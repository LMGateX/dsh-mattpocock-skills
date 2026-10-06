import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Public consumption seam, source-only mechanical tests; no live model/host claims.
const sourceURL = new URL('../src/controls/consumption.ts', import.meta.url)
const output = ts.transpileModule(readFileSync(sourceURL, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
}).outputText
registerHooks({ load(url, context, nextLoad) {
  return url === sourceURL.href ? { format: 'module', source: output, shortCircuit: true } : nextLoad(url, context)
} })
const { InstrumentConsumption } = await import(sourceURL.href)
const identity = { principalId: 'parent', sessionId: 'parent', instrumentInstanceId: 'instrument', ownerSessionId: 'parent' }
const instance = { instrumentInstanceId: 'instrument', ownerSessionId: 'parent', controlWorkspaceId: 'workspace' }
function snapshot() {
  return { sessionId: 'parent', instance, policy: { controlWorkspaceId: 'workspace', configurationRevision: 1,
    extensionEnabled: true, workspaceVerified: true, windows: { ticketWindowSize: 2, runningSubagentLimit: 2 },
    features: Object.fromEntries(['windows', 'binding', 'lifecycle'].map(key => [key, { status: 'configured' }])) },
    records: { instance, revision: 1, businessRevision: 1, scope: { kind: 'coordinator' },
      workflows: [], tickets: [], decisions: [], summary: { countingScope: 'instance', totalTickets: 0, statusCounts: [],
        pendingDecisionCount: 0, pendingUserDecisionCount: 0, pendingForPrincipalCount: 0, awaitingImplementationCount: 0 } },
    windows: { instance, revision: 1, configurationRevision: 1, status: 'ready', capability: 'cooperative',
      reason: null, scope: { kind: 'coordinator' }, runtimeKnowledge: { known: true, runtimeId: 'boot', reason: null },
      T: { used: 0, capacity: 2, available: 2, overcommitted: false },
      S: { used: 0, capacity: 2, available: 2, overcommitted: false, byState: { unknown: 0, released: 0 } }, tickets: [], executions: [] },
    resources: [], capabilities: [], health: [] }
}
function fixture(current = snapshot(), options = {}) {
  return { current, feed: new InstrumentConsumption({ readSnapshot: async () => current, ...options }) }
}
function decision(id, pending, awaitingImplementation = false) {
  return { workflowId: 'previous-workflow', decisionId: id, revision: 1,
    value: { question: id, status: 'task-defined', pending, awaitingImplementation }, history: [], view: { read: true, hidden: true } }
}
function facts(text) { return JSON.parse(text.split('Current runtime facts (null means unavailable/unknown, not zero):\n')[1]) }

test('very large active rows still show a meaningful short conclusion or pending question plus exact pointers', async () => {
  const f = fixture()
  f.current.contextConclusions = [{ workflowId: 'flow', decisionId: 'effective', sourceRevision: 1,
    result: 'Keep the agreed delivery criteria; '.repeat(1500), source: { author: 'owner' } }]
  const pending = decision('needs-answer', true)
  pending.value.question = 'Which follow-up should we choose? '.repeat(1500)
  pending.value.context = 'context '.repeat(7000)
  pending.value.options = Array.from({ length: 20 }, (_, n) => ({ key: String(n), label: 'Long option '.repeat(4000) }))
  f.current.records.decisions = [pending]
  f.current.records.summary.pendingDecisionCount = 1
  const result = await f.feed.readForConsumption(identity)
  const view = facts(result.text)
  assert.match(result.text, /Keep the agreed delivery criteria/)
  assert.match(result.text, /Which follow-up should we choose/)
  assert.equal(view.records.decisions.rows[0].value.pending, true)
  assert.equal(view.records.decisions.rows[0].query.query.recordId, '["previous-workflow","needs-answer"]')
  assert.equal(view.contextConclusions.rows[0].query.query.recordId, '["flow","effective"]')
  assert.match(result.text, /"truncated":true/)
})

test('physically retired owned legacy resources leave injection but borrowed detached trees remain',async()=>{
 const f=fixture()
 const resource=(resourceId,ownership)=>({resourceId,ownerInstanceId:'instrument',identity:{path:'/trees/'+resourceId,ownership},status:'retired',business:{status:'retained'},businessAuthorId:'parent',references:[],diagnostic:null,actualCanRetire:{facts:null}})
 f.current.resources=[resource('owned-cleaned-ghost','owned'),resource('borrowed-still-on-disk','borrowed')]
 const result=await f.feed.readForConsumption(identity)
 assert(!result.text.includes('owned-cleaned-ghost'))
 assert(result.text.includes('borrowed-still-on-disk'))
 assert.equal(f.current.resources.length,2)
})

test('task-defined status axes are not mistaken for internal history or lifecycle field names', async () => {
  const f = fixture()
  f.current.records.tickets = [{ workflowId: 'flow', localTicketId: 'ticket', revision: 1,
    value: { title: 'Task', statuses: { history: ['needs-followup'], operations: ['partial'], actualCanRetire: ['not-integrated'] } },
    history: [{ author: { kind: 'agent', principalId: 'child' }, references: [], value: { summary: 'old-private-history' } }] }]
  const result = await f.feed.readForConsumption(identity)
  const statuses = facts(result.text).records.tickets.rows[0].value.statuses
  assert.deepEqual(statuses, { history: ['needs-followup'], operations: ['partial'], actualCanRetire: ['not-integrated'] })
  assert.doesNotMatch(result.text, /old-private-history/)
})

test('all current categories together stay within 24000 characters without hiding omitted unknown health', async () => {
  const f = fixture()
  const large = 'Long task-defined summary '.repeat(2000)
  for (let n = 0; n < 40; n++) {
    const id = String(n).padStart(3, '0')
    f.current.records.workflows.push({ workflowId: id, revision: 1, history: [], value: { title: 'Workflow ' + id, axes: [{ axisKey: 'custom', label: large, counting: 'exclusive', statuses: [] }] } })
    f.current.records.tickets.push({ workflowId: id, localTicketId: id, revision: 1, history: [], value: { title: 'Ticket ' + id, statuses: { custom: ['meaningful'] }, summary: large } })
    const pending = decision(id, true); pending.value.context = large
    f.current.records.decisions.push(pending)
    f.current.records.summary.statusCounts.push({ workflowId: id, axisKey: 'custom', label: large, counting: 'exclusive', statuses: [], unreported: 0 })
    f.current.windows.tickets.push({ workflowId: id, localTicketId: id, held: true, generation: 1 })
    f.current.windows.executions.push({ executionId: id, generation: 1, state: 'unknown', workflowId: id, localTicketId: id })
    f.current.resources.push({ resourceId: id, ownerInstanceId: 'instrument', identity: { path: '/tree/' + id, ownership: 'borrowed' }, status: 'retained',
      business: { status: large }, businessAuthorId: 'parent', references: [], diagnostic: null, actualCanRetire: { facts: null } })
    f.current.capabilities.push({ key: id, status: 'unsupported', reason: large })
    f.current.health.push({ scope: id, status: 'ready', reason: large })
  }
  f.current.worktreeBindings = f.current.records.workflows.map(({ workflowId: id }) => ({ bindingId: id, revision: 1,
    value: { requestedCwd: '/tree/' + id, actualCwd: '/tree/' + id, actualChildSessionId: 'child-' + id, acceptance: 'accepted', outcome: 'confirmed', business: { state: 'discarded', notes: large } },
    source: 'agent', author: { principalId: 'parent', kind: 'agent' }, recordedAt: 1 }))
  f.current.contextConclusions = f.current.records.workflows.map(({ workflowId: id }) => ({ workflowId: id, decisionId: id, result: large, sourceRevision: 1, source: { author: 'owner' } }))
  f.current.health.push({ scope: 'zzz-not-shown', status: 'unknown', reason: 'physical facts unavailable' })
  f.current.records.summary.pendingDecisionCount = 40
  f.current.records.summary.totalTickets = 40
  f.current.windows.S.byState.unknown = 40
  const result = await f.feed.readForConsumption(identity)
  assert.ok(result.text.length <= 24000, 'total text chars=' + result.text.length)
  const view = facts(result.text)
  const categories = [view.records.workflows, view.records.tickets, view.records.decisions, view.records.summary.statusCounts,
    view.windows.tickets, view.windows.executions, view.resources, view.worktreeRelations, view.contextConclusions, view.capabilities, view.health]
  for (const category of categories) {
    assert.ok(JSON.stringify(category).length <= 2000)
    assert.ok(category.shown > 0 && category.more)
    assert.ok(category.query)
  }
  assert.equal(view.health.counts.unknown, 1)
  assert.equal(view.health.total, 41)
  assert.equal(view.records.summary.pendingDecisionCount, 40)
  assert.equal(view.windows.S.byState.unknown, 40)
  assert.equal(result.freshness, 'stale')
})

test('explicit effective conclusions stay brief and separate from resolved question details', async () => {
  const f = fixture()
  const resolved = decision('resolved-effective', false)
  resolved.value.question = 'obsolete-full-question-payload'
  resolved.value.options = [{ key: 'one', label: 'obsolete-option-payload' }]
  resolved.value.result = 'Use the agreed delivery criteria'
  f.current.records.decisions = [resolved]
  f.current.contextConclusions = [{ decisionId: 'resolved-effective', workflowId: 'previous-workflow',
    result: 'Use the agreed delivery criteria', sourceRevision: 7,
    source: { author: { kind: 'user', principalId: 'owner' }, references: ['user-answer'] } }]
  const result = await f.feed.readForConsumption(identity)
  const view = facts(result.text)
  assert.equal(view.records.decisions.total, 0)
  assert.equal(view.contextConclusions.total, 1)
  assert.match(result.text, /Use the agreed delivery criteria|user-answer/)
  assert.doesNotMatch(result.text, /obsolete-full-question-payload|obsolete-option-payload/)
  assert.equal(view.contextConclusions.rows[0].query.query.kind, 'decision')
  assert.equal(view.contextConclusions.rows[0].query.query.recordId, '["previous-workflow","resolved-effective"]')
  f.current.contextConclusions = []
  assert.doesNotMatch((await f.feed.readForConsumption(identity)).text, /Use the agreed delivery criteria/)
})

test('degraded snapshots retain current counts and unknown details but cannot be replayed as a fresh cache', async () => {
  const f = fixture()
  await f.feed.readForConsumption(identity)
  f.current.health = [{ scope: 'execution', status: 'unknown', reason: 'coverage unknown' }]
  const result = await f.feed.readForConsumption(identity)
  assert.equal(result.freshness, 'stale')
  assert.match(result.text, /coverage unknown/)
  assert.equal(f.feed.cachedText(identity), null)
  const next = await f.feed.readForConsumption(identity)
  assert.match(next.text, /coverage unknown/)
})

test('a changed current row outside shown details updates the bounded view; historical-only rows do not', async () => {
  const f = fixture()
  f.current.records.decisions = Array.from({ length: 30 }, (_, n) => decision(String(n).padStart(3, '0'), true))
  f.current.records.summary.pendingDecisionCount = 30
  const first = await f.feed.readForConsumption(identity)
  assert.ok(facts(first.text).records.decisions.shown < 30)
  f.current.records.decisions[29].revision++
  f.current.records.decisions[29].value.status = 'changed-current-status'
  const changed = await f.feed.readForConsumption(identity)
  assert.notEqual(changed.text, null)
  assert.equal(facts(changed.text).records.decisions.total, 30)
  f.current.records.businessRevision++
  f.current.records.decisions.push(decision('old-resolved-hidden', false))
  f.current.windows.revision++
  f.current.windows.S.byState.released++
  f.current.windows.executions.push({ executionId: 'ended-old-run', state: 'released', generation: 1 })
  assert.equal((await f.feed.readForConsumption(identity)).text, null)
})

test('already-filtered binding rows project actual relations and latest provenance, never raw history', async () => {
  const f = fixture()
  const value = { operationId: 'create-one', parentSessionId: 'parent', plannedChildSessionId: 'child', requestedCwd: '/trees/one',
    actualChildSessionId: 'child', actualCwd: '/trees/one', acceptance: 'accepted', outcome: 'confirmed',
    diagnostic: null, business: { state: 'discarded', notes: 'Still awaiting cleanup' } }
  f.current.worktreeBindings = [{ bindingId: 'one', revision: 3, value,
    author: { kind: 'agent', principalId: 'cleanup-author' }, source: 'agent', recordedAt: 10 }]
  const result = await f.feed.readForConsumption(identity)
  const view = facts(result.text)
  assert.equal(view.worktreeRelations.total, 1)
  assert.match(result.text, /Still awaiting cleanup|cleanup-author|requestedCwd|actualCwd/)
  assert.match(result.text, /"sourceRevision":3/)
  assert.doesNotMatch(result.text, /obsolete-private-history-detail|"history":/)
  assert.equal(view.worktreeRelations.rows[0].query.query.kind, 'worktree')
  assert.equal(view.worktreeRelations.rows[0].query.query.recordId, 'one')
  f.current.worktreeBindings = [] // runtime filters only after an explicit cleanup report
  const clean = await f.feed.readForConsumption(identity)
  assert.equal(facts(clean.text).worktreeRelations.total, 0)
  assert.doesNotMatch(f.feed.cachedText(identity), /Still awaiting cleanup/)
})

test('borrowed resource retirement is not physical cleanup and omits old closure/eligibility payload', async () => {
  const f = fixture()
  f.current.resources = [{ resourceId: 'borrowed-detached', ownerInstanceId: 'instrument', identity: { path: '/trees/borrowed', ownership: 'borrowed' },
    status: 'retired', business: { status: 'retained on disk' }, businessAuthorId: 'parent', references: [], diagnostic: null,
    entrancesClosed: true, nativeColdResumeClosed: true, retireRequest: { explanation: 'obsolete-disposal-gate' },
    actualCanRetire: { allowed: true, reasons: ['obsolete-eligibility'], facts: { exists: true, digest: 'physical', tracked: [], untracked: [], ignored: [] } } }]
  const result = await f.feed.readForConsumption(identity)
  assert.match(result.text, /borrowed-detached|retained on disk/)
  assert.match(result.text, /"exists":true/)
  assert.doesNotMatch(result.text, /obsolete-disposal-gate|obsolete-eligibility|actualCanRetire|nativeColdResumeClosed/)
})

test('oversized current categories keep pending totals, unknown health, locators and bounded readable details', async () => {
  const f = fixture()
  f.current.records.tickets = Array.from({ length: 100 }, (_, n) => ({ workflowId: 'flow', localTicketId: String(n).padStart(3, '0'),
    revision: 1, value: { title: 'Ticket ' + n, statuses: { progress: ['custom-done-but-still-relevant'] }, summary: 'x'.repeat(60000) }, history: [] }))
  f.current.records.decisions = Array.from({ length: 100 }, (_, n) => {
    const row = decision('pending-' + String(n).padStart(3, '0'), true)
    row.value.context = 'y'.repeat(60000)
    return row
  })
  f.current.records.summary.totalTickets = 100
  f.current.records.summary.pendingDecisionCount = 100
  f.current.records.summary.pendingUserDecisionCount = 47
  f.current.records.summary.awaitingImplementationCount = 13
  f.current.health = [{ scope: 'execution', status: 'unknown', reason: 'restored state not yet observed' }]
  const result = await f.feed.readForConsumption(identity)
  assert.equal(result.reason, 'snapshot-health-degraded')
  assert.ok(result.text.length < 262144)
  const view = facts(result.text)
  assert.equal(view.records.summary.pendingDecisionCount, 100)
  assert.equal(view.records.summary.pendingUserDecisionCount, 47)
  assert.equal(view.records.summary.awaitingImplementationCount, 13)
  for (const key of ['tickets', 'decisions']) {
    const category = view.records[key]
    assert.ok(JSON.stringify(category).length <= 24000)
    assert.equal(category.total, 100)
    assert.ok(category.shown > 0 && category.shown < 100)
    assert.equal(category.more, true)
    assert.ok(category.query)
  }
  assert.match(result.text, /custom-done-but-still-relevant/)
  assert.match(result.text, /"truncated":true/)
  assert.match(result.text, /restored state not yet observed/)
  assert.equal(f.feed.cachedText(identity), null)
})

test('advisory windows do not require managed-only execution, capacity approval, or lifecycle gates', async () => {
  const { feed } = fixture()
  const { text } = await feed.readForConsumption(identity)
  assert.match(text, /T\/S are advisory reference limits/)
  assert.match(text, /Exceeding them or unknown usage does not prohibit dispatch or require approval/)
  assert.doesNotMatch(text, /Retire only|actualCanRetire|close.*resume|must use managed|only.*managed/i)
  assert.match(text, /worktree binding|worktree relationships/i)
})

test('current projection keeps cross-workflow pending and awaiting matters but omits resolved details and released T/S', async () => {
  const f = fixture()
  f.current.records.decisions = [decision('old-pending', true), decision('old-awaiting', false, true), decision('old-resolved', false)]
  f.current.records.summary.pendingDecisionCount = 1
  f.current.records.summary.awaitingImplementationCount = 1
  f.current.windows.tickets = [{ workflowId: 'flow', localTicketId: 'released-ticket', generation: 1, held: false },
    { workflowId: 'flow', localTicketId: 'held-ticket', generation: 2, held: true }]
  f.current.windows.executions = [{ executionId: 'released-execution', state: 'released', generation: 1 },
    { executionId: 'unknown-execution', state: 'unknown', generation: 1 }]
  const result = await f.feed.readForConsumption(identity)
  assert.match(result.text, /old-pending/); assert.match(result.text, /old-awaiting/)
  assert.match(result.text, /held-ticket/); assert.match(result.text, /unknown-execution/)
  assert.doesNotMatch(result.text, /old-resolved|released-ticket|released-execution/)
  assert.equal(result.freshness, 'current')
})
