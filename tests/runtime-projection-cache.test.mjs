import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, policy, workflow, operator, signal } from './fixtures/runtime-host.mjs'

const settled = () => new Promise(resolve => setImmediate(resolve))

async function warm(f, id = 'root') {
  for (let i = 0; i < 3; i++) { await f.read(id); await settled() }
  return f.read(id)
}

test('completed empty replay preserves an unchanged coordinator projection inside its freshness window', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const f = await fixture(t, { initialPolicy: policy() })
  // Let baseline initialization and the one background replay finish before observing hot reads.
  await warm(f)
  const read = f.instrumentStorage.read.bind(f.instrumentStorage)
  let reads = 0
  f.instrumentStorage.read = async (...args) => { reads++; return read(...args) }
  const before = await f.read()
  assert.ok(Object.isFrozen(before))
  const baseline = reads
  for (let i = 0; i < 5; i++) {
    await settled()
    assert.strictEqual(await f.read(), before, 'an unchanged read must reuse the frozen projection, not invalidate itself')
  }
  assert.equal(reads, baseline, 'hot reads must not rebuild the business snapshot')
})

test('cached projections still refresh on a business mutation and at the freshness deadline', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const f = await fixture(t, { initialPolicy: policy() })
  const before = await warm(f)
  await f.apply('put-workflow', { value: workflow })
  const changed = await f.read()
  assert.notStrictEqual(changed, before)
  assert.equal(changed.records.workflows[0].value.title, workflow.title)
  assert.equal(changed.records.businessRevision, before.records.businessRevision + 1)
  t.mock.timers.tick(1_999)
  assert.strictEqual(await f.read(), changed)
  t.mock.timers.tick(1)
  const refreshed = await f.read()
  assert.notStrictEqual(refreshed, changed, 'the existing 2-second reconciliation window is preserved')
  assert.deepEqual(refreshed.records, changed.records)
})

test('an owner-local business write does not rebuild another owner hot projection', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const f = await fixture(t, { initialPolicy: policy() })
  await warm(f)
  const other = await warm(f, 'other')
  await f.apply('put-workflow', { value: workflow })
  assert.equal(await f.read('other') === other, true, 'a write in root must not dirty an unrelated owner')
  assert.equal((await f.read()).records.workflows.length, 1, 'the affected owner still refreshes')
})

test('owner notification bookkeeping does not invalidate unrelated owner projections', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const f = await fixture(t, { initialPolicy: policy() })
  await warm(f)
  const other = await warm(f, 'other')
  await f.runtime.applyInstrument(operator, 'root', { operationId: 'operator-write', expectedRevision: 0, action: 'put-workflow', workflowId: 'flow', value: workflow }, signal())
  assert.equal((await f.units.get('runtime_bindings').read()).notifications.length, 1)
  assert.equal(await f.read('other') === other, true, 'a root notification is not a change to another owner')
  assert.equal((await f.read()).records.workflows.length, 1)
})

test('completed empty replays in another initialized owner do not invalidate a hot projection', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const f = await fixture(t, { initialPolicy: policy() })
  await warm(f)
  await warm(f, 'other')
  t.mock.timers.tick(2_000)
  const root = await f.read()
  const other = await f.read('other')
  assert.notEqual(root.instance.instrumentInstanceId, other.instance.instrumentInstanceId)
  await settled()
  assert.strictEqual(await f.read(), root)
})
