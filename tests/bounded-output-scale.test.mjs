import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caller, core, loadSDK, mountedFixture, operator, policy, sdk, signal, workflow } from './fixtures/runtime-host.mjs'
import { executeRegistryTool } from './fixtures/nested-tool.mjs'

// Source-mounted production Host + real SDK registry/pipeline. No model, GUI, profile or spill files.
// Historical business documents below are explicitly controlled NON-durable MemoryInstrumentStorage
// fixtures at the public HostPorts dependency seam, not a claim about disk/history retention.
const LIMIT = 65_536
const CALLS = 300
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8')
const args = { request: { action: 'read' } }
const currentDecision = { question: 'Choose delivery', status: 'pending', pending: true, result: 'same current conclusion', context: 'same current context' }

async function seededMounted(t, oldVersions) {
  const stores = new Map()
  let ports
  const f = await mountedFixture(t, { runtimeCreated(_runtime, runtimePorts) {
    ports = runtimePorts
    const original = runtimePorts.instrumentStorage
    const read = original.read.bind(original), cas = original.compareAndSwap.bind(original)
    original.read = instanceId => stores.has(instanceId) ? stores.get(instanceId).read(instanceId) : read(instanceId)
    original.compareAndSwap = (instanceId, expected, next) => stores.has(instanceId) ? stores.get(instanceId).compareAndSwap(instanceId, expected, next) : cas(instanceId, expected, next)
  } })
  assert.ok(ports?.instrumentStorage, 'fixture callback exposes the existing public HostPorts dependency')
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const initial = await f.runtime.readSession(caller('root'), 'root', signal())
  const instance = initial.instance
  const store = new core.MemoryInstrumentStorage()
  const events = []
  async function append(command) {
    const previous = events.length
    events.push({ revision: previous + 1, recordedAt: previous + 1, author: caller('root'), command: { operationId: 'scale-' + previous, expectedRevision: previous, workflowId: 'scale', ...command } })
    assert.equal(await store.compareAndSwap(instance.instrumentInstanceId, previous, { schemaVersion: 1, ...instance, revision: previous + 1, events }), true)
  }
  await append({ action: 'put-workflow', value: workflow })
  // Each field obeys the actual <=65,536-character domain limit. Together the two selected
  // ASCII fields form ~110 kB/version; legacy history + changes repeat both representations.
  const historical = { ...currentDecision, result: 'R'.repeat(60_000), context: 'C'.repeat(50_000) }
  for (let index = 0; index < oldVersions; index++) await append({ action: 'put-decision', decisionId: 'decision', value: historical })
  await append({ action: 'put-decision', decisionId: 'decision', value: currentDecision })
  stores.set(instance.instrumentInstanceId, store)
  // Public policy CAS invalidates the actual runtime; no access to private project/cache helpers.
  const saved = await f.runtime.readPolicy(operator, signal())
  await f.runtime.savePolicy(operator, policy(undefined, { display: { header: false } }), saved.revision, signal())
  const full = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(full.records.decisions[0].history.length, oldVersions + 1)
  assert.deepEqual(full.records.decisions[0].value, currentDecision)
  return { ...f, fullBytes: bytes(full), revision: full.records.revision, sourceSummary: full.records.summary }
}

function execution(f, index) {
  const callId = 'scale-direct-' + index
  return { name: 'mattpocock_record', arguments: args, callId, rootCallId: callId, token: Symbol(callId), agent: f.root, signal: signal(), deferContext() {}, concludeTurn() {} }
}
function assertCurrent(value, expectedSummary, expectedRevision) {
  assert.equal(value.schemaVersion, 2)
  assert.equal(value.kind, 'current')
  assert.equal(value.revisions.records, expectedRevision, 'all repeated reads retain the same source revision')
  const { statusCounts, ...expectedCounts } = expectedSummary
  assert.deepEqual(value.records.summary, expectedCounts)
  assert.equal(value.collections['status-count'].total, statusCounts.length, 'status rows are explicitly counted and pageable, not dropped')
  const encoded = JSON.stringify(value)
  assert.equal(encoded.includes('"history":'), false, 'current DTO cannot return retained row histories')
  assert.equal(encoded.includes('"changes":'), false, 'current DTO cannot return the duplicate changes representation')
  assert.equal(encoded.includes('RRRRRRRRRRRRRRRR'), false, 'old selected body never leaks in metadata or diagnostics')
}
function renderedText(result) {
  assert.equal(result.isError, false)
  assert.equal(result.error, undefined)
  return result.content.filter(part => part.type === 'text').map(part => part.text).join('')
}

test('42 MB legacy projection cannot amplify 300 unchanged mounted model reads, rendered or nested', { timeout: 180_000 }, async t => {
  const small = await seededMounted(t, 1)
  const large = await seededMounted(t, 200)
  assert.ok(large.fullBytes > 42_000_000, 'the real full read reproduces the ~42 MB historical amplification')
  assert.ok(large.fullBytes > small.fullBytes * 100)
  assert.deepEqual(large.sourceSummary, small.sourceSummary, 'both histories describe exactly the same current obligations')
  const tool = large.ctx.tools.get('mattpocock_record')
  const smallValue = await small.ctx.tools.get('mattpocock_record').execute(args, execution(small, 'small'))
  const first = await tool.execute(args, execution(large, 0))
  const smallBytes = bytes(smallValue), firstBytes = bytes(first)
  t.diagnostic(JSON.stringify({ source: 'controlled-memory', oldVersions: 200, smallFullBytes: small.fullBytes, largeFullBytes: large.fullBytes, smallModelBytes: smallBytes, largeModelBytes: firstBytes }))
  assert.ok(firstBytes <= LIMIT, 'actual typed execute value exceeds the 64 KiB contract: ' + firstBytes)
  assert.ok(smallBytes <= LIMIT)
  assert.ok(firstBytes <= smallBytes + 2048, 'retained history growth must not scale current model output')
  assertCurrent(first, large.sourceSummary, large.revision)
  let typedTotal = firstBytes, typedMax = firstBytes, renderedTotal = 0, renderedMax = 0, nestedCount = 0
  const outerTokens = [], nestedExecutions = []
  const expectedNested = new Map()
  large.ctx.on('tools/pre-execute', async (exec, next) => {
    if (expectedNested.has(exec.callId)) {
      const expected = expectedNested.get(exec.callId)
      assert.equal(exec.name, 'mattpocock_record')
      assert.equal(exec.parent, expected.parent, 'actual SDK nested execution retains its outer parent token')
      assert.equal(exec.rootCallId, expected.rootCallId, 'actual SDK nested execution retains its root call identity')
      nestedExecutions.push(exec.callId)
    }
    return next()
  })
  large.ctx.tools.register(sdk.defineTool({ name: 'bounded_scale_outer', description: 'Controlled nested-pipeline budget probe', parameters: {},
    output: { schema: { type: 'json' }, render: () => [] }, async execute(_, exec) {
      outerTokens.push(exec.token)
      expectedNested.set(exec.callId + ':record', { parent: exec.token, rootCallId: exec.rootCallId })
      return executeRegistryTool(large.ctx, { name: 'mattpocock_record', arguments: args, callId: exec.callId + ':record', rootCallId: exec.rootCallId, parent: exec.token, agent: exec.agent, signal: exec.signal }, loadSDK)
    } }))
  for (let index = 0; index < CALLS; index++) {
    if (index > 0) {
      const value = await tool.execute(args, execution(large, index))
      const size = bytes(value)
      assert.ok(size <= LIMIT)
      assertCurrent(value, large.sourceSummary, large.revision)
      typedTotal += size; typedMax = Math.max(typedMax, size)
    }
    let result
    if (index % 30 === 0) {
      const outer = await large.execute('bounded_scale_outer')
      assert.equal(outer.isError, false)
      result = outer.value
      nestedCount++
    } else result = await large.execute('mattpocock_record', args)
    const text = renderedText(result)
    const size = Buffer.byteLength(text, 'utf8')
    assert.ok(size <= LIMIT)
    assertCurrent(JSON.parse(text), large.sourceSummary, large.revision)
    assert.deepEqual(JSON.parse(text), result.value, 'rendered JSON is the same bounded DTO as pipeline typed value')
    renderedTotal += size; renderedMax = Math.max(renderedMax, size)
  }
  assert.equal(outerTokens.length, nestedCount)
  assert.equal(nestedExecutions.length, nestedCount)
  assert.equal(new Set(nestedExecutions).size, nestedCount)
  assert.ok(nestedCount > 0)
  assert.ok(outerTokens.every(token => typeof token === 'symbol'), 'SDK registry owns each opaque execution token')
  assert.ok(typedTotal <= CALLS * LIMIT)
  assert.ok(renderedTotal <= CALLS * LIMIT)
  assert.ok(typedTotal + renderedTotal <= 2 * CALLS * LIMIT)
  t.diagnostic(JSON.stringify({ directTypedCalls: CALLS, pipelineRecordCalls: CALLS, nestedPipelineCalls: nestedCount, typedMaxBytes: typedMax, typedTotalBytes: typedTotal, renderedMaxBytes: renderedMax, renderedTotalBytes: renderedTotal, perChannelMaximum: CALLS * LIMIT, aggregatePluginBytes: typedTotal + renderedTotal }))
})
