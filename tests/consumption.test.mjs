import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Mechanical source-only probe, NOT a real-model behavior or live host integration test.
// Node 24 + repository TypeScript; in-memory transpilation emits no lib artifacts.
const sourceURL = new URL('../src/controls/consumption.ts', import.meta.url)
const source = readFileSync(sourceURL, 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
  fileName: fileURLToPath(sourceURL),
}).outputText
registerHooks({
  load(url, context, nextLoad) {
    if (url === sourceURL.href) return { format: 'module', source: output, shortCircuit: true }
    return nextLoad(url, context)
  },
})
const { InstrumentConsumption } = await import(sourceURL.href)
const identity = Object.freeze({ principalId: 'parent-agent', sessionId: 'parent', instrumentInstanceId: 'instance-A', ownerSessionId: 'parent' })
const instance = { instrumentInstanceId: identity.instrumentInstanceId, ownerSessionId: identity.ownerSessionId, controlWorkspaceId: 'workspace' }
function deferred() { return Promise.withResolvers() }
function snapshot() {
  const value = { title: 'Ticket A', statuses: { progress: ['partial'] }, disposition: 'partial delivery' }
  const author = { kind: 'agent', principalId: 'child-author', sessionId: 'child' }
  const history = [{ revision: 1, recordedAt: 1, author, references: ['native-message-A'], value }]
  return {
    sessionId: identity.sessionId, instance: { ...instance },
    policy: { configurationRevision: 1, controlWorkspaceId: 'workspace', workspaceVerified: true, extensionEnabled: true,
      features: Object.fromEntries(['binding', 'lifecycle', 'windows', 'ticketProgress', 'pendingDecisions'].map(key => [key, { requested: true, status: 'configured', reason: null }])),
      windows: { ticketWindowSize: 2, runningSubagentLimit: 2 }, pendingDecisions: { interactionMode: 'native-question' },
      display: { header: true, inputSummary: true, rightPanel: true, sessionList: true, timeline: true }, sources: {} },
    records: { instance: { ...instance }, revision: 1, businessRevision: 1, viewerRevision: 0,
      scope: { kind: 'coordinator' }, focusedWorkflowId: null,
      workflows: [{ workflowId: 'flow', revision: 1, value: { title: 'Task', axes: [{ axisKey: 'progress', label: 'Progress', counting: 'exclusive', statuses: [{ statusKey: 'partial', label: 'Partially complete', meaning: 'Task-defined partial delivery' }] }] }, history: [] }],
      tickets: [{ workflowId: 'flow', localTicketId: 'A', revision: 1, value, history }],
      decisions: [{ workflowId: 'old-flow', decisionId: 'old-obligation', revision: 1, value: { question: 'Choose follow-up', status: 'awaiting response', pending: true }, history: [], view: { read: false, hidden: false } }],
      changes: [], summary: { countingScope: 'instance', totalTickets: 1, statusCounts: [], pendingDecisionCount: 1, pendingUserDecisionCount: 0, pendingForPrincipalCount: 0, awaitingImplementationCount: 0 } },
    windows: { instance: { ...instance }, revision: 1, configurationRevision: 1, capability: 'cooperative', status: 'ready', reason: null,
      scope: { kind: 'coordinator' }, runtimeKnowledge: { runtimeId: 'boot-A', known: true, reason: null },
      tickets: [], executions: [{ ...instance, executionId: 'research', generation: 1, leaseId: 'lease-A', workflowId: 'flow', localTicketId: null,
        runtimeId: 'boot-A', state: 'running', ticketApplicable: false, ticketReason: 'no-ticket-assignment' }],
      T: { used: 0, capacity: 2, available: 2, overcommitted: false },
      S: { used: 1, capacity: 2, available: 1, overcommitted: false, byState: { reserved: 0, accepted: 0, scheduled: 0, running: 1, stopping: 0, unknown: 0, released: 0 } } },
    resources: [], capabilities: [{ key: 'native-admission', status: 'unsupported', reason: 'native seam absent' }], health: [],
  }
}
function nativeExecution(over = {}) {
  return { executionId: 'child', sessionId: 'child', parentSessionId: 'parent', instrumentInstanceId: identity.instrumentInstanceId,
    provider: 'spawn', runId: 'run-1', headerCwd: '/trees/A', state: 'ended', outcome: 'completed',
    observed: 'subagent/end: completed', startedAt: 1, endedAt: 2, recordedAt: 2, activity: 'idle',
    lane: { workflowId: 'flow', ticketIds: ['A'], task: 'Build A', source: 'inferred' }, ...over }
}
function worktreeObservation(over = {}) {
  return { observationId: 'obs-1', revision: 1, source: 'program', recordedAt: 1, creatorActivity: 'idle',
    lane: { workflowId: 'flow', ticketIds: ['A'], task: null, source: 'inferred' },
    nativeChildren: [{ sessionId: 'child', headerCwd: '/trees/A', relation: 'created-tree', source: 'observed' }],
    value: { creatorSessionId: 'child', callId: 'call-1', rootCallId: 'call-1', turn: 1, step: 1, path: '/trees/A',
      branch: 'worktree-A', baseCommit: 'a'.repeat(40), repositoryRoot: '/repo',
      check: { state: 'unverified', checkedAt: null, diagnostic: null, facts: null }, business: { state: 'open' } }, ...over }
}
function resource() {
  return { resourceId: 'tree-A', controlWorkspaceId: 'workspace', ownerInstanceId: identity.instrumentInstanceId,
    identity: { path: '/controlled/tree-A', ownership: 'owned' }, status: 'retained', business: { status: 'awaiting follow-up' }, businessAuthorId: 'parent-agent',
    references: [], retireRequest: null, entrancesClosed: false, nativeColdResumeClosed: false, diagnostic: null,
    actualCanRetire: { allowed: true, checkedAt: 1, ledgerRevision: 1, reasons: [], facts: { identityVerified: true, exists: true,
      tracked: [], untracked: [], ignored: [], headOid: 'head-A', branchOid: 'head-A', digest: 'physical-A' } } }
}
function fixture(options = {}) {
  let current = snapshot()
  let port
  let reads = 0
  const feed = new InstrumentConsumption({ readSnapshot: async (who, signal) => {
    assert.deepEqual(who, identity); assert.equal(signal.aborted, false); reads++; return current
  }, bindProgram(value) { port = value }, ...options })
  return { feed, get port() { return port }, get current() { return current }, set current(value) { current = value }, get reads() { return reads } }
}

// This demonstrates the module's intended host composition; the real SDK UserMessage is host-owned.
async function consume(feed, nativeMessages, signal) {
  const result = await feed.readForConsumption(identity, signal)
  const messages = result.text === null ? [...nativeMessages] : [...nativeMessages, { role: 'user', source: { kind: 'host-plugin', plugin: 'mattpocock' }, content: result.text }]
  return { result, messages }
}

test('legacy consumption without owner policy explicitly reports recommendation unsupported, never active', async () => {
  const f = fixture()
  const { result } = await consume(f.feed, [])
  assert.match(result.text, /Recommendation support: unsupported/)
  assert.doesNotMatch(result.text, /Recommendation support: active/)
})

test('active owner recommendation authorization instructs exact-key creation then explicit same-ID adoption, expiry returns ordinary flow', async () => {
  const f = fixture()
  f.current = { ...f.current, ownerDecisionPolicy: { revision: 2, status: 'active', epochId: 'epoch-2', expiresAt: 5000, scope: 'new-decisions', reason: null } }
  let { result } = await consume(f.feed, [])
  assert.match(result.text, /Recommendation support: active/)
  assert.match(result.text, /Without an adoptable exact-key candidate, ordinary flow applies:/)
  assert.match(result.text, /recommendation exactly equal to one unique options key/)
  assert.match(result.text, /adopt-decision-recommendation/)
  assert.match(result.text, /SAME decisionId/)
  assert.match(result.text, /candidate is not adoption/)
  assert.match(result.text, /not a fresh human reply or additional operation permission/)
  assert.match(result.text, /Do not request repeated human confirmation for the same preauthorized path choice/)
  assert.match(result.text, /Path selection does not supply missing external input, expand execution permissions or prove task completion/)
  assert.match(result.text, /Higher-priority or task requirements for personal item-by-item confirmation still prevail/)
  assert.match(result.text, /read the current decision via mattpocock_record read before adoption to obtain current support and businessRevision CAS/)
  assert.match(result.text, /sourceRevision is not business CAS/)
  assert.match(result.text, /Conflict, expiry, revocation or a prior human reply: reread current state; no retry loop or stale authorization replay/)
  const facts = JSON.parse(result.text.split('Current runtime facts (null means unavailable/unknown, not zero):\n')[1])
  assert.equal(facts.ownerDecisionPolicy.epochId, 'epoch-2')
  f.current = { ...f.current, ownerDecisionPolicy: { ...f.current.ownerDecisionPolicy, status: 'expired' } }
  ;({ result } = await consume(f.feed, []))
  assert.match(result.text, /Recommendation support: expired/)
  assert.doesNotMatch(result.text, /Recommendation support: active/)
})

function consumptionFacts(result) {
  assert.equal(result.freshness, 'current')
  return JSON.parse(result.text.split('Current runtime facts (null means unavailable/unknown, not zero):\n')[1])
}
function currentDecision(decisionId, value = {}, recommendationSupport) {
  return { workflowId: 'flow', decisionId, revision: 7,
    value: { question: 'Choose a path', status: 'task-defined', pending: true, addressee: { kind: 'user' }, ...value },
    provenance: { author: { kind: 'agent', principalId: 'parent-agent', sessionId: 'parent' }, references: ['task-source'], recordedAt: 10 },
    view: { read: true, hidden: true }, ...(recommendationSupport === undefined ? {} : { recommendationSupport }) }
}
const candidateSupport = () => ({ status: 'candidate', candidate: { optionKey: 'read-only', decisionRevision: 7,
  policyEpochId: 'epoch-current', policyRevision: 2, expiresAt: null } })

test('pending-user candidate survives four older awaiting obligations within the existing decision budget', async () => {
  const f = fixture()
  const old = Array.from({ length: 4 }, (_, i) => currentDecision('a-old-' + i, { pending: false, awaitingImplementation: true,
    result: 'Old commitment and constraints '.repeat(30) }))
  const candidate = currentDecision('z-new-question', { options: [{ key: 'read-only', label: 'Wait for a read-only runtime' }],
    recommendation: 'read-only' }, candidateSupport())
  f.current.records.decisions = [...old, candidate]
  Object.assign(f.current.records.summary, { pendingDecisionCount: 1, pendingUserDecisionCount: 1, awaitingImplementationCount: 4 })
  const before = structuredClone(f.current)
  const facts = consumptionFacts(await f.feed.readForConsumption(identity))
  const category = facts.records.decisions
  assert.equal(category.rows[0].decisionId, 'z-new-question')
  assert.deepEqual(category.rows[0].recommendationSupport, candidateSupport())
  assert.deepEqual(category.rows[0].query, { tool: 'mattpocock_record', action: 'read', query: { kind: 'decision', recordId: '["flow","z-new-question"]', limit: 20 } })
  assert.equal(category.query.tool, 'mattpocock_record')
  assert.equal(category.total, 5)
  assert.equal(category.shown, category.rows.length)
  assert.equal(category.more, category.shown < 5)
  assert.ok(JSON.stringify(category).length <= 1850)
  assert.equal(facts.records.summary.awaitingImplementationCount, 4)
  assert.deepEqual(f.current, before)
})

test('long decision bodies retain exact candidate and pending addressee with current read recovery', async () => {
  const f = fixture()
  f.current.records.scope = { kind: 'assigned', workflowId: 'flow', ticketIds: [] }
  const support = candidateSupport()
  support.candidate.optionKey = 'opaque-option-'.repeat(35)
  support.candidate.policyEpochId = 'opaque-epoch-'.repeat(35)
  f.current.records.decisions = [currentDecision('long-body', { question: 'Question '.repeat(1000), context: 'Background '.repeat(1000),
    result: 'Existing constraints '.repeat(1000), options: [{ key: support.candidate.optionKey, label: 'Label '.repeat(1000) }],
    recommendation: support.candidate.optionKey }, support)]
  const category = consumptionFacts(await f.feed.readForConsumption(identity)).records.decisions
  assert.equal(category.shown, 1)
  const row = category.rows[0]
  assert.equal(row.value.pending, true)
  assert.deepEqual(row.value.addressee, { kind: 'user' })
  assert.deepEqual(row.recommendationSupport, support)
  assert.equal(row.sourceRevision, 7)
  assert.equal(row.query.tool, 'mattpocock_record')
  assert.equal(row.query.query.recordId, '["flow","long-body"]')
  assert.ok(JSON.stringify(category).length <= 1850)
})

test('oversized candidate tokens use status plus current locator without starving later short pending rows', async () => {
  const f = fixture()
  const support = candidateSupport()
  support.candidate.optionKey = 'opaque-key-'.repeat(300)
  support.candidate.policyEpochId = 'opaque-epoch-'.repeat(300)
  const impossible = currentDecision('a-'.repeat(2000), {}, candidateSupport())
  const oversized = currentDecision('b-large-token', { recommendation: support.candidate.optionKey,
    options: [{ key: support.candidate.optionKey, label: 'Read only' }] }, support)
  f.current.records.decisions = [impossible, oversized, currentDecision('c-short', {}, candidateSupport())]
  const category = consumptionFacts(await f.feed.readForConsumption(identity)).records.decisions
  assert.equal(category.total, 3)
  assert.equal(category.more, true)
  assert.equal(category.shown, 2)
  assert.deepEqual(category.rows.map(row => row.decisionId), ['b-large-token', 'c-short'])
  const row = category.rows[0]
  assert.deepEqual(row.recommendationSupport, { status: 'candidate' })
  assert.equal(row.query.query.recordId, '["flow","b-large-token"]')
  assert.equal(row.value.recommendation, undefined)
  assert.equal(row.value.options, undefined)
  assert.ok(!JSON.stringify(category).includes('opaque-key-'))
  assert.ok(!JSON.stringify(category).includes('opaque-epoch-'))
  assert.ok(JSON.stringify(category).length <= 1850)
})

test('adopted selection without result survives compact recovery and OFF without replaying full policy', async () => {
  const f = fixture()
  const selection = { kind: 'owner-policy', selectedOptionKey: 'read-only', decisionSourceRevision: 7, authorizedAt: 20,
    policy: { epochId: 'epoch-current', policyRevision: 2, scope: 'new-decisions', enabledAt: 10, expiresAt: null,
      authorizedBy: { kind: 'user', principalId: 'operator-'.repeat(300), sessionId: null } } }
  const row = currentDecision('adopted-no-result', { pending: false, awaitingImplementation: true, question: 'Context '.repeat(1000) },
    { status: 'adopted', selection })
  row.policySelection = selection
  f.current.records.decisions = [row]
  f.current.contextConclusions = [{ workflowId: 'flow', decisionId: 'retained-adoption', sourceRevision: 8,
    result: null, policySelection: selection, source: row.provenance }]
  f.current.policy.extensionEnabled = false
  const result = await f.feed.readForConsumption(identity)
  const facts = consumptionFacts(result)
  const projected = facts.records.decisions.rows[0]
  assert.ok(projected, 'large historical policy must not erase an adopted source')
  assert.equal(projected.recommendationSupport.status, 'adopted')
  for (const compact of [projected.recommendationSupport.selection, projected.policySelection, facts.contextConclusions.rows[0].policySelection]) {
    assert.equal(compact.kind, 'owner-policy')
    assert.equal(compact.selectedOptionKey, 'read-only')
    assert.equal(compact.decisionSourceRevision, 7)
    assert.deepEqual(compact.policy, { epochId: 'epoch-current', policyRevision: 2 })
  }
  assert.equal(projected.value.awaitingImplementation, true)
  assert.ok(!JSON.stringify(facts.records.decisions).includes('operator-'))
  assert.ok(JSON.stringify(facts.records.decisions).length <= 1850)
  assert.match(result.text, /Management feature is OFF/)
  assert.doesNotMatch(result.text, /Recommendation support: active/)
})

test('decision priority uses current row support then pending addressee and stable composite identity, never labels', async () => {
  const f = fixture()
  const rows = [
    currentDecision('a-await', { pending: false, awaitingImplementation: true, status: 'urgent candidate' }),
    currentDecision('b-agent', { addressee: { kind: 'agent' } }),
    currentDecision('c-user', { status: 'closed', recommendationSupport: candidateSupport() }, { status: 'unknown', reason: 'policy-unavailable' }),
    currentDecision('z-candidate', {}, candidateSupport()),
  ]
  f.current.records.decisions = rows
  const first = consumptionFacts(await f.feed.readForConsumption(identity)).records.decisions
  assert.deepEqual(first.rows.slice(0, 3).map(row => row.decisionId), ['z-candidate', 'c-user', 'b-agent'])
  assert.equal(first.total, 4)
  assert.equal(first.more, first.shown < 4)
  f.current.records.decisions = rows.toReversed()
  assert.equal((await f.feed.readForConsumption(identity)).text, null, 'input order must not change the canonical projection')
  f.current.records.decisions = [rows[0], rows[1]]
  assert.deepEqual(consumptionFacts(await f.feed.readForConsumption(identity)).records.decisions.rows.map(row => row.decisionId), ['b-agent', 'a-await'])
  // Within a priority class, use workflow plus decision ID, not insertion or free status.
  f.current.records.decisions = [currentDecision('B'), { ...currentDecision('Z'), workflowId: 'a-flow' }, currentDecision('A')]
  const tied = consumptionFacts(await f.feed.readForConsumption(identity)).records.decisions
  assert.deepEqual(tied.rows.map(row => [row.workflowId, row.decisionId]), [['a-flow', 'Z'], ['flow', 'A'], ['flow', 'B']])
})

test('complete decision signature sees omitted bodies and support changes and retains honest zero removal', async () => {
  const f = fixture()
  const first = currentDecision('first', { context: 'Background '.repeat(1000) }, candidateSupport())
  const hidden = currentDecision('z-hidden', { pending: false, awaitingImplementation: true, result: 'Constraint '.repeat(1000) })
  const oversized = currentDecision('a-'.repeat(2000), {}, candidateSupport())
  f.current.records.decisions = [oversized, first, hidden]
  let category = consumptionFacts(await f.feed.readForConsumption(identity)).records.decisions
  const signature = category.currentFactsSignature
  assert.equal(category.total, 3)
  assert.equal(category.more, true)
  oversized.value.context = 'Changed entirely outside the shown rows'
  category = consumptionFacts(await f.feed.readForConsumption(identity)).records.decisions
  assert.notEqual(category.currentFactsSignature, signature)
  const tailSignature = category.currentFactsSignature
  first.value.context += 'Changed tail'
  category = consumptionFacts(await f.feed.readForConsumption(identity)).records.decisions
  assert.notEqual(category.currentFactsSignature, tailSignature)
  for (const support of [{ status: 'not-eligible', reason: 'feature-disabled' }, { status: 'unknown', reason: 'policy-unavailable' }, candidateSupport()]) {
    first.recommendationSupport = support
    category = consumptionFacts(await f.feed.readForConsumption(identity)).records.decisions
    assert.deepEqual(category.rows.find(row => row.decisionId === 'first').recommendationSupport, support)
  }
  f.current.records.decisions = []
  Object.assign(f.current.records.summary, { pendingDecisionCount: 0, pendingUserDecisionCount: 0, awaitingImplementationCount: 0 })
  const facts = consumptionFacts(await f.feed.readForConsumption(identity))
  assert.deepEqual(facts.records.decisions, [], 'known-empty means shown=total=0 and more=false')
  assert.equal(facts.records.summary.pendingUserDecisionCount, 0)
})

test('opaque decision identity and option keys stay exact beyond the normal text briefing limit', async () => {
  const f = fixture()
  const id = 'decision-'.repeat(50)
  const support = candidateSupport()
  const row = currentDecision(id, { options: [{ key: support.candidate.optionKey, label: 'read only' }], recommendation: support.candidate.optionKey }, support)
  f.current.records.decisions = [row]
  const category = consumptionFacts(await f.feed.readForConsumption(identity)).records.decisions
  assert.equal(category.rows[0].decisionId, id)
  assert.equal(category.rows[0].query.query.recordId, JSON.stringify(['flow', id]))
  assert.equal(category.rows[0].recommendationSupport.candidate.optionKey, support.candidate.optionKey)
  assert.ok(JSON.stringify(category).length <= 1850)
  support.candidate.optionKey = 'option-'.repeat(60)
  f.current.records.decisions = [currentDecision('short-id', { options: [{ key: support.candidate.optionKey, label: 'read only' }], recommendation: support.candidate.optionKey }, { status: 'not-eligible', reason: 'no-creation-binding' })]
  const keyed = consumptionFacts(await f.feed.readForConsumption(identity)).records.decisions.rows[0]
  assert.equal(keyed.value.options[0].key, support.candidate.optionKey)
  assert.equal(keyed.value.recommendation, support.candidate.optionKey)
  assert.equal(keyed.recommendationSupport.status, 'not-eligible')
})

test('a held window slot whose ticket sits in a terminal status is reported for authored release', async () => {
  const f = fixture()
  f.current = { ...f.current, pendingRelease: [{ workflowId: 'flow', localTicketId: 'A', generation: 2, label: '已交付' }] }
  const { result } = await consume(f.feed, [])
  assert.match(result.text, /T pending release: review pendingRelease; use mattpocock_window release/)
  const release = consumptionFacts(result).pendingRelease.rows[0]
  assert.equal(release.localTicketId, 'A')
  assert.equal(release.label, '已交付')
  assert.equal(release.generation, 2)
})

test('pure emitted module has no Node, SDK or runtime dependency imports', () => {
  assert.doesNotMatch(output, /(?:import\s|from\s|require\()[^\n]*(?:node:|@deepseek|\.js)/)
  assert.match(output, /export class InstrumentConsumption/)
  assert.doesNotMatch(output, /job_output|lastAssistantMessage|step-reject|monkeypatch/)
})
test('current records and minimal protocol append independently without touching native input', async () => {
  const f = fixture()
  const native = Object.freeze({ role: 'user', content: 'I am still running; please answer this question', source: { kind: 'agent-message', sessionId: 'child' } })
  const input = Object.freeze([native])
  const { result, messages } = await consume(f.feed, input)
  assert.equal(result.freshness, 'current'); assert.equal(messages[0], native); assert.equal(input.length, 1)
  assert.equal(messages[1].source.kind, 'host-plugin')
  assert.match(result.text, /author reports, not program execution/)
  assert.match(result.text, /Skills, user agreements and task documents/)
  assert.match(result.text, /New decisions: genuine unresolved user questions only, pending=true[/]addressee.kind=user/)
  assert.match(result.text, /mattpocock_record/); assert.match(result.text, /native subagent lifecycle observation/); assert.doesNotMatch(result.text, /mattpocock_execute/); assert.match(result.text, /mattpocock_window/)
  assert.match(result.text, /Only prepare a tree with the host's create_worktree when the task requires write isolation; read-only research\/review may share a stable checkout/)
  assert.match(result.text, /Use the host's working_directory to enter or leave a directory; this instrument does not create or delete trees/)
  assert.match(result.text, /A worktree observation lane is inferred from assignment\/binding at read time; cleaned\/notes are authored, and created-tree only proves that child created the tree/)
  assert.doesNotMatch(result.text, /Let each lane create its own tree|mattpocock_delegate|strong ticket↔worktree binding entry/)
  assert.match(result.text, /explicit T reserve\/release\/reacquire/); assert.match(result.text, /T and S are this session's configured limits/)
  assert.match(result.text, /S is the host's live run status/)
  assert.match(result.text, /countKnown false means S\.used is a stated lower bound with the total unknown/)
  assert.match(result.text, /S\.depth structures that count by edge distance/)
  assert.match(result.text, /a grandchild consumes the same capacity as a direct child and every depth belongs in S/)
  assert.match(result.text, /must already exist in this instrument/)
  assert.match(result.text, /Task-reference capability is unknown or unsupported/)
  assert.doesNotMatch(result.text, /Record it first with mattpocock_record put-ticket/)
  assert.match(result.text, /Partially complete/); assert.match(result.text, /child-author/); assert.match(result.text, /old-obligation/)
  assert.match(result.text, /native-admission/); assert.match(result.text, /unsupported/)
  assert.doesNotMatch(result.text, /candidate|development version|unvalidated|not model-validated|未验证|开发版本/i)
  assert.doesNotMatch(result.text, /advisory|admission gate|does not prohibit|approval gate|does not require approval|no forced cancellation|without requiring all work/i)
  assert.doesNotMatch(result.text, /"capability":/)
  assert.match(result.text, /Reference discipline: every handle used for T reserve\/reacquire or instrument assignment/)
  assert.doesNotMatch(result.text, /work one held ticket to convergence before admitting another|one at a time/i)
  assert.match(result.text, /Work-in-progress discipline: the T window counts selected local task handles/)
  assert.match(result.text, /explicit release may mean pause or handoff/)
  assert.doesNotMatch(result.text, /never split one ticket|shall not be released/i)
  assert.equal(result.snapshot.windows.S.used, 1)
  assert.equal(f.feed.cachedText(identity), result.text)
})

test('native execution facts are a current category with inferred lanes and header cwd source limits', async () => {
  const f = fixture()
  let result = await f.feed.readForConsumption(identity)
  assert.doesNotMatch(result.text, /Native-observed executions/)
  f.current.nativeExecutions = [nativeExecution({ state: 'running', outcome: null, activity: 'running' })]
  result = await f.feed.readForConsumption(identity)
  assert.doesNotMatch(result.text, /Native-observed executions:|header cwd \/trees\/A/)
  assert.match(result.text, /Native execution lanes are inferred/)
  assert.match(result.text, /header cwd is a recorded source value, not proof of the effective initial directory/)
  assert.doesNotMatch(result.text, /worktree observed|exact initial cwd match|worktree=observed|initial cwd match/)
  assert.match(result.text, /not strong bindings or task-completion proof/)
  assert.doesNotMatch(result.text, /completed task|task completed/i)
  const view = JSON.parse(result.text.slice(result.text.indexOf(String.fromCharCode(10, 123)) + 1))
  assert.equal(view.nativeExecutions.total, 1)
  assert.equal(view.nativeExecutions.query.query.kind, 'native-execution')
  assert.equal(view.nativeExecutions.rows[0].outcome, null)
  assert.equal(view.nativeExecutions.rows[0].state, 'running')
  assert.equal(view.nativeExecutions.rows[0].headerCwd, '/trees/A')
  assert.equal(view.nativeExecutions.rows[0].worktree, undefined)
  assert.equal(view.nativeExecutions.rows[0].lane.source, 'inferred')
  f.current.nativeExecutions = [nativeExecution({ headerCwd: null })]
  result = await f.feed.readForConsumption(identity)
  assert.doesNotMatch(result.text, /header cwd \/trees\/A/)
  assert.doesNotMatch(result.text, /header cwd null/)
  f.current.nativeExecutions = []
  result = await f.feed.readForConsumption(identity)
  assert.doesNotMatch(result.text, /Native-observed executions/)
})
test('delegate guidance and ticket rejection appear only for trusted delegateRegistered true', async () => {
  const f = fixture()
  let result = await f.feed.readForConsumption(identity)
  assert.doesNotMatch(result.text, /mattpocock_delegate/)
  assert.match(result.text, /mattpocock_window reserve rejects an unregistered handle; the rejection names it\./)
  f.current.delegateRegistered = true
  result = await f.feed.readForConsumption(identity)
  assert.match(result.text, /Opt-in mattpocock_delegate is binding-first creation only/)
  assert.match(result.text, /not the default dispatch path/)
  assert.match(result.text, /accepted or its result is uncertain, do not create another child/)
  assert.match(result.text, /keep the existing child/)
  assert.match(result.text, /explicit mattpocock_assign/)
  assert.match(result.text, /mattpocock_window reserve rejects an unregistered handle, and an opted-in mattpocock_delegate does too; the rejection names it\./)
  f.current.delegateRegistered = false
  result = await f.feed.readForConsumption(identity)
  assert.doesNotMatch(result.text, /mattpocock_delegate/)
})
test('management OFF keeps recorded facts and source limits but adds no new managed action guidance', async () => {
  const f = fixture()
  f.current.nativeExecutions = [nativeExecution()]
  f.current.worktreeObservations = [worktreeObservation()]
  f.current.policy.extensionEnabled = false
  f.current.policy.configurationRevision++
  const result = await f.feed.readForConsumption(identity)
  const text = result.text
  assert.match(text, /Management feature is OFF/)
  assert.doesNotMatch(text, /Native-observed executions:/) // no fact rows repeated in notices
  assert.match(text, /A worktree observation lane is inferred from assignment\/binding at read time; cleaned\/notes are authored, and created-tree only proves that child created the tree/)
  assert.match(text, /A tree you detached but did not clean up still needs a disposition\./)
  assert.doesNotMatch(text, /Only prepare a tree with the host's create_worktree/)
  assert.doesNotMatch(text, /Ordinary lanes use native subagent/)
  assert.doesNotMatch(text, /Mark an observed tree cleaned/)
  assert.doesNotMatch(text, /mattpocock_delegate/)
  const view = JSON.parse(text.slice(text.indexOf(String.fromCharCode(10, 123)) + 1))
  assert.equal(view.records.tickets.total, 1)
  assert.equal(view.nativeExecutions.total, 1)
  assert.equal(view.nativeExecutions.rows[0].headerCwd, '/trees/A')
  assert.equal(view.worktreeObservations.total, 1)
  assert.equal(view.worktreeObservations.rows[0].lane.source, 'inferred')
})

test('decision usage guidance preserves raw flags, hidden obligations and retained conclusions without mutation', async () => {
  const f = fixture()
  const row = (decisionId, value) => ({ workflowId: 'old-flow', decisionId, revision: 1, value: { question: decisionId, status: 'custom', ...value }, history: [], view: { read: true, hidden: true } })
  f.current.records.decisions = [
    row('agent-pending', { pending: true, addressee: { kind: 'agent' } }),
    row('await-only', { pending: false, awaitingImplementation: true }),
    row('both', { pending: true, awaitingImplementation: true, addressee: { kind: 'user' } }),
    row('ordinary-closed', { pending: false, awaitingImplementation: false, result: 'Not automatically a user conclusion' }),
  ]
  Object.assign(f.current.records.summary, { pendingDecisionCount: 2, pendingUserDecisionCount: 1, awaitingImplementationCount: 2 })
  f.current.contextConclusions = [{ workflowId: 'old-flow', decisionId: 'retained-agent-conclusion', result: 'Explicitly included old conclusion', sourceRevision: 2, source: { author: { kind: 'agent', principalId: 'old-author', sessionId: 'old-agent' } } }]
  f.current.policy.display = Object.fromEntries(Object.keys(f.current.policy.display).map(key => [key, false]))
  const before = structuredClone(f.current)
  const result = await f.feed.readForConsumption(identity)
  const facts = JSON.parse(result.text.split('Current runtime facts (null means unavailable/unknown, not zero):')[1])
  assert.match(result.text, /awaitingImplementationCount: raw compatibility markers, not unfinished tasks/)
  assert.match(result.text, /Handoff is not completion/)
  assert.deepEqual(facts.records.decisions.rows.map(row => row.decisionId), ['both', 'agent-pending', 'await-only'])
  assert.equal(facts.records.summary.pendingUserDecisionCount, 1)
  assert.equal(facts.records.summary.pendingDecisionCount, 2)
  assert.equal(facts.records.summary.awaitingImplementationCount, 2)
  assert.equal(facts.contextConclusions.rows[0].result, 'Explicitly included old conclusion')
  assert.equal(facts.contextConclusions.rows[0].source.author.kind, 'agent')
  assert.deepEqual(f.current, before, 'guidance does not classify business outcomes or clear flags')
})

test('synchronous producer commit fence reads latest durable state without waiting for running child', async () => {
  const f = fixture()
  const persistence = deferred()
  const childEnd = deferred() // deliberately never settled or registered
  void childEnd
  const commit = persistence.promise.then(() => { f.current.windows.revision = 2; f.current.windows.S.used = 0; f.current.windows.S.available = 2 })
  f.port.trackCommit(identity.instrumentInstanceId, commit)
  const read = f.feed.readForConsumption(identity)
  await Promise.resolve()
  assert.equal(f.reads, 0)
  persistence.resolve()
  const result = await read
  assert.equal(result.snapshot.windows.revision, 2); assert.equal(result.snapshot.windows.S.used, 0)
  assert.equal(result.freshness, 'current')
  assert.deepEqual(Object.keys(f.port), ['trackCommit']); assert.equal(Object.isFrozen(f.port), true)
})
test('fixed frontier ignores other instances and commits registered after capture', async () => {
  const f = fixture({ timeoutMs: 30 })
  const relevant = deferred(), later = deferred(), unrelated = deferred()
  f.port.trackCommit('instance-B', unrelated.promise)
  f.port.trackCommit(identity.instrumentInstanceId, relevant.promise)
  const read = f.feed.readForConsumption(identity)
  f.port.trackCommit(identity.instrumentInstanceId, later.promise)
  relevant.resolve()
  const result = await read
  assert.equal(result.freshness, 'current'); assert.equal(f.reads, 1)
  later.resolve(); unrelated.resolve()
})
test('durability timeout preserves input and never cancels original commit', async () => {
  const f = fixture({ timeoutMs: 10 })
  const pending = deferred()
  f.port.trackCommit(identity.instrumentInstanceId, pending.promise)
  const native = { role: 'user', content: 'ordinary progress' }
  const { result, messages } = await consume(f.feed, [native])
  assert.equal(result.reason, 'consumption-timeout'); assert.equal(result.freshness, 'unavailable')
  assert.equal(messages[0], native); assert.match(messages[1].content, /state unknown/); assert.equal(f.reads, 0)
  pending.resolve()
  assert.equal((await f.feed.readForConsumption(identity)).freshness, 'current')
})
test('already failed and newly failing commits return unknown then permit latest-read recovery', async () => {
  const f = fixture()
  f.port.trackCommit(identity.instrumentInstanceId, Promise.reject(new Error('private implementation metadata')))
  await Promise.resolve(); await Promise.resolve()
  const result = await f.feed.readForConsumption(identity)
  assert.equal(result.reason, 'durability-commit-failed'); assert.equal(f.reads, 0)
  assert.doesNotMatch(result.text, /private implementation metadata/)
  assert.equal((await f.feed.readForConsumption(identity)).freshness, 'current')
  const failing = deferred()
  f.port.trackCommit(identity.instrumentInstanceId, failing.promise)
  const reading = f.feed.readForConsumption(identity); failing.reject('failure')
  assert.equal((await reading).reason, 'durability-commit-failed')
})
test('reader failure keeps one stale body, then recovery carries new obligations and current OFF policy', async () => {
  let fail = false, current = snapshot()
  const f = fixture({ readSnapshot: async () => { if (fail) throw Error('backend down'); return current } })
  const first = await f.feed.readForConsumption(identity)
  assert.equal(first.freshness, 'current'); assert.equal(f.feed.prepared(identity).fresh, true)
  fail = true
  const result = await f.feed.readForConsumption(identity)
  assert.equal(result.freshness, 'stale'); assert.equal(result.reason, 'snapshot-read-failed')
  assert.equal(result.snapshot, undefined); assert.equal(f.feed.cachedText(identity), null)
  assert.equal(f.feed.prepared(identity).fresh, false, 'degraded text is never fresh')
  assert.match(result.text, /^Instrument state stale: .*snapshot-read-failed/)
  assert.match(result.text, /Windows explicitly enabled/, 'the last verified facts stay readable')
  assert.equal(f.feed.cachedText(identity), null, 'stale text is not replayed as verified cache')
  const repeated = await f.feed.readForConsumption(identity)
  assert.equal(repeated.text, result.text, 'repeated failures do not stack stale headers')
  // A new obligation created while refresh fails is not smuggled into the old stale body.
  current.records.decisions.push({ workflowId: 'flow', decisionId: 'new-obligation', revision: 1,
    value: { question: 'New obligation', status: 'awaiting response', pending: true }, history: [], view: { read: false, hidden: false } })
  const stillStale = await f.feed.readForConsumption(identity)
  assert.equal(stillStale.text, result.text, 'new facts wait for a successful current read')
  assert.doesNotMatch(stillStale.text, /new-obligation/)
  fail = false
  const recovered = await f.feed.readForConsumption(identity)
  assert.equal(recovered.freshness, 'current'); assert.notEqual(recovered.text, null)
  assert.match(recovered.text, /new-obligation/)
  assert.doesNotMatch(recovered.text, /state stale/)
  // A later stale period reuses the newest verified body, not the old one.
  fail = true
  const staleAgain = await f.feed.readForConsumption(identity)
  assert.match(staleAgain.text, /^Instrument state stale:/)
  assert.match(staleAgain.text, /new-obligation/)
  // Management OFF replaces the old protocol on recovery, keeps recorded facts, adds no guidance.
  fail = false; current.policy.extensionEnabled = false; current.policy.configurationRevision++
  const off = await f.feed.readForConsumption(identity)
  assert.equal(off.freshness, 'current')
  assert.match(off.text, /Management feature is OFF/)
  assert.doesNotMatch(off.text, /Windows explicitly enabled|Only prepare a tree with the host's create_worktree|Mark an observed tree cleaned/)
  assert.match(off.text, /new-obligation/)
})
test('a change past the briefed array head is detected, not served as unchanged', async () => {
  const f = fixture()
  const head = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8']
  f.current.records.scope = { kind: 'assigned', workflowId: 'flow', ticketIds: head }
  const first = await f.feed.readForConsumption(identity)
  assert.equal(first.freshness, 'current')
  // Only the ninth entry changes: it is outside the eight shown rows and the length is unchanged.
  f.current.records.scope = { kind: 'assigned', workflowId: 'flow', ticketIds: [...head, 't9'] }
  const second = await f.feed.readForConsumption(identity)
  assert.notEqual(second.text, null, 'the omitted tail is covered by the array digest')
  assert.match(second.text, /tailSignature/)
})

test('capability recovery uses current read rather than uncaptured history', async () => {
  const f = fixture()
  const result = await f.feed.readForConsumption(identity)
  const view = JSON.parse(result.text.slice(result.text.indexOf(String.fromCharCode(10, 123)) + 1))
  assert.equal(view.capabilities.query.tool, 'mattpocock_record')
  assert.equal(view.capabilities.query.query.kind, 'capability')
  assert.equal(view.health.coverage, undefined) // known-empty, no dead locator
  assert.deepEqual(view.health, [])
  assert.equal(view.records.workflows.query.query.kind, 'workflow')
})
test('stuck reader is bounded and receives timeout abort without late cache publication', async () => {
  const blocked = deferred()
  let readerSignal
  const f = fixture({ timeoutMs: 10, readSnapshot: async (_identity, signal) => { readerSignal = signal; return blocked.promise } })
  const result = await f.feed.readForConsumption(identity)
  assert.equal(result.reason, 'consumption-timeout'); assert.equal(readerSignal.aborted, true)
  blocked.resolve(snapshot()); await Promise.resolve(); await Promise.resolve()
  assert.equal(f.feed.cachedText(identity), null)
})
test('caller abort propagates the exact reason before/during durability and snapshot reads', async () => {
  const reason = { reason: 'user cancelled original native input' }
  const pre = new AbortController(); pre.abort(reason)
  const f = fixture()
  await assert.rejects(f.feed.readForConsumption(identity, pre.signal), error => error === reason)
  assert.equal(f.reads, 0)
  const pending = deferred(); f.port.trackCommit(identity.instrumentInstanceId, pending.promise)
  const controller = new AbortController()
  const result = f.feed.readForConsumption(identity, controller.signal); controller.abort(reason)
  await assert.rejects(result, error => error === reason); pending.resolve()
  let readerSignal
  const reading = deferred(), entered = deferred()
  const other = fixture({ readSnapshot: async (_identity, signal) => { readerSignal = signal; entered.resolve(); return reading.promise } })
  const caller = new AbortController(), read = other.feed.readForConsumption(identity, caller.signal)
  await entered.promise; caller.abort(reason)
  await assert.rejects(read, error => error === reason); assert.equal(readerSignal.reason, reason)
  reading.resolve(snapshot()); assert.equal(other.feed.cachedText(identity), null)
})
test('identity checks reject cross-session, cross-instance, cross-owner and nested ledger leakage', async () => {
  const mutations = [s => { s.sessionId = 'other' }, s => { s.instance.instrumentInstanceId = 'instance-B' },
    s => { s.instance.ownerSessionId = 'other' }, s => { s.records.instance.ownerSessionId = 'other' },
    s => { s.windows.instance.instrumentInstanceId = 'instance-B' }, s => { s.policy.controlWorkspaceId = 'other-workspace' },
    s => { const r = resource(); r.ownerInstanceId = 'instance-B'; s.resources = [r] }]
  for (const mutate of mutations) {
    const f = fixture(); mutate(f.current)
    const result = await f.feed.readForConsumption(identity)
    assert.equal(result.reason, 'identity-mismatch'); assert.equal(result.snapshot, undefined); assert.equal(f.feed.cachedText(identity), null)
    assert.doesNotMatch(result.text, /instance-B|other-workspace/)
  }
  const f = fixture(), r = resource(); r.ownerInstanceId = 'instance-B'
  r.references = [{ bindingId: 'authorized-shared', instrumentInstanceId: identity.instrumentInstanceId, sessionId: identity.sessionId, state: 'idle', reusable: true, entryOpen: true }]
  f.current.resources = [r]
  assert.equal((await f.feed.readForConsumption(identity)).freshness, 'current')
})
test('cache is principal/session/instance/owner keyed and cannot cross owners', async () => {
  const f = fixture(); await f.feed.readForConsumption(identity)
  for (const key of ['principalId', 'sessionId', 'instrumentInstanceId', 'ownerSessionId']) assert.equal(f.feed.cachedText({ ...identity, [key]: 'other' }), null)
})
test('dedup ignores viewer-only revisions, view metadata and read timestamps', async () => {
  const f = fixture(); f.current.resources = [resource()]
  await f.feed.readForConsumption(identity)
  f.current.records.revision++; f.current.records.viewerRevision++
  f.current.records.decisions[0].view = { read: true, hidden: true }
  f.current.records.changes.push({ command: { action: 'set-decision-view' } })
  f.current.resources[0].actualCanRetire.checkedAt++
  f.current.resources[0].actualCanRetire.ledgerRevision++
  const result = await f.feed.readForConsumption(identity)
  assert.equal(result.text, null); assert.equal(result.freshness, 'current'); assert.equal(f.reads, 2)
})
test('history-only business/window revisions do not refresh; current source and config revisions do', async () => {
  const f = fixture(); await f.feed.readForConsumption(identity)
  f.current.records.businessRevision++; f.current.windows.revision++
  assert.equal((await f.feed.readForConsumption(identity)).text, null)
  f.current.records.tickets[0].revision++
  assert.notEqual((await f.feed.readForConsumption(identity)).text, null)
  f.current.policy.configurationRevision++
  assert.notEqual((await f.feed.readForConsumption(identity)).text, null)
})
test('physical facts changes refresh below identical ledger/config watermarks', async () => {
  const f = fixture(); f.current.resources = [resource()]
  await f.feed.readForConsumption(identity)
  f.current.resources[0].actualCanRetire.facts.digest = 'physical-B'
  assert.notEqual((await f.feed.readForConsumption(identity)).text, null)
  f.current.resources[0].actualCanRetire.facts.untracked = ['new-file'] // even a defective adapter's unchanged digest cannot mask facts
  const physicalChange = await f.feed.readForConsumption(identity)
  assert.notEqual(physicalChange.text, null, 'the whole physical fact, not just its adapter digest, invalidates')
  assert.match(physicalChange.text, /new-file/)
  const observation = consumptionFacts(physicalChange).resources.rows[0]
  assert.equal(observation.observation.factsDigest, 'physical-B')
  assert.equal(observation.query.query.kind, 'resource')
  assert.equal(observation.query.query.recordId, 'tree-A')
  f.current.resources[0].retireRequest = { kind: 'remove-clean', branch: 'keep', authorId: 'parent-agent' }
  assert.equal((await f.feed.readForConsumption(identity)).text, null)
  assert.doesNotMatch(f.feed.cachedText(identity), /retireRequest|actualCanRetire|nativeColdResumeClosed/)
})
test('display-off preserves consumption and obligations; feature-off replaces old protocol', async () => {
  const f = fixture(); await f.feed.readForConsumption(identity)
  for (const key of Object.keys(f.current.policy.display)) f.current.policy.display[key] = false
  const unchanged = await f.feed.readForConsumption(identity)
  assert.equal(unchanged.text, null); assert.match(f.feed.cachedText(identity), /old-obligation/)
  f.current.records.businessRevision++
  assert.equal((await f.feed.readForConsumption(identity)).text, null)
  assert.match(f.feed.cachedText(identity), /old-obligation/)
  f.current.policy.configurationRevision++; f.current.policy.extensionEnabled = false
  const disabled = await f.feed.readForConsumption(identity)
  assert.match(disabled.text, /Management feature is OFF/); assert.doesNotMatch(disabled.text, /Windows explicitly enabled/)
  assert.match(disabled.text, /old-obligation/); assert.equal(disabled.snapshot.windows.S.used, 1)
  assert.equal(f.feed.cachedText(identity), disabled.text)
  f.current.policy.extensionEnabled = true; f.current.policy.configurationRevision++
  f.current.policy.features.windows = { requested: false, status: 'disabled', reason: 'feature-disabled' }
  assert.match((await f.feed.readForConsumption(identity)).text, /Windows are OFF/)
})
test('null scopes/capacity/physical facts stay unknown, degraded health is not fresh', async () => {
  const f = fixture(); f.current.records = null; f.current.windows = null
  const r = resource(); r.actualCanRetire.facts = null; r.actualCanRetire.allowed = false; r.actualCanRetire.reasons = ['physical-observation-unavailable']
  f.current.resources = [r]; f.current.health = [{ scope: 'resource', status: 'unknown', reason: 'cannot inspect' }]
  const result = await f.feed.readForConsumption(identity)
  assert.equal(result.freshness, 'stale'); assert.equal(result.reason, 'snapshot-health-degraded')
  assert.match(result.text, /"records":null/); assert.match(result.text, /"windows":null/); assert.equal(JSON.parse(result.text.split('Current runtime facts (null means unavailable/unknown, not zero):\n')[1]).resources.rows[0].observation.facts, null)
  assert.doesNotMatch(result.text, /"totalTickets":0/)
})
test('bounded options reject unbounded values and overflow stays unknown until untracked durability settles', async () => {
  for (const timeoutMs of [0, -1, 1.1, Infinity, 10001]) assert.throws(() => fixture({ timeoutMs }), RangeError)
  for (const maxPendingCommits of [0, -1, 65537]) assert.throws(() => fixture({ maxPendingCommits }), RangeError)
  const f = fixture({ maxPendingCommits: 1 }), first = deferred(), excess = deferred()
  f.port.trackCommit(identity.instrumentInstanceId, first.promise); f.port.trackCommit(identity.instrumentInstanceId, excess.promise)
  first.resolve()
  assert.equal((await f.feed.readForConsumption(identity)).reason, 'commit-frontier-overflow')
  assert.equal((await f.feed.readForConsumption(identity)).reason, 'commit-frontier-overflow')
  excess.reject('observed but unknown persistence'); await Promise.resolve()
  assert.equal((await f.feed.readForConsumption(identity)).reason, 'commit-frontier-overflow')
  assert.equal((await f.feed.readForConsumption(identity)).freshness, 'current')
})
test('late older reads do not replace a newer feature-off projection', async () => {
  const old = deferred(); let calls = 0
  const f = fixture({ readSnapshot: async () => { if (++calls === 1) return old.promise; const s = snapshot(); s.policy.extensionEnabled = false; s.policy.configurationRevision = 2; return s } })
  const early = f.feed.readForConsumption(identity)
  await Promise.resolve(); await Promise.resolve()
  const latest = await f.feed.readForConsumption(identity)
  old.resolve(snapshot())
  assert.equal((await early).reason, 'superseded-read')
  assert.equal(f.feed.cachedText(identity), latest.text); assert.match(latest.text, /Management feature is OFF/)
})
test('source semantic check uses repository strict compiler options without emitting', () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const config = ts.readConfigFile(root + 'tsconfig.json', ts.sys.readFile)
  assert.equal(config.error, undefined)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, { noEmit: true })
  const program = ts.createProgram([fileURLToPath(sourceURL)], parsed.options)
  const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => !d.file || d.file.fileName === fileURLToPath(sourceURL))
  assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [])
})

test('both gates report their own off state in the injected protocol', async () => {
  const workspaceClosed = fixture()
  workspaceClosed.current = { ...workspaceClosed.current, policy: { ...workspaceClosed.current.policy, workspaceEnabled: false } }
  const workspaceText = (await workspaceClosed.feed.readForConsumption(identity)).text
  assert.match(workspaceText, /Management feature is OFF for this workspace/)
  assert.doesNotMatch(workspaceText, /Management feature is OFF: existing records/)
  assert.doesNotMatch(workspaceText, /Only prepare a tree with the host's create_worktree/)
  assert.doesNotMatch(workspaceText, /Mark an observed tree cleaned/)
  assert.match(workspaceText, /worktree observation lane is inferred/)

  const globalClosed = fixture()
  globalClosed.current = { ...globalClosed.current, policy: { ...globalClosed.current.policy, extensionEnabled: false, workspaceEnabled: true } }
  const globalText = (await globalClosed.feed.readForConsumption(identity)).text
  assert.match(globalText, /Management feature is OFF: existing records/)
  assert.doesNotMatch(globalText, /OFF for this workspace/)
  assert.doesNotMatch(globalText, /Only prepare a tree with the host's create_worktree/)
  assert.doesNotMatch(globalText, /Mark an observed tree cleaned/)
  assert.match(globalText, /A worktree observation lane is inferred/)

  const gateUnknown = fixture()
  const unknownText = (await gateUnknown.feed.readForConsumption(identity)).text
  assert.doesNotMatch(unknownText, /Management feature is OFF/)
  assert.match(unknownText, /Only prepare a tree with the host's create_worktree when the task requires write isolation/)
  assert.match(unknownText, /Mark an observed tree cleaned/)
})
