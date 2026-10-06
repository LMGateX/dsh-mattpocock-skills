import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { ResourceError } from './resources.js'
import type { AuthoredRetireDisposition, CreateWorktree, GitWorktreeAdapter, GitWorktreeFacts, GitWorktreeIdentity } from './resources.js'
import { freeze, id, record } from './validation.js'

export interface GitRunResult { readonly exitCode: number; readonly stdout: string; readonly stderr: string }
export interface AuthorizedFileStat { readonly kind: 'directory' | 'file' | 'symlink' | 'other'; readonly identity: string }
export interface GitAuthorizationRequest {
  readonly operation: 'inspect' | 'create' | 'borrow' | 'retire'
  readonly paths: readonly string[]
  readonly disposition?: AuthoredRetireDisposition
}
/** Existing host permission path is mandatory. The host must confine each call,
 * preserve abort/error semantics, prohibit inherited GIT_* redirection, and serialize
 * effects with the resource program lease. No native/default runner is supplied. */
export interface AuthorizedGitRunner {
  authorize(request: GitAuthorizationRequest, signal?: AbortSignal): Promise<void>
  run(argv: readonly string[], cwd: string, signal?: AbortSignal): Promise<GitRunResult>
  lstat(path: string, signal?: AbortSignal): Promise<AuthorizedFileStat>
  realpath(path: string, signal?: AbortSignal): Promise<string>
  readFile(path: string, signal?: AbortSignal): Promise<Uint8Array>
  readlink(path: string, signal?: AbortSignal): Promise<string>
  readDirectory(path: string, signal?: AbortSignal): Promise<readonly string[]>
}
export class GitCommandError extends Error {
  override readonly name = 'GitCommandError'
  constructor(readonly argv: readonly string[], readonly result: GitRunResult) { super('Git command failed (' + result.exitCode + '): ' + result.stderr) }
}
function reject(message: string): never { throw new ResourceError('identity-conflict', message) }
function absolute(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value) || normalize(value) !== value || /[\u0000-\u001f\u007f]/u.test(value)) reject('expected normalized absolute path')
  return value
}
function objectId(value: string): string { if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) reject('unexpected Git object identity'); return value }
function below(root: string, path: string): boolean { const r = relative(root, path); return r !== '' && !isAbsolute(r) && r !== '..' && !r.startsWith('..' + sep) }
function list(value: string): string[] { return value.split('\0').filter(v => v !== '') }
function missing(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT' }
export function concreteGitAdapter(host: AuthorizedGitRunner): GitWorktreeAdapter {
  const git = async (args: readonly string[], cwd: string, signal?: AbortSignal, accepted: readonly number[] = [0]): Promise<GitRunResult> => {
    signal?.throwIfAborted()
    const argv = ['git', '--no-optional-locks', '--no-pager', '-c', 'core.hooksPath=/dev/null', ...args]
    const result = await host.run(argv, cwd, signal)
    if (!Number.isSafeInteger(result.exitCode) || typeof result.stdout !== 'string' || typeof result.stderr !== 'string') reject('invalid typed runner result')
    if (!accepted.includes(result.exitCode)) throw new GitCommandError(argv, result)
    return result
  }
  const output = async (args: readonly string[], cwd: string, signal?: AbortSignal) => (await git(args, cwd, signal)).stdout.trim()
  const directory = async (p: string, expected?: string, signal?: AbortSignal): Promise<string> => {
    absolute(p)
    const stat = await host.lstat(p, signal)
    if (stat.kind !== 'directory' || await host.realpath(p, signal) !== p || expected !== undefined && stat.identity !== expected) reject('directory/symlink identity changed: ' + p)
    return id(stat.identity, 'filesystem identity')
  }
  const absent = async (p: string, signal?: AbortSignal) => {
    try { await host.lstat(p, signal) } catch (error) { if (missing(error)) return; throw error }
    reject('creation path already exists: ' + p)
  }
  const repoIdentity = async (p: string, signal?: AbortSignal) => {
    await directory(p, undefined, signal)
    if (await output(['rev-parse', '--show-toplevel'], p, signal) !== p) reject('not the exact Git worktree root')
    const gitCommonDir = absolute(await output(['rev-parse', '--path-format=absolute', '--git-common-dir'], p, signal))
    const gitDir = absolute(await output(['rev-parse', '--absolute-git-dir'], p, signal))
    await host.authorize({ operation: 'inspect', paths: [p, gitCommonDir, gitDir] }, signal)
    const gitCommonDirIdentity = await directory(gitCommonDir, undefined, signal), gitDirIdentity = await directory(gitDir, undefined, signal)
    const result = await git(['symbolic-ref', '--quiet', 'HEAD'], p, signal, [0, 1])
    const branchRef = result.exitCode === 1 ? null : result.stdout.trim()
    if (branchRef !== null && !branchRef.startsWith('refs/heads/')) reject('HEAD is not a local branch')
    const baseOid = objectId(await output(['rev-parse', '--verify', 'HEAD^{commit}'], p, signal))
    return { gitCommonDir, gitCommonDirIdentity, gitDir, gitDirIdentity, branchRef, baseOid }
  }
  const registered = async (identity: GitWorktreeIdentity, signal?: AbortSignal) => {
    const records = (await git(['worktree', 'list', '--porcelain', '-z'], identity.repositoryPath, signal)).stdout.split('\0\0')
    const entry = records.map(v => list(v)).find(v => v.includes('worktree ' + identity.path))
    if (!entry || (identity.branchRef === null ? !entry.includes('detached') : !entry.includes('branch ' + identity.branchRef))) reject('Git worktree registration/ref changed')
    if (entry.some(v => v.startsWith('locked') || v.startsWith('prunable'))) reject('locked/prunable worktree cannot be retired')
  }
  const noForeignBranchCheckout = async (identity: GitWorktreeIdentity, signal?: AbortSignal) => {
    const records = (await git(['worktree', 'list', '--porcelain', '-z'], identity.repositoryPath, signal)).stdout.split('\0\0').map(list)
    if (records.some(v => v.includes('branch ' + identity.branchRef) && !v.includes('worktree ' + identity.path))) reject('owned ref is borrowed by another registered checkout')
  }
  const verify = async (identity: GitWorktreeIdentity, signal?: AbortSignal) => {
    await directory(identity.root, identity.rootIdentity, signal)
    if (identity.ownership === 'owned' && (!below(identity.root, identity.path) || dirname(identity.path) !== identity.root)) reject('owned worktree outside its reserved root')
    await directory(identity.path, identity.pathIdentity ?? undefined, signal)
    const actual = await repoIdentity(identity.path, signal)
    if (!identity.gitDir || !identity.pathIdentity || actual.gitDir !== identity.gitDir || actual.gitDirIdentity !== identity.gitDirIdentity || actual.gitCommonDir !== identity.gitCommonDir || actual.gitCommonDirIdentity !== identity.gitCommonDirIdentity || actual.branchRef !== identity.branchRef) reject('Git/path identity changed')
    const repo = await repoIdentity(identity.repositoryPath, signal)
    if ((repo.gitCommonDir !== identity.gitCommonDir || repo.gitCommonDirIdentity !== identity.gitCommonDirIdentity)) reject('repository common directory changed')
    await registered(identity, signal)
    return actual
  }
  const content = async (root: string, file: string, signal?: AbortSignal): Promise<string> => {
    if (!file || isAbsolute(file) || file.split('/').includes('..') || file.includes('\0')) reject('Git listed unsafe content path')
    const p = resolve(root, file)
    if (!below(root, p)) reject('content path escaped worktree')
    // Do not follow ignored symlink directories, including intermediate ones.
    const segments = relative(root, p).split(sep)
    let parent = root
    for (const segment of segments.slice(0, -1)) { parent = join(parent, segment); const s = await host.lstat(parent, signal); if (s.kind !== 'directory') reject('content parent is not a real directory') }
    let stat: AuthorizedFileStat
    try { stat = await host.lstat(p, signal) } catch (error) { if (missing(error)) return 'missing'; throw error }
    if (stat.kind === 'symlink') return 'symlink:' + await host.readlink(p, signal)
    if (stat.kind === 'directory') {
      if (segments.length > 128) throw new ResourceError('unsupported', 'content traversal depth exceeded; retained')
      const children = await host.readDirectory(p, signal), hasher = createHash('sha256')
      for (const child of [...children].sort()) {
        if (!child || child === '.' || child === '..' || /[\\/\u0000]/u.test(child)) reject('unsafe directory entry')
        hasher.update(JSON.stringify([child, await content(root, relative(root, join(p, child)), signal)]))
      }
      return 'directory:' + hasher.digest('hex')
    }
    if (stat.kind !== 'file') throw new ResourceError('unsupported', 'special content requires explicit host disposition; retained')
    return 'file:' + createHash('sha256').update(await host.readFile(p, signal)).digest('hex')
  }
  const adapter: GitWorktreeAdapter = {
    async planCreate(input, signal) {
      const raw = record(input, 'create worktree', ['repositoryPath', 'root', 'name', 'startPoint'])
      const repositoryPath = absolute(raw.repositoryPath), root = absolute(raw.root), name = id(raw.name, 'worktree name'), startPoint = id(raw.startPoint, 'startPoint')
      // One predictable direct child; no flags, traversal, arbitrary refs or shell.
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u.test(name) || startPoint.startsWith('-')) reject('unsafe worktree name/start point')
      await host.authorize({ operation: 'create', paths: [repositoryPath, root, join(root, name)] }, signal)
      const rootIdentity = await directory(root, undefined, signal), repo = await repoIdentity(repositoryPath, signal), path = join(root, name), branchRef = 'refs/heads/' + name
      if (below(path, repositoryPath) || path === repositoryPath || below(repo.gitCommonDir, path) || path === repo.gitCommonDir) reject('creation would overlap repository metadata')
      await absent(path, signal)
      await git(['check-ref-format', branchRef], repositoryPath, signal)
      const ref = await git(['show-ref', '--verify', '--quiet', branchRef], repositoryPath, signal, [0, 1])
      if (ref.exitCode === 0) reject('owned branch already exists')
      const baseOid = objectId(await output(['rev-parse', '--verify', '--end-of-options', startPoint + '^{commit}'], repositoryPath, signal))
      return freeze({ repositoryPath, root, path, rootIdentity, pathIdentity: null, gitCommonDir: repo.gitCommonDir, gitCommonDirIdentity: repo.gitCommonDirIdentity, gitDir: null, gitDirIdentity: null, branchRef, branchOwned: true, ownership: 'owned', baseOid })
    },
    async create(identity, signal) {
      if (identity.ownership !== 'owned' || !identity.branchOwned || identity.gitDir !== null || identity.pathIdentity !== null || !identity.branchRef || identity.branchRef !== 'refs/heads/' + basename(identity.path) || dirname(identity.path) !== identity.root) reject('not a reserved owned creation')
      await host.authorize({ operation: 'create', paths: [identity.repositoryPath, identity.root, identity.path, identity.gitCommonDir] }, signal)
      await directory(identity.root, identity.rootIdentity, signal)
      const repo = await repoIdentity(identity.repositoryPath, signal)
      if ((repo.gitCommonDir !== identity.gitCommonDir || repo.gitCommonDirIdentity !== identity.gitCommonDirIdentity)) reject('reserved repository identity changed')
      await absent(identity.path, signal)
      if ((await git(['show-ref', '--verify', '--quiet', identity.branchRef], identity.repositoryPath, signal, [0, 1])).exitCode === 0) reject('reserved branch now exists')
      objectId(identity.baseOid)
      await git(['worktree', 'add', '-b', identity.branchRef.slice('refs/heads/'.length), '--', identity.path, identity.baseOid], identity.repositoryPath, signal)
      const actual = await repoIdentity(identity.path, signal), pathIdentity = await directory(identity.path, undefined, signal)
      if (actual.gitCommonDir !== identity.gitCommonDir || actual.branchRef !== identity.branchRef || actual.baseOid !== identity.baseOid) reject('created worktree ref/base identity differs')
      const created = freeze({ ...identity, gitDir: actual.gitDir, gitDirIdentity: actual.gitDirIdentity, pathIdentity })
      await verify(created, signal)
      return created
    },
    async borrow(p, signal) {
      const path = absolute(p)
      await host.authorize({ operation: 'borrow', paths: [path, dirname(path)] }, signal)
      const root = dirname(path), rootIdentity = await directory(root, undefined, signal), pathIdentity = await directory(path, undefined, signal), actual = await repoIdentity(path, signal)
      const borrowed: GitWorktreeIdentity = { repositoryPath: path, root, path, rootIdentity, pathIdentity, ...actual, branchOwned: false, ownership: 'borrowed' }
      await registered(borrowed, signal)
      return freeze(borrowed)
    },
    async inspect(identity, signal) {
      await host.authorize({ operation: 'inspect', paths: [identity.repositoryPath, identity.root, identity.path, identity.gitCommonDir, ...(identity.gitDir ? [identity.gitDir] : [])] }, signal)
      try { await host.lstat(identity.path, signal) } catch (error) {
        if (!missing(error)) throw error
        return freeze({ identityVerified: false, exists: false, tracked: [], untracked: [], ignored: [], headOid: null, branchOid: null, digest: 'absent' })
      }
      const actual = await verify(identity, signal)
      const status = (await git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching', '--ignore-submodules=none'], identity.path, signal)).stdout
      const tracked: string[] = [], untracked = list((await git(['ls-files', '--others', '--exclude-standard', '-z'], identity.path, signal)).stdout), ignored = list((await git(['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], identity.path, signal)).stdout)
      const entries = list(status)
      for (let n = 0; n < entries.length; n++) {
        const item = entries[n]!, xy = item.slice(0, 2)
        if (xy === '??') { if (!untracked.includes(item.slice(3))) untracked.push(item.slice(3)); continue }
        if (xy === '!!') { if (!ignored.includes(item.slice(3))) ignored.push(item.slice(3)); continue }
        if (item.length < 4 || item[2] !== ' ') reject('unknown Git status encoding')
        tracked.push(item.slice(3))
        if (xy.includes('R') || xy.includes('C')) tracked.push(entries[++n] ?? reject('truncated Git rename status'))
      }
      const branchOid = identity.branchRef === null ? null : objectId(await output(['rev-parse', '--verify', identity.branchRef], identity.repositoryPath, signal))
      const workingDiff = (await git(['diff', '--no-ext-diff', '--no-textconv', '--binary', '--'], identity.path, signal)).stdout
      const stagedDiff = (await git(['diff', '--cached', '--no-ext-diff', '--no-textconv', '--binary', '--'], identity.path, signal)).stdout
      const hasher = createHash('sha256').update(JSON.stringify([status, actual.baseOid, branchOid, workingDiff, stagedDiff]))
      for (const file of [...new Set([...tracked, ...untracked, ...ignored])].sort()) hasher.update(JSON.stringify([file, await content(identity.path, file, signal)]))
      return freeze({ identityVerified: true, exists: true, tracked, untracked, ignored, headOid: actual.baseOid, branchOid, digest: hasher.digest('hex') })
    },
    async retire(identity, disposition, signal) {
      if (identity.ownership !== 'owned' || !identity.branchOwned) reject('borrowed resource must never be physically removed')
      id(disposition.authorId, 'actual disposition author')
      if (!['remove-clean', 'discard'].includes(disposition.kind) || !['keep', 'delete-owned'].includes(disposition.branch)) reject('invalid explicit author disposition')
      if (disposition.kind === 'discard' && (!disposition.expectedFactsDigest || !disposition.explanation?.trim())) reject('force removal requires explicit scoped author content disposition')
      await host.authorize({ operation: 'retire', paths: [identity.repositoryPath, identity.root, identity.path, identity.gitCommonDir, ...(identity.gitDir ? [identity.gitDir] : [])], disposition }, signal)
      const facts = await adapter.inspect(identity, signal)
      if (!facts.identityVerified || !facts.exists) reject('cannot prove original worktree identity')
      if (disposition.kind === 'remove-clean' && (facts.tracked.length || facts.untracked.length || facts.ignored.length)) throw new ResourceError('resource-busy', 'dirty/untracked/ignored content is not disposed')
      if (disposition.kind === 'discard' && facts.digest !== disposition.expectedFactsDigest) throw new ResourceError('resource-busy', 'content changed since author disposition')
      if (disposition.branch === 'delete-owned' && (!identity.branchRef || !disposition.expectedBranchOid || disposition.expectedBranchOid !== facts.branchOid)) reject('owned branch identity changed')
      // Repeat identity at the effect seam. Host locks/sandbox must prevent external
      // mutation; argv checks are not an adversarial filesystem security sandbox.
      await verify(identity, signal)
      if (disposition.branch === 'delete-owned') await noForeignBranchCheckout(identity, signal)
      await git(['worktree', 'remove', ...(disposition.kind === 'discard' ? ['--force'] : []), '--', identity.path], identity.repositoryPath, signal)
      if (disposition.branch === 'delete-owned') {
        // Atomic ref compare-delete, never branch -D or an unchecked force flag.
        await noForeignBranchCheckout(identity, signal)
        await git(['update-ref', '-d', identity.branchRef!, disposition.expectedBranchOid!], identity.repositoryPath, signal)
      }
    },
  }
  return freeze(adapter)
}
