import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, actualAgent, caller, operator, policy, signal, workflow, ticket } from './fixtures/runtime-host.mjs'

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
  const overview = value(await f.execute(current.policy.query.tool, { request: { action: current.policy.query.action } }, f.child))
  assert.equal(overview.scope.kind, 'assigned')
  assert.ok(Object.keys(overview.policy.sources).length > 0)
  const detail = overview.policy.detail
  const policyBody = value(await f.execute(detail.tool, { request: { action: detail.action, locator: detail.locator } }, f.child))
  assert.equal(policyBody.done, true)
  assert.deepEqual(JSON.parse(policyBody.data).sources, overview.policy.sources)
  await assert.rejects(f.runtime.historyAction(caller('child'), 'child', { action: 'query', query: { kind: 'ticket' } }, signal()), e => e.code === 'access-denied')
  const retained = current.records.tickets.rows[0].query
  await f.runtime.assign(caller('root'), { sessionId: 'child', workflowId: null, ticketIds: [] }, signal())
  assert.equal(value(await f.execute(retained.tool, { request: { action: retained.action, query: retained.query } }, f.child)).rows.length, 0,
    'navigation never retains revoked authorization')
})

async function content(f, detail, agent = f.root) {
  const chunks = []
  let request = { action: detail.action, locator: detail.locator }
  for (;;) {
    const part = value(await f.execute(detail.tool, { request }, agent))
    chunks.push(part.data)
    if (part.done) return JSON.parse(chunks.join(''))
    assert.equal(part.next.tool, 'mattpocock_record')
    request = part.next.request
  }
}

test('coordinator reads recover summarized completed executions and downshifted tree checks', async t => {
  const f = await mountedFixture(t, { futureNativeActivityKnown: true })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const child = actualAgent('ordinary-end', { parent: 'root', managed: true, cwd: '/fixture' })
  f.agents.set(child.id, child)
  await f.runtime.created(caller(child.id), signal(), child)
  await f.runtime.observe({ kind: 'subagent-start', sessionId: child.id, actualAgent: child, runId: 'run-1', provider: 'spawn', local: true })
  await f.runtime.observe({ kind: 'subagent-end', sessionId: child.id, actualAgent: child, runId: 'run-1', provider: 'spawn', local: true, stopReason: 'completed' })
  const messages = await f.runtime.preStep(caller('root'), signal(), [], 'normal-end')
  const current = facts(messages)
  assert.equal(current.nativeExecutions.ordinaryEnded, 1)
  assert.deepEqual(current.nativeExecutions.rows, [])
  const query = current.nativeExecutions.query
  const page = value(await f.execute(query.tool, { request: { action: query.action, query: query.query } }))
  assert.equal(page.total, 1)
  const execution = page.rows[0] // native rows are live-current-only, not durable detail locators
  assert.match(execution.observation.coverage, /live-current-only/)
  assert.equal(execution.sessionId, child.id)
  assert.equal(execution.headerCwd, '/fixture')
  assert.equal(execution.outcome, 'completed')
  assert.match(current.nativeExecutions.detailsCoverage, /live-current-only/)
  const historyQuery = current.nativeExecutions.historyQuery
  const recorded = value(await f.execute(historyQuery.tool, { request: { action: historyQuery.action, query: historyQuery.query } }))
  assert.ok(recorded.rows.some(row => row.recordId === child.id))
  const historical = await content(f, recorded.rows.find(row => row.recordId === child.id).detail)
  assert.ok(JSON.stringify(historical).includes(child.id), 'separate recorded version, not a fake live detail locator')
  const exec = { name: 'create_worktree', arguments: { name: 'recovery' }, callId: 'tree', rootCallId: 'tree',
    token: {}, agent: f.root, signal: signal(), deferContext() {}, concludeTurn() {} }
  await f.runtime.postExecute(caller('root'), exec, { isError: false, value: {
    path: '/trees/recovery', branch: 'recovery', baseCommit: 'a'.repeat(40), repositoryRoot: '/repo',
  } }, 'tree-create')
  const updated = facts(await f.runtime.preStep(caller('root'), signal(), [], 'tree-check'))
  assert.equal(updated.worktreeObservations.total, 1)
  const tree = updated.worktreeObservations.rows[0]
  assert.equal(tree.check.facts, undefined)
  const recovered = value(await f.execute(tree.query.tool, { request: { action: tree.query.action, query: tree.query.query } }))
  const treeBody = await content(f, recovered.rows[0].detail)
  assert.equal(treeBody.observationId, tree.observationId)
  assert.equal(treeBody.value.path, '/trees/recovery')
  assert.equal(treeBody.value.check.state, 'failed') // synthetic /trees path does not exist; no physical success is invented
  assert.equal(tree.check.state, 'failed')
  assert.ok(treeBody.value.check.diagnostic)
  assert.equal(treeBody.value.check.facts, null)
  t.diagnostic(JSON.stringify({ case: 'ordinary-end-with-required-current-read', summaryBytes: Buffer.byteLength(messages[0].content[0].text),
    readBytes: Buffer.byteLength(JSON.stringify(page)), totalBytes: Buffer.byteLength(messages[0].content[0].text) + Buffer.byteLength(JSON.stringify(page)), calls: 1 }))
})
