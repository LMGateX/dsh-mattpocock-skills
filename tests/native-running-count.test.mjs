import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, mountedFixture, loadSDK, caller, policy, signal, actualAgent } from './fixtures/runtime-host.mjs'

const { Context } = await loadSDK('@deepseek-ai/cordis')
const { createScope, scopeTarget } = await loadSDK('@deepseek-ai/dsh-scope')

const waitFor = async predicate => {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.fail('condition was not reached')
}
const child = (id, status, parent = 'root') => {
  const agent = actualAgent(id, { parent, managed: true })
  agent.status = status
  return agent
}
const catalogRow = (id, activity = 'running') => ({ kind: 'child', id, mode: 'continuable', activity, hasChildren: false })

test('an unscoped root listener receives descendant-carrier agent/status flips, a child-scoped one does not', async () => {
  // The installed dsh-agent publishes agent/status with carrier scopeTarget(agent, agent)
  // through dispatch("emit"); dsh-scope admits untagged listeners for every descendant key.
  // The plugin's mountHost scope comes from ctx.inject on an untagged plugin context, so this
  // proves the host event contract this counter maintains its ledger from.
  const ctx = new Context()
  const agent = { id: 'child-agent' }
  const other = { id: 'other-agent' }
  const scope = createScope(ctx, agent)
  const rootSeen = [], childSeen = []
  ctx.on('agent/status', payload => rootSeen.push(payload.status))
  scope.ctx.on('agent/status', payload => childSeen.push(payload.status))
  ctx.emit(scopeTarget(agent, agent), 'agent/status', { agent, status: 'running' })
  ctx.emit(scopeTarget(other, other), 'agent/status', { agent: other, status: 'idle' })
  assert.deepEqual(rootSeen, ['running', 'idle'], 'the untagged root listener receives every descendant flip')
  assert.deepEqual(childSeen, ['running'], 'the child-scoped listener receives only its own agent')
  await scope.dispose()
})

test('window reads never re-walk the native catalog while membership is fresh', async t => {
  let walks = 0
  // 'child' is the mounted fixture's pre-existing managed child; listing it keeps the baseline
  // free of an unknown-live-member refresh.
  const catalog = ['child', 'resident-idle']
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, agents }) => {
    agents.set('resident-idle', child('resident-idle', 'idle'))
    ctx.provide('subagents', { async listDescendants() {
      walks += 1
      return catalog.map(id => catalogRow(id))
    } })
  } })
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  const first = await read()
  assert.equal(first.windows.S.used, 0)
  assert.equal(first.windows.S.countKnown, true)
  assert.equal(walks, 1, 'the baseline read performs exactly one catalog walk')
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snap = await read()
    assert.equal(snap.windows.S.used, 0)
    assert.equal(snap.windows.S.countKnown, true)
  }
  assert.equal(walks, 1, 'N reads with no membership change perform zero further walks')
  // A status flip updates the count with zero walks: the read computes live Agent.status.
  const idle = f.agents.get('resident-idle')
  idle.status = 'running'
  f.ctx.emit('agent/status', { agent: idle, status: 'running' })
  assert.equal((await read()).windows.S.used, 1)
  assert.equal(walks, 1, 'a status flip never walks the catalog')
  // A new live descendant the membership does not know causes exactly one walk.
  catalog.push('fresh-runner')
  f.agents.set('fresh-runner', child('fresh-runner', 'running'))
  assert.equal((await read()).windows.S.used, 2)
  assert.equal(walks, 2, 'one new unknown live subagent id causes exactly one walk')
  assert.equal((await read()).windows.S.used, 2)
  assert.equal(walks, 2, 'the id is known after that walk; a later read does not repeat it')
})

test('only live running descendants count, and a natively started child counts once known', async t => {
  let walks = 0
  const catalog = ['child', 'resident-idle', 'turn-running']
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, agents }) => {
    agents.set('resident-idle', child('resident-idle', 'idle'))
    agents.set('turn-running', child('turn-running', 'running'))
    // Both rows claim catalog activity 'running' (resident); only Agent.status decides.
    ctx.provide('subagents', { async listDescendants() { walks += 1; return catalog.map(id => catalogRow(id, 'running')) } })
  } })
  const snap = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(snap.windows.S.used, 1, 'an idle resident child is not counted; a turn-running child is')
  assert.equal(snap.windows.S.countKnown, true)
  // A child started natively (never dispatched through this plugin) is counted once membership knows it.
  catalog.push('native-child')
  f.agents.set('native-child', child('native-child', 'running'))
  const after = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(after.windows.S.used, 2)
  assert.equal(walks, 2)
  assert.deepEqual(after.nativeStops, [])
})

test('a counted run lost with no end opens one main-agent item and one wake, then clears', async t => {
  const catalog = ['worker']
  const notices = []
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, agents }) => {
    agents.set('worker', child('worker', 'running'))
    ctx.provide('subagents', { async listDescendants() { return catalog.map(id => catalogRow(id)) } })
  } })
  f.mounted.ports.notifyOwner = async input => { notices.push(input); return { status: 'accepted', messageId: 'wake-' + notices.length } }
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  const worker = f.agents.get('worker')
  let snap = await read()
  assert.equal(snap.windows.S.used, 1)
  assert.deepEqual(snap.nativeStops, [])
  assert.equal(notices.length, 0)
  // Expected-delta mismatch: the counted run's live Agent is gone, no subagent/end, same runtime,
  // fresh membership. The child's log is unreadable here, so the outcome is unobservable.
  f.agents.delete('worker')
  f.ctx.emit('agent/disposed', { agent: worker })
  await waitFor(() => notices.length === 1)
  snap = await read()
  assert.equal(snap.windows.S.countKnown, true, 'one mismatch is an open item; only a repeat degrades')
  assert.equal(snap.nativeStops.length, 1)
  assert.equal(snap.nativeStops[0].sessionId, 'worker')
  assert.equal(snap.nativeStops[0].outcome, 'unobservable')
  assert.equal(snap.nativeStops[0].turn, null)
  assert.equal(snap.nativeStops[0].diagnostic, null, 'an unreadable log never yields an invented cause')
  assert.deepEqual(snap.nativeStops[0].evidence, { sessionId: 'worker', turn: null, seq: null })
  assert.equal(snap.nativeStops[0].observed, 'child log could not be read')
  assert.match(notices[0].notificationId, /^native-stop:worker:/)
  assert.equal(snap.health.some(row => row.scope === 'native-subagent-outcome' && row.reason.includes('worker') && row.reason.includes('outcome unobservable')), true)
  assert.deepEqual(f.mounted.ports.nativeSubagentDrift('root'), [{ sessionId: 'worker', expectedDelta: 1, observed: 0 }])
  // A repeated node observation re-derives the same failed turn and must not re-notify or re-read:
  // the classified run is retired and the durable item keeps its identity.
  f.ctx.emit('session/event', { id: 'root' }, { type: 'subagent/catalog', data: { childId: 'worker' } })
  snap = await read()
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(notices.length, 1, 'one open item per failed turn is never re-notified at later nodes')
  assert.equal(snap.nativeStops.length, 1)
  assert.equal(snap.nativeStops[0].itemId, 'worker:unknown')
  assert.equal(snap.windows.S.countKnown, true, 'a classified outcome item is not a count degradation')
  // Observed running again clears the item and restores the count through the same live fact.
  f.agents.set('worker', worker)
  worker.status = 'running'
  f.ctx.emit('agent/status', { agent: worker, status: 'running' })
  snap = await read()
  assert.deepEqual(snap.nativeStops, [])
  assert.equal(snap.windows.S.countKnown, true)
  assert.equal(snap.windows.S.used, 1)
})

test('baseline and runtime restart re-establish the count with no item and no wake', async t => {
  const notices = []
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, agents }) => {
    agents.set('pre', child('pre', 'running'))
    ctx.provide('subagents', { async listDescendants() { return [catalogRow('pre')] } })
  } })
  f.mounted.ports.notifyOwner = async input => { notices.push(input); return { status: 'accepted', messageId: 'wake-' + notices.length } }
  const snap = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(snap.windows.S.used, 1)
  assert.equal(snap.windows.S.countKnown, true)
  assert.equal(snap.nativeCount.reestablished, false)
  assert.deepEqual(snap.nativeStops, [])
  assert.equal(notices.length, 0)
  // A second runtime over the same durable window document re-establishes from live facts only.
  const g = await fixture(t, { known: true, initialPolicy: policy() })
  await g.read()
  await g.reopen()
  const after = await g.read()
  assert.equal(after.windows.nativeBaseline.reestablished, true)
  assert.notEqual(after.windows.nativeBaseline.previousRuntimeId, after.windows.nativeBaseline.runtimeId)
  assert.deepEqual(after.nativeStops, [])
  assert.equal(g.notificationCalls.length, 0, 're-establishment never wakes the owner')
})

test('an unreadable catalog stays a stated lower bound and never claims a silent stop', async t => {
  let failing = false
  const notices = []
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, agents }) => {
    agents.set('worker', child('worker', 'running'))
    ctx.provide('subagents', { async listDescendants() {
      if (failing) throw new Error('catalog unreachable')
      return [catalogRow('worker')]
    } })
  } })
  f.mounted.ports.notifyOwner = async input => { notices.push(input); return { status: 'accepted', messageId: 'wake-' + notices.length } }
  assert.equal((await f.runtime.readSession(caller('root'), 'root', signal())).windows.S.used, 1)
  // The child disappears at the same node where the catalog becomes unreadable.
  failing = true
  f.agents.delete('worker')
  f.ctx.emit('agent/disposed', { agent: child('worker', 'running') })
  const snap = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(snap.windows.S.countKnown, false)
  assert.equal(snap.windows.S.countReason, 'native-subagent-listing-rejected')
  assert.equal(snap.windows.S.used, 0)
  assert.deepEqual(snap.nativeStops, [], 'an unreadable walk cannot prove a silent stop')
  assert.equal(notices.length, 0)
})

test('a host without the native subagent service states a lower bound, never a silent stop', async t => {
  const f = await mountedFixture(t)
  assert.deepEqual(await f.mounted.ports.nativeSubagentActivity('root'), { known: false, running: 0, total: 0, reason: 'native-subagent-service-unavailable' })
  const snap = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(snap.windows.S.countKnown, false)
  assert.equal(snap.windows.S.countReason, 'native-subagent-service-unavailable')
  assert.deepEqual(snap.nativeStops, [])
})
