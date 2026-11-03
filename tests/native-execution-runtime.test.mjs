import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, mountedFixture, actualAgent, caller, core, policy, signal } from './fixtures/runtime-host.mjs'

const oid = 'b'.repeat(40)
const success = (path = '/trees/A', branch = 'worktree-A') => ({ isError: false, value: { path, branch, baseCommit: oid, repositoryRoot: '/repo' } })
function worktreeExec(agent, callId = 'native-wb-1') {
  return { name: 'create_worktree', arguments: { name: 'worktree-A' }, callId, rootCallId: callId, token: {}, agent, signal: signal(), deferContext() {}, concludeTurn() {} }
}
async function until(check, timeout = 3000) {
  const started = Date.now()
  for (;;) {
    if (await check()) return
    if (Date.now() - started > timeout) throw new Error('condition was not reached')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}
const execution = (view, sessionId) => (view.nativeExecutions ?? []).find(row => row.sessionId === sessionId)
const runtimeDocument = async f => f.units.get('runtime_bindings').read()

test('created, start and end keep one owner row with live activity and the host stopReason', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('native-one', { parent: 'root', managed: true, cwd: '/trees/A' })
  await f.created(child)
  let snap = await f.read()
  assert.equal(snap.nativeExecutions.length, 1)
  assert.equal(snap.nativeExecutions[0].state, 'created')
  assert.equal(snap.nativeExecutions[0].initialCwd, '/trees/A')
  assert.equal(snap.nativeExecutions[0].activity, 'idle')
  assert.equal(snap.nativeExecutions[0].outcome, null)
  assert.equal(snap.nativeExecutions[0].worktree, null)
  assert.equal(snap.nativeExecutions[0].lane, null)

  child.status = 'running'
  await f.event(child, 'subagent-start', { runId: 'run-1', provider: 'spawn', local: true })
  snap = await f.read()
  assert.equal(snap.nativeExecutions[0].state, 'running')
  assert.equal(snap.nativeExecutions[0].activity, 'running')
  assert.equal(snap.nativeExecutions[0].provider, 'spawn')
  assert.equal(snap.nativeExecutions[0].runId, 'run-1')

  child.status = 'idle'
  await f.event(child, 'subagent-end', { runId: 'run-1', provider: 'spawn', local: true, stopReason: 'completed' })
  snap = await f.read()
  assert.equal(snap.nativeExecutions[0].state, 'ended')
  assert.equal(snap.nativeExecutions[0].outcome, 'completed')
  assert.equal(snap.nativeExecutions[0].observed, 'subagent/end: completed')
  assert.equal(snap.nativeExecutions[0].activity, 'idle')
  assert.equal(snap.notifications ?? undefined, undefined)
  assert.deepEqual(f.notificationCalls, [], 'observing lifecycle edges never wakes the owner')

  const page = await f.runtime.historyAction(caller('root'), 'root', { action: 'query', query: { kind: 'native-execution' } }, signal())
  assert.equal(page.total, 3, 'one native execution row keeps one history version per document revision')
  const detail = await f.runtime.historyAction(caller('root'), 'root', { action: 'detail', historyIds: page.rows.map(row => row.historyId) }, signal())
  assert(detail.rows.every(row => row.snapshot.sessionId === child.id))
  assert.equal(detail.rows.some(row => row.snapshot.state === 'created'), true)
  assert.equal(detail.rows.some(row => row.snapshot.state === 'running'), true)
  assert.equal(detail.rows.some(row => row.snapshot.outcome === 'completed'), true)
  assert.equal(detail.rows[0].sourceDomain, 'runtime')
})

test('duplicate lifecycle edges and a hot reload reuse one row without document churn', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('native-dupe', { parent: 'root', managed: true, cwd: '/trees/D' })
  await f.created(child)
  await f.event(child, 'subagent-start', { runId: 'run-1', provider: 'spawn', local: true })
  let doc = await runtimeDocument(f)
  const afterStart = doc.revision
  await f.event(child, 'subagent-start', { runId: 'run-1', provider: 'spawn', local: true })
  doc = await runtimeDocument(f)
  assert.equal(doc.revision, afterStart, 'a duplicate start is equivalent and writes no revision')
  await f.event(child, 'subagent-end', { runId: 'run-1', provider: 'spawn', local: true, stopReason: 'completed' })
  doc = await runtimeDocument(f)
  const afterEnd = doc.revision
  await f.event(child, 'subagent-end', { runId: 'run-1', provider: 'spawn', local: true, stopReason: 'completed' })
  doc = await runtimeDocument(f)
  assert.equal(doc.revision, afterEnd, 'a duplicate end is equivalent and writes no revision')
  await f.created(child)
  doc = await runtimeDocument(f)
  assert.equal(doc.revision, afterEnd, 'a creation replay never rewrites the ended row')
  assert.equal(doc.nativeExecutions.length, 1)

  await f.reopen()
  await f.event(child, 'subagent-end', { runId: 'run-1', provider: 'spawn', local: true, stopReason: 'completed' })
  const restored = await f.read()
  assert.equal(restored.nativeExecutions.length, 1, 'hot reload restores the same row, never a second one')
  assert.equal(restored.nativeExecutions[0].state, 'ended')
  assert.equal(restored.nativeExecutions[0].outcome, 'completed')
  doc = await runtimeDocument(f)
  assert.equal(doc.revision, afterEnd, 'a post-reload duplicate end writes no revision')
})

test('disposed without a published end stays disposed with outcome null', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('native-disposed', { parent: 'root', managed: true, cwd: '/trees/X' })
  await f.created(child)
  await f.event(child, 'subagent-start', { runId: 'run-1', provider: 'spawn', local: true })
  await f.event(child)
  const row = execution(await f.read(), child.id)
  assert.equal(row.state, 'disposed')
  assert.equal(row.outcome, null)
  assert.equal(row.endedAt, null)
  assert.equal(row.observed, 'agent/disposed')
  const before = (await runtimeDocument(f)).revision
  await f.event(child)
  assert.equal((await runtimeDocument(f)).revision, before, 'a repeated disposal writes no revision')
})

test('native execution writes follow the management extension gate and preserve existing rows when off', async t => {
  const f = await fixture(t) // management starts OFF
  const offChild = actualAgent('gated-off', { parent: 'root', managed: true, cwd: '/trees/OFF' })
  await f.created(offChild)
  await f.event(offChild, 'subagent-start', { runId: 'off-run', provider: 'spawn', local: true })
  await f.event(offChild, 'subagent-end', { runId: 'off-run', provider: 'spawn', local: true, stopReason: 'completed' })
  const offDocument = await runtimeDocument(f)
  assert.equal(offDocument?.nativeExecutions?.length ?? 0, 0, 'management off adds no native execution fact')
  assert.deepEqual((await f.read()).nativeExecutions, [])

  await f.save(policy())
  const onChild = actualAgent('gated-on', { parent: 'root', managed: true, cwd: '/trees/ON' })
  await f.created(onChild)
  await f.event(onChild, 'subagent-start', { runId: 'on-run', provider: 'spawn', local: true })
  let snap = await f.read()
  assert.equal(snap.nativeExecutions.length, 1, 're-enabling management records the next native execution')
  assert.equal(snap.nativeExecutions[0].sessionId, onChild.id)
  assert.equal(snap.nativeExecutions[0].state, 'running')
  await f.event(onChild, 'subagent-end', { runId: 'on-run', provider: 'spawn', local: true, stopReason: 'completed' })
  snap = await f.read()
  assert.equal(snap.nativeExecutions[0].state, 'ended')
  assert.equal(snap.nativeExecutions[0].outcome, 'completed')

  const offPolicy = { extensionEnabled: false, defaults: { workspace: { enabled: true }, ticketProgress: { enabled: true },
    pendingDecisions: { enabled: true }, windows: { enabled: true, ticketWindowSize: 2, runningSubagentLimit: 2 } }, workspaceOverrides: {} }
  await f.save(offPolicy)
  assert.equal((await f.read()).nativeExecutions.length, 1, 'management off keeps existing rows readable')
  assert.equal((await f.read()).nativeExecutions[0].sessionId, onChild.id)
  const laterChild = actualAgent('gated-later', { parent: 'root', managed: true, cwd: '/trees/LATER' })
  await f.created(laterChild)
  await f.event(laterChild, 'subagent-start', { runId: 'later-run', provider: 'spawn', local: true })
  assert.equal((await runtimeDocument(f)).nativeExecutions.length, 1, 'management off adds no row for a later child')
  assert.deepEqual((await f.read()).nativeExecutions.map(row => row.sessionId), [onChild.id])
})

test('an exact initial cwd matches a current observation and nativeChildren separates relations', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const creator = actualAgent('creator-child', { parent: 'root', managed: true, cwd: '/trees/A' })
  const sibling = actualAgent('same-cwd-child', { parent: 'root', managed: true, cwd: '/trees/A' })
  const elsewhere = actualAgent('other-cwd-child', { parent: 'root', managed: true, cwd: '/trees/B' })
  await f.created(creator); await f.created(sibling); await f.created(elsewhere)
  await f.runtime.postExecute(caller(creator.id), worktreeExec(f.agents.get(creator.id)), success('/trees/A', 'worktree-A'), '1:1')
  let snap = await f.read()
  const observation = snap.worktreeObservations[0]
  assert.equal(observation.value.path, '/trees/A')
  const creatorRow = execution(snap, creator.id)
  assert.equal(creatorRow.worktree.path, '/trees/A')
  assert.equal(creatorRow.worktree.observationId, observation.observationId)
  assert.equal(creatorRow.worktree.source, 'observed')
  assert.equal(execution(snap, sibling.id).worktree.observationId, observation.observationId, 'the same exact path matches at read time')
  assert.equal(execution(snap, elsewhere.id).worktree, null, 'a different path never associates')
  assert.deepEqual(observation.nativeChildren, [
    { sessionId: creator.id, initialCwd: '/trees/A', relation: 'created-tree', source: 'observed' },
    { sessionId: sibling.id, initialCwd: '/trees/A', relation: 'initial-cwd', source: 'observed' },
  ])
  assert.equal(observation.nativeChildren.some(row => row.sessionId === elsewhere.id), false)
  // The native path writes only observations + assignment, never a delegate-style strong binding.
  assert.deepEqual(snap.worktreeBindings, [])
  await f.assign(sibling.id, 'flow', ['T1'])
  snap = await f.read()
  assert.deepEqual(execution(snap, sibling.id).lane, { workflowId: 'flow', ticketIds: ['T1'], task: null, source: 'inferred' })
  assert.equal(execution(snap, creator.id).lane, null)
  assert.deepEqual(snap.worktreeBindings, [], 'read-time native associations never write a strong binding')
  assert.deepEqual((await f.runtime.worktreeAction(caller('root'), 'root', { action: 'read' }, signal())).rows, [])
})

test('a delegate binding contributes an inferred lane while the fact row stays a native fact', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  f.ports.flushSession = async () => true
  f.ports.capabilities = { ...f.ports.capabilities, nativeInitialChildCwd: 'supported' }
  f.ports.createContinuable = async (exec, request) => {
    const child = actualAgent(request.childId, { parent: exec.agent.id, managed: true, cwd: request.cwd ?? exec.agent.session.header.cwd })
    f.agents.set(child.id, child)
    await f.runtime.created(caller(child.id), signal(), child)
    return { childId: child.id, messageId: 'native-' + child.id }
  }
  const result = await f.runtime.delegate(caller('root'), { description: 'Bound lane', prompt: 'Inspect', worktree: '/trees/BOUND' }, f.exec())
  assert.equal(result.accepted, true)
  const snap = await f.read()
  const row = execution(snap, result.childId)
  assert.equal(row.initialCwd, '/trees/BOUND')
  assert.equal(row.state, 'created')
  assert.deepEqual(row.lane, { workflowId: null, ticketIds: [], task: 'Bound lane', source: 'inferred' })
  assert.equal(snap.worktreeBindings.length, 1, 'delegate remains the only strong-binding writer')
  assert.equal(snap.worktreeBindings[0].value.actualChildSessionId, result.childId)
})

test('execution facts are coordinator-only and keep S, nativeStops and owner notices intact', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  const child = actualAgent('native-scope', { parent: 'root', managed: true, cwd: '/trees/S' })
  await f.created(child)
  await f.assign(child.id, 'flow', ['T1'])
  const root = await f.read()
  assert.equal(root.windows.S.used, 1)
  assert.equal(execution(root, child.id).sessionId, child.id)
  const restricted = await f.read(child.id)
  assert.equal(restricted.nativeExecutions, undefined, 'an assigned child never receives sibling execution facts')
  assert.deepEqual(restricted.health.filter(row => row.scope === 'native-executions'), [
    { scope: 'native-executions', status: 'restricted', reason: 'coordinator registry is not assigned-child task data' },
  ])
  f.stop({ itemId: 'native-stop-scope', sessionId: child.id, turn: 2, outcome: 'completed', cancelCause: null, diagnostic: null, evidence: null, observed: 'ended with completed' })
  await f.runtime.observe({ kind: 'native-stop', ownerSessionId: 'root', item: { ...f.stops[0] } })
  await f.runtime.observe({ kind: 'native-stop', ownerSessionId: 'root', item: { ...f.stops[0] } })
  await until(async () => f.notificationCalls.length === 1)
  assert.equal(f.notificationCalls.length, 1, 'one terminal item is still one owner notice')
  const afterStop = await f.read()
  assert.equal(afterStop.nativeStops.length, 1)
  assert.equal(execution(afterStop, child.id).state, 'created', 'a native-stop does not rewrite the execution row')
  await f.event(child)
  assert.equal((await f.read()).windows.S.used, 0)
})

test('C adds no model tool and no Remote method', async t => {
  const f = await mountedFixture(t)
  const visible = f.ctx.tools.schemas(f.root).map(row => row.name).filter(name => name.startsWith('mattpocock_')).sort()
  assert.deepEqual(visible, ['mattpocock_assign', 'mattpocock_controls', 'mattpocock_history',
    'mattpocock_record', 'mattpocock_resource', 'mattpocock_window', 'mattpocock_worktree'])
  assert.equal(visible.length, 7)
  assert.equal(f.ctx.tools.get('mattpocock_delegate'), undefined, 'delegate is opt-in, not part of the default C surface')
  assert.equal(core.REMOTE_METHODS.length, 16)
  assert.equal(core.REMOTE_METHODS.includes('readNativeExecutions'), false)
})
