import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, operator, actualAgent, deferred, caller, signal, policy, mountedFixture, loadSDK } from './fixtures/runtime-host.mjs'

// Public Runtime callers, real createHostAuthority closure and controlled source ports.
// Metadata doubles are not SDK Agents or running models; leases belong to observeSession.
async function coldFixture(t) {
  const f = await fixture(t, { known: true })
  const child = actualAgent('cancellation-child', { parent: 'root', managed: true })
  await f.created(child)
  await new Promise(resolve => setImmediate(resolve))
  f.cold.set(child.id, child); f.agents.delete(child.id)
  const control = new AbortController(), reason = new Error('caller cancelled active read')
  let stats = 0, afterAbort = 0, observes = 0, releases = 0
  const statSignals = [], observeSignals = []
  let onStat = async () => {}, onObserve = async () => {}
  const persistence = { identity: Symbol('cancellation-source'), async stat(id, options) {
    if (control.signal.aborted) afterAbort++
    statSignals.push(options?.signal)
    stats++
    await onStat(stats, options?.signal)
    const agent = f.cold.get(id) ?? f.agents.get(id)
    return agent && { header: agent.session.header, revision: 'stable-source' }
  } }
  f.ctx.get = name => name === 'sessionPersistence' ? persistence : undefined
  const observe = f.ctx.sessionQuery.observeSession
  f.ctx.sessionQuery.observeSession = async (id, options) => {
    if (control.signal.aborted) afterAbort++
    observeSignals.push(options?.signal); observes++
    await onObserve(options?.signal)
    const lease = await observe(id, options)
    return { ...lease, source: 'prepared', revision: 'stable-source', [Symbol.dispose]() { releases++; lease[Symbol.dispose]() } }
  }
  return { ...f, child, control, reason, statSignals, observeSignals,
    get counts() { return { stats, afterAbort, observes, releases } },
    onStat(fn) { onStat = fn }, onObserve(fn) { onObserve = fn },
    read(method = 'readSummaries', who = operator) { return method === 'readSummaries'
      ? f.runtime.readSummaries(who, { sessions: [{ sessionId: child.id }] }, control.signal)
      : f.runtime[method](who, child.id, control.signal) },
  }
}

test('active summary cancellation at fifth stat stops all subsequent source operations', async t => {
  const f = await coldFixture(t)
  f.onStat(async count => { if (count === 5) f.control.abort(f.reason) })
  await assert.rejects(f.read(), error => error === f.reason)
  assert.equal(f.counts.stats, 5)
  assert.equal(f.counts.afterAbort, 0, 'no new source operation may start after abort')
  assert.equal(f.counts.observes, f.counts.releases)
})

test('active full read cancellation at fifth stat stops all subsequent source operations', async t => {
  const f = await coldFixture(t)
  f.onStat(async count => { if (count === 5) f.control.abort(f.reason) })
  await assert.rejects(f.read('readSession'), error => error === f.reason)
  assert.equal(f.counts.stats, 5)
  assert.equal(f.counts.afterAbort, 0)
  assert.equal(f.counts.observes, f.counts.releases)
})


for (const method of ['readSummaries', 'readSession', 'readModelCurrent']) test(method + ' delivers the read signal to active stat/observe and rejects late source completion', async t => {
  const f = await coldFixture(t), entered = deferred(), release = deferred()
  f.onObserve(async received => { entered.resolve(received); await release.promise })
  const pending = f.read(method)
  const rejected = assert.rejects(pending, error => error === f.reason)
  const received = await entered.promise
  f.control.abort(f.reason); release.resolve()
  await rejected
  assert.equal(received, f.control.signal, 'source receives the caller signal while in flight')
  assert.ok(f.statSignals.every(control => control === f.control.signal))
  assert.equal(f.counts.afterAbort, 0)
  assert.equal(f.counts.observes, f.counts.releases, 'late acquired lease must still be disposed')
})

for (const abortAt of [10, 12, 14]) test('full read stops later authority stages at stat ' + abortAt, async t => {
  const f = await coldFixture(t)
  f.onStat(async count => { if (count === abortAt) f.control.abort(f.reason) })
  await assert.rejects(f.read('readSession'), error => error === f.reason)
  assert.equal(f.counts.stats, abortAt)
  assert.equal(f.counts.afterAbort, 0)
  assert.equal(f.counts.observes, f.counts.releases)
})


for (const method of ['readSummaries', 'readSession', 'readModelCurrent']) test(method + ' normal complete read forwards signal at every source boundary', async t => {
  const f = await coldFixture(t)
  const view = await f.read(method)
  assert.ok(method === 'readSummaries' ? view.rows[0].status === 'current' : view.instance.ownerSessionId === 'root')
  assert.ok(f.statSignals.length > 0)
  assert.ok(f.statSignals.every(received => received === f.control.signal), 'all interruptible stat stages receive signal')
  assert.ok(f.observeSignals.every(received => received === f.control.signal))
  assert.equal(f.counts.observes, f.counts.releases)
})


for (const method of ['readSummaries', 'readSession', 'readModelCurrent']) {
  test(method + ' pre-abort and FIFO-queued abort start zero source work', async t => {
    const f = await coldFixture(t)
    f.control.abort(f.reason)
    await assert.rejects(f.read(method), error => error === f.reason)
    assert.equal(f.counts.stats, 0)
    assert.equal(f.counts.observes, 0)
    const queued = await coldFixture(t), entered = deferred(), release = deferred()
    const holding = queued.runtime.serializePolicyPermission(async () => { entered.resolve(); await release.promise })
    await entered.promise
    const pending = queued.read(method), rejected = assert.rejects(pending, error => error === queued.reason)
    await new Promise(resolve => setImmediate(resolve))
    queued.control.abort(queued.reason); release.resolve()
    await holding; await rejected
    assert.equal(queued.counts.stats, 0)
    assert.equal(queued.counts.observes, 0)
  })

  test(method + ' in-flight stat rejection preserves caller reason rather than source fault', async t => {
    const f = await coldFixture(t), entered = deferred(), release = deferred()
    f.onStat(async (_count, received) => { entered.resolve(received); await release.promise; throw new Error('late source fault') })
    const pending = f.read(method), rejected = assert.rejects(pending, error => error === f.reason)
    assert.equal(await entered.promise, f.control.signal)
    f.control.abort(f.reason); release.resolve(); await rejected
    assert.equal(f.counts.stats, 1)
    assert.equal(f.counts.afterAbort, 0)
  })
}

test('assigned nested model read passes signal through every real ancestor scope check', async t => {
  const f = await coldFixture(t), leaf = actualAgent('nested-caller', { parent: f.child.id, managed: true })
  await f.created(leaf)
  await new Promise(resolve => setImmediate(resolve))
  f.statSignals.length = 0; f.observeSignals.length = 0
  const read = await f.runtime.readModelCurrent(caller(leaf.id), leaf.id, f.control.signal)
  assert.equal(read.scope.kind, 'assigned')
  assert.ok(f.statSignals.length > 0)
  assert.ok(f.statSignals.every(received => received === f.control.signal), 'scope lineage is not a cancellation-free authority island')
})


for (const method of ['readSession', 'readModelCurrent']) test(method + ' rejects cancelled observe fault with exact caller reason', async t => {
  const f = await coldFixture(t), entered = deferred(), release = deferred()
  f.onObserve(async () => { entered.resolve(); await release.promise; throw new Error('observe denied after abort') })
  const pending = f.read(method), rejected = assert.rejects(pending, error => error === f.reason)
  await entered.promise; f.control.abort(f.reason); release.resolve(); await rejected
  assert.equal(f.counts.afterAbort, 0)
})

test('mounted Remote forwards combined transport signal into its first cold authorization source', async t => {
  const f = await mountedFixture(t)
  await f.runtime.created(caller(f.child.id), signal(), f.child)
  await new Promise(resolve => setImmediate(resolve))
  f.agents.delete(f.child.id)
  const control = new AbortController(), reason = new Error('transport cancelled')
  const entered = deferred(), release = deferred()
  let stats = 0
  f.ctx.provide('sessionPersistence', { identity: Symbol('mounted-source'), async stat(id, options) {
    stats++; entered.resolve(options?.signal); await release.promise
    return { header: f.child.session.header, revision: 'mounted-source' }
  } })
  const { TypertGatewayService } = await loadSDK('@deepseek-ai/dsh-api-gateway')
  const gateway = new TypertGatewayService(f.ctx, {})
  const pending = gateway.invoke({ namespace: 'mattpocockControls', method: 'readSession', args: { sessionId: f.child.id }, peer: f.peer, signal: control.signal })
  const rejected = assert.rejects(pending, error => error.cause === reason)
  const received = await entered.promise
  control.abort(reason); release.resolve(); await rejected
  assert.ok(received instanceof AbortSignal)
  assert.equal(received.aborted, true)
  assert.equal(received.reason, reason)
  assert.equal(stats, 1)
})

for (const method of ['readSession', 'readModelCurrent']) test(method + ' stops before new registry work after an awaited read aborts', async t => {
  const f = await coldFixture(t)
  let intercepted = false, afterAbortReads = 0
  const wrapped = new WeakSet()
  const wrap = (name, store) => {
    if (wrapped.has(store)) return store
    wrapped.add(store)
    const read = store.read.bind(store)
    store.read = async (...args) => {
      if (f.control.signal.aborted) afterAbortReads++
      const result = await read(...args)
      if (!intercepted && name.startsWith('worktrees_')) { intercepted = true; f.control.abort(f.reason) }
      return result
    }
    return store
  }
  for (const [name, store] of f.units) wrap(name, store)
  const open = f.ports.openUnitStorage.bind(f.ports)
  f.ports.openUnitStorage = async (name, parser) => wrap(name, await open(name, parser))
  await assert.rejects(f.read(method), error => error === f.reason)
  assert.equal(intercepted, true)
  assert.equal(afterAbortReads, 0, 'do not open/read the next registry or begin history capture')
})


test('real RC1 Session own descriptor uses the same cancellable authority and balances leases', async t => {
  const f = await coldFixture(t)
  const { Session } = await loadSDK('@deepseek-ai/dsh-session')
  const source = Session.create(f.child.id, [], { ...f.child.session.header, delegationDepth: 1 })
  source.append('subagent/descriptor', { version: 3, mode: 'continuable', provider: 'spawn', label: 'real-session' })
  f.child.session = source
  f.onStat(async count => { if (count === 5) f.control.abort(f.reason) })
  await assert.rejects(f.read(), error => error === f.reason)
  assert.equal(f.counts.stats, 5)
  assert.equal(f.counts.afterAbort, 0)
  assert.equal(f.counts.observes, f.counts.releases)
})

test('read cancellation leaves accepted instrument CAS, consumption frontier and retained history intact', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy(), consumptionTimeoutMs: 2000 })
  await f.read()
  await new Promise(resolve => setImmediate(resolve))
  const entered = deferred(), release = deferred(), control = new AbortController(), reason = new Error('cancel frontier consumer')
  const swap = f.instrumentStorage.compareAndSwap.bind(f.instrumentStorage)
  f.instrumentStorage.compareAndSwap = async (...args) => { entered.resolve(); await release.promise; return swap(...args) }
  const writing = f.runtime.applyInstrument(caller('root'), 'root', { action: 'put-workflow', operationId: 'accepted-producer', expectedRevision: 0, workflowId: 'surviving', value: { title: 'Committed despite consumer abort', axes: [] } }, signal())
  await entered.promise
  const reading = f.runtime.preStep(caller('root'), control.signal, [], 'frontier-cancel')
  const rejected = assert.rejects(reading, error => error === reason)
  await new Promise(resolve => setImmediate(resolve))
  control.abort(reason)
  // The global effect FIFO remains intact: cancellation does not skip the pending producer.
  release.resolve(); await rejected
  const committed = await writing
  assert.equal(committed.appliedRevision, 1)
  const fresh = await f.runtime.preStep(caller('root'), signal(), [], 'frontier-recover')
  const text = fresh.flatMap(message => message.content.map(part => part.text ?? '')).join('')
  assert.match(text, /Committed despite consumer abort/)
  assert.doesNotMatch(text, /durability-commit-failed|consumption-timeout/)
  const retained = await f.runtime.historyAction(caller('root'), 'root', { action: 'query', query: { kind: 'workflow' } }, signal())
  assert.equal(retained.total, 1)
})

test('registration already accepted by ensureSession survives caller cancellation', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  const late = actualAgent('late-registration')
  f.agents.set(late.id, late)
  const entered = deferred(), release = deferred(), control = new AbortController(), reason = new Error('cancel after registration accepted')
  const swap = f.controlsStorage.compareAndSwap.bind(f.controlsStorage)
  f.controlsStorage.compareAndSwap = async (...args) => { entered.resolve(); await release.promise; return swap(...args) }
  const reading = f.runtime.preStep(caller(late.id), control.signal, [], 'register-cancel')
  const rejected = assert.rejects(reading, error => error === reason)
  await entered.promise; control.abort(reason); release.resolve(); await rejected
  const read = await f.runtime.readSession(operator, late.id, signal())
  assert.equal(read.instance.ownerSessionId, late.id)
})


for (const failAt of [1, 3]) test('controls source rejection at stage ' + failAt + ' after cancellation preserves reason without publishing unknown', async t => {
  const f = await coldFixture(t), entered = deferred(), release = deferred()
  const read = f.controlsStorage.read.bind(f.controlsStorage)
  let reads = 0
  f.controlsStorage.read = async () => { if (++reads !== failAt) return read(); entered.resolve(); await release.promise; throw new Error('controls source rejected late') }
  const pending = f.read('readSession'), rejected = assert.rejects(pending, error => error === f.reason)
  await entered.promise; f.control.abort(f.reason); release.resolve(); await rejected
  assert.equal(f.counts.afterAbort, 0)
})


test('proofless fallback checks cancellation after awaiting an unavailable stat seam', async t => {
  const f = await coldFixture(t)
  f.ctx.get = name => { if (name === 'sessionPersistence') queueMicrotask(() => f.control.abort(f.reason)); return undefined }
  await assert.rejects(f.read('readSession'), error => error === f.reason)
  assert.equal(f.counts.stats, 0)
  assert.equal(f.counts.afterAbort, 0, 'fallback observe may not start after the stat boundary aborted')
  assert.equal(f.counts.observes, 0)
})

