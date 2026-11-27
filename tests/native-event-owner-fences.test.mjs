import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { test } from 'node:test'
import { mountedFixture, actualAgent, caller, deferred, operator, policy, signal } from './fixtures/runtime-host.mjs'

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)) }
const running = (id, parent) => Object.assign(actualAgent(id, { parent, managed: true }), { status: 'running' })
const start = (f, runId) => f.ctx.emit('subagent/start', { id: 'leaf', provider: 'controlled', local: true, runId })
const end = (f, runId, stopReason = 'refusal') => f.ctx.emit('subagent/end', { id: 'leaf', provider: 'controlled', local: true, stopReason, runId })

// Public mounted Host ports/events only: current count and the durable notification owner
// must agree about replacement incarnations, while old run receipts remain attributable.
test('a same-id other-tree replacement cannot send its new stop or notice to the old owner', async t => {
  const roots = new Map(); let other
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); other = actualAgent('other'); agents.set(other.id, other)
    ctx.provide('subagents', { rootOf(agent) { assert.equal(agents.get(agent.id), agent); return roots.get(agent) ?? agent },
      async listChildren() { return [{ id: 'cold-a', createdAt: 0, mode: 'continuable', label: 'cold' }] } })
  } })
  const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
  assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 1); await settle()
  const replacement = running('leaf', 'other'); roots.set(replacement, other); f.agents.set(replacement.id, replacement)
  const current = await f.mounted.ports.nativeSubagentActivity('root')
  assert.equal(current.running, 0); assert.equal(current.known, true)
  start(f, 'new-other-run'); replacement.status = 'idle'; end(f, 'new-other-run')
  await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('new-other-run')), false)
  const document = await f.runtimeStorage.read()
  assert.equal(document?.notifications.some(row => row.ownerSessionId === 'root' && row.notificationId.includes('new-other-run')) ?? false, false, 'there is no foreign notification, including when the outbox was never written')
})

for (const otherEnabled of [true, false]) test(`a genuine late old-run end wakes its owner independently of the replacement workspace (${otherEnabled ? 'ON' : 'OFF'})`, async t => {
  const roots = new Map(); let other
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); other = actualAgent('other', { cwd: '/other' }); agents.set(other.id, other)
    const original = { ...ctx.workspaceRegistry }
    const otherWorkspace = { id: 'OTHER', path: '/other', status: async () => 'ok' }
    Object.assign(ctx.workspaceRegistry, { get: id => id === otherWorkspace.id ? otherWorkspace : original.get(id), resolveByPath: async path => path === otherWorkspace.path ? otherWorkspace : original.resolveByPath(path) })
    ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
  } })
  if (!otherEnabled) await f.runtime.savePolicy(operator, { ...policy(), workspaceOverrides: { OTHER: { workspace: { enabled: false } } } }, 1, signal())
  const notices = []
  f.mounted.ports.notifyOwner = async notice => { notices.push(notice); return { status: 'accepted', messageId: 'wake-' + notices.length } }
  const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
  assert.equal((await f.runtime.readSession(caller('root'), 'root', signal())).windows.S.used, 1)
  await assert.rejects(f.runtime.readSession(caller('leaf'), 'leaf', signal()), { code: 'feature-disabled' }, 'native membership is not child ACL')
  f.ctx.emit('subagent/start', { id: old.id, parentSessionId: 'cold-b', runId: 'old-root-run', provider: 'controlled', local: true }); await settle()
  const replacement = running('leaf', 'other'); roots.set(replacement, other); f.agents.set(replacement.id, replacement)
  const events = replacement.session.ownEvents()
  replacement.session.ownEvents = () => [...events, { type: 'turn/end', seq: 42, data: { turn: 42, reason: { kind: 'error', error: { code: 'NEW', message: 'replacement turn only' } } } }]
  if (otherEnabled) {
    await f.runtime.created(caller('other'), signal(), other)
    assert.equal((await f.runtime.readSession(caller('other'), 'other', signal())).windows.S.used, 1)
  } else assert.equal((await f.mounted.ports.nativeSubagentActivity('other')).known, false)
  start(f, 'new-other-run'); await settle()
  f.ctx.emit('subagent/end', { id: old.id, parentSessionId: 'another-creator', runId: 'old-root-run', provider: 'controlled', local: true, stopReason: 'refusal' }); await settle()
  assert.deepEqual(f.mounted.ports.nativeSubagentStops('root'), [], 'an end contradicting the paired direct creator cannot consume an observed run')
  assert.deepEqual(notices, [])
  f.ctx.emit('subagent/end', { id: old.id, parentSessionId: 'cold-b', runId: 'old-root-run', provider: 'controlled', local: true, stopReason: 'refusal' }); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('old-root-run')).length, 1)
  assert.equal(f.mounted.ports.nativeSubagentStops('other').some(row => row.itemId.includes('old-root-run')), false)
  assert.equal(f.mounted.ports.nativeSubagentStops('root').find(row => row.itemId.includes('old-root-run')).turn, null, 'the replacement turn tail is not evidence for an older run')
  assert.equal(replacement.status, 'running', 'observing the old run does not stop the replacement')
  replacement.status = 'idle'; end(f, 'new-other-run'); await settle()
  assert.deepEqual(f.mounted.ports.nativeSubagentStops('other').map(item => item.itemId), otherEnabled ? ['leaf:new-other-run:42'] : [])
  assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('new-other-run')), false)
  const document = await f.runtimeStorage.read()
  assert(document?.notifications.some(row => row.ownerSessionId === 'root' && row.notificationId.includes('old-root-run')), 'the true late old-run outcome still reaches its original owner notification journal')
  assert.deepEqual(notices.map(row => [row.ownerSessionId, row.notificationId]), [
    ['root', 'native-stop:leaf:old-root-run:unknown'],
    ...(otherEnabled ? [['other', 'native-stop:leaf:new-other-run:42']] : []),
  ])
})

test('a published old-run stop queued across OFF and ON cannot wake the owner', { timeout: 5000 }, async t => {
  const roots = new Map(), entered = deferred(), release = deferred()
  t.after(() => release.resolve())
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx }) {
    ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
  } })
  const notices = []
  const forward = f.runtime.observe.bind(f.runtime)
  f.runtime.observe = async event => {
    if (event.kind === 'native-stop' && event.item.itemId.includes('queued-old-run')) { entered.resolve(); await release.promise }
    return forward(event)
  }
  f.mounted.ports.notifyOwner = async notice => { notices.push(notice); return { status: 'accepted', messageId: 'wake-' + notices.length } }
  const old = running('leaf', 'root'); roots.set(old, f.root); f.agents.set(old.id, old)
  await f.runtime.readSession(caller('root'), 'root', signal()); start(f, 'queued-old-run'); await settle()
  f.agents.delete('leaf'); f.ctx.emit('agent/disposed', { agent: old }); end(f, 'queued-old-run')
  await entered.promise
  await f.runtime.savePolicy(operator, { ...policy(), workspaceOverrides: { W: { workspace: { enabled: false } } } }, 1, signal())
  await f.runtime.savePolicy(operator, policy(), 2, signal())
  const replacement = running('leaf', 'root'); roots.set(replacement, f.root); f.agents.set(replacement.id, replacement)
  await f.runtime.readSession(caller('root'), 'root', signal()); start(f, 'fresh-run'); await settle()
  release.resolve(); end(f, 'queued-old-run'); await settle()
  const document = await f.runtimeStorage.read()
  assert.equal(document?.notifications.some(row => row.notificationId.includes('queued-old-run')) ?? false, false)
  assert.deepEqual(notices, [])
  assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 1)
  replacement.status = 'idle'; end(f, 'fresh-run'); await settle()
  assert.deepEqual(notices.map(row => row.notificationId), ['native-stop:leaf:fresh-run:unknown'])
})

test('a displaced baseline cannot authorize an unobserved cold replacement start and end', async t => {
  const roots = new Map(); let other
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); other = actualAgent('other'); agents.set(other.id, other)
    ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
  } })
  const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
  await f.mounted.ports.nativeSubagentActivity('root'); await settle()
  const replacement = running('leaf', 'other'); roots.set(replacement, other); f.agents.set(replacement.id, replacement)
  assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 0)
  f.agents.delete('leaf')
  start(f, 'unobserved-other-run'); end(f, 'unobserved-other-run'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('unobserved-other-run')), false)
})

test('legacy creator evidence does not adopt a different same-id live creator chain', async t => {
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); agents.set('other', actualAgent('other'))
    ctx.provide('subagents', { async listChildren() { return [{ id: 'leaf', createdAt: 0, mode: 'continuable', label: 'legacy' }] } })
  } })
  const old = running('leaf', 'root'); f.agents.set(old.id, old)
  await f.mounted.ports.nativeSubagentActivity('root'); start(f, 'legacy-old-run'); await settle()
  const replacement = running('leaf', 'other'); f.agents.set(replacement.id, replacement)
  start(f, 'legacy-other-run'); replacement.status = 'idle'; end(f, 'legacy-other-run'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('legacy-other-run')), false)
  f.agents.delete('leaf'); end(f, 'legacy-old-run'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('legacy-old-run')).length, 1,
    'legacy cold terminal receipt still follows its observed old run')
})

test('an older same-owner end cannot clear a newer run terminal receipt', async t => {
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents, root }) {
    agents.delete('child'); ctx.provide('subagents', { rootOf() { return root }, async listChildren() { return [] } })
  } })
  const leaf = running('leaf', 'cold-b'); f.agents.set(leaf.id, leaf)
  await f.mounted.ports.nativeSubagentActivity('root')
  start(f, 'same-owner-old'); start(f, 'same-owner-new'); leaf.status = 'idle'; end(f, 'same-owner-new'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('same-owner-new')).length, 1)
  end(f, 'same-owner-old', 'completed'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('same-owner-new')).length, 1,
    'an old run end cannot clear the newer failure item after its ledger run retired')
})

test('service and root replacement fence new edges while retaining an authenticated prior run end', async t => {
  for (const variant of ['other-root-service', 'denied-service', 'legacy-service', 'same-id-root', 'selective-denial']) {
    const roots = new Map(); let other
    const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
      agents.delete('child'); other = actualAgent('other'); agents.set(other.id, other)
      ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
    } })
    const leaf = running('leaf', 'cold-b'); roots.set(leaf, f.root); f.agents.set(leaf.id, leaf)
    await f.mounted.ports.nativeSubagentActivity('root'); start(f, 'prior-' + variant); await settle()
    if (variant === 'other-root-service') f.ctx.set('subagents', { rootOf(agent) { return agent === leaf ? other : agent }, async listChildren() { return [] } })
    if (variant === 'denied-service') f.ctx.set('subagents', { rootOf() { throw new Error('new service rejects old runtime facts') }, async listChildren() { return [] } })
    if (variant === 'legacy-service') f.ctx.set('subagents', { async listChildren() { return [] } })
    if (variant === 'same-id-root') f.agents.set('root', actualAgent('root'))
    if (variant === 'selective-denial') {
      f.ctx.set('subagents', { rootOf(agent) { if (agent === f.root) throw new Error('old root denied'); return agent === leaf ? other : agent }, async listChildren() { return [] } })
      await f.mounted.ports.nativeSubagentActivity('other')
    }
    start(f, 'new-' + variant); leaf.status = 'idle'; end(f, 'new-' + variant); await settle()
    assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('new-' + variant)), false, variant)
    if (variant === 'selective-denial') assert.equal(f.mounted.ports.nativeSubagentStops('other').filter(row => row.itemId.includes('new-' + variant)).length, 1, 'a denied obsolete candidate cannot suppress the verified new root')
    end(f, 'prior-' + variant); await settle()
    assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('prior-' + variant)).length, 1, variant + ': true old run end remains observable')
  }
})

test('a proved start before the next count read retains its genuine cold old-run route', async t => {
  const roots = new Map()
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
  } })
  await f.mounted.ports.nativeSubagentActivity('root')
  const leaf = running('leaf', 'cold-b'); roots.set(leaf, f.root); f.agents.set(leaf.id, leaf)
  start(f, 'started-without-poll'); await settle()
  f.agents.delete('leaf'); end(f, 'started-without-poll'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('started-without-poll')).length, 1)
})

test('a rejected foreign start fences the old baseline before any await or count poll', async t => {
  const roots = new Map(); let other
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); other = actualAgent('other'); agents.set(other.id, other)
    ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
  } })
  const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
  assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 1); await settle()
  const replacement = running('leaf', 'other'); roots.set(replacement, other); f.agents.set(replacement.id, replacement)
  start(f, 'no-poll-foreign')
  f.agents.delete('leaf')
  end(f, 'no-poll-foreign')
  await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('no-poll-foreign')), false)
  const document = await f.runtimeStorage.read()
  assert.equal(document?.notifications.some(row => row.ownerSessionId === 'root' && row.notificationId.includes('no-poll-foreign')) ?? false, false)
})

test('an agent-absent new start cannot use a null-run baseline between count reads', async t => {
  const roots = new Map()
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); ctx.provide('subagents', { rootOf(agent) { assert.equal(agents.get(agent.id), agent); return roots.get(agent) ?? agent }, async listChildren() { return [] } })
  } })
  const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
  assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 1); await settle()
  f.agents.set('leaf', running('leaf', 'other')); f.agents.delete('leaf')
  start(f, 'unobserved-between-reads'); end(f, 'unobserved-between-reads')
  await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('unobserved-between-reads')), false)
  const document = await f.runtimeStorage.read()
  assert.equal(document?.notifications.some(row => row.ownerSessionId === 'root' && row.notificationId.includes('unobserved-between-reads')) ?? false, false, 'no notification journal entry (or no journal at all) was created for the old owner')
})

test('an absent terminal needs an observed matching run or exact old-incarnation disposal, not a null baseline ID', async t => {
  for (const proof of ['none', 'exact-disposal', 'different-disposal']) {
    const roots = new Map()
    const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
      agents.delete('child'); ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
    } })
    const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
    assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 1); await settle()
    f.agents.delete('leaf')
    if (proof !== 'none') f.ctx.emit('agent/disposed', { agent: proof === 'exact-disposal' ? old : running('leaf', 'other') })
    end(f, 'baseline-terminal-' + proof)
    await settle()
    assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('baseline-terminal-' + proof)), proof === 'exact-disposal', proof)
  }
})

test('idle reconciliation preserves a delayed native end only for the exact disposed incarnation', async t => {
  for (const proof of ['exact-disposal', 'different-disposal', 'new-foreign-start', 'same-id-root-replacement']) {
    const roots = new Map()
    const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
      agents.delete('child'); agents.set('other', actualAgent('other'))
      ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
    } })
    const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
    assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 1); await settle()
    old.status = 'idle'; f.ctx.emit('agent/status', { agent: old, status: 'idle' })
    f.agents.delete('leaf')
    f.ctx.emit('agent/disposed', { agent: proof === 'different-disposal' ? running('leaf', 'other') : old })
    await settle() // Native manager may finish teardown and publish its end after reconciliation.
    assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 0)
    assert.deepEqual(f.mounted.ports.nativeSubagentStops('root'), [])
    if (proof === 'new-foreign-start') {
      const replacement = running('leaf', 'other'); roots.set(replacement, f.agents.get('other')); f.agents.set(replacement.id, replacement)
      start(f, 'delayed-' + proof); f.agents.delete('leaf')
    }
    if (proof === 'same-id-root-replacement') f.agents.set('root', actualAgent('root'))
    end(f, 'delayed-' + proof); await settle()
    const stops = f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('delayed-' + proof))
    assert.equal(stops.length, proof === 'exact-disposal' ? 1 : 0, proof)
    if (stops.length) assert.equal(stops[0].outcome, 'refusal')
  }
})

test('a queued old end preserves its published outcome without borrowing the replacement turn', async t => {
  const roots = new Map(); let other
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); other = actualAgent('other'); agents.set(other.id, other)
    ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
  } })
  const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
  await f.runtime.readSession(caller('root'), 'root', signal())
  f.ctx.emit('subagent/start', { id: old.id, parentSessionId: 'cold-b', runId: 'old-deferred-tail', provider: 'controlled', local: true }); await settle()
  old.status = 'idle'
  f.ctx.emit('subagent/end', { id: old.id, parentSessionId: 'cold-b', runId: 'old-deferred-tail', provider: 'controlled', local: true, stopReason: 'refusal' })
  const replacement = running('leaf', 'other'); roots.set(replacement, other); f.agents.set(replacement.id, replacement)
  const events = replacement.session.ownEvents()
  replacement.session.ownEvents = () => [...events, { type: 'turn/end', seq: 42, data: { turn: 42, reason: { kind: 'error', error: { code: 'NEW', message: 'replacement only' } } } }]
  await settle()
  const stop = f.mounted.ports.nativeSubagentStops('root').find(row => row.itemId.includes('old-deferred-tail'))
  assert(stop, 'the authentic old end must not disappear while its enrichment source changes')
  assert.equal(stop.turn, null); assert.equal(stop.outcome, 'refusal')
  assert.equal(stop.itemId, 'leaf:old-deferred-tail:unknown')
  assert.equal(stop.diagnostic, null, 'replacement error diagnostics cannot become old-run evidence')
  const document = await f.runtimeStorage.read()
  assert(document.notifications.some(row => row.ownerSessionId === 'root' && row.notificationId.includes('old-deferred-tail')))
  assert.equal(document.notifications.some(row => row.ownerSessionId === 'other' && row.notificationId.includes('old-deferred-tail')), false)
  assert.equal(f.mounted.ports.nativeSubagentStops('other').some(row => row.itemId.includes('old-deferred-tail')), false)
  assert.equal(document.nativeExecutions.some(row => row.runId === 'old-deferred-tail' && row.parentSessionId === 'other'), false)
})

test('a cold turn observation rechecks incarnation before opening its deferred event suffix', { timeout: 5000 }, async t => {
  const roots = new Map(), entered = Promise.withResolvers(), reply = Promise.withResolvers(); let other
  const runtimeObservation = new AsyncLocalStorage()
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); other = actualAgent('other'); agents.set(other.id, other)
    ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
    const query = ctx.sessionQuery, original = query.observeSession.bind(query)
    query.observeSession = (id, options) => {
      if (!runtimeObservation.getStore() && String(id) === 'leaf' && options?.projectionMode === 'none') { entered.resolve(); return reply.promise }
      return original(id, options)
    }
  } })
  const forward = f.runtime.observe.bind(f.runtime)
  f.runtime.observe = event => runtimeObservation.run(true, () => forward(event))
  let eventReads = 0, disposals = 0
  const observation = { inheritedEventCount: 0, get events() { eventReads++; return [{ type: 'turn/end', seq: 42, data: { turn: 42, reason: { kind: 'error', error: { code: 'NEW', message: 'new source after await' } } } }] }, [Symbol.dispose]() { disposals++ } }
  t.after(() => reply.resolve(observation))
  await f.runtime.readSession(caller('root'), 'root', signal())
  const old = running('leaf', 'root'); roots.set(old, f.root); f.agents.set(old.id, old)
  await f.mounted.ports.nativeSubagentActivity('root'); start(f, 'old-inflight-tail'); await settle()
  f.agents.delete('leaf'); f.ctx.emit('agent/disposed', { agent: old }); end(f, 'old-inflight-tail')
  await entered.promise
  const replacement = running('leaf', 'other'); roots.set(replacement, other); f.agents.set(replacement.id, replacement)
  reply.resolve(observation); await settle()
  assert.equal(eventReads, 0, 'the returned suffix is not opened after source incarnation changed')
  assert.equal(disposals, 1, 'the late observation lease is still released')
  const stop = f.mounted.ports.nativeSubagentStops('root').find(row => row.itemId.includes('old-inflight-tail'))
  assert.equal(stop?.turn, null); assert.equal(stop?.outcome, 'refusal')
})

test('an observed lost root-only run cannot classify a replacement suffix through suspect reconciliation', { timeout: 5000 }, async t => {
  const roots = new Map(), entered = Promise.withResolvers(), reply = Promise.withResolvers()
  let eventReads = 0, disposals = 0
  const observation = { inheritedEventCount: 0, get events() { eventReads++; return [{ type: 'turn/end', seq: 42, data: { turn: 42, reason: { kind: 'error', error: { code: 'NEW', message: 'replacement only' } } } }] }, [Symbol.dispose]() { disposals++ } }
  t.after(() => reply.resolve(observation))
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); agents.set('other', actualAgent('other'))
    ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
    ctx.set('sessionQuery', { async observeSession(id, options) {
      if (String(id) === 'leaf' && options?.projectionMode === 'none') { entered.resolve(); return reply.promise }
      throw new Error('unregistered ACL cold query')
    } })
  } })
  // This locks the mounted counter seam, not independent Runtime ACL/history reads.
  f.runtime.observe = async () => {}
  const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
  assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 1)
  start(f, 'lost-root-only-old'); await settle()
  f.agents.delete('leaf'); f.ctx.emit('agent/disposed', { agent: old })
  await entered.promise
  const replacement = running('leaf', 'other'); roots.set(replacement, f.agents.get('other')); f.agents.set(replacement.id, replacement)
  reply.resolve(observation); await settle()
  const stops = f.mounted.ports.nativeSubagentStops('root')
  console.log('root-only suspect diagnostic', JSON.stringify({ stops, eventReads, disposals }))
  assert.equal(disposals, 1)
  assert.equal(stops.some(row => row.turn === 42 || row.diagnostic?.includes('NEW')), false, 'no replacement turn or diagnostic becomes evidence for the old root-only run')
  assert.equal(eventReads, 0, 'counter does not open a suffix after its incarnation proof changed')
  const oldStop = stops.find(row => row.itemId.includes('lost-root-only-old'))
  assert(oldStop, 'the measured old lost run remains explicitly unobservable, not silently erased')
  assert.equal(oldStop.itemId, 'leaf:lost-root-only-old:unknown')
  assert.equal(oldStop.outcome, 'unobservable'); assert.equal(oldStop.turn, null); assert.equal(oldStop.diagnostic, null)
  assert.equal(f.mounted.ports.nativeSubagentStops('other').some(row => row.itemId.includes('lost-root-only-old')), false)
})

test('a stable observed root-only lost run still classifies its own cold suffix', { timeout: 5000 }, async t => {
  const roots = new Map(), entered = Promise.withResolvers(), reply = Promise.withResolvers()
  let eventReads = 0, disposals = 0
  const observation = { inheritedEventCount: 0, get events() { eventReads++; return [{ type: 'turn/end', seq: 7, data: { turn: 7, reason: { kind: 'error', error: { code: 'OLD', message: 'same old source' } } } }] }, [Symbol.dispose]() { disposals++ } }
  t.after(() => reply.resolve(observation))
  const f = await mountedFixture(t, { enabledNativeCounter: true, configureBeforeMount({ ctx, agents }) {
    agents.delete('child')
    ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
    ctx.set('sessionQuery', { async observeSession(id, options) {
      if (String(id) === 'leaf' && options?.projectionMode === 'none') { entered.resolve(); return reply.promise }
      throw new Error('unregistered ACL cold query')
    } })
  } })
  f.runtime.observe = async () => {}
  const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
  assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 1)
  start(f, 'stable-root-only-old'); await settle()
  f.agents.delete('leaf'); f.ctx.emit('agent/disposed', { agent: old })
  await entered.promise; reply.resolve(observation); await settle()
  const stop = f.mounted.ports.nativeSubagentStops('root').find(row => row.itemId.includes('stable-root-only-old'))
  assert(stop); assert.equal(stop.turn, 7); assert.equal(stop.outcome, 'error'); assert.equal(stop.diagnostic, 'OLD: same old source')
  assert.equal(eventReads, 1); assert.equal(disposals, 1)
})
