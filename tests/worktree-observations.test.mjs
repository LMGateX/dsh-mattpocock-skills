import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Source-only public seam harness, matching the worktree-binding tests; no lib writes.
const sourceRoot = new URL('../src/controls/', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sourceRoot) && specifier.endsWith('.js') && specifier.startsWith('.')) {
      const candidate = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
        fileName: fileURLToPath(url),
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
const { createWorktreeObservations, parseWorktreeObservationsDocument } = await import('../src/controls/worktree-observations.ts')
const { probeWorktree } = await import('../src/controls/git-worktrees.ts')
const { MemoryVersionedStorage } = await import('../src/controls/versioned-storage.ts')
const owner = { instrumentInstanceId: 'instance-A', ownerSessionId: 'owner-A', controlWorkspaceId: 'workspace' }
const agent = sessionId => ({ kind: 'agent', principalId: 'agent:' + sessionId, sessionId })
const program = { kind: 'user', principalId: 'user:operator', sessionId: null }
const oid = 'a'.repeat(40)
const creation = (creatorSessionId = 'owner-A', callId = 'call-1', path = '/trees/A') => ({
  creatorSessionId, callId, rootCallId: callId, turn: 3, step: 2, path, branch: 'worktree-' + path.slice(-1), baseCommit: oid, repositoryRoot: '/repo',
})
const probeFacts = (over = {}) => ({
  repositoryPath: '/trees/A', gitCommonDir: '/repo/.git', gitDir: '/repo/.git/worktrees/A', pathIdentity: '1:2',
  branchRef: 'refs/heads/worktree-A', branchOid: oid, headOid: oid, ...over,
})
function fixture(now = () => 1_000) {
  const stores = new Map()
  const storage = key => {
    if (!stores.has(key)) stores.set(key, new MemoryVersionedStorage(parseWorktreeObservationsDocument))
    return stores.get(key)
  }
  return { storage, open: () => createWorktreeObservations(storage, now) }
}

test('one successful creation appends exactly one observed row and a repeated call never creates a second', async () => {
  const f = fixture(), observations = f.open()
  const first = await observations.observe(owner, agent('owner-A'), creation(), 'program')
  assert.equal(first.recorded, true)
  assert.equal(first.row.value.check.state, 'unverified')
  assert.equal(first.row.history[0].event, 'observed')
  assert.equal(first.row.history[0].source, 'program')
  const replay = await observations.observe(owner, agent('owner-A'), creation(), 'program')
  assert.equal(replay.recorded, false)
  assert.equal(replay.row.observationId, first.row.observationId)
  assert.equal((await observations.query(owner)).revision, 1)
  assert.equal((await f.open().query(owner)).rows.length, 1, 'reopening the storage keeps one row')
})

test('a second creation at the same path by the same session appends a version; another creator keeps its own row', async () => {
  const observations = fixture().open()
  const first = await observations.observe(owner, agent('owner-A'), creation(), 'program')
  const again = await observations.observe(owner, agent('owner-A'), creation('owner-A', 'call-2'), 'program')
  assert.equal(again.recorded, true)
  assert.equal(again.row.observationId, first.row.observationId)
  assert.equal(again.row.history.length, 2)
  assert.equal((await observations.query(owner)).rows.length, 1)
  const other = await observations.observe(owner, agent('child-B'), creation('child-B', 'call-3'), 'program')
  assert.notEqual(other.row.observationId, first.row.observationId)
  assert.equal((await observations.query(owner)).rows.length, 2)
  // The same call id can never describe a second payload, and earlier call ids stay reserved.
  for (const altered of [{ ...creation(), branch: 'other-branch' }, { ...creation(), path: '/trees/A2' }])
    await assert.rejects(observations.observe(owner, agent('owner-A'), altered, 'program'), error => error.code === 'operation-conflict')
})

test('an observing agent author must be the actual creator; replay is attributed to the program owner session', async () => {
  const observations = fixture().open()
  await assert.rejects(observations.observe(owner, agent('someone-else'), creation(), 'program'), error => error.code === 'access-denied')
  const replayed = await observations.observe(owner, program, creation('child-B', 'replay-1', '/trees/B'), 'replay')
  assert.equal(replayed.row.history[0].source, 'replay')
})

test('Git verification records identity facts, keeps unknown explicit, and never changes proven identity', async () => {
  const observations = fixture().open()
  const { row } = await observations.observe(owner, agent('owner-A'), creation(), 'program')
  const verified = await observations.check(owner, program, { observationId: row.observationId, kind: 'facts', facts: probeFacts() })
  assert.equal(verified.value.check.state, 'verified')
  assert.equal(verified.value.check.facts.gitCommonDir, '/repo/.git')
  const failed = await observations.check(owner, program, { observationId: row.observationId, kind: 'failed', diagnostic: 'git unavailable' })
  assert.equal(failed.value.check.state, 'failed')
  assert.equal(failed.value.check.diagnostic, 'git unavailable')
  assert.deepEqual(failed.value.check.facts, verified.value.check.facts, 'a failed recheck cannot erase proven facts')
  await assert.rejects(observations.check(owner, program, { observationId: row.observationId, kind: 'facts', facts: probeFacts({ gitCommonDir: '/other/.git' }) }),
    error => error.code === 'invalid-input', 'a proven Git identity cannot move')
  const moved = await observations.check(owner, program, { observationId: row.observationId, kind: 'facts', facts: probeFacts({ branchOid: 'b'.repeat(40) }) })
  assert.equal(moved.value.check.facts.branchOid, 'b'.repeat(40), 'a moved branch OID is a new observation, not a new identity')
  const absent = await observations.check(owner, program, { observationId: row.observationId, kind: 'absent' })
  assert.equal(absent.value.check.state, 'absent')
  assert.equal(absent.value.check.checkedAt, 1_000)
})

test('author-declared cleaned leaves the current view, stays readable in history, and cannot be reopened', async () => {
  const observations = fixture().open()
  const { row } = await observations.observe(owner, agent('owner-A'), creation(), 'program')
  const command = { operationId: 'clean-A', observationId: row.observationId, expectedRevision: row.revision, state: 'cleaned', notes: 'removed by hand' }
  const cleaned = await observations.updateBusiness(owner, agent('owner-A'), command)
  assert.equal(cleaned.value.business.state, 'cleaned')
  const snapshot = await observations.query(owner)
  assert.deepEqual(snapshot.current, [])
  assert.equal(snapshot.rows.length, 1)
  assert.equal(snapshot.rows[0].history.at(-1).source, 'agent')
  await assert.rejects(observations.updateBusiness(owner, agent('owner-A'), { ...command, operationId: 'clean-B', expectedRevision: cleaned.revision, state: 'open' }),
    error => error.code === 'invalid-state')
  await assert.rejects(observations.updateBusiness(owner, agent('owner-A'), { ...command, operationId: 'clean-C', expectedRevision: 1, state: 'cleaned' }),
    error => error.code === 'revision-conflict')
})

test('the storage parser rejects unknown fields, foreign owners, gaps and fabricated first versions', async () => {
  const f = fixture(), observations = f.open()
  const { row } = await observations.observe(owner, agent('owner-A'), creation(), 'program')
  const verified = await observations.check(owner, program, { observationId: row.observationId, kind: 'facts', facts: probeFacts() })
  assert.equal(verified.value.check.state, 'verified')
  const document = await f.storage('owner-A').read()
  assert.equal(parseWorktreeObservationsDocument(document).rows.length, 1)
  const unknown = structuredClone(document); unknown.rows[0].extra = true
  assert.throws(() => parseWorktreeObservationsDocument(unknown), /unknown key extra/)
  const gap = structuredClone(document); gap.revision = 5
  assert.throws(() => parseWorktreeObservationsDocument(gap), /revision gap|missing/)
  const fabricated = structuredClone(document); fabricated.rows[0].history[0].event = 'verified'
  assert.throws(() => parseWorktreeObservationsDocument(fabricated), /program-observed creation/)
  // A retained version may not move a proven filesystem identity.
  const movedIdentity = structuredClone(document)
  const moved = structuredClone(movedIdentity.rows[0].history[1])
  moved.revision = 3
  moved.value = { ...moved.value, check: { ...moved.value.check, facts: { ...moved.value.check.facts, pathIdentity: '9:9' } } }
  movedIdentity.rows[0].history.push(moved)
  movedIdentity.rows[0].value = moved.value
  movedIdentity.rows[0].revision = 3
  movedIdentity.revision = 3
  assert.throws(() => parseWorktreeObservationsDocument(movedIdentity), /identity cannot change or move/)
  // A second observed creation at the same path is legal; changing the creator or path is not.
  const relocated = structuredClone(document)
  relocated.rows[0].history.push({ revision: 3, recordedAt: 1, event: 'observed', source: 'program', author: agent('owner-A'), value: { ...relocated.rows[0].value, callId: 'call-9' } })
  relocated.rows[0].value = relocated.rows[0].history[2].value
  relocated.rows[0].revision = 3
  relocated.revision = 3
  assert.equal(parseWorktreeObservationsDocument(relocated).rows[0].history.length, 3)
  const foreign = structuredClone(relocated)
  foreign.rows[0].history[2].value.path = '/trees/B'
  foreign.rows[0].value = foreign.rows[0].history[2].value
  assert.throws(() => parseWorktreeObservationsDocument(foreign), /row identity cannot change/)
  assert.equal(row.value.creatorSessionId, 'owner-A')
})

function runner(overrides = {}) {
  const calls = []
  const run = async argv => {
    calls.push(argv)
    const args = argv.slice(5).join(' ')
    const answer = overrides[args]
    if (answer === undefined) throw new Error('unexpected Git argv: ' + args)
    return answer
  }
  return {
    calls,
    authorize: async () => {},
    lstat: async path => overrides['lstat:' + path] ?? { kind: 'directory', identity: path === '/repo/.git' ? '7:7' : '1:2' },
    realpath: async path => path,
    readFile: async () => new Uint8Array(),
    readlink: async () => '',
    readDirectory: async () => [],
    run,
  }
}

test('probeWorktree proves an existing checkout and reports a missing path as absent, not as failure', async () => {
  const host = runner({
    'rev-parse --show-toplevel': { exitCode: 0, stdout: '/trees/A\n', stderr: '' },
    'rev-parse --path-format=absolute --git-common-dir': { exitCode: 0, stdout: '/repo/.git\n', stderr: '' },
    'rev-parse --absolute-git-dir': { exitCode: 0, stdout: '/repo/.git/worktrees/A\n', stderr: '' },
    'symbolic-ref --quiet HEAD': { exitCode: 0, stdout: 'refs/heads/worktree-A\n', stderr: '' },
    'rev-parse --verify HEAD^{commit}': { exitCode: 0, stdout: oid + '\n', stderr: '' },
    'rev-parse --verify refs/heads/worktree-A': { exitCode: 0, stdout: oid + '\n', stderr: '' },
  })
  const probe = await probeWorktree(host, '/trees/A')
  assert.deepEqual(probe, { exists: true, repositoryPath: '/trees/A', gitCommonDir: '/repo/.git', gitDir: '/repo/.git/worktrees/A',
    pathIdentity: '1:2', branchRef: 'refs/heads/worktree-A', branchOid: oid, headOid: oid })
  const missing = runner()
  missing.lstat = async () => { const error = new Error('missing'); error.code = 'ENOENT'; throw error }
  assert.deepEqual(await probeWorktree(missing, '/trees/gone'), { exists: false, repositoryPath: null, gitCommonDir: null, gitDir: null,
    pathIdentity: null, branchRef: null, branchOid: null, headOid: null })
  const wrongRoot = runner({ 'rev-parse --show-toplevel': { exitCode: 0, stdout: '/elsewhere\n', stderr: '' } })
  await assert.rejects(probeWorktree(wrongRoot, '/trees/A'), error => error.code === 'identity-conflict')
  const notDirectory = runner()
  notDirectory.lstat = async () => ({ kind: 'file', identity: '1:2' })
  await assert.rejects(probeWorktree(notDirectory, '/trees/A'), error => error.code === 'identity-conflict')
})
