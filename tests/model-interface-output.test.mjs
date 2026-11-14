import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { caller, mountedFixture, operator, policy, signal, workflow } from './fixtures/runtime-host.mjs'

// Approved seam: real mountHost SDK registry execute, typed output and rendered JSON.
async function execute(f, tool, request, agent = f.root) {
  const result = await f.execute(tool, { request }, agent)
  assert.notEqual(result.isError, true, result.error?.message)
  const text = result.content.find(block => block.type === 'text').text
  assert.equal(text, JSON.stringify(result.value))
  assert.deepEqual(JSON.parse(text), result.value)
  assert.equal(result.value.schemaVersion, 2)
  assert.equal(result.value.representationVersion, 2)
  assert.ok(Buffer.byteLength(text) <= (result.value.kind === 'receipt' ? 8192 : 65536))
  return result.value
}
async function setup(t) {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'flow', expectedRevision: 0, action: 'put-workflow', workflowId: 'flow', value: workflow }, signal())
  return f
}

test('mounted v2 keeps small exact fields and omits long fields into separate explicit previews', async t => {
  const f = await setup(t)
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'ticket', expectedRevision: 1, workflowId: 'flow', localTicketId: 'T', action: 'put-ticket', value: { title: 'Short exact title', statuses: { delivery: ['partial'] } } }, signal())
  const page = await execute(f, 'mattpocock_record', { action: 'read', query: { kind: 'ticket' } })
  assert.deepEqual(page.rows[0].statuses, { delivery: ['partial'] })
  assert.equal(page.rows[0].title, 'Short exact title')
  const question = 'Long 漢😀\n'.repeat(1000)
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'decision', expectedRevision: 2, workflowId: 'flow', decisionId: 'D', action: 'put-decision', value: { question, status: 'open', pending: true } }, signal())
  const decisions = await execute(f, 'mattpocock_record', { action: 'read', query: { kind: 'decision' } })
  assert.equal(Object.hasOwn(decisions.rows[0], 'question'), false)
  const preview = decisions.rows[0].previews.question
  assert.equal(preview.truncated, true)
  assert.equal(preview.totalBytes, Buffer.byteLength(question))
  assert.equal(preview.shownBytes, Buffer.byteLength(preview.text))
  assert.ok(question.startsWith(preview.text))
  assert.deepEqual(decisions.rows[0].view, { read: false, hidden: false })
})

test('mounted current target selects composite identities exactly and rejects ambiguous selectors', async t => {
  const f = await setup(t)
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'ticket', expectedRevision: 1, workflowId: 'flow', localTicketId: 'T', action: 'put-ticket', value: { title: 'Ticket', statuses: { delivery: ['partial'] } } }, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'decision', expectedRevision: 2, workflowId: 'flow', decisionId: 'D', action: 'put-decision', value: { question: 'Choose?', status: 'open' } }, signal())
  for (const [kind, target, recordId] of [
    ['workflow', { workflowId: 'flow' }, 'flow'],
    ['ticket', { workflowId: 'flow', localTicketId: 'T' }, '["flow","T"]'],
    ['decision', { workflowId: 'flow', decisionId: 'D' }, '["flow","D"]'],
    ['status-count', { workflowId: 'flow', axisKey: 'delivery' }, '["flow","delivery"]'],
  ]) {
    const modern = await execute(f, 'mattpocock_record', { action: 'read', query: { kind, target } })
    const legacy = await execute(f, 'mattpocock_record', { action: 'read', query: { kind, workflowId: 'flow', recordId } })
    assert.equal(modern.rows.length, 1)
    assert.equal(modern.rows[0].recordId, recordId)
    assert.deepEqual(modern.query, legacy.query)
  }
  for (const query of [
    { kind: 'ticket', target: { workflowId: 'flow', localTicketId: 'T' }, workflowId: 'flow' },
    { kind: 'ticket', target: { workflowId: 'flow', localTicketId: 'T' }, recordId: '["flow","T"]' },
    { kind: 'ticket', target: { workflowId: 'flow', decisionId: 'D' } },
    { kind: 'workflow', target: { workflowId: 'flow', localTicketId: 'T' } },
    { kind: 'health', target: { workflowId: 'flow' } },
    { kind: 'decision', target: null },
    { kind: 'decision', target: { workflowId: 'flow', decisionId: '' } },
  ]) {
    const result = await f.execute('mattpocock_record', { request: { action: 'read', query } })
    assert.equal(result.isError, true, JSON.stringify(query))
    await assert.rejects(f.ctx.tools.get('mattpocock_record').execute({ request: { action: 'read', query } }, { agent: f.root, signal: signal(), concludeTurn() {}, deferContext() {} }), error => error.code === 'invalid-input')
  }
})

test('mounted next requests execute unchanged across current pages and canonical UTF-8 body chunks', async t => {
  const f = await setup(t)
  for (let index = 0; index < 3; index++) await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'ticket-' + index, expectedRevision: index + 1, workflowId: 'flow', localTicketId: 'T' + index, action: 'put-ticket', value: { title: 'Ticket ' + index, statuses: { delivery: ['partial'] } } }, signal())
  const ids = []
  let next = { tool: 'mattpocock_record', request: { action: 'read', query: { kind: 'ticket', workflowId: 'flow', limit: 1 } } }
  while (next !== null) {
    const page = await execute(f, next.tool, next.request)
    ids.push(...page.rows.map(row => row.recordId))
    assert.equal(page.next === null, !page.more)
    if (page.next) {
      assert.deepEqual(page.next.request.query, { kind: 'ticket', workflowId: 'flow', limit: 1, cursor: page.nextCursor })
      assert.equal(page.next.tool, 'mattpocock_record')
    }
    next = page.next
    assert.ok(ids.length <= 3)
  }
  assert.deepEqual(new Set(ids), new Set(['["flow","T0"]', '["flow","T1"]', '["flow","T2"]']))
  const context = '漢😀\n\\"'.repeat(6000)
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'large', expectedRevision: 4, workflowId: 'flow', decisionId: 'D', action: 'put-decision', value: { question: 'Exact body', context, status: 'open' } }, signal())
  const page = await execute(f, 'mattpocock_record', { action: 'read', query: { kind: 'decision', target: { workflowId: 'flow', decisionId: 'D' } } })
  const chunks = []
  next = { tool: 'mattpocock_record', request: { action: 'detail', locator: page.rows[0].detail.locator } }
  let previous = 0, hash, total
  while (next !== null) {
    const part = await execute(f, next.tool, next.request)
    assert.equal(part.contentType, 'application/json')
    assert.equal(part.encoding, 'utf-8')
    assert.equal(part.offset, previous)
    hash ??= part.contentHash; total ??= part.totalBytes
    assert.equal(part.contentHash, hash); assert.equal(part.totalBytes, total)
    chunks.push(part.data)
    assert.equal(part.next === null, part.done)
    if (part.next) assert.deepEqual(part.next, { tool: 'mattpocock_record', request: { action: 'detail', locator: part.locator, offset: part.nextOffset } })
    assert.ok(part.nextOffset > previous || part.done)
    previous = part.nextOffset; next = part.next
    assert.ok(chunks.length < 20)
  }
  assert.ok(chunks.length > 1)
  const text = chunks.join('')
  assert.equal(Buffer.byteLength(text), total)
  assert.equal(createHash('sha256').update(text).digest('hex'), hash)
  assert.equal(JSON.parse(text).value.context, context)
})

test('mounted history next preserves its structured cut/filter and absent summaries remain null', async t => {
  const f = await setup(t)
  for (let index = 0; index < 3; index++) await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'question-' + index, expectedRevision: index + 1, workflowId: 'flow', decisionId: 'D' + index, action: 'put-decision', value: { question: 'Question ' + index, status: 'open' } }, signal())
  const ids = []
  let next = { tool: 'mattpocock_history', request: { action: 'query', query: { kind: 'decision', limit: 1 } } }, cut
  while (next !== null) {
    const page = await execute(f, next.tool, next.request)
    assert.equal(page.rows.length, 1)
    assert.equal(page.rows[0].summary, null)
    ids.push(page.rows[0].historyId)
    cut ??= page.cut; assert.equal(page.cut, cut)
    if (page.more) {
      assert.equal(page.next.tool, 'mattpocock_history')
      assert.equal(page.next.request.query.kind, 'decision')
      assert.equal(page.next.request.query.limit, 1)
      assert.deepEqual(page.next.request.query.cursor, page.nextCursor)
      assert.equal(typeof page.nextCursor, 'object')
    } else assert.equal(page.next, null)
    next = page.next
    assert.ok(ids.length <= 3)
  }
  assert.equal(new Set(ids).size, 3)
})

test('mounted audit preserves unknown and not-recorded episode coverage without inventing zero or completion', async t => {
  const config = { schemaVersion: 1, revision: 0, defaults: { enabled: true, dryRun: true }, workspaceOverrides: {} }
  const name = 'mattpocock_supervision_state_' + createHash('sha256').update('root').digest('hex').slice(0, 32)
  for (const status of ['unknown', 'not-recorded']) {
    const seedUnits = new Map([['mattpocock_supervision_config', new Map([['state', config]])]])
    if (status === 'unknown') seedUnits.set(name, new Map([['state', { schemaVersion: 999, corrupt: true }]]))
    const f = await mountedFixture(t, { seedUnits })
    await f.runtime.savePolicy(operator, policy(), 0, signal())
    const overview = await execute(f, 'mattpocock_audit', { action: 'read' })
    assert.equal(overview.coverage.episodes.status, status)
    assert.equal(overview.collections.episode.coverage, status)
    assert.equal(overview.collections.episode.total, null)
    assert.equal(overview.collections.episode.more, null)
    assert.equal(overview.collections.episode.query, null)
    assert.equal(typeof overview.collections.episode.reason, 'string')
    const page = await execute(f, 'mattpocock_audit', { action: 'read', query: { kind: 'episode' } })
    assert.equal(page.coverage, status)
    assert.deepEqual(page.auditCoverage.episodes, overview.coverage.episodes)
    assert.equal(page.auditCoverage.persistence, overview.coverage.persistence)
    assert.equal(page.auditCoverage.previews, undefined)
    assert.ok(page.auditCoverage.events >= overview.coverage.events, 'live summary can gain audit tool events between reads')
    assert.equal(page.total, null)
    assert.equal(page.more, null)
    assert.equal(page.next, null)
    assert.equal(page.nextCursor, null)
    assert.equal(typeof page.reason, 'string')
    const denied = await f.execute('mattpocock_audit', { request: { action: 'read' } }, f.child)
    assert.equal(denied.isError, true)
  }
})

test('resource reasons and receipt diagnostics retain exact small structures with separate long previews', async t => {
  const f = await setup(t)
  const { createModelTools } = await import('../src/model-tools.ts')
  const adapter = createModelTools(f.runtime)
  const who = await adapter.identity(caller('root'), signal())
  // Public adapter projection seam supplements (not replaces) the mounted tests above.
  const resource = await adapter.project('mattpocock_resource', who, { action: 'read' }, { resourceId: 'R', status: 'retained', actualCanRetire: { allowed: false, reasons: ['identity-unknown'], facts: null, ledgerRevision: 1, checkedAt: 2 } }, signal())
  assert.deepEqual(resource.actualCanRetire.reasons, ['identity-unknown'])
  const largeReasons = Array.from({ length: 100 }, (_, index) => 'live-observation-reason-' + index)
  const largeResource = await adapter.project('mattpocock_resource', who, { action: 'read' }, { resourceId: 'R', status: 'retained', actualCanRetire: { allowed: false, reasons: largeReasons, facts: null, ledgerRevision: 1, checkedAt: 2 } }, signal())
  assert.equal(Object.hasOwn(largeResource.actualCanRetire, 'reasons'), false)
  assert.equal(largeResource.actualCanRetire.previews.reasons.truncated, true)
  assert.deepEqual(largeResource.actualCanRetire.observation, { coverage: 'live-current-only', read: { tool: 'mattpocock_resource', request: { action: 'read', resourceId: 'R' } } })
  const coverage = { records: 'unknown', reason: 'storage-unavailable' }
  const short = await adapter.project('mattpocock_window', who, { action: 'reserve' }, { appliedRevision: 2, generation: 1, ignored: false, coverage }, signal())
  assert.deepEqual(short.coverage, coverage)
  const diagnostic = 'Detail 漢😀'.repeat(200)
  const long = await adapter.project('mattpocock_window', who, { action: 'reserve' }, { appliedRevision: 2, generation: 1, ignored: false, diagnostic }, signal())
  assert.equal(Object.hasOwn(long, 'diagnostic'), false)
  assert.equal(long.previews.diagnostic.truncated, true)
  assert.equal(long.previews.diagnostic.totalBytes, Buffer.byteLength(diagnostic))
  assert.ok(Buffer.byteLength(JSON.stringify(long)) <= 8192)
  assert.equal(long.generation, 1); assert.equal(long.ignored, false); assert.equal(long.appliedRevision, 2)
})

test('mounted target supports reference and held-terminal selectors without granting history or releasing slots', async t => {
  const f = await setup(t)
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'reference', expectedRevision: 1, workflowId: 'flow', localTicketId: 'R', action: 'put-task-reference', value: { source: { kind: 'unverified' }, locator: 'task:R' } }, signal())
  const reference = await execute(f, 'mattpocock_record', { action: 'read', query: { kind: 'task-reference', target: { workflowId: 'flow', localTicketId: 'R' } } })
  assert.deepEqual(reference.rows[0].source, { kind: 'unverified' })
  assert.equal(reference.rows[0].sourceObservation, 'authored-unverified')
  const terminal = { title: 'Terminal', axes: [{ axisKey: 'delivery', label: 'Delivery', counting: 'exclusive', statuses: [{ statusKey: 'delivered', label: 'Delivered', terminal: true }] }] }
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'terminal-flow', expectedRevision: 2, action: 'put-workflow', workflowId: 'done', value: terminal }, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'ticket', expectedRevision: 3, action: 'put-ticket', workflowId: 'done', localTicketId: 'T', value: { title: 'Held', statuses: { delivery: ['delivered'] } } }, signal())
  const receipt = await execute(f, 'mattpocock_window', { action: 'reserve', operationId: 'hold', workflowId: 'done', localTicketId: 'T' })
  assert.equal(receipt.generation, 1)
  for (const kind of ['window-ticket', 'pending-release']) {
    const page = await execute(f, 'mattpocock_record', { action: 'read', query: { kind, target: { workflowId: 'done', localTicketId: 'T' } } })
    assert.equal(page.rows.length, 1)
    assert.equal(page.rows[0].recordId, '["done","T"]')
    assert.equal(page.rows[0].generation, 1)
  }
  await f.runtime.assign(caller('root'), { sessionId: 'child', workflowId: 'flow', ticketIds: ['R'] }, signal())
  const child = await execute(f, 'mattpocock_record', { action: 'read', query: { kind: 'task-reference', target: { workflowId: 'flow', localTicketId: 'R' } } }, f.child)
  assert.equal(child.rows.length, 1)
  const unrelated = await execute(f, 'mattpocock_record', { action: 'read', query: { kind: 'ticket', target: { workflowId: 'done', localTicketId: 'T' } } }, f.child)
  assert.deepEqual(unrelated.rows, [])
  assert.equal((await f.execute('mattpocock_history', { request: { action: 'query' } }, f.child)).isError, true)
  const current = await execute(f, 'mattpocock_record', { action: 'read' })
  assert.equal(current.windows.T.used, 1)
})

test('mounted oversized structured fields are omitted with previews and authorized detail retains the exact object', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const keys = Array.from({ length: 32 }, (_, index) => 'status-' + index)
  const workflowValue = { title: 'Many statuses', axes: [{ axisKey: 'checks', label: 'Checks', counting: 'overlapping', statuses: keys.map(key => ({ statusKey: key, label: key })) }] }
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'flow', expectedRevision: 0, workflowId: 'flow', action: 'put-workflow', value: workflowValue }, signal())
  const statuses = { checks: keys }
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'ticket', expectedRevision: 1, workflowId: 'flow', localTicketId: 'T', action: 'put-ticket', value: { title: 'Exact', statuses } }, signal())
  const page = await execute(f, 'mattpocock_record', { action: 'read', query: { kind: 'ticket', target: { workflowId: 'flow', localTicketId: 'T' } } })
  assert.equal(Object.hasOwn(page.rows[0], 'statuses'), false)
  assert.equal(page.rows[0].previews.statuses.truncated, true)
  assert.equal(page.rows[0].previews.statuses.totalBytes, Buffer.byteLength(JSON.stringify(statuses)))
  const body = await execute(f, 'mattpocock_record', { action: 'detail', locator: page.rows[0].detail.locator })
  assert.equal(body.done, true); assert.equal(body.next, null)
  assert.deepEqual(JSON.parse(body.data).value.statuses, statuses)
})

test('adapter keeps critical row coverage exact while long explanatory reasons are explicitly previewed', async t => {
  const f = await setup(t)
  const { createModelTools } = await import('../src/model-tools.ts')
  const view = await f.runtime.readModelCurrent(caller('root'), 'root', signal())
  const coverage = { status: 'unknown', reasons: Array.from({ length: 40 }, (_, index) => 'source-gap-' + index) }
  const reason = 'source detail '.repeat(100)
  const health = { ...view.collections.health, reason, rows: [{ ...view.collections.health.rows[0], preview: { coverage } }] }
  const adapter = createModelTools({ ...f.runtime, readModelCurrent: async () => ({ ...view, collections: { health } }) })
  const page = await adapter.current(caller('root'), { kind: 'health' }, signal())
  assert.deepEqual(page.rows[0].coverage, coverage)
  assert.equal(Object.hasOwn(page, 'reason'), false)
  assert.equal(page.previews.reason.truncated, true)
  const current = await adapter.current(caller('root'), undefined, signal())
  assert.equal(Object.hasOwn(current.collections.health, 'reason'), false)
  assert.equal(current.collections.health.previews.reason.totalBytes, Buffer.byteLength(reason))
})

test('mounted byte-deferred history detail next consumes exact remaining IDs from a legal retained fixture', async t => {
  const f = await setup(t)
  const history = await import('../src/controls/history.ts')
  const who = await f.runtime.readModelIdentity(caller('root'), 'root', signal())
  const suffix = 'history_' + createHash('sha256').update(who.instance.instrumentInstanceId).digest('hex').slice(0, 56)
  const store = await f.mounted.ports.openUnitStorage(suffix, history.parseHistoryDocument)
  const initial = await store.read() ?? history.initialHistoryDocument(who.instance)
  const kind = '種'.repeat(256), sourceDomain = '源'.repeat(256), now = Date.now()
  const rows = Array.from({ length: 20 }, (_, index) => ({
    historyId: 'h:' + (initial.rows.length + index + 1), sequence: initial.rows.length + index + 1, capturedAt: now,
    kind, recordId: '件'.repeat(250) + index, recordKey: '件'.repeat(250) + index, version: 1,
    snapshot: { answer: 'retained fixture ' + index }, source: { kind: 'snapshot', domain: sourceDomain, author: null, recordedAt: null, coverage: 'snapshot-only' },
    summary: index === 0 ? 'Exact short summary' : '\u0001'.repeat(1000), sourceDomain, purged: false,
  }))
  await store.compareAndSwap(initial.revision, history.parseHistoryDocument({ ...initial, revision: initial.revision + 1, rows: [...initial.rows, ...rows] }))
  const ids = rows.map(row => row.historyId), delivered = []
  let next = { tool: 'mattpocock_history', request: { action: 'detail', historyIds: ids } }, count = 0
  while (next !== null) {
    const page = await execute(f, next.tool, next.request)
    assert.ok(page.rows.length > 0)
    assert.deepEqual(page.missingHistoryIds, [])
    if (count === 0) {
      assert.ok(page.rows.length < 20, 'final JSON budget defers legal large metadata, not missing rows')
      assert.ok(page.remainingHistoryIds.length > 0)
      assert.notEqual(page.next, null)
      t.diagnostic(JSON.stringify({ firstDetailRows: page.rows.length, deferred: page.remainingHistoryIds.length, bytes: Buffer.byteLength(JSON.stringify(page)) }))
    }
    for (const row of page.rows) {
      if (row.historyId === ids[0]) assert.equal(row.summary, 'Exact short summary')
      else { assert.equal(Object.hasOwn(row, 'summary'), false); assert.equal(row.previews.summary.totalBytes, 1000) }
      delivered.push(row.historyId)
    }
    if (page.next !== null) assert.deepEqual(page.next, { tool: 'mattpocock_history', request: { action: 'detail', historyIds: page.remainingHistoryIds } })
    next = page.next
    assert.ok(++count <= 20)
  }
  assert.deepEqual(new Set(delivered), new Set(ids))
  assert.equal(delivered.length, ids.length)
})
