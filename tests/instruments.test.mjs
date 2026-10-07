import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ControlsError, SessionInstruments, parseInstrumentDocument, parseInstrumentCommand } from '../lib/controls/index.js'
import { instrumentFixture, definition, denied } from './fixtures/instrument-fixture.mjs'
const code = value => error => error instanceof ControlsError && error.code === value
const ticket = (statuses = { delivery: ['partial'] }) => ({ title: '任意票', externalRef: 'shared-external-ref', statuses, summary: '任务原样说明' })
const decision = (more = {}) => ({ question: '模型认为有需要裁决的事项', status: '自由业务名称', pending: true, addressee: { kind: 'user', principalId: 'user' }, ...more })
async function ready() { const f = await instrumentFixture(); await f.apply('put-workflow', { value: definition }); return f }

test('read of a registered instance is side-effect-free and task dictionaries have no built-in stages', async () => {
  const f = await instrumentFixture()
  const snapshot = await f.read()
  assert.equal(snapshot.revision, 0)
  assert.deepEqual(snapshot.workflows, [])
  assert.equal(await f.storage.read(snapshot.instance.instrumentInstanceId), undefined)
  assert.equal(snapshot.summary.pendingDecisionCount, 0)
  assert.equal('windows' in snapshot, false)
})

test('arbitrary partial status and multi-axis overlapping counts survive without buckets or percentages', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket({ delivery: ['partial'], qualities: ['review', 'experiment'] }) })
  const snapshot = await f.read()
  assert.equal(snapshot.tickets[0].value.summary, '任务原样说明')
  assert.equal(snapshot.summary.totalTickets, 1)
  assert.equal(snapshot.summary.statusCounts[0].statuses[0].label, '部分完成')
  assert.equal(snapshot.summary.statusCounts[0].statuses[0].count, 1)
  assert.equal(snapshot.summary.statusCounts[1].counting, 'overlapping')
  assert.equal(snapshot.summary.statusCounts[1].statuses.reduce((sum, row) => sum + row.count, 0), 2)
  assert.equal('percentage' in snapshot.tickets[0].value, false)
  assert.equal('completed' in snapshot.summary, false)
})

test('opaque prototype-named axes count missing/report values using own properties only', async () => {
  const f = await instrumentFixture()
  const keys = ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'length', 'name', 'valueOf']
  const value = { title: '不透明键', axes: keys.map(axisKey => ({ axisKey, label: axisKey, counting: 'exclusive', statuses: [{ statusKey: '__proto__', label: '任务状态' }] })) }
  await f.apply('put-workflow', { value })
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket({}) })
  let snapshot = await f.read()
  assert(snapshot.summary.statusCounts.every(axis => axis.unreported === 1 && axis.statuses[0].count === 0))
  await f.apply('put-ticket', { localTicketId: 'T2', value: ticket(Object.fromEntries(keys.map(key => [key, ['__proto__']]))) })
  snapshot = await f.read()
  assert(snapshot.summary.statusCounts.every(axis => axis.unreported === 1 && axis.statuses[0].count === 1))
  assert.equal(snapshot.summary.totalTickets, 2)
})

test('workflow dictionaries retain ordered keys, renaming/meaning history and source authors', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket() })
  const changed = structuredClone(definition)
  changed.axes[0].statuses[0].label = '阶段自定的新名字'
  changed.axes[0].statuses[0].meaning = '模型更新其说明'
  await f.apply('put-workflow', { value: changed, references: ['document:task-rules'] })
  const workflow = (await f.read()).workflows[0]
  assert.equal(workflow.history[0].value.axes[0].statuses[0].label, '部分完成')
  assert.equal(workflow.value.axes[0].statuses[0].statusKey, 'partial')
  assert.equal(workflow.value.axes[0].statuses[0].label, '阶段自定的新名字')
  assert.deepEqual(workflow.history[1].references, ['document:task-rules'])
  assert.equal(workflow.history[1].author.kind, 'agent')
  assert.equal(workflow.history[1].author.sessionId, 'A')
})

test('used status/axis deletion and incompatible cardinality reject structurally, not semantically', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket({ qualities: ['review', 'experiment'] }) })
  const changed = structuredClone(definition)
  changed.axes[1].counting = 'exclusive'
  await assert.rejects(f.apply('put-workflow', { value: changed }), code('invalid-input'))
  changed.axes[1].counting = 'overlapping'
  changed.axes[1].statuses.pop()
  await assert.rejects(f.apply('put-workflow', { value: changed }), code('invalid-input'))
  changed.axes.pop()
  await assert.rejects(f.apply('put-workflow', { value: changed }), code('invalid-input'))
  await assert.rejects(f.apply('put-ticket', { localTicketId: 'T2', value: ticket({ delivery: ['partial', 'repair'] }) }), code('invalid-input'))
  await assert.rejects(f.apply('put-ticket', { localTicketId: 'T2', value: ticket({ delivery: ['undefined-key'] }) }), code('invalid-input'))
  assert.equal((await f.read()).revision, 2)
})

test('status and blocker-like labels do not create decisions, certify delivery or modify configuration', async () => {
  const f = await ready()
  const config = await f.controls.readPolicy('admin')
  await f.apply('put-ticket', { localTicketId: 'T1', value: { ...ticket(), summary: '测试失败；blocked；awaiting approval', disposition: '模型自行认为已交付' } })
  const snapshot = await f.read()
  assert.equal(snapshot.decisions.length, 0)
  assert.equal(snapshot.summary.pendingDecisionCount, 0)
  assert.equal(snapshot.tickets[0].value.disposition, '模型自行认为已交付')
  assert.deepEqual(await f.controls.readPolicy('admin'), config)
  assert(!snapshot.changes.some(event => 'execution' in event.command || 'lease' in event.command))
})

test('same workspace and external/local ticket identifiers never mix independent owner state', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket() })
  await f.apply('put-decision', { decisionId: 'D', value: decision({ ticketIds: ['T1'] }) })
  await f.apply('put-workflow', { value: definition }, 'B', 'B')
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket({ delivery: ['repair'] }) }, 'B', 'B')
  const a = await f.read(), b = await f.read('B', 'B')
  assert.notEqual(a.instance.instrumentInstanceId, b.instance.instrumentInstanceId)
  assert.equal(a.tickets[0].value.statuses.delivery[0], 'partial')
  assert.equal(b.tickets[0].value.statuses.delivery[0], 'repair')
  assert.equal(a.decisions.length, 1)
  assert.equal(b.decisions.length, 0)
})

test('managed child shares owner ledger but may update only assigned tickets and not whole dictionaries', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket() })
  await f.apply('put-ticket', { localTicketId: 'T2', value: ticket() })
  const child = await f.read('child', 'child')
  assert.deepEqual(child.instance, (await f.read()).instance)
  assert.equal(child.summary.countingScope, 'assignment')
  assert.equal(child.summary.totalTickets, 1)
  assert.equal(child.tickets[0].localTicketId, 'T1')
  assert(!child.changes.some(event => event.command.localTicketId === 'T2'))
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket({ delivery: ['repair'] }) }, 'child', 'child')
  await assert.rejects(f.apply('put-ticket', { localTicketId: 'T2', value: ticket() }, 'child', 'child'), code('access-denied'))
  await assert.rejects(f.apply('put-workflow', { value: definition }, 'child', 'child'), code('access-denied'))
})

test('decision scope checks every old and new ticket; relationships cannot launder child authority', async () => {
  const f = await ready()
  for (const localTicketId of ['T1', 'T2']) await f.apply('put-ticket', { localTicketId, value: ticket() })
  await f.apply('put-decision', { decisionId: 'mixed', value: decision({ ticketIds: ['T1', 'T2'] }) })
  await assert.rejects(f.apply('put-decision', { decisionId: 'mixed', value: decision({ ticketIds: ['T1'] }) }, 'child', 'child'), code('access-denied'))
  await assert.rejects(f.apply('put-decision', { decisionId: 'new', value: decision({ ticketIds: ['T1', 'T2'] }) }, 'child', 'child'), code('access-denied'))
  await f.apply('put-decision', { decisionId: 'own', value: decision({ ticketIds: ['T1'] }) }, 'child', 'child')
  await assert.rejects(f.apply('put-decision', { decisionId: 'own', value: decision({ ticketIds: ['T2'] }) }, 'child', 'child'), code('access-denied'))
  await assert.rejects(f.apply('set-decision-view', { decisionId: 'mixed', value: { read: true, hidden: true } }, 'child', 'child'), code('access-denied'))
  assert.deepEqual((await f.read('child', 'child')).decisions.map(row => row.decisionId), ['own'])
})

test('assigned ticketless matters remain attributable to their creator, not global workflow grants', async () => {
  const f = await ready()
  await f.apply('put-decision', { decisionId: 'global', value: decision() })
  await f.apply('put-decision', { decisionId: 'child-question', value: decision() }, 'child', 'child')
  const child = await f.read('child', 'child')
  assert.deepEqual(child.decisions.map(row => row.decisionId), ['child-question'])
  await assert.rejects(f.apply('put-decision', { decisionId: 'global', value: decision({ pending: false }) }, 'child', 'child'), code('access-denied'))
})

test('decision business status/flags are explicit; resolution, withdrawal and reopen need no approval proof', async () => {
  const f = await ready()
  await f.apply('put-decision', { decisionId: 'D', value: decision() })
  await f.apply('put-decision', { decisionId: 'D', value: decision({ status: '已自行处理', pending: false, awaitingImplementation: true, result: '模型按任务约定处理' }) })
  let snapshot = await f.read()
  assert.equal(snapshot.summary.pendingDecisionCount, 0)
  assert.equal(snapshot.summary.awaitingImplementationCount, 1)
  await f.apply('put-decision', { decisionId: 'D', value: decision({ status: '撤回', pending: false, awaitingImplementation: false }) })
  await f.apply('put-decision', { decisionId: 'D', value: decision({ status: '新事实下再次登记', pending: true }) })
  snapshot = await f.read()
  assert.equal(snapshot.decisions[0].history.length, 4)
  assert.equal(snapshot.summary.pendingDecisionCount, 1)
})

test('read/hidden are per-actual-viewer metadata with independent revisions, not business resolution', async () => {
  const f = await ready()
  await f.apply('put-decision', { decisionId: 'D', value: decision() })
  const before = await f.read()
  await f.apply('set-decision-view', { decisionId: 'D', value: { read: true, hidden: true } }, 'user', 'A')
  const user = await f.read('user', 'A'), other = await f.read('user2', 'A')
  assert.equal(user.businessRevision, before.businessRevision)
  assert.equal(user.viewerRevision, 1)
  assert.equal(user.revision, before.revision + 1)
  assert.deepEqual(user.decisions[0].view, { read: true, hidden: true })
  assert.deepEqual(other.decisions[0].view, { read: false, hidden: false })
  assert.equal(user.summary.pendingForPrincipalCount, 1)
  assert.equal(other.summary.pendingForPrincipalCount, 0)
  assert.equal(user.summary.pendingDecisionCount, 1)
  assert.equal(user.decisions[0].history.length, 1)
  assert(!other.changes.some(event => event.command.action === 'set-decision-view'))
})

test('omitted optional fields preserve pending obligations and associations until an explicit update clears them', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket() })
  await f.apply('put-decision', { decisionId: 'D', value: decision({ ticketIds: ['T1'], awaitingImplementation: true, context: '背景保留' }) })
  await f.apply('put-decision', { decisionId: 'D', value: { question: '仅改问题文字', status: '状态文字并不解决事项' } })
  const row = (await f.read('child', 'child')).decisions[0]
  assert.equal(row.value.pending, true)
  assert.equal(row.value.awaitingImplementation, true)
  assert.deepEqual(row.value.ticketIds, ['T1'])
  assert.equal(row.value.context, '背景保留')
  await f.apply('put-decision', { decisionId: 'D', value: { question: '显式更新', status: '任务自定', pending: false, awaitingImplementation: false, ticketIds: [], context: null } })
  assert.equal((await f.read()).summary.pendingDecisionCount, 0)
  assert.equal((await f.read()).summary.awaitingImplementationCount, 0)
})

test('workflow focus does not erase instance obligations or mislabel filtered totals', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket() })
  await f.apply('put-decision', { decisionId: 'old', value: decision({ awaitingImplementation: true }) })
  await f.apply('put-workflow', { workflowId: 'new-task', value: { title: '新的任务', axes: [] } })
  const focused = await f.read('A', 'A', { workflowId: 'new-task' })
  assert.equal(focused.tickets.length, 0)
  assert.equal(focused.workflows.length, 1)
  assert.equal(focused.summary.totalTickets, 1)
  assert.equal(focused.summary.countingScope, 'instance')
  assert.equal(focused.summary.pendingDecisionCount, 1)
  assert.equal(focused.decisions[0].decisionId, 'old')
})

test('agent understanding of user reply stays agent-authored; direct user input has real user provenance', async () => {
  const f = await ready()
  await f.apply('put-decision', { decisionId: 'D', value: decision(), references: ['message:context'] })
  await f.apply('put-decision', { decisionId: 'D', value: decision({ status: '模型理解为已经答复', result: '按用户自然语言继续', pending: false }), references: ['message:user-42'] })
  await f.apply('put-decision', { decisionId: 'D', value: decision({ status: '用户直接记录', pending: false, result: '用户选择' }) }, 'user', 'A')
  const history = (await f.read()).decisions[0].history
  assert.equal(history[1].author.kind, 'agent')
  assert.deepEqual(history[1].references, ['message:user-42'])
  assert.equal(history[2].author.kind, 'user')
  assert.equal(history[2].author.sessionId, null)
})

test('mapping key order is canonical for operation dedup, without sorting task-defined display arrays', async () => {
  const f = await ready()
  const command = await f.command('put-ticket', { localTicketId: 'T1', value: ticket({ delivery: ['partial'], qualities: ['review', 'experiment'] }) })
  await f.instruments.apply('A', 'A', command)
  const reordered = { ...command, value: { ...command.value, statuses: { qualities: ['review', 'experiment'], delivery: ['partial'] } } }
  assert.equal((await f.instruments.apply('A', 'A', reordered)).replayed, true)
  assert.deepEqual((await f.read()).workflows[0].value.axes.map(axis => axis.axisKey), ['delivery', 'qualities'])
  assert.deepEqual((await f.read()).tickets[0].value.statuses.qualities, ['review', 'experiment'])
})

test('sparse/non-JSON arrays reject before persistence and supported commands round-trip through JSON', async () => {
  const f = await ready()
  const ticketCommand = await f.command('put-ticket', { localTicketId: 'T1', value: ticket() })
  for (const input of [
    { ...ticketCommand, references: Array(1) },
    { ...ticketCommand, value: { ...ticket(), statuses: { delivery: Array(1) } } },
    { operationId: 'sparse-workflow', expectedRevision: 1, workflowId: 'flow', action: 'put-workflow', value: { title: 'hole', axes: Array(1) } },
  ]) await assert.rejects(f.instruments.apply('A', 'A', input), code('invalid-input'))
  for (const axes of [Array(1), [{ axisKey: 'x', label: 'x', counting: 'exclusive', statuses: Array(1) }]]) {
    await assert.rejects(f.apply('put-workflow', { value: { title: 'invalid', axes } }), code('invalid-input'))
  }
  const hidden = []
  Object.defineProperty(hidden, 'ignored', { value: 'not serialized', enumerable: false })
  assert.throws(() => parseInstrumentCommand({ ...ticketCommand, references: hidden }), code('invalid-input'))
  assert.equal((await f.read()).revision, 1)
  await f.instruments.apply('A', 'A', ticketCommand)
  const snapshot = await f.read()
  const document = await f.storage.read(snapshot.instance.instrumentInstanceId)
  assert.deepEqual(parseInstrumentDocument(JSON.parse(JSON.stringify(document))), document)
})

test('persistent operation dedup precedes stale revision, but never bypasses current authorization', async () => {
  const f = await ready()
  const command = await f.command('put-ticket', { localTicketId: 'T1', value: ticket() })
  const first = await f.instruments.apply('A', 'A', command)
  await f.apply('put-ticket', { localTicketId: 'T2', value: ticket() })
  const replay = await f.instruments.apply('A', 'A', command)
  assert.equal(replay.replayed, true)
  assert.equal(replay.appliedRevision, first.appliedRevision)
  assert.equal(replay.snapshot.revision, 3)
  await assert.rejects(f.instruments.apply('A', 'A', { ...command, value: ticket({ delivery: ['repair'] }) }), code('operation-conflict'))
  await assert.rejects(f.instruments.apply('user', 'A', command), code('operation-conflict'))
  f.revoked.add('A')
  await assert.rejects(f.instruments.apply('A', 'A', command), error => error === denied)
})

test('business/view concurrency does not invalidate business expectedRevision; stale business writers conflict', async () => {
  const f = await ready()
  await f.apply('put-decision', { decisionId: 'D', value: decision() })
  const update = await f.command('put-decision', { decisionId: 'D', value: decision({ status: '继续处理', pending: false }) })
  const view = await f.command('set-decision-view', { decisionId: 'D', value: { read: true, hidden: false } }, 'user', 'A')
  await Promise.all([f.instruments.apply('A', 'A', update), f.instruments.apply('user', 'A', view)])
  assert.equal((await f.read()).businessRevision, 3)
  const one = await f.command('put-ticket', { localTicketId: 'T1', value: ticket() })
  const two = { ...one, operationId: 'other-id', localTicketId: 'T2' }
  const results = await Promise.allSettled([f.instruments.apply('A', 'A', one), f.instruments.apply('A', 'A', two)])
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1)
  assert.equal(results.find(row => row.status === 'rejected').reason.code, 'revision-conflict')
})

test('turning features off retains reads/old explicit dispositions but does not accept new instrument objects', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket() })
  await f.apply('put-decision', { decisionId: 'D', value: decision() })
  await f.controls.savePolicy('admin', { extensionEnabled: false, defaults: {}, workspaceOverrides: {} }, 1)
  await f.apply('put-ticket', { localTicketId: 'T1', value: { ...ticket(), disposition: '按原约定收尾' } })
  await f.apply('put-decision', { decisionId: 'D', value: decision({ pending: false, status: '已处理' }) })
  await assert.rejects(f.apply('put-ticket', { localTicketId: 'T2', value: ticket() }), code('feature-disabled'))
  await assert.rejects(f.apply('put-decision', { decisionId: 'new', value: decision() }), code('feature-disabled'))
  assert.equal((await f.read()).decisions[0].value.pending, false)
})

test('display off is independent of business recording, and input author/instance/window forgery is rejected', async () => {
  const f = await ready()
  await f.controls.savePolicy('admin', { extensionEnabled: true, defaults: { workspace: { enabled: true }, ticketProgress: { enabled: true }, pendingDecisions: { enabled: true },
    display: { header: false, inputSummary: false, rightPanel: false, sessionList: false, timeline: false } }, workspaceOverrides: {} }, 1)
  await f.apply('put-decision', { decisionId: 'D', value: decision() })
  assert.equal((await f.read()).summary.pendingDecisionCount, 1)
  const input = await f.command('put-decision', { decisionId: 'D', value: decision() })
  for (const field of ['author', 'instrumentInstanceId', 'lease', 'extensionEnabled']) assert.throws(() => parseInstrumentCommand({ ...input, [field]: 'forged' }), code('invalid-input'))
  assert.throws(() => parseInstrumentCommand({ ...input, value: { ...decision(), approveRequired: true } }), code('invalid-input'))
})

test('wrong stored instance, unknown/corrupt event versions and duplicate operation IDs never reset state', async () => {
  const f = await ready()
  await f.apply('put-decision', { decisionId: 'D', value: decision() })
  const snapshot = await f.read()
  const good = await f.storage.read(snapshot.instance.instrumentInstanceId)
  for (const mutate of [doc => { doc.schemaVersion = 99 }, doc => { doc.events[0].revision = 3 }, doc => { doc.revision++ },
    doc => { doc.events[1].command.operationId = doc.events[0].command.operationId }, doc => { doc.events[1].command.expectedRevision = 99 }]) {
    const broken = structuredClone(good); mutate(broken)
    assert.throws(() => parseInstrumentDocument(broken), code('invalid-state'))
  }
  const wrong = { ...good, ownerSessionId: 'B' }
  const instruments = new SessionInstruments(f.controls, { async read() { return wrong }, async compareAndSwap() { assert.fail('must not overwrite mismatched state') } }, f.authority)
  await assert.rejects(instruments.read('A', 'A'), code('association-conflict'))
})

test('decision history/change feed do not expose formerly out-of-assignment references', async () => {
  const f = await ready()
  for (const localTicketId of ['T1', 'T2']) await f.apply('put-ticket', { localTicketId, value: ticket() })
  await f.apply('put-decision', { decisionId: 'D', value: decision({ ticketIds: ['T2'], context: 'other assignment context' }) })
  await f.apply('put-decision', { decisionId: 'D', value: decision({ ticketIds: ['T1'], context: 'assigned scope context' }) })
  const child = await f.read('child', 'child')
  assert.equal(child.decisions[0].history.length, 1)
  assert.equal(child.decisions[0].history[0].value.context, 'assigned scope context')
  assert(!child.changes.some(event => event.command.value.ticketIds?.includes('T2')))
})

test('mismatched host author or absent authority cannot turn a child report into a user action', async () => {
  const f = await ready()
  const instruments = new SessionInstruments(f.controls, f.storage, { async resolveAccess() {
    return { author: { kind: 'user', principalId: 'other-user', sessionId: null }, scope: { kind: 'coordinator' } }
  } })
  await assert.rejects(instruments.read('A', 'A'), code('access-denied'))
  await assert.rejects(f.instruments.read('child', 'A'), error => error === denied)
})

test('saved commands and returned history are detached/frozen; change cursor is scoped and revisioned', async () => {
  const f = await ready()
  const command = await f.command('put-ticket', { localTicketId: 'T1', value: ticket() })
  const pending = f.instruments.apply('A', 'A', command)
  command.value.statuses.delivery.push('repair')
  const result = await pending
  assert.deepEqual(result.snapshot.tickets[0].value.statuses.delivery, ['partial'])
  assert.throws(() => { result.snapshot.tickets[0].history[0].value.title = 'side write' }, TypeError)
  assert.deepEqual((await f.read('A', 'A', { afterRevision: 1 })).changes.map(event => event.revision), [2])
  await assert.rejects(f.read('A', 'A', { afterRevision: 100 }), code('invalid-input'))
})
