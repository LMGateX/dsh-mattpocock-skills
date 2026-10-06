import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
const recipeId = 'initial-cwd-dsh-0.2.1-alpha.1-v1';
const recipeDigest = 'd37a15a5712b62af03a150b6ef44e906f3dc26aa06924818b53dd5a08158f22d';
const ownerName = '@lmgatex/dsh-mattpocock-skills';
const stateName = '.dsh-mattpocock-initial-cwd';
const lockName = '.dsh-mattpocock-initial-cwd.lock';
const receiptHashes = new WeakMap();
const deletedBackups = new WeakMap();
class Refusal extends Error {
    status;
    constructor(status, diagnostic) { super(diagnostic); this.status = status; }
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const message = (error) => error instanceof Error ? error.message : String(error);
const checkpoint = (signal) => { if (signal?.aborted)
    throw new Refusal('failed', 'Operation cancelled'); };
const missing = (error) => error.code === 'ENOENT';
function result(status, root, version, diagnostic = null, managed = false) {
    return { status, sdkVersion: version, diagnostic, managed, recipeId, canonicalRoot: root };
}
async function recipe() {
    const value = JSON.parse(await readFile(new URL('../../compatibility/initial-cwd.recipe.json', import.meta.url), 'utf8'));
    const { manifestSha256, ...body } = value;
    if (manifestSha256 !== recipeDigest || hash(JSON.stringify(body)) !== recipeDigest)
        throw new Refusal('incompatible', 'Bundled recipe integrity mismatch');
    return value;
}
async function safePath(root, relative, directory = false) {
    const path = resolve(root, relative);
    if (!path.startsWith(root + sep))
        throw new Refusal('incompatible', 'Path escapes SDK root');
    if (await realpath(root) !== root)
        throw new Refusal('incompatible', 'SDK root changed');
    let current = root;
    const parts = path.slice(root.length + 1).split(sep);
    for (const [index, part] of parts.entries()) {
        current = join(current, part);
        const stat = await lstat(current);
        if (stat.isSymbolicLink())
            throw new Refusal('incompatible', 'SDK symlink is not supported: ' + relative);
        if (index < parts.length - 1 || directory ? !stat.isDirectory() : !stat.isFile())
            throw new Refusal('incompatible', 'SDK path has unexpected type: ' + relative);
    }
    return path;
}
async function readSafe(root, relative) {
    const path = await safePath(root, relative);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        return await handle.readFile();
    }
    finally {
        await handle.close();
    }
}
async function exists(path) {
    try {
        await lstat(path);
        return true;
    }
    catch (error) {
        if (missing(error))
            return false;
        throw error;
    }
}
async function canonicalRoot(targetRoot) {
    if (!isAbsolute(targetRoot))
        throw new Refusal('incompatible', 'Explicit absolute SDK root required');
    const root = await realpath(targetRoot);
    if (root !== resolve(targetRoot) || !(await lstat(root)).isDirectory())
        throw new Refusal('incompatible', 'SDK root must be a canonical directory without symlinks');
    return root;
}
function packageVersion(value) {
    return typeof value === 'string' && value.length <= 128
        && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
}
async function readReceipt(root, spec) {
    if (!await exists(join(root, stateName)))
        return null;
    try {
        await safePath(root, stateName, true);
        const raw = await readSafe(root, stateName + '/receipt.json');
        const value = JSON.parse(raw.toString('utf8'));
        if (value.schemaVersion !== 1 || value.owner !== ownerName || !packageVersion(value.ownerVersion) || value.targetRoot !== root || value.sdkVersion !== spec.sdkVersion || value.recipeId !== recipeId || value.recipeSha256 !== recipeDigest || !/^[0-9a-f-]{36}$/.test(value.transactionId) || !['preparing', 'prepared', 'restoring', 'restored'].includes(value.phase) || value.files.length !== spec.files.length)
            throw new Error('Receipt ownership or identity mismatch');
        for (const [i, file] of spec.files.entries()) {
            const record = value.files[i];
            if (!record || record.path !== file.path || record.before !== file.sha256 || record.after !== file.patchedSha256 || record.backup !== String(i) + '.original' || !Number.isInteger(record.mode) || record.mode < 0 || record.mode > 0o777)
                throw new Error('Receipt file metadata mismatch');
            if (value.phase !== 'restored' && hash(await readSafe(root, stateName + '/' + record.backup)) !== file.sha256)
                throw new Error('Backup integrity mismatch: ' + file.path);
        }
        await assertKnownStateEntries(root, value);
        receiptHashes.set(value, hash(raw));
        return value;
    }
    catch (error) {
        throw new Refusal('uncertain', 'Cannot validate managed journal: ' + message(error));
    }
}
async function snapshot(targetRoot, signal, ignoreLock = false) {
    checkpoint(signal);
    const spec = await recipe();
    const root = await canonicalRoot(targetRoot);
    const pkg = JSON.parse((await readSafe(root, 'package.json')).toString('utf8'));
    const version = typeof pkg.version === 'string' ? pkg.version : null;
    if (pkg.name !== spec.sdkName || version !== spec.sdkVersion)
        throw new Refusal('incompatible', 'SDK identity or version does not match pinned recipe');
    const ownPkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    if (ownPkg.name !== ownerName || !packageVersion(ownPkg.version))
        throw new Refusal('incompatible', 'Manager package identity unavailable');
    if (!ignoreLock && await exists(join(root, lockName)))
        throw new Refusal('uncertain', 'SDK preparation lock exists; no stale-PID guessing or automatic lock removal');
    const receipt = await readReceipt(root, spec);
    const bytes = [];
    const modes = [];
    for (const file of spec.files) {
        checkpoint(signal);
        bytes.push(await readSafe(root, file.path));
        modes.push((await lstat(await safePath(root, file.path))).mode & 0o7777);
    }
    const pristine = spec.files.every((file, i) => hash(bytes[i]) === file.sha256);
    const patched = spec.files.every((file, i) => hash(bytes[i]) === file.patchedSha256);
    const ordinary = modes.every(mode => (mode & 0o7000) === 0);
    const modesMatch = !receipt || receipt.files.every((file, i) => file.mode === modes[i]);
    const state = receipt?.phase === 'prepared' && patched && ordinary && modesMatch ? result('ready', root, version, null, true)
        : receipt?.phase === 'restored' && pristine && ordinary && modesMatch ? result('not-prepared', root, version)
            : receipt ? result('uncertain', root, version, 'Journal is incomplete or current SDK bytes drifted; preserve journal and investigate offline')
                : !ordinary ? result('incompatible', root, version, 'SDK special permission bits are not supported')
                    : pristine ? result('not-prepared', root, version)
                        : result('incompatible', root, version, patched ? 'Externally prepared SDK has no owned receipt; manager cannot claim preparation or restore authority' : 'SDK bytes differ from pinned recipe');
    return { spec, root, version, ownerVersion: ownPkg.version, bytes, modes, receipt, result: state };
}
/** Read-only disk evidence; never asserts the running native manager has loaded these bytes. */
export async function inspectManagedSdk(targetRoot, signal) {
    try {
        return (await snapshot(targetRoot, signal)).result;
    }
    catch (error) {
        return await failureResult(targetRoot, error);
    }
}
async function failureResult(targetRoot, error) {
    let root = null;
    let version = null;
    try {
        root = await canonicalRoot(targetRoot);
        const pkg = JSON.parse((await readSafe(root, 'package.json')).toString('utf8'));
        version = typeof pkg.version === 'string' ? pkg.version : null;
    }
    catch { /* A failed identity check must not invent target evidence. */ }
    return result(error instanceof Refusal ? error.status : 'failed', root, version, message(error));
}
async function syncDirectory(path) {
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        await handle.sync();
    }
    finally {
        await handle.close();
    }
}
async function writeExclusive(path, bytes, mode) {
    const handle = await open(path, 'wx', mode);
    try {
        await handle.writeFile(bytes);
        await handle.chmod(mode);
        await handle.sync();
    }
    finally {
        await handle.close();
    }
}
async function atomicReplace(root, relative, bytes, expectedHash, mode) {
    const path = await safePath(root, relative);
    const stageRelative = relative + '.initial-cwd-' + randomUUID() + '.tmp';
    const stage = join(root, stageRelative);
    let identity = null;
    try {
        const handle = await open(stage, 'wx', mode);
        try {
            identity = await handle.stat();
            await handle.writeFile(bytes);
            await handle.chmod(mode);
            await handle.sync();
        }
        finally {
            await handle.close();
        }
        if (hash(await readSafe(root, stageRelative)) !== hash(bytes))
            throw new Refusal('uncertain', 'Staging bytes changed; preserve staging file and journal');
        if (hash(await readSafe(root, relative)) !== expectedHash || ((await lstat(await safePath(root, relative))).mode & 0o7777) !== mode)
            throw new Error('SDK bytes or permissions changed before atomic replacement: ' + relative);
        await safePath(root, relative);
        const staged = await lstat(await safePath(root, stageRelative));
        if (staged.dev !== identity.dev || staged.ino !== identity.ino || (staged.mode & 0o7777) !== mode || hash(await readSafe(root, stageRelative)) !== hash(bytes))
            throw new Refusal('uncertain', 'Staging ownership changed; preserve staging file and journal');
        await rename(stage, path);
        await syncDirectory(dirname(path));
        if (hash(await readSafe(root, relative)) !== hash(bytes))
            throw new Error('SDK replacement readback mismatch: ' + relative);
    }
    catch (error) {
        if (await exists(stage)) {
            try {
                const staged = await lstat(await safePath(root, stageRelative));
                if (!identity || staged.dev !== identity.dev || staged.ino !== identity.ino || (staged.mode & 0o7777) !== mode || hash(await readSafe(root, stageRelative)) !== hash(bytes))
                    throw new Error('Stage identity, permissions or bytes are foreign/partial');
                await unlink(stage);
            }
            catch (stageError) {
                throw new Refusal('uncertain', message(error) + '; staging retained: ' + message(stageError));
            }
        }
        throw error;
    }
}
async function writeReceipt(root, receipt, first = false) {
    await safePath(root, stateName, true);
    const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n');
    const relative = stateName + '/receipt.json';
    if (first) {
        await writeExclusive(join(root, relative), bytes, 0o600);
        await syncDirectory(join(root, stateName));
    }
    else {
        await assertOwnedJournal(root, receipt);
        await atomicReplace(root, relative, bytes, receiptHashes.get(receipt), 0o600);
    }
    if (!bytes.equals(await readSafe(root, relative)))
        throw new Refusal('uncertain', 'Receipt readback changed; preserve foreign journal');
    receiptHashes.set(receipt, hash(bytes));
}
async function assertKnownStateEntries(root, receipt) {
    const deleted = deletedBackups.get(receipt);
    const allowed = new Set(['receipt.json', ...receipt.phase === 'restored' ? [] : receipt.files.map(file => file.backup).filter(name => !deleted?.has(name))]);
    const entries = await readdir(await safePath(root, stateName, true));
    if (entries.some(entry => !allowed.has(entry)))
        throw new Refusal('uncertain', 'Unknown managed-state entries; preserve foreign metadata, journal and lock');
}
async function assertOwnedJournal(root, receipt) {
    const expected = receiptHashes.get(receipt);
    try {
        await assertKnownStateEntries(root, receipt);
        const path = await safePath(root, stateName + '/receipt.json');
        if (!expected || hash(await readSafe(root, stateName + '/receipt.json')) !== expected || ((await lstat(path)).mode & 0o7777) !== 0o600)
            throw new Error('Journal bytes or permissions no longer match the last owned receipt');
    }
    catch (error) {
        throw new Refusal('uncertain', 'Journal ownership changed; preserve journal and lock: ' + message(error));
    }
}
async function acquireLock(root) {
    const path = join(root, lockName);
    const token = JSON.stringify({ owner: ownerName, recipeId, transactionId: randomUUID(), pid: process.pid }) + '\n';
    try {
        await writeExclusive(path, token, 0o600);
        await syncDirectory(root);
    }
    catch (error) {
        if (error.code === 'EEXIST')
            throw new Refusal('uncertain', 'SDK preparation lock exists; no automatic stale lock removal');
        throw error;
    }
    return async () => {
        if ((await readSafe(root, lockName)).toString('utf8') !== token)
            throw new Error('Lock ownership changed; retaining lock');
        await unlink(path);
        await syncDirectory(root);
    };
}
async function assertRestoredFiles(root, receipt) {
    for (const file of receipt.files) {
        if (hash(await readSafe(root, file.path)) !== file.before || ((await lstat(await safePath(root, file.path))).mode & 0o7777) !== file.mode)
            throw new Refusal('uncertain', 'SDK bytes or permissions drifted during cleanup; preserve terminal evidence and lock');
    }
}
async function cleanup(root, receipt) {
    // Never delete the sole journal: retain a terminal receipt after removing known backups.
    const deleted = new Set();
    deletedBackups.set(receipt, deleted);
    await assertOwnedJournal(root, receipt);
    await assertRestoredFiles(root, receipt);
    for (const file of receipt.files) {
        if (hash(await readSafe(root, stateName + '/' + file.backup)) !== file.before)
            throw new Error('Backup changed before cleanup');
    }
    for (const file of receipt.files) {
        await assertOwnedJournal(root, receipt);
        await assertRestoredFiles(root, receipt);
        if (hash(await readSafe(root, stateName + '/' + file.backup)) !== file.before)
            throw new Refusal('uncertain', 'Backup changed before deletion; preserve metadata');
        await unlink(await safePath(root, stateName + '/' + file.backup));
        deleted.add(file.backup);
        await assertOwnedJournal(root, receipt);
        await assertRestoredFiles(root, receipt);
    }
    await assertOwnedJournal(root, receipt);
    receipt.phase = 'restored';
    await writeReceipt(root, receipt);
    await assertOwnedJournal(root, receipt);
    await assertRestoredFiles(root, receipt);
    await syncDirectory(root);
}
async function rollback(root, spec, receipt) {
    await assertOwnedJournal(root, receipt);
    const original = [];
    for (const [i, file] of spec.files.entries()) {
        const record = receipt.files[i];
        const bytes = await readSafe(root, stateName + '/' + record.backup);
        if (hash(bytes) !== file.sha256)
            throw new Error('Cannot rollback: backup changed');
        const current = hash(await readSafe(root, file.path));
        if ((current !== file.sha256 && current !== file.patchedSha256) || ((await lstat(await safePath(root, file.path))).mode & 0o7777) !== record.mode)
            throw new Error('Cannot rollback foreign SDK bytes or permissions: ' + file.path);
        original.push(bytes);
    }
    for (const [i, file] of spec.files.entries()) {
        await assertOwnedJournal(root, receipt);
        if (hash(await readSafe(root, stateName + '/' + receipt.files[i].backup)) !== file.sha256)
            throw new Refusal('uncertain', 'Backup changed during rollback; preserve metadata');
        const current = hash(await readSafe(root, file.path));
        if (current === file.patchedSha256)
            await atomicReplace(root, file.path, original[i], file.patchedSha256, receipt.files[i].mode);
        else if (current !== file.sha256)
            throw new Error('SDK changed during rollback');
    }
    for (const file of spec.files)
        if (hash(await readSafe(root, file.path)) !== file.sha256)
            throw new Error('Rollback final verification failed');
    await cleanup(root, receipt);
}
/** Offline only: caller must ensure every DSH process using this installation is stopped. */
export async function prepareManagedSdk(targetRoot, signal) {
    let release = null;
    let data = null;
    let journal = null;
    let answer;
    try {
        data = await snapshot(targetRoot, signal);
        if (data.result.status !== 'not-prepared')
            return data.result;
        // Compute and verify every postimage before any target-root write, including the lock.
        const postimages = data.spec.files.map((file, i) => {
            let text = data.bytes[i].toString('utf8');
            for (const replacement of file.replacements) {
                if (text.split(replacement.before).length !== 2)
                    throw new Refusal('incompatible', 'Recipe replacement context is not unique: ' + file.path);
                text = text.replace(replacement.before, replacement.after);
            }
            const bytes = Buffer.from(text);
            if (hash(bytes) !== file.patchedSha256)
                throw new Refusal('incompatible', 'Recipe postimage mismatch: ' + file.path);
            return bytes;
        });
        checkpoint(signal);
        release = await acquireLock(data.root);
        data = await snapshot(targetRoot, signal, true);
        if (data.result.status !== 'not-prepared')
            throw new Refusal(data.result.status, data.result.diagnostic ?? 'SDK changed before preparation');
        const files = [];
        for (const [i, file] of data.spec.files.entries()) {
            const mode = data.modes[i];
            files.push({ path: file.path, before: file.sha256, after: file.patchedSha256, backup: String(i) + '.original', mode });
        }
        checkpoint(signal);
        const previous = data.receipt;
        if (!previous)
            await mkdir(join(data.root, stateName), { mode: 0o700 });
        else
            await assertOwnedJournal(data.root, previous);
        journal = { schemaVersion: 1, owner: ownerName, ownerVersion: data.ownerVersion, targetRoot: data.root, sdkVersion: data.version, recipeId, recipeSha256: recipeDigest, transactionId: randomUUID(), phase: 'preparing', files };
        if (previous)
            receiptHashes.set(journal, receiptHashes.get(previous));
        await writeReceipt(data.root, journal, !previous);
        await syncDirectory(data.root);
        for (const [i, file] of files.entries()) {
            await safePath(data.root, stateName, true);
            await writeExclusive(join(data.root, stateName, file.backup), data.bytes[i], 0o600);
            if (hash(await readSafe(data.root, stateName + '/' + file.backup)) !== file.before)
                throw new Error('Backup readback mismatch');
        }
        await syncDirectory(join(data.root, stateName));
        // Journal and every backup are durable before the first compiled-file effect.
        await readReceipt(data.root, data.spec);
        for (const [i, file] of data.spec.files.entries()) {
            checkpoint(signal);
            await assertOwnedJournal(data.root, journal);
            await atomicReplace(data.root, file.path, postimages[i], file.sha256, files[i].mode);
        }
        checkpoint(signal);
        for (const file of data.spec.files)
            if (hash(await readSafe(data.root, file.path)) !== file.patchedSha256)
                throw new Error('Final all-postimage verification failed');
        journal.phase = 'prepared';
        await writeReceipt(data.root, journal);
        await assertOwnedJournal(data.root, journal);
        answer = (await snapshot(targetRoot, undefined, true)).result;
        await assertOwnedJournal(data.root, journal);
        if (answer.status !== 'ready')
            throw new Error('Owned readiness verification failed');
    }
    catch (error) {
        answer = await failureResult(targetRoot, error);
        if (journal && data && !(error instanceof Refusal && error.status === 'uncertain')) {
            try {
                await rollback(data.root, data.spec, journal);
            }
            catch (rollbackError) {
                answer = result('uncertain', data.root, data.version, message(error) + '; rollback not completed: ' + message(rollbackError));
            }
        }
    }
    if (release && answer.status !== 'uncertain') {
        try {
            await release();
        }
        catch (error) {
            answer = result('uncertain', data?.root ?? null, data?.version ?? null, 'Cannot release owned lock: ' + message(error));
        }
    }
    return answer;
}
/** Explicit uninstall only; feature-off settings must never call this function. Offline prerequisite applies. */
export async function restoreManagedSdk(targetRoot, signal) {
    let release = null;
    let data = null;
    let journal = null;
    let startedEffect = false;
    let answer;
    try {
        data = await snapshot(targetRoot, signal);
        if (data.result.status !== 'ready')
            return data.result;
        checkpoint(signal);
        release = await acquireLock(data.root);
        data = await snapshot(targetRoot, signal, true);
        if (data.result.status !== 'ready' || !data.receipt)
            throw new Refusal(data.result.status, data.result.diagnostic ?? 'Owned preparation changed before restoration');
        journal = data.receipt;
        checkpoint(signal);
        journal.phase = 'restoring';
        await writeReceipt(data.root, journal);
        for (const [i, file] of data.spec.files.entries()) {
            checkpoint(signal);
            await assertOwnedJournal(data.root, journal);
            const bytes = await readSafe(data.root, stateName + '/' + journal.files[i].backup);
            if (hash(bytes) !== file.sha256)
                throw new Error('Backup changed before restoration');
            startedEffect = true;
            await atomicReplace(data.root, file.path, bytes, file.patchedSha256, journal.files[i].mode);
        }
        for (const file of data.spec.files)
            if (hash(await readSafe(data.root, file.path)) !== file.sha256)
                throw new Error('Restoration final verification failed');
        await cleanup(data.root, journal);
        answer = (await snapshot(targetRoot, undefined, true)).result;
        if (answer.status !== 'not-prepared')
            throw new Refusal('uncertain', 'Terminal restore evidence does not match current pristine SDK');
        await assertOwnedJournal(data.root, journal);
        journal = null;
    }
    catch (error) {
        answer = await failureResult(targetRoot, error);
        if (journal && data && !(error instanceof Refusal && error.status === 'uncertain')) {
            try {
                if (startedEffect)
                    await rollback(data.root, data.spec, journal);
                else {
                    journal.phase = 'prepared';
                    await writeReceipt(data.root, journal);
                }
            }
            catch (rollbackError) {
                answer = result('uncertain', data.root, data.version, message(error) + '; restore recovery not completed: ' + message(rollbackError));
            }
        }
    }
    if (release && answer.status !== 'uncertain') {
        try {
            await release();
        }
        catch (error) {
            answer = result('uncertain', data?.root ?? null, data?.version ?? null, 'Cannot release owned lock: ' + message(error));
        }
    }
    return answer;
}
