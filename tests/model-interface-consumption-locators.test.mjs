import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, caller, operator, policy, signal, workflow, ticket } from './fixtures/runtime-host.mjs'

const facts = messages => {
  assert.equal(messages.length, 1)
  return JSON.parse(messages[0].content[0].text.split('Current runtime facts (null means unavailable/unknown, not zero):\n')[1])
}
const value = result => {
  assert.notEqual(result.isError, true, result.error?.message)
  return result.value
}

// Agreed public seam: real Runtime injection -> mounted current-read tool under assigned ACL.
// Synthetic records only; this does not grant history access or prove source-current business data.
test('assigned consumers recover workflows, tickets, counts and held windows through executable current locators', async t => {
  const f = await mountedFixture(t, { futureNativeActivityKnown: true })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'flow', expectedRevision: 0,
    workflowId: 'flow', action: 'put-workflow', value: workflow }, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'A', expectedRevision: 1,
    workflowId: 'flow', localTicketId: 'A', action: 'put-ticket', value: ticket() }, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'B', expectedRevision: 2,
    workflowId: 'flow', localTicketId: 'B', action: 'put-ticket', value: ticket() }, signal())
  await f.runtime.assign(caller('root'), { sessionId: 'child', workflowId: 'flow', ticketIds: ['A'] }, signal())
  await f.runtime.applyTicketWindow(caller('child'), 'child', { operationId: 'reserve', workflowId: 'flow', localTicketId: 'A', action: 'reserve' }, signal())
  const current = facts(await f.runtime.preStep(caller('child'), signal(), [], 'locator:1'))
  for (const [category, kind, id] of [
    [current.records.workflows, 'workflow', 'flow'],
    [current.records.tickets, 'ticket', '["flow","A"]'],
    [current.records.summary.statusCounts, 'status-count', '["flow","delivery"]'],
    [current.windows.tickets, 'window-ticket', '["flow","A"]'],
  ]) {
    assert.equal(category.query.tool, 'mattpocock_record', kind + ' must not point assigned readers at owner history')
    assert.equal(category.query.action, 'read')
    assert.equal(category.query.query.kind, kind)
    const listed = value(await f.execute(category.query.tool, { request: { action: category.query.action, query: category.query.query } }, f.child))
    assert.equal(listed.rows.length, 1, kind + ' respects the assigned scope')
    const query = category.rows[0].query
    assert.equal(query.tool, 'mattpocock_record')
    assert.equal(query.query.recordId, id)
    const recovered = value(await f.execute(query.tool, { request: { action: query.action, query: query.query } }, f.child))
    assert.equal(recovered.rows.length, 1)
    assert.equal(recovered.rows[0].recordId, id)
  }
  await assert.rejects(f.runtime.historyAction(caller('child'), 'child', { action: 'query', query: { kind: 'ticket' } }, signal()), e => e.code === 'access-denied')
  const retained = current.records.tickets.rows[0].query
  await f.runtime.assign(caller('root'), { sessionId: 'child', workflowId: null, ticketIds: [] }, signal())
  assert.equal(value(await f.execute(retained.tool, { request: { action: retained.action, query: retained.query } }, f.child)).rows.length, 0,
    'navigation never retains revoked authorization')
})
