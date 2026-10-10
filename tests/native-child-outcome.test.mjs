import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, mountedFixture, loadSDK, caller, policy, signal, actualAgent } from './fixtures/runtime-host.mjs'

const sessionSdk = await loadSDK('@deepseek-ai/dsh-session')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const waitFor = async (predicate, what = 'condition') => {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (await predicate()) return
    await sleep(5)
  }
  assert.fail('condition was not reached: ' + what)
}
const child = (id, status, parent = 'root') => {
  const agent = actualAgent(id, { parent, managed: true })
  agent.status = status
  return agent
}
const catalogRow = id => ({ kind: 'child', id, mode: 'continuable', activity: 'running', hasChildren: false })
/** Real SDK Session events: append/validate/freeze produce the published turn/end shape. */
const turnLog = (turn, reason, openOnly = false) => {
  const session = sessionSdk.Session.create('log-' + turn)
  session.append('turn/start', { turn })
  if (!openOnly) session.append('turn/end', { turn, reason })
  return session.snapshotEvents()
}
const errorLog = (turn, code, message) => turnLog(turn, { kind: 'error', error: { code, message } })

async function outcomeFixture(t, { logs = new Map(), catalog = ['worker'] } = {}) {
  const notices = []
  const f = await mountedFixture(t, { sessionLogs: logs, configureBeforeMount: ({ ctx, agents }) => {
    agents.set('worker', child('worker', 'running'))
    ctx.provide('subagents', { async listDescendants() { return catalog.map(catalogRow) } })
  } })
  f.mounted.ports.notifyOwner = async input => { notices.push(input); return { status: 'accepted', messageId: 'wake-' + notices.length } }
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal((await read()).windows.S.used, 1, 'the counted run is part of the baseline')
  return { f, notices, read }
}
/** The counted child disappears with no subagent/end: the expected-delta reconciliation path. */
const lose = f => { const worker = f.agents.get('worker'); f.agents.delete('worker'); f.ctx.emit('agent/disposed', { agent: worker }); return worker }

test('an error turn/end on a lost counted child opens one item with the published LlmFailure facts and one wake', async t => {
  const logs = new Map([['worker', errorLog(3, 'PROVIDER_5XX', 'upstream failed')]])
  const { f, notices, read } = await outcomeFixture(t, { logs })
  lose(f)
  await waitFor(() => notices.length === 1, 'one wake')
  const snap = await read()
  assert.equal(snap.nativeStops.length, 1)
  const [item] = snap.nativeStops
  assert.equal(item.itemId, 'worker:3', 'dedup key is session id + turn when the host gave no runId')
  assert.equal(item.sessionId, 'worker')
  assert.equal(item.outcome, 'error')
  assert.equal(item.turn, 3)
  assert.equal(item.diagnostic, 'PROVIDER_5XX: upstream failed', 'the published code/message verbatim')
  assert.equal(item.cancelCause, null)
  assert.equal(item.evidence, null)
  assert.equal(item.lane, null)
  assert.equal(item.observed, 'turn/end: error (PROVIDER_5XX: upstream failed)')
  assert.equal(notices[0].notificationId, 'native-stop:worker:3')
  assert.deepEqual(f.sessionReads, ['worker'], 'only the suspect child log is read, exactly once')
  assert.equal(snap.health.some(row => row.scope === 'native-subagent-outcome' && row.reason.includes('turn failed') && row.reason.includes('worker turn 3')), true)
  // Ordinary reads never re-read a log.
  await read(); await read()
  assert.deepEqual(f.sessionReads, ['worker'])
})

test('an interrupted turn/end reports that the turn never ended normally', async t => {
  const logs = new Map([['worker', turnLog(2, { kind: 'interrupted' })]])
  const { f, notices, read } = await outcomeFixture(t, { logs })
  lose(f)
  await waitFor(() => notices.length === 1, 'one wake')
  const [item] = (await read()).nativeStops
  assert.equal(item.outcome, 'interrupted')
  assert.equal(item.turn, 2)
  assert.equal(item.observed, 'turn/end: interrupted')
  assert.equal(item.diagnostic, null)
})

for (const [label, reason] of [['max-tokens', { kind: 'max-tokens' }], ['blocked', { kind: 'blocked' }]]) {
  test('a ' + label + ' turn/end reports outcome ' + label, async t => {
    const logs = new Map([['worker', turnLog(1, reason)]])
    const { f, notices, read } = await outcomeFixture(t, { logs })
    lose(f)
    await waitFor(() => notices.length === 1, 'one wake')
    const [item] = (await read()).nativeStops
    assert.equal(item.outcome, label)
    assert.equal(item.turn, 1)
    assert.equal(item.observed, 'turn/end: ' + label)
  })
}

test('a host refusal end reports that kind through the primary path', async t => {
  const { f, notices, read } = await outcomeFixture(t)
  f.ctx.emit('subagent/end', { id: 'worker', runId: 'run-refusal', provider: 'spawn', local: true, stopReason: 'refusal' })
  await waitFor(() => notices.length === 1, 'one wake')
  const [item] = (await read()).nativeStops
  assert.equal(item.outcome, 'refusal')
  assert.equal(item.observed, 'subagent/end: refusal')
  assert.equal(item.itemId, 'worker:run-refusal:unknown')
})

test('an aborted turn/end caused by our own cancellation opens no item', async t => {
  for (const cause of ['parent', 'disposed']) {
    const logs = new Map([['worker', turnLog(2, { kind: 'aborted', reason: { kind: cause } })]])
    const { f, notices, read } = await outcomeFixture(t, { logs })
    lose(f)
    const snap = await read()
    assert.deepEqual(snap.nativeStops, [], 'a cancellation this owner side caused is not an actionable outcome (' + cause + ')')
    assert.deepEqual(f.sessionReads, ['worker'], 'the cause came from the child log, never from inference')
    await sleep(20)
    assert.equal(notices.length, 0)
  }
})

test('an aborted turn/end with a foreign cause opens one item naming the cause', async t => {
  const logs = new Map([['worker', turnLog(5, { kind: 'aborted', reason: { kind: 'hook', reason: 'test hook' } })]])
  const { f, notices, read } = await outcomeFixture(t, { logs })
  lose(f)
  await waitFor(() => notices.length === 1, 'one wake')
  const [item] = (await read()).nativeStops
  assert.equal(item.outcome, 'aborted')
  assert.equal(item.turn, 5)
  assert.equal(item.cancelCause, 'hook')
  assert.equal(item.observed, 'turn/end: aborted by hook')
})

test('a host aborted end with an own-readable cause opens no item', async t => {
  const { f, notices, read } = await outcomeFixture(t)
  f.agents.get('worker').session.ownEvents = () => turnLog(2, { kind: 'aborted', reason: { kind: 'disposed' } })
  f.ctx.emit('subagent/end', { id: 'worker', runId: 'run-aborted', provider: 'spawn', local: true, stopReason: 'aborted' })
  assert.deepEqual((await read()).nativeStops, [])
  await sleep(20)
  assert.equal(notices.length, 0)
})

test('a host aborted end with a foreign cause reports the published cause', async t => {
  const { f, notices, read } = await outcomeFixture(t)
  f.agents.get('worker').session.ownEvents = () => turnLog(2, { kind: 'aborted', reason: { kind: 'hook', reason: 'foreign hook' } })
  f.ctx.emit('subagent/end', { id: 'worker', runId: 'run-aborted', provider: 'spawn', local: true, stopReason: 'aborted' })
  await waitFor(() => notices.length === 1, 'one wake')
  const [item] = (await read()).nativeStops
  assert.equal(item.outcome, 'aborted')
  assert.equal(item.cancelCause, 'hook')
  assert.equal(item.observed, 'subagent/end: aborted by hook')
})

test('a completed turn/end is a normal return with no item', async t => {
  const logs = new Map([['worker', turnLog(4, { kind: 'completed' })]])
  const { f, notices, read } = await outcomeFixture(t, { logs })
  lose(f)
  assert.deepEqual((await read()).nativeStops, [])
  await sleep(20)
  assert.equal(notices.length, 0)
})

test('the same failed turn across repeated nodes stays one item, one wake and one child-log read', async t => {
  const logs = new Map([['worker', errorLog(1, 'E1', 'first')]])
  const { f, notices, read } = await outcomeFixture(t, { logs })
  lose(f)
  await waitFor(() => notices.length === 1, 'one wake')
  assert.equal((await read()).nativeStops.length, 1)
  const itemId = (await read()).nativeStops[0].itemId
  f.ctx.emit('session/event', { id: 'root' }, { type: 'subagent/catalog', data: { childId: 'worker' } })
  await sleep(30)
  const snap = await read()
  assert.equal(snap.nativeStops.length, 1)
  assert.equal(snap.nativeStops[0].itemId, itemId, 'the same failed turn keeps its durable identity')
  assert.equal(notices.length, 1, 'one open item is never re-notified')
  await read(); await read()
  assert.deepEqual(f.sessionReads, ['worker'], 'no further child logs are read after classification')
})

test('a later turn failing again opens a new item and a new wake', async t => {
  const logs = new Map([['worker', errorLog(1, 'E1', 'first')]])
  const { f, notices, read } = await outcomeFixture(t, { logs })
  lose(f)
  await waitFor(() => notices.length === 1, 'first wake')
  assert.equal((await read()).nativeStops[0].itemId, 'worker:1')
  // The child is woken again: a new activation clears the open item through the existing path.
  const worker = child('worker', 'running')
  f.agents.set('worker', worker)
  f.ctx.emit('subagent/start', { id: 'worker', runId: 'run-2', provider: 'spawn', local: true })
  f.ctx.emit('agent/status', { agent: worker, status: 'running' })
  assert.deepEqual((await read()).nativeStops, [])
  // The new run fails at a new turn.
  logs.set('worker', errorLog(4, 'E2', 'second'))
  f.agents.delete('worker')
  f.ctx.emit('agent/disposed', { agent: worker })
  await waitFor(() => notices.length === 2, 'second wake')
  const snap = await read()
  assert.equal(snap.nativeStops.length, 1)
  assert.equal(snap.nativeStops[0].itemId, 'worker:run-2:4')
  assert.equal(snap.nativeStops[0].turn, 4)
  assert.equal(snap.nativeStops[0].diagnostic, 'E2: second')
})

test('the child running again clears the item', async t => {
  const logs = new Map([['worker', errorLog(1, 'E1', 'first')]])
  const { f, notices, read } = await outcomeFixture(t, { logs })
  lose(f)
  await waitFor(() => notices.length === 1, 'one wake')
  assert.equal((await read()).nativeStops.length, 1)
  const worker = child('worker', 'running')
  f.agents.set('worker', worker)
  f.ctx.emit('agent/status', { agent: worker, status: 'running' })
  assert.deepEqual((await read()).nativeStops, [])
})

test('a late end resolves the item through the existing clearing path', async t => {
  const logs = new Map([['worker', errorLog(1, 'E1', 'first')]])
  const { f, notices, read } = await outcomeFixture(t, { logs })
  lose(f)
  await waitFor(() => notices.length === 1, 'one wake')
  assert.equal((await read()).nativeStops.length, 1)
  f.ctx.emit('subagent/end', { id: 'worker', runId: 'run-late', provider: 'spawn', local: true, stopReason: 'completed' })
  assert.deepEqual((await read()).nativeStops, [])
})

test('an absent or unreadable log reports unobservable with an evidence pointer and no invented cause', async t => {
  const { f, notices, read } = await outcomeFixture(t)
  lose(f)
  await waitFor(() => notices.length === 1, 'one wake')
  const snap = await read()
  const [item] = snap.nativeStops
  assert.equal(item.outcome, 'unobservable')
  assert.equal(item.turn, null)
  assert.equal(item.diagnostic, null)
  assert.equal(item.cancelCause, null)
  assert.deepEqual(item.evidence, { sessionId: 'worker', turn: null, seq: null })
  assert.equal(item.observed, 'child log could not be read')
  assert.equal(snap.health.some(row => row.scope === 'native-subagent-outcome' && row.reason.includes('outcome unobservable')), true)
})

test('a readable log with no turn/end reports unobservable with the last observed turn/seq', async t => {
  const logs = new Map([['worker', turnLog(7, null, true)]])
  const { f, notices, read } = await outcomeFixture(t, { logs })
  lose(f)
  await waitFor(() => notices.length === 1, 'one wake')
  const [item] = (await read()).nativeStops
  assert.equal(item.outcome, 'unobservable')
  assert.equal(item.turn, 7)
  assert.equal(item.diagnostic, null, 'a missing turn/end never becomes a failure cause')
  assert.deepEqual(item.evidence, { sessionId: 'worker', turn: 7, seq: 0 })
  assert.equal(item.observed, 'no turn/end in the readable child log')
})

const stopItem = turn => ({ itemId: 'worker:run-1:' + turn, sessionId: 'worker', turn, outcome: 'error', cancelCause: null, diagnostic: 'E: boom', evidence: null, observed: 'host subagent/end: error' })

test('the durable notification row dedups the same failed turn across a runtime restart', async t => {
  const notices = []
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  f.setNotify(async input => { notices.push(input); return { status: 'accepted', messageId: 'wake-' + input.notificationId } })
  await f.read()
  const rows = async () => (await f.units.get('runtime_bindings').read())?.notifications ?? []
  await f.runtime.observe({ kind: 'native-stop', ownerSessionId: 'root', item: stopItem(3) })
  await waitFor(() => notices.length === 1, 'first wake')
  // Simulate the real durable commit of the delivered notice (the existing lifecycle).
  await waitFor(async () => (await rows()).some(row => row.notificationId === notices[0].notificationId && row.state === 'accepted'), 'accepted row')
  await f.runtime.notificationCommitted('root', notices[0].notificationId, 'wake-' + notices[0].notificationId)
  await waitFor(async () => (await rows()).some(row => row.notificationId === notices[0].notificationId && row.state === 'consumed'), 'consumed row')
  // A plugin hot reload or DSH restart reuses the same durable document.
  await f.reopen()
  await f.read()
  await f.runtime.observe({ kind: 'native-stop', ownerSessionId: 'root', item: stopItem(3) })
  await sleep(40)
  assert.equal(notices.length, 1, 'the same failed turn is never re-reported after a restart')
  assert.equal((await rows()).filter(row => row.notificationId === notices[0].notificationId).length, 1)
  // A later failing turn is a new item and a new wake.
  await f.runtime.observe({ kind: 'native-stop', ownerSessionId: 'root', item: stopItem(4) })
  await waitFor(() => notices.length === 2, 'new turn wake')
  assert.notEqual(notices[0].notificationId, notices[1].notificationId)
})
