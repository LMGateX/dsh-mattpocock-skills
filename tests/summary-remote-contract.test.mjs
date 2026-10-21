import test from 'node:test'
import assert from 'node:assert/strict'
import './fixtures/runtime-host.mjs'
const contract = await import('../src/controls/remote-contract.ts')

test('summary batches have a strict bounded request and real cancellation channel', () => {
  assert.ok(contract.REMOTE_METHODS.includes('readSummaries'))
  const endpoint = contract.REMOTE_CONTRIBUTION.descriptors.find(row => row.method === 'readSummaries')
  assert.deepEqual(endpoint.parameters.map(row => row.wire), ['request'])
  assert.equal(endpoint.cancellation.parameter, 'signal')
  const parse = value => endpoint.parameters[0].codec.create().parse(value)
  const request = { sessions: [{ sessionId: 'root' }, { sessionId: 'child', version: 'a'.repeat(64) }] }
  assert.deepEqual(parse(request), request)
  assert.ok(Object.isFrozen(parse(request).sessions))
  for (const invalid of [
    { sessions: [] }, { sessions: Array.from({ length: 33 }, (_, i) => ({ sessionId: 's' + i })) },
    { sessions: [{ sessionId: 'root' }, { sessionId: 'root' }] },
    { sessions: [{ sessionId: 'root', principalId: 'user:operator' }] },
    { sessions: [{ sessionId: 'root', version: 'untrusted-version' }] },
    { sessions: [{ sessionId: 'root' }], ownerSessionId: 'foreign' },
  ]) assert.throws(() => parse(invalid))
})

const summary = () => ({ sessionId: 'root', caller: { kind: 'user', principalId: 'user:operator', sessionId: null },
  instance: { instrumentInstanceId: 'I', ownerSessionId: 'root', controlWorkspaceId: 'W' },
  policy: { configurationRevision: 2, controlWorkspaceId: 'W', workspaceVerified: true, extensionEnabled: true, workspaceEnabled: false,
    display: { header: false, inputSummary: false, rightPanel: true, sessionList: true, timeline: true } },
  records: { businessRevision: 7, viewerRevision: 1, summary: { countingScope: 'instance', pendingUserDecisionCount: 3 } }, health: [] })
const batch = (value = summary()) => ({ rows: [{ sessionId: 'root', status: 'current', version: 'a'.repeat(64), summary: value }] })

test('summary results reject unbounded, foreign or full-detail fields and contradictory health', () => {
  const valid = batch(), parsed = contract.parseSessionSummaryBatch(valid)
  assert.deepEqual(parsed, valid)
  assert.ok(Object.isFrozen(parsed.rows[0].summary.records.summary))
  for (const mutate of [
    value => { value.rows.push(value.rows[0]) },
    value => { value.rows[0].summary.sessionId = 'foreign' },
    value => { value.rows[0].summary.caller = { kind: 'agent', principalId: 'agent:foreign', sessionId: 'foreign' } },
    value => { value.rows[0].summary.policy.controlWorkspaceId = 'foreign' },
    value => { value.rows[0].summary.records.history = [] },
    value => { value.rows[0].summary.records.summary.pendingUserDecisionCount = -1 },
    value => { value.rows[0].summary.records = null },
    value => { value.rows[0].summary.health = [{ scope: 'records', status: 'unknown', reason: 'failed' }] },
    value => { value.rows[0].summary.health = [{ scope: 'windows', status: 'unknown', reason: 'failed' }] },
    value => { value.rows[0].reason = 'unexpected-field' },
  ]) { const bad = structuredClone(valid); mutate(bad); assert.throws(() => contract.parseSessionSummaryBatch(bad)) }
  const unknown = summary(); unknown.records = null; unknown.health = [{ scope: 'records', status: 'unknown', reason: 'records-unavailable' }]
  assert.deepEqual(contract.parseSessionSummaryBatch(batch(unknown)), batch(unknown))
  const statuses = { rows: [{ sessionId: 'root', status: 'unchanged', version: 'b'.repeat(64) }, { sessionId: 'child', status: 'unavailable', reason: 'access-denied' }] }
  assert.deepEqual(contract.parseSessionSummaryBatch(statuses), statuses)
  assert.throws(() => contract.parseSessionSummaryBatch({ rows: Array(33).fill(statuses.rows[0]) }))
})

test('maximum-length legal Unicode identities fit the bounded UTF-8 summary batch', () => {
  const longest = '界'.repeat(256)
  const rows = Array.from({ length: contract.SUMMARY_BATCH_LIMIT }, (_, i) => {
    const value = summary(), sessionId = '行'.repeat(252) + String(i).padStart(4, '0')
    value.sessionId = sessionId; value.caller.principalId = longest
    value.instance = { instrumentInstanceId: longest, ownerSessionId: longest, controlWorkspaceId: longest }
    value.policy.controlWorkspaceId = longest
    value.records = null; value.health = [{ scope: 'records', status: 'unknown', reason: 'records-unavailable' }]
    return { sessionId, status: 'current', version: 'f'.repeat(64), summary: value }
  })
  const parsed = contract.parseSessionSummaryBatch({ rows })
  assert.equal(parsed.rows.length, 32)
  assert.ok(Buffer.byteLength(JSON.stringify(parsed), 'utf8') <= contract.SUMMARY_RESPONSE_LIMIT)
  assert.deepEqual(contract.parseSessionSummaryRequest({ sessions: rows.map(row => ({ sessionId: row.sessionId })) }).sessions.map(row => row.sessionId), rows.map(row => row.sessionId))
})

test('an over-budget summary array is rejected before traversing its elements', () => {
  const sessions = new Proxy(Array(33), { ownKeys() { throw new Error('must not traverse over-budget input') } })
  assert.throws(() => contract.parseSessionSummaryRequest({ sessions }), error => error.code === 'invalid-input')
})
