import { randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { inspectManagedSdk } from './managed-sdk.js';
const epochSlot = Symbol.for('@lmgatex/dsh-mattpocock-skills/startup-process-epochs');
/** The carrier is the actual process, not a plugin module or Cordis mount. */
export function processStartupEpoch() {
    const carrier = process;
    let epochs = carrier[epochSlot];
    if (!epochs) {
        epochs = new Map();
        Object.defineProperty(carrier, epochSlot, { value: epochs });
    }
    let epoch = epochs.get(process.pid);
    if (!epoch) {
        epoch = randomUUID();
        epochs.set(process.pid, epoch);
    }
    return epoch;
}
const detail = (error) => error instanceof Error ? error.message : String(error);
export class HostStartupNode {
    options;
    nativeSupported;
    lifetime;
    epoch;
    constructor(options, nativeSupported, lifetime) {
        this.options = options;
        this.nativeSupported = nativeSupported;
        this.lifetime = lifetime;
        this.epoch = options.bootEpoch ?? processStartupEpoch();
    }
    async sdkRoot(signal) {
        signal?.throwIfAborted();
        if (this.options.sdkRoot !== undefined) {
            if (!isAbsolute(this.options.sdkRoot))
                throw new Error('Trusted SDK root must be an absolute path');
            return await realpath(this.options.sdkRoot);
        }
        // Follow only the actual executable and a bounded chain of its parents. No
        // cwd, PATH, global install directory, or plugin dependency lookup is evidence.
        const argument = process.argv[1];
        if (!argument)
            return null;
        let entry;
        try {
            entry = await realpath(resolve(argument));
        }
        catch {
            return null;
        }
        let candidate = dirname(entry);
        for (let depth = 0; depth < 6; depth += 1) {
            signal?.throwIfAborted();
            try {
                const pkg = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
                const bin = typeof pkg.bin === 'object' && pkg.bin !== null ? pkg.bin.dsh : undefined;
                // Discovery establishes launch identity, not recipe compatibility. Retain
                // genuine other-version roots so the inspector can report actual evidence.
                if (pkg.name === '@deepseek-ai/dsh' && typeof pkg.version === 'string'
                    && pkg.version.trim().length > 0 && pkg.version.length <= 256 && !pkg.version.includes('\0')
                    && bin === 'lib/bin.js' && await realpath(join(candidate, bin)) === entry)
                    return candidate;
            }
            catch { /* A parent without the declared executable identity is not an SDK root. */ }
            const parent = dirname(candidate);
            if (parent === candidate)
                break;
            candidate = parent;
        }
        return null;
    }
    async observe(signal) {
        const control = this.lifetime && signal ? AbortSignal.any([this.lifetime, signal]) : this.lifetime ?? signal;
        control?.throwIfAborted();
        let native;
        try {
            native = this.nativeSupported();
        }
        catch {
            native = null;
        }
        if (native === true)
            return { nativeInitialCwdSupported: true, preparation: {
                    status: 'ready', sdkVersion: null, diagnostic: 'Running native interface supports initial child cwd; managed SDK preparation is not required.',
                } };
        if (native === null)
            return { nativeInitialCwdSupported: null, preparation: {
                    status: 'uncertain', sdkVersion: null, diagnostic: 'Running native initial child cwd capability is unavailable; no enabled or unsupported guarantee can be made.',
                } };
        let root;
        try {
            root = await this.sdkRoot(control);
        }
        catch (error) {
            control?.throwIfAborted();
            return { nativeInitialCwdSupported: native, preparation: { status: 'failed', sdkVersion: null, diagnostic: detail(error) } };
        }
        control?.throwIfAborted();
        if (root === null)
            return { nativeInitialCwdSupported: native, preparation: {
                    status: 'not-prepared', sdkVersion: null, diagnostic: 'SDK root could not be verified from the actual launch entry. Native initial child cwd is unsupported; restart alone cannot prepare an unlocated SDK.',
                } };
        const inspected = await inspectManagedSdk(root, control);
        control?.throwIfAborted();
        return { nativeInitialCwdSupported: native, preparation: {
                status: inspected.status, sdkVersion: inspected.sdkVersion, diagnostic: inspected.diagnostic,
            } };
    }
}
