import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, core, caller, signal, policy } from './fixtures/runtime-host.mjs'

async function seeded(t) {
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  await new Promise(resolve => setImmediate(resolve))
  const controls = new core.WorkspaceControls(f.controlsStorage, f.ports.authority)
  const { instance } = await controls.readSession('agent:root', 'root')
  const author = caller('root')
  const events = [
    { revision: 1, recordedAt: 10, author, command: { action: 'put-workflow', operationId: 'flow', expectedRevision: 0, workflowId: 'flow', value: { title: 'Current task', axes: [] } } },
    { revision: 2, recordedAt: 20, author, command: { action: 'put-decision', operationId: 'D1', expectedRevision: 1, workflowId: 'flow', decisionId: 'D', references: ['ref-1'], value: { question: 'Pending obligation', status: 'open', pending: true } } },
    { revision: 3, recordedAt: 30, author, command: { action: 'put-decision', operationId: 'D2', expectedRevision: 2, workflowId: 'flow', decisionId: 'D', references: ['ref-2'], value: { question: 'Current obligation', status: 'open', pending: true } } },
  ]
  for (let revision = 1; revision <= events.length; revision++) assert(await f.instrumentStorage.compareAndSwap(instance.instrumentInstanceId, revision - 1, { schemaVersion: 1, ...instance, revision, events: events.slice(0, revision) }))
  return Object.assign(f, { instance })
}
function countFullReads(t) {
  let count = 0
  const original = core.SessionInstruments.prototype.read
  core.SessionInstruments.prototype.read = async function(...args) { count++; return original.apply(this, args) }
  t.after(() => { core.SessionInstruments.prototype.read = original })
  return () => count
}
const text = messages => messages.map(message => message.content.map(part => part.text ?? '').join('')).join('')

test('current consumption catches up cold history once, then rebuilds without full business histories', async t => {
  const f = await seeded(t), reads = countFullReads(t)
  const first = await f.runtime.preStep(caller('root'), signal(), [], 'cold')
  assert.match(text(first), /Current obligation/)
  assert.match(text(first), /ref-2/)
  assert.match(text(first), /"recordedAt":30/)
  assert.equal(reads(), 1, 'first consumption must capture all retained source versions')
  await f.runtime.serializePolicyPermission(async () => {})
  const hot = await f.runtime.preStep(caller('root'), signal(), [], 'hot')
  assert.match(text(hot), /Current obligation/)
  assert.equal(reads(), 1, 'hot current-facts rebuild must not construct histories or changes')
  const history = await f.runtime.historyAction(caller('root'), 'root', { action: 'query', query: { kind: 'decision' } }, signal())
  assert.equal(history.total, 2, 'cold catchup retains both source versions')
})

test('alternating unchanged owner and assigned consumers retain their bounded successful capture versions', async t => {
  const f = await seeded(t)
  await f.assign('old-child', 'flow', [])
  const reads = countFullReads(t)
  await f.runtime.preStep(caller('root'), signal(), [], 'owner-cold')
  await f.runtime.preStep(caller('old-child'), signal(), [], 'child-cold')
  assert.equal(reads(), 2)
  for (let step = 0; step < 3; step++) {
    await f.runtime.serializePolicyPermission(async () => {})
    const owner = await f.runtime.preStep(caller('root'), signal(), [], 'owner-hot-' + step)
    assert.match(text(owner), /Current obligation/)
    await f.runtime.serializePolicyPermission(async () => {})
    const child = await f.runtime.preStep(caller('old-child'), signal(), [], 'child-hot-' + step)
    assert.doesNotMatch(text(child), /Current obligation/, 'assigned child cannot inherit owner-only obligations')
  }
  assert.equal(reads(), 2, 'switching consumers must not forget previously captured unchanged scopes')
  await f.assign('old-child', null, [])
  await f.runtime.preStep(caller('old-child'), signal(), [], 'child-revoked')
  assert.equal(reads(), 3, 'changed assignment scope must recheck and capture its own current version')
})

test('failed cold capture does not advance its mark and retries inside the freshness window', async t => {
  const f = await seeded(t), reads = countFullReads(t)
  const open = f.ports.openUnitStorage.bind(f.ports)
  let failures = 0
  const wrapped = new WeakSet()
  const inject = store => {
    if (wrapped.has(store)) return store
    wrapped.add(store)
    const swap = store.compareAndSwap.bind(store)
    store.compareAndSwap = async (revision, next) => {
      if (failures === 0 && next.rows.some(row => row.kind === 'decision')) { failures++; throw new Error('isolated capture fault') }
      return swap(revision, next)
    }
    return store
  }
  for (const [name, store] of f.units) if (name.startsWith('history_')) inject(store)
  f.ports.openUnitStorage = async (name, parse) => { const store = await open(name, parse); return name.startsWith('history_') ? inject(store) : store }
  const failed = await f.runtime.preStep(caller('root'), signal(), [], 'failed')
  assert.equal(failures, 1)
  assert.match(text(failed), /isolated capture fault/)
  assert.equal(reads(), 1)
  const recovered = await f.runtime.preStep(caller('root'), signal(), [], 'retry')
  assert.equal(reads(), 2, 'failed mark must demand full history retry even at the same source version')
  assert.match(text(recovered), /Current obligation/)
  assert.doesNotMatch(text(recovered), /isolated capture fault/)
  await f.runtime.serializePolicyPermission(async () => {})
  await f.runtime.preStep(caller('root'), signal(), [], 'converged')
  assert.equal(reads(), 2, 'successful retry must converge to current-only hot reads')
  const store = [...f.units].find(([name]) => name.startsWith('history_'))[1]
  assert.equal((await store.read()).rows.filter(row => row.kind === 'decision').length, 2)
})

test('a transient history store opening failure is retried rather than retained forever', async t => {
  const f = await seeded(t)
  const open = f.ports.openUnitStorage.bind(f.ports)
  let attempts = 0
  f.ports.openUnitStorage = async (name, parse) => {
    if (name.startsWith('history_') && ++attempts === 1) throw new Error('isolated history open fault')
    return open(name, parse)
  }
  await f.reopen()
  const failed = await f.runtime.preStep(caller('root'), signal(), [], 'open-failed')
  assert.match(text(failed), /isolated history open fault/)
  const recovered = await f.runtime.preStep(caller('root'), signal(), [], 'open-retry')
  assert.doesNotMatch(text(recovered), /isolated history open fault/)
  assert.match(text(recovered), /Current obligation/)
  assert.equal(attempts, 2)
})

test('concurrent consumers recover from one failed open without discarding the successor handle', async t => {
  const f = await seeded(t)
  await f.assign('old-child', 'flow', [])
  const open = f.ports.openUnitStorage.bind(f.ports), entered = Promise.withResolvers(), release = Promise.withResolvers()
  let attempts = 0
  f.ports.openUnitStorage = async (name, parse) => {
    if (name.startsWith('history_') && ++attempts === 1) { entered.resolve(); await release.promise }
    return open(name, parse)
  }
  await f.reopen()
  const first = f.runtime.preStep(caller('root'), signal(), [], 'concurrent-owner')
  await entered.promise
  const second = f.runtime.preStep(caller('old-child'), signal(), [], 'concurrent-child')
  release.reject(new Error('isolated concurrent open fault'))
  const [failed, recovered] = await Promise.all([first, second])
  assert.match(text(failed), /isolated concurrent open fault/)
  assert.doesNotMatch(text(recovered), /isolated concurrent open fault/)
  assert.equal(attempts, 2, 'FIFO successor opens a fresh handle after the first rejection')
  await f.runtime.serializePolicyPermission(async () => {})
  const owner = await f.runtime.preStep(caller('root'), signal(), [], 'owner-recovered')
  assert.match(text(owner), /Current obligation/)
  assert.doesNotMatch(text(owner), /isolated concurrent open fault/)
  assert.equal(attempts, 2, 'later reads retain the successful successor handle')
})

test('a source change catches up retained versions again and current provenance is not invented history', async t => {
  const f = await seeded(t), reads = countFullReads(t)
  await f.runtime.preStep(caller('root'), signal(), [], 'cold')
  const before = await f.instrumentStorage.read(f.instance.instrumentInstanceId)
  const event = { revision: 4, recordedAt: 40, author: caller('root'), command: { action: 'put-decision', operationId: 'D3', expectedRevision: 3, workflowId: 'flow', decisionId: 'D', references: ['ref-3'], value: { question: 'Changed obligation', status: 'open', pending: true } } }
  assert(await f.instrumentStorage.compareAndSwap(f.instance.instrumentInstanceId, 3, { ...before, revision: 4, events: [...before.events, event] }))
  await f.runtime.serializePolicyPermission(async () => {})
  const changed = await f.runtime.preStep(caller('root'), signal(), [], 'changed')
  assert.equal(reads(), 2)
  assert.match(text(changed), /Changed obligation/)
  assert.match(text(changed), /ref-3/)
  assert.match(text(changed), /"recordedAt":40/)
  const store = [...f.units].find(([name]) => name.startsWith('history_'))[1]
  assert.equal((await store.read()).rows.filter(row => row.kind === 'decision').length, 3)
  await f.runtime.serializePolicyPermission(async () => {})
  await f.runtime.postExecute(caller('root'), f.exec(), { isError: false, value: 'native result' }, 'hot-post')
  assert.equal(reads(), 2, 'postExecute also uses the current-facts path')
})
