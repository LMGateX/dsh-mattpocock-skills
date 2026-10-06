import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { SessionInstruments, createDomainInstrumentStorage } from '../lib/controls/index.js'
import { definition } from './fixtures/instrument-fixture.mjs'
import { openInstrumentDomain } from './fixtures/instrument-domain.mjs'
const options = { skip: process.env.DSH_CONTROLS_HOST_ROOT ? false : 'set DSH_CONTROLS_HOST_ROOT for actual host integration' }
const decision = { question: '保存后不能被滚动丢失', status: '模型自定', pending: true, addressee: { kind: 'user', principalId: 'user' } }
async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-instruments-'))
  const root = join(temporary, 'storage')
  let current
  const reopen = async () => { await current?.close(); current = await openInstrumentDomain(root); return current }
  t.after(async () => { try { await current?.close() } finally { assert(isAbsolute(temporary) && basename(temporary).startsWith('dsh-instruments-')); await rm(temporary, { recursive: true, force: true }) } })
  return { root, temporary, reopen }
}

test('actual domain per-instance ledgers restore status history, obligations, viewer state and idempotency', options, async t => {
  const f = await fixture(t)
  let state = await f.reopen()
  await state.apply('put-workflow', { value: definition })
  const command = await state.command('put-ticket', { localTicketId: 'T1', value: { title: '部分进展', statuses: { delivery: ['partial'], qualities: ['review', 'experiment'] } } })
  const applied = await state.instruments.apply('A', 'A', command)
  await state.apply('put-decision', { decisionId: 'D', value: decision })
  await state.apply('set-decision-view', { decisionId: 'D', value: { read: true, hidden: true } }, 'user', 'A')
  await state.apply('put-workflow', { value: definition }, 'B', 'B')
  const beforeA = await state.read('user', 'A'), beforeB = await state.read('B', 'B')
  state = await f.reopen()
  assert.deepEqual(await state.read('user', 'A'), beforeA)
  assert.deepEqual(await state.read('B', 'B'), beforeB)
  assert.equal((await state.read('child', 'child')).tickets.length, 1)
  const replay = await state.instruments.apply('A', 'A', command)
  assert.equal(replay.replayed, true)
  assert.equal(replay.appliedRevision, applied.appliedRevision)
  assert.equal((await state.read('user', 'A')).summary.pendingDecisionCount, 1)
  assert.equal((await state.read('B', 'B')).decisions.length, 0)
})

test('actual JSON round-trip preserves opaque prototype-named axes without poisoning snapshot reads', options, async t => {
  const f = await fixture(t)
  let state = await f.reopen()
  const keys = ['toString', 'constructor', '__proto__']
  await state.apply('put-workflow', { value: { title: 'opaque axes', axes: keys.map(axisKey => ({ axisKey, label: axisKey, counting: 'exclusive', statuses: [{ statusKey: '__proto__', label: '自定' }] })) } })
  await state.apply('put-ticket', { localTicketId: 'T1', value: { title: '无报告', statuses: {} } })
  await state.apply('put-ticket', { localTicketId: 'T2', value: { title: '有报告', statuses: Object.fromEntries(keys.map(key => [key, ['__proto__']])) } })
  const before = await state.read()
  state = await f.reopen()
  assert.deepEqual(await state.read(), before)
  assert(before.summary.statusCounts.every(axis => axis.unreported === 1 && axis.statuses[0].count === 1))
})

test('actual independent process restores business/view revisions and hidden-but-pending matters', options, async t => {
  const f = await fixture(t)
  const state = await f.reopen()
  await state.apply('put-workflow', { value: definition })
  await state.apply('put-decision', { decisionId: 'D', value: decision })
  await state.apply('set-decision-view', { decisionId: 'D', value: { read: true, hidden: true } }, 'user', 'A')
  const before = await state.read('user', 'A')
  await state.close()
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('./fixtures/instruments-restart.mjs', import.meta.url)), f.root], { encoding: 'utf8' })
  assert.deepEqual(JSON.parse(output), before)
  assert.deepEqual(await (await f.reopen()).read('user', 'A'), before)
})

test('actual first-write CAS is per-instance, including simultaneous independent-owner updates', options, async t => {
  const f = await fixture(t)
  const state = await f.reopen()
  const a = await state.command('put-workflow', { value: definition })
  const b = await state.command('put-workflow', { value: definition }, 'B', 'B')
  const duplicate = { ...a, operationId: 'competing-operation' }
  const results = await Promise.allSettled([state.instruments.apply('A', 'A', a), state.instruments.apply('A', 'A', duplicate), state.instruments.apply('B', 'B', b)])
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 2)
  assert.equal(results.find(row => row.status === 'rejected').reason.code, 'revision-conflict')
  assert.equal((await state.read()).businessRevision, 1)
  assert.equal((await state.read('B', 'B')).businessRevision, 1)
})

test('actual pre-publication failure does not publish business records and locks every row until reopen', options, async t => {
  const f = await fixture(t)
  let state = await f.reopen()
  await state.apply('put-workflow', { value: definition })
  await state.apply('put-workflow', { value: definition }, 'B', 'B')
  const a = await state.read(), b = await state.read('B', 'B')
  const bytes = await readFile(join(f.root, 'mattpocock_instruments.json'))
  const count = state.events.length
  const saved = join(f.temporary, 'saved')
  await rename(f.root, saved)
  try {
    await writeFile(f.root, 'blocker')
    await assert.rejects(state.apply('put-decision', { decisionId: 'D', value: decision }), error => error.code === 'ENOTDIR')
    assert.equal(state.events.length, count)
    assert.equal(state.table.get(a.instance.instrumentInstanceId).events.length, 1)
    await assert.rejects(state.read('B', 'B'), error => error.code === 'storage-uncertain')
    const freshWrapper = new SessionInstruments(state.controls, createDomainInstrumentStorage(state.table), state.authority)
    await assert.rejects(freshWrapper.read('A', 'A'), error => error.code === 'storage-uncertain')
  } finally { await unlink(f.root); await rename(saved, f.root) }
  assert(bytes.equals(await readFile(join(f.root, 'mattpocock_instruments.json'))))
  state = await f.reopen()
  assert.deepEqual(await state.read(), a)
  assert.deepEqual(await state.read('B', 'B'), b)
  await state.apply('put-decision', { decisionId: 'D', value: decision })
  assert.equal((await state.read()).summary.pendingDecisionCount, 1)
})

test('actual commit then lost receipt persists operation dedup and prohibits blind overwrite', options, async t => {
  const f = await fixture(t)
  let state = await f.reopen()
  await state.apply('put-workflow', { value: definition })
  const command = await state.command('put-decision', { decisionId: 'D', value: decision })
  const failedReceipt = new Error('receipt lost after actual durable update')
  const table = state.table
  const fault = { get: key => table.get(key), put: (...args) => table.put(...args), async update(...args) { await table.update(...args); throw failedReceipt } }
  const instruments = new SessionInstruments(state.controls, createDomainInstrumentStorage(fault), state.authority)
  await assert.rejects(instruments.apply('A', 'A', command), error => error === failedReceipt)
  await assert.rejects(instruments.read('A', 'A'), error => error.code === 'storage-uncertain')
  state = await f.reopen()
  const replay = await state.instruments.apply('A', 'A', command)
  assert.equal(replay.replayed, true)
  assert.equal(replay.snapshot.businessRevision, 2)
  assert.equal(replay.snapshot.decisions[0].history.length, 1)
})

test('actual malformed event log rejects the whole reopen instead of silently dropping obligations', options, async t => {
  const f = await fixture(t)
  const state = await f.reopen()
  await state.apply('put-workflow', { value: definition })
  await state.apply('put-decision', { decisionId: 'D', value: decision })
  const snapshot = await state.read()
  const raw = structuredClone(state.table.get(snapshot.instance.instrumentInstanceId))
  raw.events[1].command.operationId = raw.events[0].command.operationId
  await state.table.put(snapshot.instance.instrumentInstanceId, raw)
  await assert.rejects(f.reopen(), error => error.code === 'invalid-record')
})
