import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, loadSDK, signal, core, operator, policy } from './fixtures/runtime-host.mjs'

async function remote(t) {
  const f = await mountedFixture(t)
  const { TypertGatewayService } = await loadSDK('@deepseek-ai/dsh-api-gateway')
  const gateway = new TypertGatewayService(f.ctx, {})
  return { ...f, invoke: () => gateway.invoke({ namespace: 'mattpocockControls', method: 'readSession', args: { sessionId: 'root' }, peer: f.peer, signal: signal() }) }
}
test('mounted Remote reuses only a strictly validated immutable representation and keeps authorization before reuse', async t => {
  const f = await remote(t)
  const raw = core.parseHostJson({ sessionId: 'root', records: { decisions: [{ value: { question: 'complete' }, history: [{ value: { question: 'old' } }] }] } })
  let calls = 0
  f.runtime.readSession = async () => { calls++; return raw }
  const first = await f.invoke(), next = await f.invoke()
  assert.deepEqual(first, raw)
  assert.notEqual(first, raw, 'wire graph is detached')
  assert.equal(next, first, 'same validated immutable source does not copy its whole graph again')
  assert.equal(calls, 2, 'Runtime authorization/freshness is never cached by Remote')
  assert(Object.isFrozen(first.records.decisions[0].history))
  f.runtime.readSession = async () => { throw new core.ControlsError('access-denied', 'revoked') }
  await assert.rejects(f.invoke(), { code: 'access-denied' })
})
test('mounted Remote never caches mutable descendants and rejects frozen non-JSON inputs', async t => {
  const f = await remote(t)
  const mutable = Object.freeze({ child: { value: 'before' } })
  f.runtime.readSession = async () => mutable
  const first = await f.invoke()
  mutable.child.value = 'after'
  assert.equal((await f.invoke()).child.value, 'after')
  assert.equal(first.child.value, 'before')
  let getterCalls = 0
  const accessor = Object.freeze(Object.defineProperty({}, 'value', { enumerable: true, get() { getterCalls++; return 1 } }))
  const symbol = Object.freeze({ [Symbol('bad')]: 1 })
  const sparse = Object.freeze(new Array(1))
  const cycle = {}; cycle.self = cycle; Object.freeze(cycle)
  for (const bad of [accessor, symbol, sparse, cycle, Object.freeze({ n: NaN }), Object.freeze({ n: -0 }), Object.freeze({ n: 1n }), Object.freeze({ value: undefined }), Object.freeze({ value: new Date() })]) {
    f.runtime.readSession = async () => bad
    await assert.rejects(f.invoke(), { code: 'invalid-input' })
    await assert.rejects(f.invoke(), { code: 'invalid-input' })
  }
  assert.equal(getterCalls, 0)
})
test('mounted complete Remote keeps actual Runtime histories, changes and wire bytes lossless', async t => {
  const f = await remote(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const apply = (operationId, expectedRevision, action, value, more = {}) => f.runtime.applyInstrument(operator, 'root', { operationId, expectedRevision, workflowId: 'flow', action, value, ...more }, signal())
  await apply('flow', 0, 'put-workflow', { title: 'Task', axes: [] })
  await apply('D1', 1, 'put-decision', { question: 'Old question', status: 'pending', pending: true }, { decisionId: 'D' })
  await apply('D2', 2, 'put-decision', { question: 'Current question', status: 'pending', pending: true }, { decisionId: 'D' })
  await new Promise(resolve => setImmediate(resolve))
  const full = await f.runtime.readSession(operator, 'root', signal())
  const wire = await f.invoke()
  assert.equal(JSON.stringify(wire), JSON.stringify(full))
  assert.equal(wire.records.decisions[0].history.length, 2)
  assert.equal(wire.records.decisions[0].history[0].value.question, 'Old question')
  assert.equal(wire.records.changes.length, 3)
  assert.notEqual(wire.records.decisions[0].history, full.records.decisions[0].history)
})
