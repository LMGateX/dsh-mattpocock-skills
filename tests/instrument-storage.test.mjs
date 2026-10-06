import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDomainInstrumentStorage, MemoryInstrumentStorage } from '../lib/controls/index.js'
function document(instance, owner = instance) { return { schemaVersion: 1, revision: 1, instrumentInstanceId: instance, ownerSessionId: owner, controlWorkspaceId: 'W',
  events: [{ revision: 1, recordedAt: 1, author: { kind: 'agent', principalId: owner, sessionId: owner }, command: {
    action: 'put-workflow', operationId: 'op', expectedRevision: 0, workflowId: 'flow', value: { title: '任务', axes: [] } } }] } }
function table(values = new Map()) {
  return { get(key) { return values.get(key) }, async put(key, next) { values.set(key, next) },
    async update(key, transform) { const next = transform(values.get(key)); values.set(key, next); return next } }
}

test('per-instance memory CAS validates row identity and independent first writes', async () => {
  const storage = new MemoryInstrumentStorage()
  const a = document('A'), b = document('B')
  await assert.rejects(storage.compareAndSwap('A', 0, b), error => error.code === 'association-conflict')
  assert.deepEqual(await Promise.all([storage.compareAndSwap('A', 0, a), storage.compareAndSwap('B', 0, b)]), [true, true])
  a.events[0].command.value.title = 'outside mutation'
  assert.equal((await storage.read('A')).events[0].command.value.title, '任务')
  assert.equal(await storage.compareAndSwap('A', 0, document('A')), false)
  assert.equal((await storage.read('B')).revision, 1)
})

test('domain row adapter is stable; CAS false leaves the other rows readable and unchanged', async () => {
  const values = new Map(), handle = table(values)
  const storage = createDomainInstrumentStorage(handle)
  assert.equal(createDomainInstrumentStorage(handle), storage)
  const results = await Promise.all([storage.compareAndSwap('A', 0, document('A')), storage.compareAndSwap('A', 0, document('A')), storage.compareAndSwap('B', 0, document('B'))])
  assert.deepEqual(results, [true, false, true])
  assert.equal((await storage.read('A')).revision, 1)
  assert.equal((await storage.read('B')).revision, 1)
  assert(Object.isFrozen((await storage.read('A')).events))
})

test('first-put receipt loss latches all existing/new rows and queued siblings, not just failing instance', async () => {
  const values = new Map(), failure = new Error('indeterminate commit')
  const handle = { ...table(values), async put(key, next) { values.set(key, next); throw failure } }
  const storage = createDomainInstrumentStorage(handle)
  const [a, b] = await Promise.allSettled([storage.compareAndSwap('A', 0, document('A')), storage.compareAndSwap('B', 0, document('B'))])
  assert.equal(a.reason, failure)
  assert.equal(b.reason.code, 'storage-uncertain')
  await assert.rejects(storage.read('A'), error => error.code === 'storage-uncertain')
  await assert.rejects(createDomainInstrumentStorage(handle).read('new-row'), error => error.code === 'storage-uncertain')
  assert.equal(values.size, 1)
  const reopened = createDomainInstrumentStorage(table(values))
  assert.equal((await reopened.read('A')).revision, 1)
  assert.equal(await reopened.compareAndSwap('B', 0, document('B')), true)
})

test('mismatched stored row fails explicitly rather than returning another instance document', async () => {
  const storage = createDomainInstrumentStorage(table(new Map([['A', document('B')]])))
  await assert.rejects(storage.read('A'), error => error.code === 'association-conflict')
})
