import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, caller, operator, policy, signal } from './fixtures/runtime-host.mjs'

const facts = messages => {
  assert.equal(messages.length, 1)
  return JSON.parse(messages[0].content[0].text.split('Current runtime facts (null means unavailable/unknown, not zero):\n')[1])
}
const value = result => {
  assert.notEqual(result.isError, true, result.error?.message)
  assert.deepEqual(result.value, JSON.parse(result.content.find(part => part.type === 'text').text))
  return result.value
}

// Real Runtime/record/policy and mounted current-read seam, synthetic business data only.
// This proves the injected recovery locator works for its actual assigned consumer, not
// that a live model adopts or that the production GUI/SDK has changed.
test('assigned consumption recovers a real candidate ahead of old awaits through its authorized current locator', async t => {
  const f = await mountedFixture(t, { futureNativeActivityKnown: true })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const initial = await f.runtime.readOwnerDecisionPolicy(operator, 'root', signal())
  await f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'enable-recovery', expectedRevision: 0,
    expectedScope: initial.instance, action: 'enable', durationMs: null }, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'flow', expectedRevision: 0, workflowId: 'flow',
    action: 'put-workflow', value: { title: 'Recovery task', axes: [] } }, signal())
  await f.runtime.assign(caller('root'), { sessionId: 'child', workflowId: 'flow', ticketIds: [] }, signal())
  for (let i = 0; i < 4; i++) await f.runtime.applyInstrument(caller('child'), 'child', {
    operationId: 'old-' + i, expectedRevision: i + 1, workflowId: 'flow', decisionId: 'a-old-' + i, action: 'put-decision',
    value: { question: 'Old follow-through', status: 'answered', pending: false, awaitingImplementation: true,
      result: 'Retained commitment '.repeat(200) } }, signal())
  const put = await f.runtime.applyInstrument(caller('child'), 'child', { operationId: 'candidate', expectedRevision: 5,
    workflowId: 'flow', decisionId: 'z-current', action: 'put-decision', references: ['task:source'],
    value: { question: 'Choose a read-only runtime path', status: 'open', pending: true, addressee: { kind: 'user', principalId: operator.principalId },
      context: 'Existing constraints '.repeat(1000), options: [{ key: 'wait-read-only', label: 'Wait for maintenance-provided input' }],
      recommendation: 'wait-read-only', awaitingImplementation: true } }, signal())
  assert.equal(put.recommendation.status, 'candidate')
  const current = facts(await f.runtime.preStep(caller('child'), signal(), [], 'recovery:1'))
  const row = current.records.decisions.rows[0]
  assert.equal(row.decisionId, 'z-current')
  assert.deepEqual(row.recommendationSupport, put.recommendation)
  assert.equal(current.records.decisions.total, 5)
  assert.equal(current.records.summary.pendingUserDecisionCount, 1)
  assert.equal(current.records.summary.awaitingImplementationCount, 5)
  assert.ok(JSON.stringify(current.records.decisions).length <= 1850)
  assert.equal(row.query.tool, 'mattpocock_record')
  const recovered = value(await f.execute(row.query.tool, { request: { action: row.query.action, query: row.query.query } }, f.child))
  assert.equal(recovered.rows.length, 1)
  assert.deepEqual(recovered.rows[0].recommendationSupport, put.recommendation)
  assert.equal(recovered.revisions.business, 6)
  await assert.rejects(f.runtime.historyAction(caller('child'), 'child', { action: 'query', query: { kind: 'decision' } }, signal()), error => error.code === 'access-denied')
  await f.runtime.assign(caller('root'), { sessionId: 'child', workflowId: null, ticketIds: [] }, signal())
  const revoked = value(await f.execute(row.query.tool, { request: { action: row.query.action, query: row.query.query } }, f.child))
  assert.equal(revoked.rows.length, 0, 'the locator is navigation, never a retained authorization token')
})
