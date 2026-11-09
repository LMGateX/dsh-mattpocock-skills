import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, mountedFixture, caller, operator, actualAgent, signal, policy, workflow, ticket } from './fixtures/runtime-host.mjs'

const { createModelTools, sourceKey } = await import('../src/model-tools.ts')

async function ready(t) {
  const f = await fixture(t, { initialPolicy: policy(), known: true })
  await f.apply('put-workflow', { value: workflow })
  return f
}
async function child(f, id, parent) {
  await f.created(actualAgent(id, { parent, managed: true }))
}

test('effective grants intersect the actual parent chain and restore raw grants only when the parent restores scope', async t => {
  const f = await ready(t)
  for (const id of ['A', 'B']) await f.apply('put-ticket', { localTicketId: id, value: ticket() })
  await f.assign('old-child', 'flow', ['A', 'B'])
  await child(f, 'grandchild', 'old-child')
  await f.assign('grandchild', 'flow', ['A', 'B'], 'old-child')
  assert.deepEqual((await f.read('grandchild')).assignment, { workflowId: 'flow', ticketIds: ['A', 'B'] })
  await f.assign('old-child', 'flow', ['A'])
  const narrowed = await f.read('grandchild')
  assert.deepEqual(narrowed.assignment, { workflowId: 'flow', ticketIds: ['A'] })
  assert.deepEqual(narrowed.records.tickets.map(row => row.localTicketId), ['A'])
  assert.deepEqual(narrowed.records.scope, { kind: 'assigned', workflowId: 'flow', ticketIds: ['A'] })
  const source = await f.runtime.readModelSource(caller('grandchild'), 'grandchild', { domain: 'assignment', key: sourceKey('assignment', 'grandchild') }, signal())
  assert.deepEqual(source.source.value.ticketIds, ['A'])
  assert.deepEqual((await f.read('grandchild', operator)).assignment.ticketIds, ['A'])
  await child(f, 'great-grandchild', 'grandchild')
  await assert.rejects(f.assign('great-grandchild', 'flow', ['B'], 'grandchild'), { code: 'access-denied' })
  await f.assign('old-child', 'flow', ['A', 'B'])
  assert.deepEqual((await f.read('grandchild')).assignment.ticketIds, ['A', 'B'])
})

test('unreadable local handles fail closed for admission but never trap an authorized release', async t => {
  const f = await ready(t)
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket() })
  await f.window('reserve', 'A')
  const generation = (await f.read()).windows.tickets[0].generation
  const read = f.instrumentStorage.read.bind(f.instrumentStorage)
  f.instrumentStorage.read = async () => { throw new Error('local storage unavailable') }
  await assert.rejects(f.window('reserve', 'A'), { code: 'storage-uncertain' })
  await assert.rejects(f.window('reacquire', 'A', { generation }), { code: 'storage-uncertain' })
  await assert.rejects(f.assign('old-child', 'flow', ['A']), { code: 'storage-uncertain' })
  const released = await f.window('release', 'A', { generation })
  assert.equal(released.snapshot.T.used, 0)
  await f.assign('old-child', null, [])
  f.instrumentStorage.read = read
  const messages = await f.runtime.preStep(caller('root'), signal(), [], '1:1')
  assert.doesNotMatch(JSON.stringify(messages), /durability-commit-failed/, 'a refused local read started no durable mutation')
  assert.match(JSON.stringify(messages), /Current runtime facts/)
})

test('assigned readSession metadata does not disclose sibling policy grants or native outcome bodies', async t => {
  const f = await ready(t)
  await f.assign('old-child', null, [])
  await child(f, 'sibling', 'root')
  await f.assign('sibling', null, [])
  await f.grants.compareAndSwap(0, { schemaVersion: 1, revision: 1, grants: [{ sessionId: 'sibling', enabled: true }] })
  f.stop({ itemId: 'stop:sibling', sessionId: 'sibling', turn: 1, outcome: 'error', cancelCause: null, diagnostic: 'private sibling body', evidence: null, observed: 'private sibling body' })
  const view = await f.read('old-child')
  assert.deepEqual(view.policyGrants.grants, [])
  assert.deepEqual(view.nativeStops, [])
  assert.doesNotMatch(JSON.stringify(view), /private sibling body/)
})

test('runtime preparation never re-injects cached private content when current lineage cannot be proved', async t => {
  const f = await ready(t)
  await f.apply('put-ticket', { localTicketId: 'A', value: { title: 'PRIVATE-task-content', statuses: { delivery: ['partial'] } } })
  await f.assign('old-child', 'flow', ['A'])
  const first = await f.runtime.preStep(caller('old-child'), signal(), [], '1:1')
  assert.match(JSON.stringify(first), /PRIVATE-task-content/)
  f.ports.authority.resolveSession = async () => { throw new Error('current lineage unavailable') }
  const failed = await f.runtime.preStep(caller('old-child'), signal(), [], '2:1')
  assert.doesNotMatch(JSON.stringify(failed), /PRIVATE-task-content/)
  assert.match(JSON.stringify(failed), /unavailable/)
})

const reference = (label = 'Source task') => ({ source: { kind: 'external', instance: 'tracker', project: 'project', taskId: '42' }, locator: 'https://tracker.invalid/project/42', label })
test('a real reference flows through T assignment decision current query and history without a business ticket', async t => {
  const f = await fixture(t, { initialPolicy: policy(), known: true })
  await f.apply('put-workflow', { value: { title: 'Cooperation', axes: [] } })
  await f.apply('put-task-reference', { localTicketId: 'R', value: reference() })
  const reserved = await f.window('reserve', 'R')
  await f.assign('old-child', 'flow', ['R'])
  await f.apply('put-decision', { decisionId: 'question', value: { question: 'Approve?', status: 'open', pending: true, addressee: { kind: 'user' }, ticketIds: ['R'] } }, 'old-child')
  const childView = await f.read('old-child')
  assert.deepEqual(childView.records.tickets, [])
  assert.equal(childView.records.taskReferences[0].localTicketId, 'R')
  assert.equal(childView.records.summary.totalTickets, 0)
  assert.equal(childView.records.summary.totalTaskReferences, 1)
  assert.deepEqual(childView.records.capabilities, { taskReferences: true, storageVersions: [1, 2, 3, 4], decisionRecommendationAdoption: true })
  assert.equal(reserved.snapshot.T.used, 1)
  assert.equal(childView.records.decisions[0].value.ticketIds[0], 'R')
  const model = createModelTools(f.runtime)
  const page = await model.current(caller('old-child'), { kind: 'task-reference' }, signal())
  assert.equal(page.total, 1)
  assert.equal(page.rows[0].localTicketId, 'R')
  assert.equal(page.localCoverage, 'local-current')
  assert.equal(page.sourceObservation, 'authored-unverified')
  const history = await f.runtime.historyAction(caller('root'), 'root', { action: 'query', query: { kind: 'task-reference' } }, signal())
  assert.equal(history.rows.length, 1)
  assert.equal(history.rows[0].recordId, '["flow","R"]')
  await f.save({ extensionEnabled: false, defaults: {}, workspaceOverrides: {} })
  await f.window('release', 'R', { generation: reserved.generation }, 'old-child')
  assert.equal((await f.read()).windows.T.used, 0)
})

function dto(result) {
  assert.notEqual(result.isError, true, result.error?.message)
  assert.deepEqual(result.value, JSON.parse(result.content.find(row => row.type === 'text').text))
  assert.equal(result.value.schemaVersion, 2)
  assert.ok(Buffer.byteLength(JSON.stringify(result.value)) <= (result.value.kind === 'receipt' ? 8192 : 65536))
  return result.value
}
test('mounted reference receipts query the reference kind and locators/cursors fence a narrowed effective grant', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  let revision = 0
  const apply = async command => dto(await f.execute('mattpocock_record', { request: { action: 'apply', command: { operationId: 'reference-' + revision, expectedRevision: revision++, workflowId: 'flow', ...command } } }))
  await apply({ action: 'put-workflow', value: { title: 'References', axes: [] } })
  for (const localTicketId of ['A', 'B']) {
    const result = await apply({ action: 'put-task-reference', localTicketId, value: { ...reference(), source: { ...reference().source, taskId: localTicketId } } })
    assert.equal(result.read.query.kind, 'task-reference')
    assert.equal(result.read.query.recordId, JSON.stringify(['flow', localTicketId]))
    assert.equal(result.snapshot, undefined)
  }
  dto(await f.execute('mattpocock_assign', { request: { sessionId: 'child', workflowId: 'flow', ticketIds: ['A', 'B'] } }))
  const current = dto(await f.execute('mattpocock_record', { request: { action: 'read' } }, f.child))
  assert.deepEqual(current.records.capabilities, { taskReferences: true, storageVersions: [1, 2, 3, 4], decisionRecommendationAdoption: true })
  assert.equal(current.collections.ticket.total, 0)
  assert.equal(current.collections['task-reference'].total, 2)
  const first = dto(await f.execute('mattpocock_record', { request: { action: 'read', query: { kind: 'task-reference', limit: 1 } } }, f.child))
  const locator = first.rows[0].detail.locator
  const part = dto(await f.execute('mattpocock_record', { request: { action: 'detail', locator } }, f.child))
  assert.equal(JSON.parse(part.data).value.source.kind, 'external')
  assert.equal(part.done, true)
  dto(await f.execute('mattpocock_assign', { request: { sessionId: 'child', workflowId: 'flow', ticketIds: ['A'] } }))
  const staleDetail = await f.execute('mattpocock_record', { request: { action: 'detail', locator } }, f.child)
  const stalePage = await f.execute('mattpocock_record', { request: { action: 'read', query: { kind: 'task-reference', limit: 1, cursor: first.nextCursor } } }, f.child)
  assert.equal(staleDetail.isError, true)
  assert.equal(stalePage.isError, true)
  const snapshot = await f.runtime.readSession(caller('child'), 'child', signal())
  assert.doesNotMatch(JSON.stringify(snapshot.records), /"localTicketId":"B"/)
})

test('runtime scope partition prevents hot prepared or failing-source replay after an ancestor narrows', async t => {
  const f = await ready(t)
  for (const id of ['A', 'B']) await f.apply('put-ticket', { localTicketId: id, value: { title: id === 'B' ? 'PRIVATE-revoked-B' : 'Allowed-A', statuses: { delivery: ['partial'] } } })
  await f.assign('old-child', 'flow', ['A', 'B'])
  await child(f, 'grandchild', 'old-child')
  await f.assign('grandchild', 'flow', ['A', 'B'], 'old-child')
  const first = await f.runtime.preStep(caller('grandchild'), signal(), [], '1:1')
  assert.match(JSON.stringify(first), /PRIVATE-revoked-B/)
  // Simulate another runtime's CAS: no local touchState invalidation can hide a bad key.
  const storage = f.units.get('runtime_bindings'), old = await storage.read()
  await storage.compareAndSwap(old.revision, { ...old, revision: old.revision + 1, assignments: old.assignments.map(row => row.sessionId === 'old-child' ? { ...row, ticketIds: ['A'] } : row) })
  f.ports.readPolicyGrants = async () => { throw new Error('source read failed after scope verification') }
  const failed = await f.runtime.preStep(caller('grandchild'), signal(), [], '2:1')
  assert.doesNotMatch(JSON.stringify(failed), /PRIVATE-revoked-B/)
  assert.match(JSON.stringify(failed), /unavailable|unknown/)
})

test('reference source cleanup suppresses old captures across compact and reopen without deleting the current reference', async t => {
  const f = await ready(t)
  await f.apply('put-task-reference', { localTicketId: 'R', value: { ...reference(), locator: 'PRIVATE-old-reference-marker' } })
  await f.apply('put-task-reference', { localTicketId: 'R', value: { ...reference(), locator: 'current-reference-pointer' } })
  const before = await f.read(), expectedRevision = before.records.revision
  const input = { action: 'purge-source', domain: 'records', request: { operationId: 'cleanup-reference', expectedRevision, throughRevision: expectedRevision, targets: [{ kind: 'task-reference', workflowId: 'flow', localTicketId: 'R' }] } }
  const result = await f.runtime.historyAction(caller('root'), 'root', input, signal())
  assert.equal(result.sourceRecordsDeleted, true)
  assert.equal(result.nativeConversationDeleted, false)
  assert.equal((await f.read()).records.taskReferences[0].value.locator, 'current-reference-pointer')
  const compact = await f.runtime.historyAction(caller('root'), 'root', { action: 'compact-source', domain: 'records', request: { operationId: 'compact-reference', expectedRevision: (await f.read()).records.revision } }, signal())
  assert.equal(compact.nativeConversationDeleted, false)
  await f.reopen()
  const after = await f.read()
  assert.equal(after.records.taskReferences[0].history.length, 1)
  assert.equal(after.records.taskReferences[0].value.locator, 'current-reference-pointer')
  const page = await f.runtime.historyAction(caller('root'), 'root', { action: 'query', query: { kind: 'task-reference' } }, signal())
  const detail = await f.runtime.historyAction(caller('root'), 'root', { action: 'detail', historyIds: page.rows.map(row => row.historyId) }, signal())
  assert.doesNotMatch(JSON.stringify(detail), /PRIVATE-old-reference-marker/)
  assert.match(JSON.stringify(detail), /current-reference-pointer/)
  assert.equal((await f.runtime.historyAction(caller('root'), 'root', input, signal())).replayed, true)
})

test('held T and pending decisions retain reference and workflow identities despite context exclusion', async t => {
  const f = await fixture(t, { initialPolicy: policy(), known: true })
  await f.apply('put-workflow', { value: { title: 'Required-group', axes: [] } })
  for (const id of ['Held', 'Question', 'Excluded']) await f.apply('put-task-reference', { localTicketId: id, value: { source: { kind: 'unverified' }, locator: 'task-document#' + id, label: id + '-identity' } })
  await f.window('reserve', 'Held')
  await f.apply('put-decision', { decisionId: 'D', value: { question: 'Real user question', status: 'open', pending: true, ticketIds: ['Question'], addressee: { kind: 'user' } } })
  for (const recordId of ['Held', 'Question', 'Excluded']) await f.runtime.historyAction(caller('root'), 'root', { action: 'set-context', kind: 'task-reference', recordId: JSON.stringify(['flow', recordId]), included: false }, signal())
  await f.runtime.historyAction(caller('root'), 'root', { action: 'set-context', kind: 'workflow', recordId: 'flow', included: false }, signal())
  const message = await f.runtime.preStep(caller('root'), signal(), [], '1:1')
  const text = message[0].content.find(row => row.type === 'text').text
  const facts = JSON.parse(text.slice(text.indexOf('{\"sessionId\"')))
  assert.deepEqual(facts.records.taskReferences.rows.map(row => row.localTicketId).sort(), ['Held', 'Question'])
  assert.equal(facts.records.taskReferences.total, 2)
  assert.equal(facts.records.workflows.rows[0].workflowId, 'flow')
  assert.equal(facts.records.decisions.rows[0].decisionId, 'D')
  assert.equal(facts.windows.T.used, 1)
  assert.doesNotMatch(JSON.stringify(facts.records.taskReferences), /Excluded-identity/)
})

test('assignment CAS retry rechecks the effective ancestor scope of the exact old runtime document', async t => {
  const f = await ready(t)
  for (const id of ['A', 'B']) await f.apply('put-ticket', { localTicketId: id, value: ticket() })
  await f.assign('old-child', 'flow', ['A', 'B'])
  await child(f, 'grandchild', 'old-child')
  await f.assign('grandchild', 'flow', ['A', 'B'], 'old-child')
  await child(f, 'target', 'grandchild')
  const storage = f.units.get('runtime_bindings'), cas = storage.compareAndSwap.bind(storage)
  let raced = false
  storage.compareAndSwap = async (revision, next) => {
    if (!raced && next.assignments.some(row => row.sessionId === 'target')) {
      raced = true
      const old = await storage.read()
      assert.equal(await cas(old.revision, { ...old, revision: old.revision + 1, assignments: old.assignments.map(row => row.sessionId === 'old-child' ? { ...row, ticketIds: ['A'] } : row) }), true)
      return false
    }
    return cas(revision, next)
  }
  await assert.rejects(f.assign('target', 'flow', ['B'], 'grandchild'), { code: 'access-denied' })
  assert.equal(raced, true)
  assert.deepEqual((await f.read('target')).records.scope, { kind: 'assigned', workflowId: null, ticketIds: [] })
})

test('opt-in delegate supports real reference handles and fails before native creation on unknown local reads', async t => {
  const f = await ready(t)
  await f.apply('put-task-reference', { localTicketId: 'R', value: reference() })
  let calls = 0
  f.ports.flushSession = async () => true
  f.ports.createContinuable = async (exec, request) => {
    calls++
    await f.created(actualAgent(request.childId, { parent: exec.agent.id, managed: true }))
    return { childId: request.childId, messageId: 'accepted-' + calls }
  }
  const input = { description: 'Reference lane', prompt: 'Use existing source task', operationId: 'reference-delegate', workflowId: 'flow', ticketIds: ['R'] }
  const result = await f.runtime.delegate(caller('root'), input, f.exec())
  assert.equal(result.accepted, true)
  assert.equal(result.assignment, 'granted')
  assert.deepEqual((await f.read(result.childId)).assignment.ticketIds, ['R'])
  assert.deepEqual((await f.read()).records.tickets, [])
  const replay = await f.runtime.delegate(caller('root'), input, f.exec())
  assert.equal(replay.replayed, true)
  assert.equal(calls, 1)
  f.instrumentStorage.read = async () => { throw new Error('local task handles unreadable') }
  await assert.rejects(f.runtime.delegate(caller('root'), { ...input, operationId: 'blocked-delegate' }, f.exec()), { code: 'storage-uncertain' })
  assert.equal(calls, 1)
})

test('delegate revalidates referenced admission after preparation rather than relying on its first successful local read', async t => {
  const f = await ready(t)
  await f.apply('put-task-reference', { localTicketId: 'R', value: reference() })
  let created = 0
  f.ports.capabilities = { ...f.ports.capabilities, nativeInitialChildCwd: 'supported' }
  f.ports.authorizeInitialChildCwd = async () => { f.instrumentStorage.read = async () => { throw new Error('local read lost during preparation') } }
  f.ports.createContinuable = async () => { created++; throw new Error('must not create') }
  await assert.rejects(f.runtime.delegate(caller('root'), { description: 'Prepared lane', prompt: 'Use reference', worktree: '/fixture/prepared', workflowId: 'flow', ticketIds: ['R'] }, f.exec()), { code: 'storage-uncertain' })
  assert.equal(created, 0)
})

test('one admitted step installs at most one view across scope changes and identity failures in source and mounted runtimes', async t => {
  for (const mounted of [false, true]) await t.test(mounted ? 'mounted' : 'source', async t => {
    const f = mounted ? await mountedFixture(t) : await fixture(t, { initialPolicy: policy(), known: true })
    if (mounted) await f.runtime.savePolicy(operator, policy(), 0, signal())
    const childId = mounted ? 'child' : 'old-child', who = caller(childId)
    let revision = 0
    const apply = command => f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'same-step-' + revision, expectedRevision: revision++, workflowId: 'flow', ...command }, signal())
    await apply({ action: 'put-workflow', value: { title: 'Step group', axes: [] } })
    for (const id of ['A', 'B']) await apply({ action: 'put-task-reference', localTicketId: id, value: { source: { kind: 'unverified' }, locator: 'task#' + id, label: id === 'B' ? 'PRIVATE-old-scope-B' : 'Allowed-A' } })
    const assign = ticketIds => f.runtime.assign(caller('root'), { sessionId: childId, workflowId: 'flow', ticketIds }, signal())
    await assign(['A', 'B'])
    const first = await f.runtime.preStep(who, signal(), [], '1:1')
    assert.equal(first.length, 1)
    const original = JSON.stringify(first[0])
    await assign(['A'])
    assert.equal((await f.runtime.preStep(who, signal(), first, '1:1')).length, 0, 'scope partition must not create a second per-step installation slot')
    const narrowed = await f.runtime.preStep(who, signal(), first, '2:1')
    assert.equal(narrowed.length, 1)
    assert.doesNotMatch(JSON.stringify(narrowed), /PRIVATE-old-scope-B/)
    assert.equal(JSON.stringify(first[0]), original, 'already admitted native history is never rewritten')
    const ports = mounted ? f.mounted.ports : f.ports, resolve = ports.authority.resolveSession
    ports.authority.resolveSession = async () => { throw new Error('identity unavailable') }
    assert.equal((await f.runtime.preStep(who, signal(), narrowed, '2:1')).length, 0, 'an unavailable diagnostic shares the same per-step installation slot')
    const failed = await f.runtime.preStep(who, signal(), narrowed, '3:1')
    assert.equal(failed.length, 1)
    assert.match(JSON.stringify(failed), /Instrument context unavailable/)
    assert.doesNotMatch(JSON.stringify(failed), /PRIVATE-old-scope-B|Allowed-A/)
    ports.authority.resolveSession = resolve
    assert.equal((await f.runtime.preStep(who, signal(), failed, '3:1')).length, 0, 'recovery also waits for the next admitted step')
    const recovered = await f.runtime.preStep(who, signal(), failed, '4:1')
    assert.equal(recovered.length, 1)
    assert.doesNotMatch(JSON.stringify(recovered), /PRIVATE-old-scope-B/)
  })
})

test('external ancestor widening during snapshot reads cannot cache a broad body under an earlier narrow scope', async t => {
  for (const mounted of [false, true]) for (const widenAt of [1, 3]) await t.test((mounted ? 'mounted' : 'source') + ': widen at read ' + widenAt, async t => {
    const f = mounted ? await mountedFixture(t) : await fixture(t, { initialPolicy: policy(), known: true })
    if (mounted) await f.runtime.savePolicy(operator, policy(), 0, signal())
    const parentId = mounted ? 'child' : 'old-child', grandchildId = 'scope-race-grandchild'
    let revision = 0
    const apply = command => f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'scope-race-' + revision, expectedRevision: revision++, workflowId: 'flow', ...command }, signal())
    await apply({ action: 'put-workflow', value: workflow })
    for (const id of ['A', 'B']) await apply({ action: 'put-ticket', localTicketId: id, value: { ...ticket(), title: id === 'B' ? 'PRIVATE-raced-B' : 'Allowed-A' } })
    const assign = (parent, target, ticketIds) => f.runtime.assign(caller(parent), { sessionId: target, workflowId: 'flow', ticketIds }, signal())
    await assign('root', parentId, ['A', 'B'])
    const grandchild = actualAgent(grandchildId, { parent: parentId, managed: true })
    f.agents.set(grandchild.id, grandchild)
    await f.runtime.created(caller(grandchild.id), signal(), grandchild)
    await assign(parentId, grandchild.id, ['A', 'B'])
    await assign('root', parentId, ['A'])
    const store = mounted ? f.runtimeStorage : f.units.get('runtime_bindings'), read = store.read.bind(store), cas = store.compareAndSwap.bind(store)
    const changeParent = async ticketIds => {
      const old = await read()
      assert.equal(await cas(old.revision, { ...old, revision: old.revision + 1, assignments: old.assignments.map(row => row.sessionId === parentId ? { ...row, ticketIds } : row) }), true)
    }
    let calls = 0, fired = false
    store.read = async () => {
      const old = await read()
      if (++calls === widenAt) { fired = true; await changeParent(['A', 'B']) }
      return old
    }
    const first = await f.runtime.preStep(caller(grandchild.id), signal(), [], '1:1')
    store.read = read
    assert.equal(fired, true)
    await changeParent(['A'])
    const identity = await f.runtime.readModelIdentity(caller(grandchild.id), grandchild.id, signal())
    assert.deepEqual(identity.scope.ticketIds, ['A'])
    const ports = mounted ? f.mounted.ports : f.ports
    ports.readPolicyGrants = async () => { throw new Error('source unavailable after the narrow scope was proved') }
    const second = await f.runtime.preStep(caller(grandchild.id), signal(), [], '2:1')
    assert.doesNotMatch(JSON.stringify(first), /PRIVATE-raced-B/, 'a body collected under another scope must not be published under the initial narrow proof')
    assert.doesNotMatch(JSON.stringify(second), /PRIVATE-raced-B/, 'a mixed authorization cut must never become a fresh or stale narrow-key cache entry')
  })
})

test('external ancestor narrowing during a refresh never republishes an earlier verified broader body as stale', async t => {
  for (const mounted of [false, true]) for (const narrowAt of [1, 3]) await t.test((mounted ? 'mounted' : 'source') + ': narrow at read ' + narrowAt, async t => {
    const f = mounted ? await mountedFixture(t) : await fixture(t, { initialPolicy: policy(), known: true })
    if (mounted) await f.runtime.savePolicy(operator, policy(), 0, signal())
    const parentId = mounted ? 'child' : 'old-child', grandchildId = 'scope-narrow-grandchild'
    let revision = 0
    const apply = command => f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'scope-narrow-' + revision, expectedRevision: revision++, workflowId: 'flow', ...command }, signal())
    await apply({ action: 'put-workflow', value: workflow })
    for (const id of ['A', 'B']) await apply({ action: 'put-ticket', localTicketId: id, value: { ...ticket(), title: id === 'B' ? 'PRIVATE-before-narrow-B' : 'Allowed-A' } })
    const assign = (parent, target, ticketIds) => f.runtime.assign(caller(parent), { sessionId: target, workflowId: 'flow', ticketIds }, signal())
    await assign('root', parentId, ['A', 'B'])
    const grandchild = actualAgent(grandchildId, { parent: parentId, managed: true })
    f.agents.set(grandchild.id, grandchild)
    await f.runtime.created(caller(grandchild.id), signal(), grandchild)
    await assign(parentId, grandchild.id, ['A', 'B'])
    const first = await f.runtime.preStep(caller(grandchild.id), signal(), [], '1:1')
    assert.match(JSON.stringify(first), /PRIVATE-before-narrow-B/)
    // An actual authored update invalidates the refresh gate without changing any grant.
    await apply({ action: 'put-ticket', localTicketId: 'A', value: { ...ticket(), title: 'Allowed-A-current' } })
    const store = mounted ? f.runtimeStorage : f.units.get('runtime_bindings'), read = store.read.bind(store), cas = store.compareAndSwap.bind(store)
    let calls = 0, fired = false
    store.read = async () => {
      const old = await read()
      if (++calls === narrowAt) {
        fired = true
        assert.equal(await cas(old.revision, { ...old, revision: old.revision + 1, assignments: old.assignments.map(row => row.sessionId === parentId ? { ...row, ticketIds: ['A'] } : row) }), true)
      }
      return old
    }
    const narrowed = await f.runtime.preStep(caller(grandchild.id), signal(), first, '2:1')
    store.read = read
    assert.equal(fired, true)
    assert.doesNotMatch(JSON.stringify(narrowed), /PRIVATE-before-narrow-B/, 'a rejected refresh must not publish the old broad verified body as stale')
    const identity = await f.runtime.readModelIdentity(caller(grandchild.id), grandchild.id, signal())
    assert.deepEqual(identity.scope.ticketIds, ['A'])
    const next = await f.runtime.preStep(caller(grandchild.id), signal(), narrowed, '3:1')
    assert.doesNotMatch(JSON.stringify(next), /PRIVATE-before-narrow-B/)
  })
})

test('model current and record source never return a wider body with an earlier narrower identity', async t => {
  for (const mounted of [false, true]) for (const mode of ['current', 'source']) await t.test((mounted ? 'mounted' : 'source') + ': ' + mode, async t => {
    const f = mounted ? await mountedFixture(t) : await fixture(t, { initialPolicy: policy(), known: true })
    if (mounted) await f.runtime.savePolicy(operator, policy(), 0, signal())
    const parentId = mounted ? 'child' : 'old-child', grandchildId = 'model-race-grandchild'
    let revision = 0
    const apply = command => f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'model-race-' + revision, expectedRevision: revision++, workflowId: 'flow', ...command }, signal())
    await apply({ action: 'put-workflow', value: workflow })
    for (const id of ['A', 'B']) await apply({ action: 'put-ticket', localTicketId: id, value: { ...ticket(), title: id === 'B' ? 'PRIVATE-model-B' : 'Allowed-A' } })
    await f.runtime.assign(caller('root'), { sessionId: parentId, workflowId: 'flow', ticketIds: ['A', 'B'] }, signal())
    const grandchild = actualAgent(grandchildId, { parent: parentId, managed: true })
    f.agents.set(grandchild.id, grandchild)
    await f.runtime.created(caller(grandchild.id), signal(), grandchild)
    await f.runtime.assign(caller(parentId), { sessionId: grandchild.id, workflowId: 'flow', ticketIds: ['A', 'B'] }, signal())
    await f.runtime.assign(caller('root'), { sessionId: parentId, workflowId: 'flow', ticketIds: ['A'] }, signal())
    const store = mounted ? f.runtimeStorage : f.units.get('runtime_bindings'), read = store.read.bind(store), cas = store.compareAndSwap.bind(store)
    let fired = false
    store.read = async () => {
      const old = await read()
      if (!fired) {
        fired = true
        assert.equal(await cas(old.revision, { ...old, revision: old.revision + 1, assignments: old.assignments.map(row => row.sessionId === parentId ? { ...row, ticketIds: ['A', 'B'] } : row) }), true)
      }
      return old
    }
    const reading = mode === 'current' ? f.runtime.readModelCurrent(caller(grandchild.id), grandchild.id, signal()) : f.runtime.readModelSource(caller(grandchild.id), grandchild.id, { domain: 'records', key: sourceKey('records', 'ticket', 'flow', 'B') }, signal())
    await assert.rejects(reading, { code: 'revision-conflict' })
    store.read = read
    assert.equal(fired, true)
  })
})
