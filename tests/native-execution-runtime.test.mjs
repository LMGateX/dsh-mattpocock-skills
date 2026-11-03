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
const nativeEnd = (sessionId, runId, stopReason = 'completed') => ({
  kind: 'subagent-end', sessionId, runId, provider: 'spawn', local: true, stopReason,
})

test('created, start and end keep one owner row with live activity and the host stopReason', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('native-one', { parent: 'root', managed: true, cwd: '/trees/A' })
  await f.created(child)
  let snap = await f.read()
  assert.equal(snap.nativeExecutions.length, 1)
  assert.equal(snap.nativeExecutions[0].state, 'created')
  assert.equal(snap.nativeExecutions[0].headerCwd, '/trees/A')
  assert.equal(Object.hasOwn(snap.nativeExecutions[0], 'initialCwd'), false)
  assert.equal(Object.hasOwn(snap.nativeExecutions[0], 'worktree'), false)
  assert.equal(snap.nativeExecutions[0].activity, 'idle')
  assert.equal(snap.nativeExecutions[0].outcome, null)
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
  assert.equal(snap.nativeExecutions[0].runId, 'run-1')
  assert.equal(snap.nativeExecutions[0].observed, 'subagent/end: completed')
  assert.equal(snap.nativeExecutions[0].activity, 'idle')
  assert.equal(snap.notifications ?? undefined, undefined)
  assert.deepEqual(f.notificationCalls, [], 'observing lifecycle edges never wakes the owner')

  const stored = (await runtimeDocument(f)).nativeExecutions[0]
  assert.equal(stored.headerCwd, '/trees/A')
  assert.equal(Object.hasOwn(stored, 'initialCwd'), false, 'new writes store only the header key')

  const page = await f.runtime.historyAction(caller('root'), 'root', { action: 'query', query: { kind: 'native-execution' } }, signal())
  assert.equal(page.total, 3, 'one native execution row keeps one history version per document revision')
  const detail = await f.runtime.historyAction(caller('root'), 'root', { action: 'detail', historyIds: page.rows.map(row => row.historyId) }, signal())
  assert(detail.rows.every(row => row.snapshot.sessionId === child.id))
  assert.equal(detail.rows.some(row => row.snapshot.state === 'created'), true)
  assert.equal(detail.rows.some(row => row.snapshot.state === 'running'), true)
  assert.equal(detail.rows.some(row => row.snapshot.outcome === 'completed'), true)
  assert.equal(detail.rows.every(row => Object.hasOwn(row.snapshot, 'headerCwd') && !Object.hasOwn(row.snapshot, 'initialCwd')), true)
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

test('disposed without a published end stays disposed with outcome null and a later dispose never erases an outcome', async t => {
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
  assert.equal(row.runId, 'run-1', 'disposal is not an outcome but keeps the run identity')
  const before = (await runtimeDocument(f)).revision
  await f.event(child)
  assert.equal((await runtimeDocument(f)).revision, before, 'a repeated disposal writes no revision')

  const ended = actualAgent('native-ended-disposed', { parent: 'root', managed: true, cwd: '/trees/Y' })
  await f.created(ended)
  await f.event(ended, 'subagent-start', { runId: 'run-2', provider: 'spawn', local: true })
  await f.event(ended, 'subagent-end', { runId: 'run-2', provider: 'spawn', local: true, stopReason: 'error' })
  await f.event(ended)
  const endedRow = execution(await f.read(), ended.id)
  assert.equal(endedRow.state, 'ended')
  assert.equal(endedRow.outcome, 'error', 'disposal is never an outcome and never overwrites a published one')
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

test('a parent header plus a later tree event yields only created-tree, never a worktree or initial-cwd association', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const creator = actualAgent('header-parent', { parent: 'root', managed: true, cwd: '/trees' })
  const sibling = actualAgent('same-header', { parent: 'root', managed: true, cwd: '/trees' })
  const noHeader = actualAgent('no-header-creator', { parent: 'root', managed: true, cwd: null })
  await f.created(creator); await f.created(sibling); await f.created(noHeader)
  // Real host shape: the session header keeps the parent directory while the later directory
  // event adopts the requested worktree. Only the creation fact is observable here.
  await f.runtime.postExecute(caller(creator.id), worktreeExec(f.agents.get(creator.id), 'native-wb-a'), success('/trees/A', 'worktree-A'), '1:1')
  // The parent header directory itself is also observed as a tree: still not an initial-cwd relation.
  await f.runtime.postExecute(caller(sibling.id), worktreeExec(f.agents.get(sibling.id), 'native-wb-b'), success('/trees', 'worktree-parent'), '1:2')
  // A creator without a readable header still keeps its created-tree row with headerCwd null.
  await f.runtime.postExecute(caller(noHeader.id), worktreeExec(f.agents.get(noHeader.id), 'native-wb-c'), success('/trees/C', 'worktree-C'), '1:3')
  const snap = await f.read()
  const byPath = Object.fromEntries(snap.worktreeObservations.map(row => [row.value.path, row]))
  const creatorRow = execution(snap, creator.id)
  assert.equal(creatorRow.headerCwd, '/trees')
  assert.equal(Object.hasOwn(creatorRow, 'worktree'), false)
  assert.deepEqual(byPath['/trees/A'].nativeChildren, [
    { sessionId: creator.id, headerCwd: '/trees', relation: 'created-tree', source: 'observed' },
  ])
  assert.equal(byPath['/trees/A'].nativeChildren.some(row => row.sessionId === sibling.id), false,
    'a matching header path never adds a second association')
  assert.deepEqual(byPath['/trees'].nativeChildren, [
    { sessionId: sibling.id, headerCwd: '/trees', relation: 'created-tree', source: 'observed' },
  ], 'an observed tree equal to the header path is still only created-tree')
  assert.deepEqual(byPath['/trees/C'].nativeChildren, [
    { sessionId: noHeader.id, headerCwd: null, relation: 'created-tree', source: 'observed' },
  ], 'the creator row survives an unreadable header with an explicit null')
  assert.equal('initial-cwd' in byPath['/trees/A'].nativeChildren[0], false)
  assert.equal('initial-cwd' in byPath['/trees'].nativeChildren[0], false)
  assert.deepEqual(snap.worktreeBindings, [], 'read-time native associations never write a strong binding')
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
  assert.equal(row.headerCwd, '/trees/BOUND')
  assert.equal(Object.hasOwn(row, 'worktree'), false)
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

test('a late end after Agent disposal records the published outcome from the durable owner row', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('late-end', { parent: 'root', managed: true, cwd: '/trees/L' })
  await f.created(child)
  await f.read() // retain the owner view; children are not retained after disposal
  await f.event(child, 'subagent-start', { runId: 'run-1', provider: 'spawn', local: true })
  await f.event(child) // dispose→end: the registry no longer has the Agent
  let snap = await f.read()
  assert.equal(execution(snap, child.id).state, 'disposed')
  assert.equal(execution(snap, child.id).outcome, null)

  await f.runtime.observe(nativeEnd(child.id, 'run-1'))
  snap = await f.read()
  const row = execution(snap, child.id)
  assert.equal(row.state, 'ended', 'the published end is not silently dropped without actualAgent')
  assert.equal(row.outcome, 'completed')
  assert.equal(row.runId, 'run-1')
  assert.equal(row.endedAt !== null, true)
  assert.equal(snap.health.some(item => item.scope === 'native-executions' && item.status === 'unknown'), false)
  assert.deepEqual(f.notificationCalls, [], 'a late end adds no second terminal notification')
  assert.deepEqual(snap.nativeStops ?? [], [], 'a late end does not create nativeStops')
  const revision = (await runtimeDocument(f)).revision
  await f.runtime.observe(nativeEnd(child.id, 'run-1'))
  assert.equal((await runtimeDocument(f)).revision, revision, 'a repeated late end is idempotent')
})

test('an old run late end cannot overwrite a new run and leaves an explicit coverage gap', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('old-run-end', { parent: 'root', managed: true, cwd: '/trees/R' })
  await f.created(child)
  await f.read()
  child.status = 'running'
  await f.event(child, 'subagent-start', { runId: 'run-1', provider: 'spawn', local: true })
  await f.event(child, 'subagent-start', { runId: 'run-2', provider: 'spawn', local: true })
  await f.runtime.observe(nativeEnd(child.id, 'run-1'))
  let snap = await f.read()
  let row = execution(snap, child.id)
  assert.equal(row.state, 'running', 'the old run end cannot overwrite the new run')
  assert.equal(row.runId, 'run-2')
  assert.equal(row.outcome, null)
  let gap = snap.health.find(item => item.scope === 'native-executions')
  assert.equal(gap?.status, 'unknown')
  assert.match(gap.reason, /another host run|run identity/)

  await f.runtime.observe(nativeEnd(child.id, 'run-2', 'error'))
  snap = await f.read()
  row = execution(snap, child.id)
  assert.equal(row.state, 'ended')
  assert.equal(row.outcome, 'error')
  gap = snap.health.find(item => item.scope === 'native-executions')
  assert.equal(gap, undefined, 'the correctly attributed end clears the coverage gap')
})

test('an old Agent disposal cannot clobber a new live run or drop its retained view', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const old = actualAgent('dispose-run', { parent: 'root', managed: true, cwd: '/trees/D' })
  await f.created(old)
  await f.event(old, 'subagent-start', { runId: 'run-1', provider: 'spawn', local: true })
  const current = actualAgent('dispose-run', { parent: 'root', managed: true, cwd: '/trees/D' })
  f.agents.set(current.id, current)
  await f.created(current)
  await f.event(current, 'subagent-start', { runId: 'run-2', provider: 'spawn', local: true })
  await f.event(old, 'agent-disposed')
  const snap = await f.read()
  const row = execution(snap, old.id)
  assert.equal(row.state, 'running', 'the old Agent disposal does not clear the new run')
  assert.equal(row.runId, 'run-2')
  assert.equal(row.outcome, null)
  const gap = snap.health.find(item => item.scope === 'native-executions')
  assert.equal(gap?.status, 'unknown')
  assert.match(gap.reason, /earlier Agent|current run remains live/)
})

test('a late end without a durable row reports a coverage gap and creates no row', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('rowless-end', { parent: 'root', managed: true, cwd: '/trees/N' })
  await f.created(child)
  await f.read()
  const store = f.units.get('runtime_bindings'), document = await store.read()
  assert.equal(document.nativeExecutions.length, 1)
  assert.equal(await store.compareAndSwap(document.revision, { ...document, revision: document.revision + 1, nativeExecutions: [] }), true)
  await f.runtime.observe(nativeEnd(child.id, 'run-1', 'error'))
  const snap = await f.read()
  assert.equal((await runtimeDocument(f)).nativeExecutions.length, 0, 'a late end never creates a row')
  assert.equal(execution(snap, child.id), undefined)
  const gap = snap.health.find(item => item.scope === 'native-executions')
  assert.equal(gap?.status, 'unknown')
  assert.match(gap.reason, /no durable execution row/)
  assert.deepEqual(f.notificationCalls, [])
})

test('a rowless late end after disposal still attributes the gap to its owner', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('rowless-disposed', { parent: 'root', managed: true, cwd: '/trees/R' })
  await f.created(child)
  await f.read()
  await f.event(child, 'agent-disposed')
  const store = f.units.get('runtime_bindings'), document = await store.read()
  assert.equal(document.nativeExecutions.length, 1)
  assert.equal(await store.compareAndSwap(document.revision, { ...document, revision: document.revision + 1, nativeExecutions: [] }), true)
  await f.runtime.observe(nativeEnd(child.id, 'run-1', 'error'))
  const snap = await f.read()
  assert.equal((await runtimeDocument(f)).nativeExecutions.length, 0)
  assert.equal(execution(snap, child.id), undefined)
  const gap = snap.health.find(item => item.scope === 'native-executions')
  assert.equal(gap?.status, 'unknown')
  assert.match(gap.reason, /no durable execution row/)
  assert.deepEqual(f.notificationCalls, [])
})

test('a late end without a trusted owner view reports a gap instead of inventing one', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  const child = actualAgent('viewless-end', { parent: 'root', managed: true, cwd: '/trees/V' })
  await f.created(child)
  await f.read()
  // A restarted runtime seeds retained views from live Agents only. Keep the durable row and
  // its persisted association, but remove every live Agent so no owner view is retained.
  f.cold.set('root', actualAgent('root'))
  for (const key of [...f.agents.keys()]) f.agents.delete(key)
  await f.reopen()
  await f.runtime.observe(nativeEnd(child.id, 'run-1'))
  const owner = { kind: 'user', principalId: 'user:operator', sessionId: null }
  const snap = await f.runtime.readSession(owner, 'root', signal())
  const row = execution(snap, child.id)
  assert.equal(row.state, 'created', 'no view means no write and no guessed end')
  assert.equal(row.outcome, null)
  const gap = snap.health.find(item => item.scope === 'native-executions')
  assert.equal(gap?.status, 'unknown')
  assert.match(gap.reason, /owner view is unavailable/)
  assert.equal((await runtimeDocument(f)).nativeExecutions[0].state, 'created')
})

test('a non-local end is not this instrument\'s execution fact and does not report a gap', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  await f.read()
  await f.runtime.observe({ ...nativeEnd('foreign-child', 'run-1'), local: false })
  const snap = await f.read()
  assert.deepEqual(snap.nativeExecutions, [])
  assert.equal((await runtimeDocument(f))?.nativeExecutions?.length ?? 0, 0, 'a non-local end never creates a row')
  assert.equal(snap.health.some(item => item.scope === 'native-executions' && item.status === 'unknown'), false)
})

test('management off leaves a late end unwritten and does not report a false observation failure', async t => {
  const f = await fixture(t) // management starts OFF
  const child = actualAgent('late-off', { parent: 'root', managed: true, cwd: '/trees/LOFF' })
  await f.created(child)
  await f.read()
  await f.runtime.observe(nativeEnd(child.id, 'run-1'))
  const snap = await f.read()
  assert.equal((await runtimeDocument(f))?.nativeExecutions?.length ?? 0, 0)
  assert.equal(snap.health.some(item => item.scope === 'native-executions' && item.status === 'unknown'), false)
  assert.deepEqual(snap.nativeExecutions, [])
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
