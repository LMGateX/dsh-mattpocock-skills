import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, caller, operator, policy, signal, workflow, ticket, actualAgent } from './fixtures/runtime-host.mjs'

// Recovery is observed only through the real mounted SDK tool pipeline's typed value
// and rendered content. No preStep/model-step assembly is invoked and no automatic
// additionalContexts are consumed. Production postExecute hooks remain enabled.
// Native Agents/catalog entries below are controlled public fixtures, not live models.

async function modelRead(f, query, agent = f.root) {
  const result = await f.execute('mattpocock_record', { request: { action: 'read', ...(query ? { query } : {}) } }, agent)
  assert.equal(result.error, undefined)
  assert.equal(result.value.schemaVersion, 2, 'recovery must use the actual bounded typed model result, not an automatic snapshot')
  const rendered = result.content.filter(row => row.type === 'text').map(row => row.text).join('')
  assert.equal(rendered, JSON.stringify(result.value), 'typed value and actual model render carry identical recovery facts')
  assert(Buffer.byteLength(rendered) <= 65536)
  return result.value
}

test('record model read alone recovers current window knowledge without preStep or consumed injection', async t => {
  const f = await mountedFixture(t, { futureNativeActivityKnown: true })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const current = await modelRead(f)
  assert.equal(current.kind, 'current')
  assert.equal(current.windows.T.used, 0)
  assert.equal(current.windows.T.capacity, 2)
  assert.equal(current.windows.S.used, 0)
  assert.equal(current.windows.S.countKnown, true)
  assert.equal(current.windows.S.countReason, null)
  const health = await modelRead(f, { kind: 'health', limit: 100 })
  assert(health.rows.some(row => row.scope === 'native-count' && row.status === 'current'))
})

test('record recovery reports an unknown positive running lower bound rather than a known or empty count', async t => {
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, child }) {
    child.status = 'running'
    ctx.provide('subagents', { async listChildren() { throw new Error('discovery unavailable') } })
  } })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  // One public read admits the live membership; the second observes the rejected discovery.
  await modelRead(f)
  const current = await modelRead(f)
  assert.equal(current.windows.S.used, 1)
  assert.equal(current.windows.S.countKnown, false)
  assert.equal(current.windows.S.countReason, 'native-subagent-listing-rejected')
  assert.equal(current.windows.S.depth.direct, 1)
  assert.equal(current.windows.S.depth.direct + current.windows.S.depth.deeper + current.windows.S.depth.unknown, 1)
  const health = await modelRead(f, { kind: 'health', limit: 100 })
  assert(health.rows.some(row => row.scope === 'native-count' && row.status === 'unknown' && row.reason === 'native-subagent-listing-rejected'))
  assert.equal(current.collections['native-stop'].total, 0)
})

let operation = 0
async function apply(f, action, fields, agent = f.root) {
  const current = await modelRead(f, undefined, agent)
  const result = await f.execute('mattpocock_record', { request: { action: 'apply', command: {
    operationId: 'recovery-op-' + ++operation, expectedRevision: action === 'set-decision-view' ? current.revisions.viewer : current.revisions.business,
    workflowId: 'flow', action, ...fields,
  } } }, agent)
  assert.equal(result.error, undefined)
  assert.equal(result.value.kind, 'receipt')
  assert(Buffer.byteLength(JSON.stringify(result.value)) <= 8192)
  return result.value
}
async function pages(f, kind, filter = {}, agent = f.root) {
  const rows = [], cursors = new Set()
  let cursor
  do {
    const page = await modelRead(f, { kind, limit: 1, ...filter, ...(cursor ? { cursor } : {}) }, agent)
    assert.equal(page.kind, 'page')
    assert.equal(page.coverage, 'current')
    assert.equal(page.shown, page.rows.length)
    assert(page.rows.length > 0 || page.total === 0, 'a nonempty stable query makes progress')
    rows.push(...page.rows)
    assert(rows.length <= page.total, 'bounded pagination cannot run beyond the advertised collection')
    if (!page.more) { assert.equal(page.nextCursor, null); assert.equal(rows.length, page.total); break }
    assert.equal(typeof page.nextCursor, 'string')
    assert(!cursors.has(page.nextCursor), 'continuation must advance instead of returning the same cursor')
    cursors.add(page.nextCursor)
    cursor = page.nextCursor
  } while (true)
  assert.equal(new Set(rows.map(row => row.recordId)).size, rows.length, 'stable pagination neither duplicates nor omits rows')
  return rows
}

test('model read and query recover every terminal held slot as pending release without releasing it', async t => {
  const f = await mountedFixture(t, { futureNativeActivityKnown: true })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const terminal = { title: 'Delivery', axes: [{ axisKey: 'delivery', label: 'Delivery', counting: 'exclusive',
    statuses: [{ statusKey: 'partial', label: 'Partial' }, { statusKey: 'delivered', label: 'Delivered', terminal: true }] }] }
  await apply(f, 'put-workflow', { value: terminal })
  for (const localTicketId of ['T1', 'T2', 'T3']) {
    await apply(f, 'put-ticket', { localTicketId, value: ticket() })
    const held = await f.execute('mattpocock_window', { request: { action: 'reserve', operationId: 'hold-' + localTicketId, workflowId: 'flow', localTicketId } })
    assert.equal(held.error, undefined)
    await apply(f, 'put-ticket', { localTicketId, value: ticket('delivered') })
  }
  const overview = await modelRead(f)
  assert.equal(overview.windows.T.used, 3)
  assert.equal(overview.windows.T.overcommitted, true)
  const obligations = overview.collections['pending-release']
  assert.equal(obligations.total, 3)
  assert.equal(obligations.more, true)
  assert.equal(obligations.shown, 2)
  assert.deepEqual(obligations.query, { tool: 'mattpocock_record', action: 'read', query: { kind: 'pending-release', limit: 20 } })
  const rows = await pages(f, 'pending-release')
  assert.deepEqual(rows.map(row => row.localTicketId).sort(), ['T1', 'T2', 'T3'])
  for (const row of rows) {
    assert.equal(row.generation, 1)
    assert.equal(row.label, 'Delivered')
    assert.equal(row.workflowId, 'flow')
  }
  assert.equal((await modelRead(f)).windows.T.used, 3, 'recovery reads never author a release')
  assert.deepEqual((await pages(f, 'window-ticket')).map(row => row.recordId).sort(), rows.map(row => row.recordId).sort())
})

test('hidden matters survive management OFF and querying a new workflow without losing pending or implementation obligations', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  await apply(f, 'put-workflow', { value: workflow })
  for (const decisionId of ['D1', 'D2', 'D3']) {
    await apply(f, 'put-decision', { decisionId, value: { question: 'Old workflow obligation ' + decisionId, status: 'pending-user', pending: true,
      awaitingImplementation: true, addressee: { kind: 'user', principalId: 'user:operator' } } })
    await apply(f, 'set-decision-view', { decisionId, value: { read: true, hidden: true } })
  }
  await apply(f, 'put-workflow', { workflowId: 'new-focus', value: workflow })
  const policyState = await f.runtime.readPolicy(operator, signal())
  await f.runtime.savePolicy(operator, { extensionEnabled: false, defaults: {}, workspaceOverrides: {} }, policyState.revision, signal())
  const current = await modelRead(f)
  assert.equal(current.policy.extensionEnabled, false)
  assert.equal(current.records.summary.pendingDecisionCount, 3)
  assert.equal(current.records.summary.pendingUserDecisionCount, 3)
  assert.equal(current.records.summary.awaitingImplementationCount, 3)
  const focused = await pages(f, 'decision', { workflowId: 'new-focus' })
  assert.deepEqual(focused, [], 'a new workflow query narrows rows but does not resolve old matters')
  const rows = await pages(f, 'decision')
  assert.deepEqual(rows.map(row => row.decisionId).sort(), ['D1', 'D2', 'D3'])
  assert(rows.every(row => row.pending === true && row.awaitingImplementation === true))
  for (const row of rows) assert.deepEqual(row.view, { hidden: true, read: true })
  const latest = await modelRead(f)
  assert.equal(latest.records.summary.pendingDecisionCount, 3)
  assert.equal(latest.records.summary.awaitingImplementationCount, 3)
  assert.equal(latest.revisions.viewer, 3)
})

const catalog = id => ({ kind: 'child', id, mode: 'continuable', activity: 'running', hasChildren: false })
for (const outcome of ['error', 'unobservable']) {
  test('record recovery discovers native-stop ' + outcome + ' and its health without an injected snapshot', { timeout: 10000 }, async t => {
    let acceptNotice
    const noticed = new Promise(resolve => { acceptNotice = resolve })
    const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents }) {
      const worker = actualAgent('worker', { parent: 'root', managed: true })
      worker.status = 'running'
      agents.set(worker.id, worker)
      ctx.provide('subagents', { async listDescendants() { return [catalog('worker')] } })
    } })
    f.mounted.ports.notifyOwner = async input => { acceptNotice(input); return { status: 'accepted', messageId: 'recovery-wake' } }
    await f.runtime.savePolicy(operator, policy(), 0, signal())
    const before = await modelRead(f)
    assert.equal(before.windows.S.used, 1)
    assert.equal(before.windows.S.countKnown, true)
    if (outcome === 'error') {
      f.ctx.emit('subagent/end', { id: 'worker', runId: 'recovery-failed-run', provider: 'spawn', local: true, stopReason: 'error' })
    } else {
      const worker = f.agents.get('worker')
      f.agents.delete('worker')
      f.ctx.emit('agent/disposed', { agent: worker })
    }
    await noticed
    const current = await modelRead(f)
    assert.equal(current.collections['native-stop'].total, 1)
    assert.equal(current.collections['native-stop'].coverage, 'current')
    const rows = await pages(f, 'native-stop')
    assert.equal(rows[0].sessionId, 'worker')
    assert.equal(rows[0].outcome, outcome)
    assert.equal(rows[0].diagnostic, null, 'no unavailable cause is invented')
    if (outcome === 'unobservable') {
      assert.equal(rows[0].turn, null)
      assert.equal(rows[0].cancelCause, null)
      assert.match(JSON.stringify(rows[0].evidence), /worker/)
      assert.equal(rows[0].observed, 'child log could not be read')
      assert.deepEqual(f.sessionReads, ['worker'])
    }
    const health = await modelRead(f, { kind: 'health', limit: 100 })
    assert(health.rows.some(row => row.scope === 'native-subagent-outcome' && row.status === 'unsupported'))
  })
}

test('record recovery exposes a native worktree creation observation for disposition without claiming physical verification', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  await modelRead(f, undefined, f.child)
  // This is a controlled native tool-result event, not an authored business record or
  // proof that this test created a real tree. The unavailable Git seam must stay unknown.
  await f.runtime.postExecute(caller('child'), { name: 'create_worktree', arguments: { name: 'recovery-tree' },
    callId: 'native-recovery-tree', rootCallId: 'native-recovery-tree', token: {}, agent: f.child, signal: signal(),
    deferContext() {}, concludeTurn() {} }, { isError: false, value: { path: '/trees/recovery', branch: 'recovery-tree',
      baseCommit: 'a'.repeat(40), repositoryRoot: '/repo' } }, '1:1')
  f.agents.delete('child')
  f.ctx.emit('agent/disposed', { agent: f.child })
  const current = await modelRead(f)
  assert.equal(current.collections['worktree-observation'].total, 1)
  const rows = await pages(f, 'worktree-observation')
  assert.equal(rows[0].path, '/trees/recovery')
  assert.equal(rows[0].branch, 'recovery-tree')
  assert.equal(rows[0].creatorSessionId, 'child')
  assert.equal(rows[0].businessState, 'open')
  assert.equal(rows[0].businessSource, 'authored')
  assert.equal(rows[0].source, 'program')
  assert.notEqual(rows[0].checkState, 'verified')
  assert.equal(rows[0].lane, null)
  assert.equal(rows[0].creatorActivity, 'gone', 'the observed tree remains open for disposition after its creator is gone')
  assert.equal(rows[0].detail.action, 'detail')
})

test('assigned model recovery preserves all-ticket and creator scope without opening coordinator history or registries', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  await apply(f, 'put-workflow', { value: workflow })
  for (const localTicketId of ['T1', 'T2']) await apply(f, 'put-ticket', { localTicketId, value: ticket() })
  const assign = await f.execute('mattpocock_assign', { request: { sessionId: 'child', workflowId: 'flow', ticketIds: ['T1'] } })
  assert.equal(assign.error, undefined)
  const matter = (question, ticketIds) => ({ question, status: 'pending', pending: true, awaitingImplementation: true, ...(ticketIds ? { ticketIds } : {}) })
  await apply(f, 'put-decision', { decisionId: 'assigned', value: matter('Assigned visible matter', ['T1']) })
  await apply(f, 'put-decision', { decisionId: 'mixed', value: matter('coordinator-private-mixed-marker', ['T1', 'T2']) })
  await apply(f, 'put-decision', { decisionId: 'owner-ticketless', value: matter('coordinator-private-ticketless-marker') })
  await apply(f, 'put-decision', { decisionId: 'own-ticketless', value: matter('Creator visible matter') }, f.child)
  const current = await modelRead(f, undefined, f.child)
  assert.equal(current.scope.kind, 'assigned')
  assert.equal(current.scope.workflowId, 'flow')
  assert.equal(current.scope.ticketCount, 1)
  assert.equal(current.records.summary.totalTickets, 1)
  assert.equal(current.records.summary.pendingDecisionCount, 2)
  assert.equal(current.records.summary.awaitingImplementationCount, 2)
  const visible = await pages(f, 'decision', {}, f.child)
  assert.deepEqual(visible.map(row => row.decisionId).sort(), ['assigned', 'own-ticketless'])
  assert(!JSON.stringify(visible).includes('coordinator-private'))
  assert.deepEqual((await pages(f, 'ticket', {}, f.child)).map(row => row.localTicketId), ['T1'])
  for (const kind of ['resource', 'worktree-binding', 'worktree-observation', 'native-execution']) {
    const restricted = current.collections[kind]
    assert.equal(restricted.coverage, 'restricted')
    assert.equal(restricted.total, null, 'unavailable registry size is not a zero claim')
    assert.equal(restricted.query, null, 'overview cannot offer a coordinator registry locator')
    const query = await modelRead(f, { kind, limit: 1 }, f.child)
    assert.equal(query.coverage, 'restricted')
    assert.deepEqual(query.rows, [])
  }
  const history = await f.execute('mattpocock_history', { request: { action: 'query', query: { kind: 'decision', limit: 20 } } }, f.child)
  assert(history.error || history.isError)
  assert.match(JSON.stringify(history.error ?? history.value), /coordinator|access-denied/)
  assert(Buffer.byteLength(JSON.stringify(history.error ?? history.value)) <= 8192)
  const revoked = await f.execute('mattpocock_assign', { request: { sessionId: 'child', workflowId: null } })
  assert.equal(revoked.error, undefined)
  const empty = await modelRead(f, undefined, f.child)
  assert.equal(empty.scope.kind, 'assigned')
  assert.equal(empty.scope.workflowId, null)
  assert.equal(empty.scope.ticketCount, 0)
  assert.equal(empty.records.summary.pendingDecisionCount, 0)
  assert.deepEqual(await pages(f, 'decision', {}, f.child), [])
})
