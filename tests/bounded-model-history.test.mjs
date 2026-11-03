import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { caller, mountedFixture, operator, policy, signal, workflow } from './fixtures/runtime-host.mjs'

// Approved public seam: mounted SDK execution/render plus RuntimeFacade's authorized full detail.
// No production profile, private projector, monkey-patched serializer, or live session evidence.
const bytes = value => Buffer.byteLength(JSON.stringify(value))
async function read(f, name, request, agent = f.root) {
  const result = await f.execute(name, { request }, agent)
  assert.notEqual(result.isError, true, result.error?.message)
  const text = result.content.find(block => block.type === 'text').text
  assert.ok(Buffer.byteLength(text) <= 65536, name + ' rendered budget')
  const value = JSON.parse(text)
  assert.equal(value.schemaVersion, 2)
  assert.ok(bytes(value) <= (value.kind === 'receipt' ? 8192 : 65536), name + ' typed/rendered JSON budget')
  return value
}
async function body(f, locator) {
  const pieces = []
  let offset = 0, expectedHash, total
  for (let count = 0; count < 100; count++) {
    const piece = await read(f, 'mattpocock_record', { action: 'detail', locator, offset })
    assert.equal(piece.kind, 'content')
    assert.equal(piece.offset, offset)
    assert.equal(piece.nextOffset, offset + Buffer.byteLength(piece.data))
    if (expectedHash !== undefined) assert.equal(piece.contentHash, expectedHash)
    expectedHash = piece.contentHash; total = piece.totalBytes
    pieces.push(piece.data)
    if (piece.done) {
      const text = pieces.join('')
      assert.equal(Buffer.byteLength(text), total)
      assert.equal(createHash('sha256').update(text).digest('hex'), expectedHash)
      return JSON.parse(text)
    }
    assert.ok(piece.nextOffset > offset, 'non-EOF reads progress')
    offset = piece.nextOffset
  }
  assert.fail('content did not terminate')
}

test('large history pages advance from the emitted row; detail distinguishes missing, deferred and purged bodies', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  // Tracer fails on the old model contract before creating the large fixture.
  await read(f, 'mattpocock_record', { action: 'read' })
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'history-flow', expectedRevision: 0,
    workflowId: 'flow', action: 'put-workflow', value: workflow }, signal())
  const count = 100
  for (let index = 0; index < count; index++) await f.runtime.applyInstrument(caller('root'), 'root', {
    operationId: 'history-decision-' + index, expectedRevision: index + 1, workflowId: 'flow',
    action: 'put-decision', decisionId: 'D' + '\\'.repeat(64) + index, value: {
      question: 'Question-' + index + ' ' + '\n'.repeat(9000), status: 'pending', pending: true,
      result: 'Canonical body ' + index + ' 漢😀\\"' } }, signal())
  const ids = [], sequences = []
  let cursor, pages = 0
  do {
    const page = await read(f, 'mattpocock_history', { action: 'query', query: {
      kind: 'decision', limit: 100, ...(cursor === undefined ? {} : { cursor }) } })
    if (pages === 0) t.diagnostic(JSON.stringify({ firstPageRows: page.rows.length, firstPageBytes: bytes(page), firstPageHasLocator: Boolean(page.rows[0]?.detail?.locator) }))
    assert.ok(page.rows.length > 0, 'nonempty retained query makes progress')
    for (const row of page.rows) { ids.push(row.historyId); sequences.push(row.sequence) }
    if (page.nextCursor !== null) assert.equal(page.nextCursor.after, page.rows.at(-1).sequence)
    assert.equal(page.more, page.nextCursor !== null)
    cursor = page.nextCursor
    pages++
    assert.ok(pages < 20)
  } while (cursor !== null)
  assert.ok(pages >= 2, 'large metadata hits the final JSON byte budget')
  assert.equal(ids.length, count)
  assert.equal(new Set(ids).size, count, 'byte packing never drops or duplicates a retained row')
  assert.equal(new Set(sequences).size, count)
  const allTwenty = ids.slice(0, 20)
  const batch = await read(f, 'mattpocock_history', { action: 'detail', historyIds: allTwenty })
  assert.deepEqual(new Set([...batch.rows.map(row => row.historyId), ...batch.remainingHistoryIds]), new Set(allTwenty))
  assert.deepEqual(batch.missingHistoryIds, [])
  t.diagnostic(JSON.stringify({ requestedLargeDetails: 20, deliveredRows: batch.rows.length, deferredRows: batch.remainingHistoryIds.length, resultBytes: bytes(batch) }))
  const selected = ids.slice(0, 19), absent = 'history-id-that-was-never-recorded'
  const detail = await read(f, 'mattpocock_history', { action: 'detail', historyIds: [...selected, absent] })
  assert.deepEqual(detail.missingHistoryIds, [absent])
  assert.deepEqual(new Set([...detail.rows.map(row => row.historyId), ...detail.remainingHistoryIds]), new Set(selected))
  assert(!detail.remainingHistoryIds.includes(absent))
  const row = detail.rows[0]
  assert.ok(row.detail?.locator)
  const expected = await f.runtime.historyAction(caller('root'), 'root', { action: 'detail', historyIds: [row.historyId] }, signal())
  assert.deepEqual(await body(f, row.detail.locator), expected.rows[0], 'locator reconstructs the actual authorized retained row')
  await read(f, 'mattpocock_history', { action: 'purge', historyIds: [row.historyId] })
  const old = await f.execute('mattpocock_record', { request: { action: 'detail', locator: row.detail.locator } })
  assert.equal(old.isError, true, 'purge cannot resurrect a previously selected body')
  assert.ok(bytes(old.error) <= 8192)
  const tombstone = await read(f, 'mattpocock_history', { action: 'detail', historyIds: [row.historyId] })
  assert.equal(tombstone.rows[0].purged, true)
  assert.equal(tombstone.rows[0].detail, undefined)
  assert.deepEqual(tombstone.missingHistoryIds, [])
  const current = await read(f, 'mattpocock_record', { action: 'read', query: { kind: 'decision', limit: 20 } })
  assert.equal(current.total, count, 'purging a derived copy does not delete current business obligations')
  await f.runtime.assign(caller('root'), { sessionId: 'child' }, signal())
  const childHistory = await f.execute('mattpocock_history', { request: { action: 'query' } }, f.child)
  assert.equal(childHistory.isError, true, 'assigned current scope does not become coordinator history access')
  const childBody = await f.execute('mattpocock_record', { request: { action: 'detail', locator: detail.rows.at(-1).detail.locator } }, f.child)
  assert.equal(childBody.isError, true, 'a locator is not an access grant')
  t.diagnostic(JSON.stringify({ retainedDecisions: count, queryPages: pages, maximumReadBytes: 65536 }))
})
