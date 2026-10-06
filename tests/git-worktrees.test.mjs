import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute } from 'node:path'
import ts from 'typescript'
registerHooks({ resolve(s, c, n) { return n(s.endsWith('.js') && c.parentURL?.includes('/src/controls/') ? s.slice(0, -3) + '.ts' : s, c) }, load(u, c, n) { return u.endsWith('.ts') ? { format: 'module', source: ts.transpileModule(readFileSync(new URL(u), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText, shortCircuit: true } : n(u, c) } })
const { concreteGitAdapter } = await import('../src/controls/git-worktrees.ts')
const { createResourceModule, MemoryResourceStorage } = await import('../src/controls/resources.ts')
const exec = promisify(execFile)
async function fixture(t) {
  const root = await fs.mkdtemp(join(tmpdir(), 'resource-git-fixture-'))
  const within = p => { const r = relative(root, resolve(p)); assert(!isAbsolute(r) && r !== '..' && !r.startsWith('../'), 'fixture runner refuses path outside temporary root'); return resolve(p) }
  t.after(async () => { assert(root.startsWith(join(tmpdir(), 'resource-git-fixture-'))); await fs.rm(root, { recursive: true, force: true }) })
  const calls = []
  const runner = {
    async authorize(request) { for (const p of request.paths) within(p) },
    async run(argv, cwd, signal) {
      within(cwd)
      // Test-only native execution: fixed git executable, temporary repository,
      // sanitized environment, no shell, and every absolute argv inside fixture.
      assert.equal(argv[0], 'git')
      for (const p of argv.slice(1)) if (isAbsolute(p)) within(p)
      calls.push([...argv])
      try { const r = await exec('git', argv.slice(1), { cwd, signal, env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' } }); return { exitCode: 0, stdout: r.stdout, stderr: r.stderr } } catch (e) { if (typeof e.code !== 'number') throw e; return { exitCode: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' } }
    },
    async lstat(p) { const s = await fs.lstat(within(p)); return { kind: s.isSymbolicLink() ? 'symlink' : s.isDirectory() ? 'directory' : s.isFile() ? 'file' : 'other', identity: s.dev + ':' + s.ino } },
    async realpath(p) { return fs.realpath(within(p)) },
    async readFile(p) { return fs.readFile(within(p)) },
    async readlink(p) { return fs.readlink(within(p)) },
    async readDirectory(p) { return fs.readdir(within(p)) },
  }
  const repo = join(root, 'repo'), trees = join(root, 'trees')
  await fs.mkdir(repo); await fs.mkdir(trees)
  async function git(args, cwd = repo) { const r = await runner.run(['git', ...args], cwd); assert.equal(r.exitCode, 0, r.stderr); return r.stdout.trim() }
  await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Fixture']); await git(['config', 'user.email', 'fixture@example.invalid'])
  await fs.writeFile(join(repo, 'file.txt'), 'baseline\n'); await fs.writeFile(join(repo, '.gitignore'), 'ignored/\n')
  await git(['add', '.']); await git(['commit', '-m', 'fixture baseline'])
  return { root, repo, trees, runner, git, calls, adapter: concreteGitAdapter(runner) }
}
test('authorized concrete adapter creates owned tree and leaves borrowed tree untouched', async t => {
  const f = await fixture(t), spec = { repositoryPath: f.repo, root: f.trees, name: 'owned', startPoint: 'HEAD' }
  const planned = await f.adapter.planCreate(spec)
  assert.equal(planned.pathIdentity, null)
  const owned = await f.adapter.create(planned)
  assert.equal(owned.branchOwned, true)
  assert.equal((await f.adapter.inspect(owned)).identityVerified, true)
  const borrowed = await f.adapter.borrow(owned.path)
  assert.equal(borrowed.ownership, 'borrowed')
  await assert.rejects(f.adapter.retire(borrowed, { kind: 'remove-clean', branch: 'keep', authorId: 'A' }), e => e.code === 'identity-conflict')
  await f.adapter.retire(owned, { kind: 'remove-clean', branch: 'keep', authorId: 'A' })
  await assert.rejects(fs.lstat(owned.path), { code: 'ENOENT' })
  assert.equal(await f.git(['rev-parse', '--verify', owned.branchRef]), owned.baseOid)
})
test('recreated Git common/private directories at same path fail physical identity verification', async t => {
  const f = await fixture(t), r = await f.adapter.create(await f.adapter.planCreate({ repositoryPath: f.repo, root: f.trees, name: 'metadata', startPoint: 'HEAD' }))
  const saved = join(f.repo, 'saved-git'); await fs.rename(join(f.repo, '.git'), saved); await fs.cp(saved, join(f.repo, '.git'), { recursive: true })
  await assert.rejects(f.adapter.inspect(r), e => e.code === 'identity-conflict')
  await fs.lstat(r.path)
})
async function owned(f, name = 'owned') { return f.adapter.create(await f.adapter.planCreate({ repositoryPath: f.repo, root: f.trees, name, startPoint: 'HEAD' })) }
test('dirty, untracked and ignored bytes survive clean retirement request; discard is author-scoped', async t => {
  const f = await fixture(t), r = await owned(f)
  await fs.writeFile(join(r.path, 'file.txt'), 'dirty\n'); await fs.writeFile(join(r.path, 'untracked.txt'), 'untracked\n')
  await fs.mkdir(join(r.path, 'ignored')); await fs.writeFile(join(r.path, 'ignored', 'value'), 'valuable\n')
  const facts = await f.adapter.inspect(r)
  assert.deepEqual(facts.tracked, ['file.txt']); assert.deepEqual(facts.untracked, ['untracked.txt']); assert.deepEqual([...facts.ignored].sort(), ['ignored/', 'ignored/value'])
  await assert.rejects(f.adapter.retire(r, { kind: 'remove-clean', branch: 'keep', authorId: 'A' }), e => e.code === 'resource-busy')
  assert.equal(await fs.readFile(join(r.path, 'ignored', 'value'), 'utf8'), 'valuable\n')
  await assert.rejects(f.adapter.retire(r, { kind: 'discard', branch: 'keep', authorId: 'A' }), e => e.code === 'identity-conflict')
  await fs.writeFile(join(r.path, 'ignored', 'value'), 'new value\n')
  const disposition = { kind: 'discard', branch: 'keep', authorId: 'actual-agent', expectedFactsDigest: facts.digest, explanation: 'task agreement explicitly permits discarding these fixture files' }
  await assert.rejects(f.adapter.retire(r, disposition), e => e.code === 'resource-busy')
  const fresh = await f.adapter.inspect(r)
  await f.adapter.retire(r, { ...disposition, expectedFactsDigest: fresh.digest })
  assert(f.calls.some(c => c.includes('remove') && c.includes('--force')))
})
test('ignored empty directories and nested repositories are protected and deeply observed', async t => {
  const f = await fixture(t), r = await owned(f)
  await fs.mkdir(join(r.path, 'ignored'))
  const empty = await f.adapter.inspect(r)
  assert(empty.ignored.includes('ignored/'))
  await assert.rejects(f.adapter.retire(r, { kind: 'remove-clean', branch: 'keep', authorId: 'A' }), e => e.code === 'resource-busy')
  await fs.mkdir(join(r.path, 'nested')); await f.git(['init', '-b', 'main'], join(r.path, 'nested'))
  await fs.writeFile(join(r.path, 'nested', 'valuable'), 'first nested value')
  const before = await f.adapter.inspect(r)
  await fs.writeFile(join(r.path, 'nested', 'valuable'), 'changed nested value')
  const after = await f.adapter.inspect(r)
  assert.notEqual(before.digest, after.digest)
})
test('staged bytes participate in content observation even when working bytes and status code stay unchanged', async t => {
  const f = await fixture(t), r = await owned(f)
  await fs.writeFile(join(r.path, 'file.txt'), 'stage one\n'); await f.git(['add', 'file.txt'], r.path)
  await fs.writeFile(join(r.path, 'file.txt'), 'working bytes\n')
  const first = await f.adapter.inspect(r)
  await fs.writeFile(join(r.path, 'file.txt'), 'stage two\n'); await f.git(['add', 'file.txt'], r.path)
  await fs.writeFile(join(r.path, 'file.txt'), 'working bytes\n')
  const second = await f.adapter.inspect(r)
  assert.deepEqual(first.tracked, second.tracked)
  assert.notEqual(first.digest, second.digest)
})
test('creation rejects existing branch, path, traversal and symlink root without force', async t => {
  const f = await fixture(t)
  await f.git(['branch', 'existing'])
  await assert.rejects(f.adapter.planCreate({ repositoryPath: f.repo, root: f.trees, name: 'existing', startPoint: 'HEAD' }), e => e.code === 'identity-conflict')
  await fs.mkdir(join(f.trees, 'occupied'))
  await assert.rejects(f.adapter.planCreate({ repositoryPath: f.repo, root: f.trees, name: 'occupied', startPoint: 'HEAD' }), e => e.code === 'identity-conflict')
  await assert.rejects(f.adapter.planCreate({ repositoryPath: f.repo, root: f.trees, name: '../escape', startPoint: 'HEAD' }), e => e.code === 'identity-conflict')
  const link = join(f.root, 'link'); await fs.symlink(f.trees, link)
  await assert.rejects(f.adapter.planCreate({ repositoryPath: f.repo, root: link, name: 'unsafe', startPoint: 'HEAD' }), e => e.code === 'identity-conflict')
  assert(!f.calls.some(c => c.includes('--force') || c.includes('-D')))
})
test('reserved root, branch and target identities are rechecked at creation', async t => {
  const f = await fixture(t), plan = await f.adapter.planCreate({ repositoryPath: f.repo, root: f.trees, name: 'race', startPoint: 'HEAD' })
  await f.git(['branch', 'race'])
  await assert.rejects(f.adapter.create(plan), e => e.code === 'identity-conflict')
  await f.git(['branch', '-d', 'race'])
  const replacement = join(f.root, 'replacement'); await fs.mkdir(replacement)
  const saved = join(f.root, 'old-trees'); await fs.rename(f.trees, saved); await fs.symlink(replacement, f.trees)
  await assert.rejects(f.adapter.create(plan), e => e.code === 'identity-conflict')
  assert(!f.calls.some(c => c.includes('add') && c.includes('worktree')))
})
test('path replacement and Git HEAD/ref migration cannot delete a different tree', async t => {
  const f = await fixture(t), r = await owned(f)
  await f.git(['checkout', '-b', 'other'], r.path)
  await assert.rejects(f.adapter.retire(r, { kind: 'remove-clean', branch: 'keep', authorId: 'A' }), e => e.code === 'identity-conflict')
  await f.git(['checkout', 'owned'], r.path)
  const original = join(f.trees, 'saved-original'); await fs.rename(r.path, original); await fs.mkdir(r.path)
  await fs.writeFile(join(r.path, 'keep-me'), 'different checkout')
  await assert.rejects(f.adapter.retire(r, { kind: 'remove-clean', branch: 'keep', authorId: 'A' }), e => e.code === 'identity-conflict')
  assert.equal(await fs.readFile(join(r.path, 'keep-me'), 'utf8'), 'different checkout')
})
test('owned branch compare-delete requires exact OID and never deletes borrowed or foreign refs', async t => {
  const f = await fixture(t), r = await owned(f)
  await fs.writeFile(join(r.path, 'file.txt'), 'commit\n'); await f.git(['add', '.'], r.path); await f.git(['commit', '-m', 'candidate'], r.path)
  await assert.rejects(f.adapter.retire(r, { kind: 'remove-clean', branch: 'delete-owned', expectedBranchOid: r.baseOid, authorId: 'A' }), e => e.code === 'identity-conflict')
  await fs.lstat(r.path)
  const current = (await f.adapter.inspect(r)).branchOid
  await f.adapter.retire(r, { kind: 'remove-clean', branch: 'delete-owned', expectedBranchOid: current, authorId: 'A' })
  const absent = await f.runner.run(['git', 'show-ref', '--verify', '--quiet', r.branchRef], f.repo)
  assert.equal(absent.exitCode, 1)
  assert.equal(await f.git(['symbolic-ref', 'HEAD']), 'refs/heads/main')
  assert(!f.calls.some(c => c.includes('-D')))
})
test('owned branch cannot be deleted while another registered checkout borrows its ref', async t => {
  const f = await fixture(t), r = await owned(f), foreign = await owned(f, 'foreign')
  await f.git(['symbolic-ref', 'HEAD', r.branchRef], foreign.path)
  await assert.rejects(f.adapter.retire(r, { kind: 'remove-clean', branch: 'delete-owned', expectedBranchOid: r.baseOid, authorId: 'A' }), e => e.code === 'identity-conflict')
  await fs.lstat(r.path)
  assert.equal(await f.git(['rev-parse', '--verify', r.branchRef]), r.baseOid)
})
function moduleFor(f, git = f.adapter, storage = new MemoryResourceStorage()) {
  return createResourceModule({ storage, git, authority: { async authorize(principal) { return { controlWorkspaceId: 'fixture-control-workspace', instrumentInstanceId: principal, authorId: principal } } }, lifecycle: { async verifyInitialBinding() { return true }, async closeEntrypoints() { return { closed: true, nativeColdResumeClosed: true } } } })
}
test('resource module and concrete authorized Git compose without deleting busy cold or borrowed tree', async t => {
  const f = await fixture(t), m = moduleFor(f)
  const r = await m.resources.create('A', { repositoryPath: f.repo, root: f.trees, name: 'composed', startPoint: 'HEAD' })
  const b = await m.resources.borrow('B', r.identity.path)
  await m.program.setReference(r.resourceId, { bindingId: 'child', instrumentInstanceId: 'A', sessionId: 'child', state: 'cold', reusable: true, entryOpen: true })
  await m.resources.requestRetire('A', r.resourceId, { kind: 'remove-clean', branch: 'keep' })
  assert.equal((await m.resources.actualRetire('A', r.resourceId)).status, 'retire-requested')
  await fs.lstat(r.identity.path)
  await m.program.releaseReference(r.resourceId, 'child')
  await m.resources.requestRetire('B', b.resourceId, { kind: 'remove-clean', branch: 'keep' })
  assert.equal((await m.resources.actualRetire('B', b.resourceId)).status, 'retired')
  await fs.lstat(r.identity.path)
  assert.equal((await m.resources.actualRetire('A', r.resourceId)).status, 'retired')
  await assert.rejects(fs.lstat(r.identity.path), { code: 'ENOENT' })
})
test('concrete pre-effect retirement failure retries but post-remove branch failure quarantines', async t => {
  const f = await fixture(t); let failRemove = true
  const adapted = concreteGitAdapter({ ...f.runner, async run(argv, cwd, signal) {
    if (argv.includes('worktree') && argv.includes('remove') && failRemove) { failRemove = false; return { exitCode: 1, stdout: '', stderr: 'fixture pre-effect failure' } }
    return f.runner.run(argv, cwd, signal)
  } })
  const m = moduleFor(f, adapted), r = await m.resources.create('A', { repositoryPath: f.repo, root: f.trees, name: 'retry-real', startPoint: 'HEAD' })
  await m.resources.requestRetire('A', r.resourceId, { kind: 'remove-clean', branch: 'keep' })
  await assert.rejects(m.resources.actualRetire('A', r.resourceId), /pre-effect failure/)
  assert.equal((await m.resources.read('A', r.resourceId)).status, 'cleanup-failed')
  assert.equal((await m.resources.actualRetire('A', r.resourceId)).status, 'retired')
  const branchFail = concreteGitAdapter({ ...f.runner, async run(argv, cwd, signal) {
    if (argv.includes('update-ref') && argv.includes('-d')) return { exitCode: 1, stdout: '', stderr: 'fixture post-remove ref failure' }
    return f.runner.run(argv, cwd, signal)
  } })
  const n = moduleFor(f, branchFail), r2 = await n.resources.create('A', { repositoryPath: f.repo, root: f.trees, name: 'partial-real', startPoint: 'HEAD' })
  await n.resources.requestRetire('A', r2.resourceId, { kind: 'remove-clean', branch: 'delete-owned', expectedBranchOid: r2.identity.baseOid })
  await assert.rejects(n.resources.actualRetire('A', r2.resourceId), /post-remove ref failure/)
  assert.equal((await n.resources.read('A', r2.resourceId)).status, 'quarantined')
  assert.equal(await f.git(['rev-parse', '--verify', r2.identity.branchRef]), r2.identity.baseOid)
})
test('permission denial and aborted signal stop Git effects through injected runner only', async t => {
  const f = await fixture(t)
  const denied = concreteGitAdapter({ ...f.runner, async authorize() { throw new Error('existing host policy denied') } })
  const before = f.calls.length
  await assert.rejects(denied.planCreate({ repositoryPath: f.repo, root: f.trees, name: 'denied', startPoint: 'HEAD' }), /host policy denied/)
  assert.equal(f.calls.length, before)
  const controller = new AbortController(); controller.abort(new Error('cancelled'))
  await assert.rejects(f.adapter.planCreate({ repositoryPath: f.repo, root: f.trees, name: 'abort', startPoint: 'HEAD' }, controller.signal), /cancelled/)
  assert(!f.calls.some(c => c.includes('worktree') && c.includes('add')))
})
