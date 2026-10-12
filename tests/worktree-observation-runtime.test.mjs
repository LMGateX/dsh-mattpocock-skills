import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, actualAgent, caller, policy, signal } from './fixtures/runtime-host.mjs'

const oid = 'a'.repeat(40)
const success = (over = {}) => ({ isError: false, value: { path: '/trees/A', branch: 'worktree-A', baseCommit: oid, repositoryRoot: '/repo', ...over } })
function worktreeExec(agent, callId = 'wb-call-1', over = {}) {
  return { name: 'create_worktree', arguments: { name: 'worktree-A' }, callId, rootCallId: callId, token: {}, agent, signal: signal(), deferContext() {}, concludeTurn() {}, ...over }
}
function gitRunner() {
  const answers = {
    'rev-parse --show-toplevel': '/trees/A',
    'rev-parse --path-format=absolute --git-common-dir': '/repo/.git',
    'rev-parse --absolute-git-dir': '/repo/.git/worktrees/A',
    'symbolic-ref --quiet HEAD': 'refs/heads/worktree-A',
    'rev-parse --verify HEAD^{commit}': oid,
    'rev-parse --verify refs/heads/worktree-A': oid,
  }
  return {
    async authorize() {},
    async lstat(path) { return { kind: 'directory', identity: path.startsWith('/repo/.git') ? '7:7' : '1:2' } },
    async realpath(path) { return path },
    async readFile() { return new Uint8Array() },
    async readlink() { return '' },
    async readDirectory() { return [] },
    async run(argv) {
      const key = argv.slice(5).join(' ')
      if (!Object.hasOwn(answers, key)) return { exitCode: 1, stdout: '', stderr: 'unexpected argv' }
      return { exitCode: 0, stdout: answers[key] + '\n', stderr: '' }
    },
  }
}
async function until(check, timeout = 3000) {
  const started = Date.now()
  for (;;) {
    if (await check()) return
    if (Date.now() - started > timeout) throw new Error('condition was not reached')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}
const checkState = view => view.worktreeObservations[0]?.value.check.state

test('a successful native creation is observed once and verified through the owner-anchored runner', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('observer-child', { parent: 'root', managed: true })
  await f.created(child)
  f.setRunner(() => gitRunner())
  const before = await f.read()
  assert.deepEqual(before.worktreeObservations, [])
  await f.runtime.postExecute(caller(child.id), worktreeExec(f.agents.get(child.id)), success(), '4:2')
  const view = await f.read()
  assert.equal(view.worktreeObservations.length, 1)
  const row = view.worktreeObservations[0]
  assert.equal(row.value.path, '/trees/A')
  assert.equal(row.value.branch, 'worktree-A')
  assert.equal(row.value.creatorSessionId, child.id)
  assert.equal(row.value.turn, 4)
  assert.equal(row.value.step, 2)
  assert.equal(row.creatorActivity, 'idle', 'a live resident child that is not running reads as idle')
  assert.equal(row.lane, null, 'no lane binding means the ticket information stays unknown')
  assert.equal(row.value.business.state, 'open')
  assert.equal(view.health.some(entry => entry.scope === 'worktree-observations' && entry.status === 'unknown'), false)
  assert.deepEqual(f.gitCalls.map(entry => entry.sessionId), ['root'], 'verification is anchored at the owner session, not the creating child')
  await until(async () => checkState(await f.read()) === 'verified')
  const checked = (await f.read()).worktreeObservations[0]
  assert.equal(checked.value.check.facts.gitCommonDir, '/repo/.git')
  assert.equal(checked.value.check.facts.pathIdentity, '1:2')
  // The same call replayed (PTC retry, hot reload, duplicate result) never adds a second row.
  await f.runtime.postExecute(caller(child.id), worktreeExec(f.agents.get(child.id)), success(), '4:2')
  assert.equal((await f.read()).worktreeObservations.length, 1)
  assert.equal((await f.read()).worktreeObservations[0].revision, checked.revision)
})

test('a failed call writes nothing and an unavailable Git seam records unknown, never success', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('unverified-child', { parent: 'root', managed: true })
  await f.created(child)
  await f.runtime.postExecute(caller(child.id), worktreeExec(f.agents.get(child.id), 'wb-failed'), { isError: true, value: null, error: { message: 'creation failed' } }, '4:1')
  assert.deepEqual((await f.read()).worktreeObservations, [], 'a failed tool call is not an observation')
  await f.runtime.postExecute(caller(child.id), worktreeExec(f.agents.get(child.id), 'wb-ok'), success(), '4:2')
  await until(async () => checkState(await f.read()) === 'failed')
  const row = (await f.read()).worktreeObservations[0]
  assert.match(row.value.check.diagnostic, /no permitted fake runner|access-denied/)
  assert.equal(row.value.check.facts, null)
  assert.equal(row.value.check.checkedAt !== null, true)
})

test('a PTC sub-dispatch keeps its own call identity inside the outer call', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('ptc-child', { parent: 'root', managed: true })
  await f.created(child)
  const ptc = worktreeExec(f.agents.get(child.id), 'outer-call:ptc:1', { rootCallId: 'outer-call', parent: {} })
  await f.runtime.postExecute(caller(child.id), ptc, success({ path: '/trees/P', branch: 'worktree-P' }), '5:1')
  const rows = (await f.read()).worktreeObservations
  assert.equal(rows.length, 1)
  assert.equal(rows[0].value.callId, 'outer-call:ptc:1')
  assert.equal(rows[0].value.rootCallId, 'outer-call')
  assert.equal(rows[0].value.path, '/trees/P')
})

test('durable session events backfill a missing row once and mark it as lower-evidence replay', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('replay-child', { parent: 'root', managed: true })
  const descriptor = { type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', provider: 'spawn', label: 'fixture' } }
  const payload = (path, branch) => JSON.stringify({ path, branch, baseCommit: oid, repositoryRoot: '/repo' })
  child.session.ownEvents = () => [descriptor,
    { type: 'tool/call', data: { turn: 7, step: 1, callId: 'logged-1', name: 'create_worktree', arguments: '{"name":"worktree-R"}' } },
    { type: 'tool/result', data: { turn: 7, step: 1, message: { toolCallId: 'logged-1', content: [{ type: 'text', text: payload('/trees/R', 'worktree-R') }] } } },
    { type: 'tool/call', data: { turn: 7, step: 2, callId: 'logged-failed', name: 'create_worktree', arguments: '{}' } },
    { type: 'tool/result', data: { turn: 7, step: 2, message: { toolCallId: 'logged-failed', content: [{ type: 'text', text: 'boom' }] }, error: { name: 'Error', code: 'failed' } } },
    { type: 'tool/ptc-dispatch', data: { rootCallId: 'run-1', parentCallId: 'run-1', subCallId: 'run-1:ptc:2', name: 'create_worktree', isError: false, content: [{ type: 'text', text: payload('/trees/Q', 'worktree-Q') }] } },
  ]
  await f.created(child)
  const view = await f.read()
  const rows = view.worktreeObservations
  assert.deepEqual(rows.map(row => row.value.path).sort(), ['/trees/Q', '/trees/R'])
  assert(rows.every(row => row.source === 'replay'), 'replay evidence is stated as such')
  const logged = rows.find(row => row.value.path === '/trees/R')
  assert.equal(logged.value.callId, 'logged-1')
  assert.equal(logged.value.turn, 7)
  assert.equal(rows.find(row => row.value.path === '/trees/Q').value.callId, 'run-1:ptc:2')
  assert.equal((await f.read()).worktreeObservations.length, 2, 'replay is idempotent')
})

test('a terminal item names the trees its child created, and creation itself never wakes the owner', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('stop-child', { parent: 'root', managed: true })
  await f.created(child)
  await f.runtime.postExecute(caller(child.id), worktreeExec(f.agents.get(child.id), 'wb-stop'), success(), '6:1')
  await f.read()
  assert.deepEqual(f.notificationCalls, [], 'observing a creation is not a wake')
  f.stop({ itemId: 'stop-1', sessionId: child.id, turn: 6, outcome: 'completed', cancelCause: null, diagnostic: null, evidence: null, observed: 'ended with completed' })
  const view = await f.read()
  assert.equal(view.nativeStops.length, 1)
  assert.deepEqual(view.nativeStops[0].createdWorktrees, [{ path: '/trees/A', branch: 'worktree-A', businessState: 'open' }])
  await f.runtime.observe({ kind: 'native-stop', ownerSessionId: 'root', item: { ...f.stops[0], ownerSessionId: undefined } })
  await f.runtime.observe({ kind: 'native-stop', ownerSessionId: 'root', item: { ...f.stops[0], ownerSessionId: undefined } })
  await until(async () => f.notificationCalls.length === 1)
  assert.equal(f.notificationCalls.length, 1, 'one terminal item is one durable owner notice')
})

test('the management extension gate suppresses observation writes entirely', async t => {
  const f = await fixture(t)
  const child = actualAgent('off-child', { parent: 'root', managed: true })
  await f.created(child)
  await f.runtime.postExecute(caller(child.id), worktreeExec(f.agents.get(child.id)), success(), '2:1')
  assert.deepEqual((await f.read()).worktreeObservations, [])
})

test('an author-declared cleaned row leaves the current view through the worktree action', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('clean-child', { parent: 'root', managed: true })
  await f.created(child)
  await f.runtime.postExecute(caller(child.id), worktreeExec(f.agents.get(child.id)), success(), '3:1')
  const before = await f.read()
  const row = before.worktreeObservations[0]
  const updated = await f.runtime.worktreeAction(caller('root'), 'root', {
    action: 'update-observation',
    command: { operationId: 'clean-1', observationId: row.observationId, expectedRevision: row.revision, state: 'cleaned', notes: 'removed by hand' },
  }, signal())
  assert.equal(updated.value.business.state, 'cleaned')
  assert.deepEqual((await f.read()).worktreeObservations, [])
  const units = [...f.units.entries()].find(([name]) => name.startsWith('worktree_observations_'))
  assert.equal((await units[1].read()).rows.length, 1, 'the durable record is retained after the authored mark')
})
