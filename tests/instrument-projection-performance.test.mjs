import './fixtures/instrument-source.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const { parseInstrumentDocument, projectInstrumentDocument } = await import('../src/controls/instrument-state.ts')
const { instrumentFixture } = await import('./fixtures/instrument-fixture.mjs')
const { createDomainInstrumentStorage } = await import('../src/controls/instrument-storage.ts')

const author = { kind: 'agent', principalId: 'A', sessionId: 'A' }
function source(versions, entities = 1) {
  const events = []
  const add = (action, fields) => events.push({ revision: events.length + 1, recordedAt: 12345, author,
    command: { operationId: 'e-' + events.length, expectedRevision: events.length, workflowId: 'flow', action, ...fields } })
  add('put-workflow', { value: { title: 'Workflow', axes: [] } })
  for (let i = 0; i < versions; i++) add('put-decision', { decisionId: 'D' + i % entities, value: { question: 'Question', status: 'open', pending: true } })
  return { schemaVersion: 1, instrumentInstanceId: 'instance', ownerSessionId: 'A', controlWorkspaceId: 'W', revision: events.length, events }
}
// Count array iteration at the real synchronous source seam, not private builder state.
function iterationWork(run) {
  const original = Array.prototype[Symbol.iterator]
  let visits = 0
  Array.prototype[Symbol.iterator] = function* () { for (const value of original.call(this)) { visits++; yield value } }
  try { return { result: run(), visits: () => visits } } finally { Array.prototype[Symbol.iterator] = original }
}
test('cold projection history append work grows with retained versions, not their square', t => {
  for (const versions of [500, 1000, 2000, 4000]) {
    const { result, visits } = iterationWork(() => projectInstrumentDocument(source(versions)))
    assert.equal(result.decisions[0].history.length, versions)
    assert.equal(result.decisions[0].history.at(-1).revision, versions + 1)
    assert(visits() < versions * 30, versions + ' versions performed ' + visits() + ' array iterations')
    t.diagnostic(versions + ' versions: ' + visits() + ' array iteration steps')
  }
})

test('full changes authorize each merged revision with linear search work across history and entities', async t => {
  for (const [versions, entities] of [[500, 1], [2000, 1000]]) {
    const values = new Map()
    const table = { get: key => values.get(key), async put(key, value) { values.set(key, value) },
      async update(key, change) { const value = change(values.get(key)); values.set(key, value); return value } }
    const f = await instrumentFixture({ storage: createDomainInstrumentStorage(table) })
    const { instance } = await f.controls.readSession('A', 'A')
    values.set(instance.instrumentInstanceId, { ...source(versions, entities), ...instance })
    await f.read()
    let visits = 0
    const original = Array.prototype.find
    Array.prototype.find = function (predicate, thisArg) { return original.call(this, (...args) => { visits++; return predicate.apply(thisArg, args) }) }
    let full
    try { full = await f.read() } finally { Array.prototype.find = original }
    assert.equal(full.changes.length, versions + 1)
    assert.equal(full.decisions.length, entities)
    assert(visits < versions * 20, versions + ' versions / ' + entities + ' entities searched ' + visits + ' candidates')
    t.diagnostic(versions + ' versions / ' + entities + ' entities: ' + visits + ' find candidates')
  }
})

test('validated immutable source reuses pure projection but shallow-frozen foreign input is revalidated', async () => {
  const raw = source(500)
  const parsed = parseInstrumentDocument(raw)
  assert.strictEqual(projectInstrumentDocument(parsed), projectInstrumentDocument(parsed))
  assert.strictEqual(parseInstrumentDocument(parsed), parsed)
  assert.notStrictEqual(projectInstrumentDocument(raw), projectInstrumentDocument(raw))
  const foreign = Object.freeze(source(2))
  parseInstrumentDocument(foreign)
  foreign.events[1].command.expectedRevision = 900
  assert.throws(() => parseInstrumentDocument(foreign), error => error.code === 'invalid-state')
  const f = await instrumentFixture({ storage: { async read() { return foreign } } })
  // Even the read-side cache must not mistake a top-level frozen object for a
  // trusted deeply immutable source. Use a matching instance before mutation.
  const { instance } = await f.controls.readSession('A', 'A')
  const input = Object.freeze({ ...source(2), ...instance })
  const { SessionInstruments } = await import('../src/controls/instruments.ts')
  const instruments = new SessionInstruments(f.controls, { async read() { return input } }, f.authority)
  await instruments.read('A', 'A')
  input.events[1].command.expectedRevision = 900
  await assert.rejects(instruments.read('A', 'A'), error => error.code === 'invalid-state')
})

test('V2 checkpoint validation indexes entity references and first creators without quadratic searches', async t => {
  const values = new Map()
  const table = { get: key => values.get(key), async put(key, value) { values.set(key, value) },
    async update(key, change) { const value = change(values.get(key)); values.set(key, value); return value } }
  const storage = createDomainInstrumentStorage(table), f = await instrumentFixture({ storage })
  const { instance } = await f.controls.readSession('A', 'A')
  values.set(instance.instrumentInstanceId, { ...source(1000, 1000), ...instance })
  await f.instruments.compact('A', 'A', { operationId: 'compact', expectedRevision: 1001 })
  const raw = structuredClone(await storage.read(instance.instrumentInstanceId))
  let visits = 0
  const originals = new Map(['find', 'some'].map(method => [method, Array.prototype[method]]))
  for (const [method, original] of originals) Array.prototype[method] = function (predicate, thisArg) {
    return original.call(this, (...args) => { visits++; return predicate.apply(thisArg, args) })
  }
  let parsed
  try { parsed = parseInstrumentDocument(raw) } finally { for (const [method, original] of originals) Array.prototype[method] = original }
  assert.equal(projectInstrumentDocument(parsed).decisions.length, 1000)
  assert(visits < 30000, 'checkpoint validation searched ' + visits + ' candidates')
  t.diagnostic('1000 checkpoint entities: ' + visits + ' search candidates')
})

// Observe real target serializations across a cold PUBLIC parser call. No private
// validator hooks/cache access, elapsed-time threshold or production instrumentation.
function targetSerializationWork(input) {
  const stringify = JSON.stringify
  let visits = 0
  JSON.stringify = function (value, ...args) {
    if (value && typeof value === 'object' && typeof value.workflowId === 'string'
      && ['workflow', 'ticket', 'task-reference', 'decision'].includes(value.kind)) visits++
    return Reflect.apply(stringify, this, [value, ...args])
  }
  try { return { parsed: parseInstrumentDocument(input), visits } } finally { JSON.stringify = stringify }
}
async function checkpointFromSource(document) {
  const values = new Map()
  const table = { get: key => values.get(key), async put(key, value) { values.set(key, value) },
    async update(key, change) { const value = change(values.get(key)); values.set(key, value); return value } }
  const storage = createDomainInstrumentStorage(table), f = await instrumentFixture({ storage })
  const { instance } = await f.controls.readSession('A', 'A')
  values.set(instance.instrumentInstanceId, { ...document, ...instance })
  await f.instruments.compact('A', 'A', { operationId: 'performance-compact', expectedRevision: document.revision })
  // Every measurement parses a new mutable graph, so immutable-source reuse cannot
  // conceal a cold quadratic algorithm.
  return structuredClone(await storage.read(instance.instrumentInstanceId))
}
async function adoptedSourceFactory() {
  const { SessionInstruments, OwnerDecisionPolicyStore, parseOwnerDecisionPolicyDocument } = await import('../lib/controls/index.js')
  const { MemoryVersionedStorage } = await import('../lib/controls/versioned-storage.js')
  const f = await instrumentFixture(), instance = (await f.read()).instance
  // Stable backing storage, and genuine public save/create/adopt seams, establish
  // the V4 fixture template before any controlled replication of public IDs.
  const backing = new MemoryVersionedStorage(parseOwnerDecisionPolicyDocument)
  const store = new OwnerDecisionPolicyStore({ storageFor: () => backing, now: () => 12345,
    newEpochId: () => 'performance-epoch', authorizeOperator: async () => {}, authorizeEnable: async () => {} })
  await store.save(instance, { operationId: 'enable', expectedRevision: 0, expectedScope: instance, action: 'enable', durationMs: 3600000 }, { kind: 'user', principalId: 'user', sessionId: null })
  const instruments = new SessionInstruments(f.controls, f.storage, f.authority, () => 12345, store)
  await instruments.apply('A', 'A', { operationId: 'workflow', expectedRevision: 0, workflowId: 'flow', action: 'put-workflow', value: { title: 'Workflow', axes: [] } })
  const created = await instruments.apply('A', 'A', { operationId: 'bound', expectedRevision: 1, workflowId: 'flow', decisionId: 'D', action: 'put-decision', references: ['task:original'],
    value: { question: 'Choose', status: 'open', pending: true, addressee: { kind: 'user', principalId: 'user' }, options: [{ key: 'B', label: 'Recommended' }], recommendation: 'B', result: 'Preserved result' } })
  const candidate = created.recommendation.candidate
  await instruments.apply('A', 'A', { operationId: 'adopted', expectedRevision: 2, workflowId: 'flow', decisionId: 'D', action: 'adopt-decision-recommendation', references: ['task:adoption'],
    value: { optionKey: candidate.optionKey, decisionRevision: candidate.decisionRevision, policyEpochId: candidate.policyEpochId, policyRevision: candidate.policyRevision } })
  const template = await f.storage.read(instance.instrumentInstanceId)
  assert.equal(template.schemaVersion, 4)
  return entities => {
    const events = [structuredClone(template.events[0])]
    for (let i = 0; i < entities; i++) {
      const bound = structuredClone(template.events[1]), adopted = structuredClone(template.events[2]), sourceRevision = 2 + 2 * i
      for (const [event, action] of [[bound, 'bound'], [adopted, 'adopted']]) {
        event.revision = events.length + 1; event.command.expectedRevision = events.length
        event.command.operationId = action + '-' + i; event.command.decisionId = 'D' + i
        events.push(event)
      }
      bound.decisionPolicy.binding.createdRevision = sourceRevision
      adopted.command.value.decisionRevision = sourceRevision
      adopted.decisionPolicy.selection.decisionSourceRevision = sourceRevision
    }
    return { ...structuredClone(template), revision: events.length, events }
  }
}
for (const version of [2, 4]) test('cold V' + version + ' checkpoint target validation grows linearly across decision entities', async t => {
  const document = version === 4 ? await adoptedSourceFactory() : entities => source(entities, entities)
  const measurements = []
  for (const entities of [200, 400, 800, 1600]) {
    const raw = await checkpointFromSource(document(entities))
    assert.equal(raw.schemaVersion, version)
    const { parsed, visits } = targetSerializationWork(raw)
    assert.equal(projectInstrumentDocument(parsed).decisions.length, entities)
    if (version === 4) assert.equal(projectInstrumentDocument(parsed).decisions.at(-1).policySelection.selectedOptionKey, 'B')
    measurements.push({ entities, visits })
    t.diagnostic(entities + ' V' + version + ' entities: ' + visits + ' target serializations')
  }
  for (const { entities, visits } of measurements) assert(visits <= entities * 32, 'cold V' + version + ': ' + entities + ' entities serialized ' + visits + ' targets, exceeding a linear work budget')
  for (let i = 1; i < measurements.length; i++) assert(measurements[i].visits <= measurements[i - 1].visits * 2.1, 'doubling entities must not quadruple cold validation work')
})

test('indexed V4 receipt chains still reject changed options, discarded refs and inconsistent authors or source metadata', async () => {
  const source = await adoptedSourceFactory(), raw = await checkpointFromSource(source(3))
  const mutations = [
    ['current options', d => { const row = d.checkpoint.state.decisions[0]; row.value.options = [{ key: 'A', label: 'Other' }]; row.history.at(-1).value.options = row.value.options }],
    ['original refs', d => { d.checkpoint.state.decisions[0].history.at(-1).references = ['task:adoption'] }],
    ['creator', d => { d.checkpoint.state.decisions[0].creator.principalId = 'other' }],
    ['opening binding', d => { d.checkpoint.state.decisions[0].policyBinding.createdRevision = 4 }],
    ['adoption preceding source', d => { d.dedup[2].command.decisionPolicy.selection.decisionSourceRevision = 4 }],
    ['current selection', d => { delete d.checkpoint.state.decisions[0].policySelection }],
    ['retained selection', d => { delete d.checkpoint.state.decisions[0].history.at(-1).policySelection }],
    ['retained author', d => { d.checkpoint.state.decisions[0].history.at(-1).author.principalId = 'other' }],
    ['duplicate operation', d => { d.dedup[2].operationId = d.dedup[1].operationId }],
    ['receipt target', d => { d.dedup[2].command.target.decisionId = 'D1' }],
  ]
  for (const [label, mutate] of mutations) {
    const corrupted = structuredClone(raw); mutate(corrupted)
    assert.throws(() => parseInstrumentDocument(corrupted), error => error.code === 'invalid-state', label)
  }
  const valid = projectInstrumentDocument(parseInstrumentDocument(structuredClone(raw)))
  assert.equal(valid.decisions[0].policySelection.selectedOptionKey, 'B')
  assert.equal(valid.decisions[0].history[0].author.principalId, 'A')
  assert.deepEqual(valid.decisions[0].history.at(-1).references, ['task:original', 'task:adoption'])
})

test('checkpoint plus tail appends copy each retained history only once and never mutate the checkpoint', t => {
  for (const versions of [500, 1000, 2000, 4000]) {
    const raw = source(versions), cut = Math.floor(versions / 2)
    const base = projectInstrumentDocument({ ...raw, revision: cut, events: raw.events.slice(0, cut) })
    const before = JSON.stringify(base)
    const document = { ...raw, schemaVersion: 2, checkpoint: { throughRevision: cut, state: base }, events: raw.events.slice(cut), dedup: [], coverage: [] }
    const { result, visits } = iterationWork(() => projectInstrumentDocument(document))
    assert.equal(result.decisions[0].history.length, versions)
    assert.equal(JSON.stringify(base), before)
    assert(Object.isFrozen(result.decisions[0].history))
    assert(visits() < versions * 30, 'checkpoint/tail copied ' + visits() + ' array entries')
    t.diagnostic(versions + ' checkpoint/tail versions: ' + visits() + ' array iteration steps')
    assert.strictEqual(result.decisions[0].history[0], base.decisions[0].history[0])
  }
})

test('hot full reads recheck source health, current scope and exact merged historical permissions', async () => {
  const values = new Map()
  let gets = 0, denied = false
  const table = { get(key) { gets++; if (denied) throw new Error('source denied'); return values.get(key) },
    async put(key, value) { values.set(key, value) }, async update(key, change) { const value = change(values.get(key)); values.set(key, value); return value } }
  const f = await instrumentFixture({ storage: createDomainInstrumentStorage(table) })
  await f.apply('put-workflow', { value: { title: 'Flow', axes: [] } })
  for (const localTicketId of ['T1', 'T2']) await f.apply('put-ticket', { localTicketId, value: { title: localTicketId, statuses: {} } })
  await f.apply('put-decision', { decisionId: 'same', value: { question: 'private', status: 'open', ticketIds: ['T2'], context: 'private history' } })
  await f.apply('put-decision', { decisionId: 'same', value: { question: 'private omitted association', status: 'open' } })
  await f.apply('put-decision', { decisionId: 'same', value: { question: 'visible', status: 'open', ticketIds: ['T1'], context: null, pending: true }, references: ['visible source'] })
  await f.apply('put-decision', { decisionId: 'same', value: { question: 'visible omitted association', status: 'open' } })
  const owner = await f.read(), beforeGets = gets
  const child = await f.read('child', 'child')
  assert.equal(gets, beforeGets + 1)
  assert.deepEqual(child.decisions[0].history.map(change => change.revision), [6, 7])
  assert.deepEqual(child.changes.filter(event => event.command.action === 'put-decision').map(event => event.revision), [6, 7])
  assert.equal(child.decisions[0].history[0].author.principalId, 'A')
  assert.deepEqual(child.decisions[0].history[0].references, ['visible source'])
  assert.equal(child.decisions[0].history[0].recordedAt, 12345)
  assert.equal(owner.decisions[0].history.length, 4)
  assert(!JSON.stringify(child).includes('private history'))
  f.scopes.set('child', { kind: 'assigned', workflowId: null, ticketIds: [] })
  assert.equal((await f.read('child', 'child')).decisions.length, 0)
  f.revoked.add('child')
  await assert.rejects(f.read('child', 'child'))
  denied = true
  await assert.rejects(f.read(), /source denied/)
})
