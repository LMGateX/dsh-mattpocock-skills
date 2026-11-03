import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caller, mountedFixture, operator, policy, signal, workflow } from './fixtures/runtime-host.mjs'

const value = result => {
  assert.notEqual(result.isError, true, result.error?.message)
  const text = result.content.find(row => row.type === 'text').text
  const parsed = JSON.parse(text)
  assert.deepEqual(result.value, parsed, 'the actual typed value and rendered compact JSON must be the same DTO')
  assert.equal(text, JSON.stringify(result.value))
  assert.ok(Buffer.byteLength(text) <= (parsed.kind === 'receipt' ? 8192 : 65536))
  return parsed
}

test('model execute returns a current-only schema2 value and a small committed receipt', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const written = value(await f.execute('mattpocock_record', { request: { action: 'apply', command: { operationId: 'flow', expectedRevision: 0, action: 'put-workflow', workflowId: 'wf', references: [], value: workflow } } }))
  assert.equal(written.schemaVersion, 2)
  assert.equal(written.kind, 'receipt')
  assert.equal(written.appliedRevision, 1)
  assert.equal(written.businessRevision, 1)
  assert.equal(written.snapshot, undefined)
  const current = value(await f.execute('mattpocock_record', { request: { action: 'read' } }))
  assert.equal(current.schemaVersion, 2)
  assert.equal(current.kind, 'current')
  assert.ok(current.instance.instrumentInstanceId)
  assert.ok(current.windows.S)
  assert.ok(current.collections.health)
  assert.ok(Buffer.byteLength(JSON.stringify(current)) <= 65536)
  assert.doesNotMatch(JSON.stringify(current), /"history":|"changes":/)
})
