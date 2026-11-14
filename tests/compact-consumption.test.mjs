import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Accepted public seam: complete owned InstrumentConsumption text, not private caches.
// The source-only loader emits no artifacts or shared dependency changes.
const load = source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
}).outputText).toString('base64'))
const { InstrumentConsumption } = await load(readFileSync(new URL('../src/controls/consumption.ts', import.meta.url), 'utf8'))
const identity = { principalId: 'agent:root', sessionId: 'root', instrumentInstanceId: 'I', ownerSessionId: 'root' }
const instance = { instrumentInstanceId: 'I', ownerSessionId: 'root', controlWorkspaceId: 'W' }
const marker = 'Current runtime facts (null means unavailable/unknown, not zero):\n'
const parse = text => JSON.parse(text.split(marker)[1])
function fixture(on = false) {
  return { sessionId: 'root', instance, policy: {
    controlWorkspaceId: 'W', configurationRevision: 1, extensionEnabled: on, workspaceEnabled: on, workspaceVerified: true,
    features: Object.fromEntries(['binding', 'lifecycle', 'windows', 'ticketProgress', 'pendingDecisions'].map(key => [key,
      { status: on ? 'configured' : 'disabled', requested: on, reason: on ? null : 'workspace-disabled' }])),
    windows: { ticketWindowSize: 2, runningSubagentLimit: 3 }, pendingDecisions: { interactionMode: 'native-question' },
    display: { header: true }, sources: { 'display.header': 'global', 'workspace.enabled': 'workspace' },
  }, records: { instance, revision: 1, businessRevision: 1, viewerRevision: 0, scope: { kind: 'coordinator' },
    capabilities: { taskReferences: true, decisionRecommendationAdoption: true },
    workflows: [], tickets: [], taskReferences: [], decisions: [], summary: {
      countingScope: 'instance', totalTickets: 0, totalTaskReferences: 0, statusCounts: [], pendingDecisionCount: 0,
      pendingUserDecisionCount: 0, pendingForPrincipalCount: 0, awaitingImplementationCount: 0,
    } }, windows: { instance, configurationRevision: 1, status: 'ready', reason: null, scope: { kind: 'coordinator' },
      runtimeKnowledge: { known: true, runtimeId: 'R', reason: null }, tickets: [], executions: [],
      T: { capacity: 2, used: 0, available: 2 }, S: { capacity: 3, used: 0, available: 3, countKnown: true,
        byState: { running: 0, released: 0 }, depth: { direct: 0, deeper: 0, unknown: 0, levels: {} } } },
    resources: [], contextConclusions: [], worktreeBindings: [], worktreeObservations: [], nativeStops: [], nativeExecutions: [],
    capabilities: [{ key: 'nativeLifecycleObservation', status: 'supported', reason: null }],
    health: [{ scope: 'native-executions', status: 'current', reason: null }],
  }
}
const feedFor = (snapshot, Class = InstrumentConsumption) => new Class({ readSnapshot: async () => snapshot })

function execution(id, over = {}) {
  return { executionId: id, sessionId: id, parentSessionId: 'root', instrumentInstanceId: 'I', provider: 'spawn',
    runId: 'run-' + id, headerCwd: '/tree/' + id, state: 'ended', outcome: 'completed',
    observed: 'subagent/end: completed', startedAt: 1, endedAt: 2, recordedAt: 2, activity: 'idle', lane: null, ...over }
}
test('ordinary ended rows become counts while live, abnormal, unknown and linked obligations take priority', async () => {
  const snapshot = fixture(true)
  snapshot.nativeExecutions = Array.from({ length: 8 }, (_, i) => execution('normal-' + i))
  const feed = feedFor(snapshot)
  let text = (await feed.readForConsumption(identity)).text
  let facts = parse(text)
  assert.equal(facts.nativeExecutions.ordinaryEnded, 8)
  assert.equal(facts.nativeExecutions.total, 8)
  assert.deepEqual(facts.nativeExecutions.rows, [])
  assert.equal(facts.nativeExecutions.more, true)
  assert.equal(facts.nativeExecutions.query.tool, 'mattpocock_record')
  assert.doesNotMatch(text.split('Current runtime notices:')[1].split(marker)[0], /normal-0|Native-observed executions/)
  snapshot.nativeExecutions[7].runId = 'same-count-new-run'
  const changed = await feed.readForConsumption(identity)
  assert.notEqual(changed.text, null, 'omitted ordinary rows still invalidate deduplication')
  snapshot.nativeExecutions.push(execution('live', { activity: 'running', state: 'running', outcome: null }),
    execution('failed', { outcome: 'error' }), execution('unknown', { state: 'disposed', outcome: null }))
  text = (await feed.readForConsumption(identity)).text
  facts = parse(text)
  assert.equal(facts.nativeExecutions.ordinaryEnded, 8)
  assert.equal(facts.nativeExecutions.rows[0].sessionId, 'live')
  assert.ok(facts.nativeExecutions.rows.some(row => row.sessionId === 'failed'))
  // Even an honest budget omission retains the exact current query and whole-source signature.
  assert.equal(facts.nativeExecutions.total, 11)
  snapshot.nativeExecutions = [execution('linked', { lane: { workflowId: 'F', ticketIds: ['T'], task: null, source: 'inferred' } })]
  snapshot.pendingRelease = [{ workflowId: 'F', localTicketId: 'T', generation: 4, label: null }]
  facts = parse((await feed.readForConsumption(identity)).text)
  assert.equal(facts.nativeExecutions.ordinaryEnded, 0)
  assert.equal(facts.nativeExecutions.rows[0].sessionId, 'linked')
  assert.equal(facts.pendingRelease.rows[0].generation, 4)
  snapshot.pendingRelease = []
  snapshot.records.decisions = [decision('pending-linked')]
  facts = parse((await feed.readForConsumption(identity)).text)
  assert.equal(facts.nativeExecutions.ordinaryEnded, 0, 'same workflow unresolved decision retains execution visibility')
  snapshot.records.decisions = []
  snapshot.nativeExecutions = [execution('unknown-only', { outcome: null, state: 'disposed' })]
  facts = parse((await feed.readForConsumption(identity)).text)
  assert.equal(facts.nativeExecutions.rows[0].outcome, null)
  assert.equal(facts.nativeExecutions.ordinaryEnded, 0)
})

function tree(over = {}) {
  return { observationId: 'tree-1', revision: 1, creatorActivity: 'idle', lane: null, source: 'program', recordedAt: 1,
    value: { creatorSessionId: 'normal-0', path: '/trees/one', branch: 'one', repositoryRoot: '/repo',
      check: { state: 'verified', checkedAt: 5, diagnostic: 'diagnostic-detail', facts: {
        gitCommonDir: '/repo/.git', gitDir: '/repo/.git/worktrees/one', branchRef: 'refs/heads/one', branchOid: 'a', headOid: 'a' } },
      business: { state: 'open' } }, ...over }
}
test('downshifted Git details and configuration sources remain recoverable and invalidate even same-digest tails', async () => {
  const snapshot = fixture()
  snapshot.worktreeObservations = [tree()]
  const feed = feedFor(snapshot)
  const first = await feed.readForConsumption(identity)
  const facts = parse(first.text)
  const row = facts.worktreeObservations.rows[0]
  assert.equal(row.check.facts, undefined)
  assert.equal(row.check.state, 'verified')
  assert.equal(row.query.query.kind, 'worktree-observation')
  assert.equal(row.query.query.recordId, 'tree-1')
  snapshot.worktreeObservations[0].value.check.facts.branchOid = 'b'
  assert.notEqual((await feed.readForConsumption(identity)).text, null)
  snapshot.policy.sources['workspace.enabled'] = 'global'
  assert.notEqual((await feed.readForConsumption(identity)).text, null)
  assert.equal((await feed.readForConsumption(identity)).text, null)
})

const decision = (id, over = {}) => ({ workflowId: 'F', decisionId: id, revision: 3,
  value: { question: 'Qualified input?', status: 'partial', pending: true, awaitingImplementation: true,
    result: { answer: '只授权fixture', source: 'native:user-message', included: ['isolated'], excluded: ['install', 'restart'] }, ...over },
  provenance: { author: { kind: 'agent', principalId: 'agent:root', sessionId: 'root' }, references: ['spec#scope'], recordedAt: 4 } })

test('OFF retains old result constraints, pending release and trees; missing coverage is not empty', async () => {
  const snapshot = fixture()
  snapshot.records.decisions = [decision('old')]
  snapshot.records.summary.pendingDecisionCount = 1
  snapshot.records.summary.awaitingImplementationCount = 1
  snapshot.pendingRelease = [{ workflowId: 'F', localTicketId: 'T', generation: 2, label: '交付报告' }]
  snapshot.worktreeObservations = [tree()]
  snapshot.nativeStops = [{ sessionId: 'stopped', turn: 2, outcome: 'unobservable', lane: null, evidence: null }]
  const text = (await feedFor(snapshot).readForConsumption(identity)).text
  const facts = parse(text)
  assert.equal(facts.records.decisions.rows[0].decisionId, 'old')
  assert.deepEqual(facts.records.decisions.rows[0].value.result.excluded, ['install', 'restart'])
  assert.equal(facts.records.decisions.rows[0].value.awaitingImplementation, true)
  assert.equal(facts.pendingRelease.rows[0].generation, 2)
  assert.equal(facts.worktreeObservations.counts.open, 1)
  assert.equal(facts.nativeStops.rows[0].outcome, 'unobservable')
  const notices = text.split('Current runtime notices:')[1].split(marker)[0]
  assert.doesNotMatch(notices, /stopped|交付报告/)
  assert.match(notices, /review nativeStops/)
  delete snapshot.nativeExecutions
  delete snapshot.worktreeObservations
  const missing = parse((await feedFor(snapshot).readForConsumption(identity)).text)
  assert.equal(missing.nativeExecutions.coverage, 'not-recorded')
  assert.equal(missing.worktreeObservations.coverage, 'not-recorded')
})

test('frozen same fixtures measure baseline 8ff0d7e and candidate protocol/notices/JSON bytes and characters', async t => {
  const { execFileSync } = await import('node:child_process')
  const baselineSource = execFileSync('git', ['show', '8ff0d7e8f4bc1fe72ff3a7327e907677c0fba8c9:src/controls/consumption.ts'], { encoding: 'utf8' })
  const Baseline = (await load(baselineSource)).InstrumentConsumption
  const cases = new Map([['OFF-empty', fixture()], ['OFF-old-obligations', fixture()], ['ON-full', fixture(true)],
    ['eight-normal-ended', fixture()], ['live-abnormal', fixture(true)], ['long-ID-body', fixture(true)], ['assigned-child', fixture(true)]])
  cases.get('OFF-old-obligations').records.decisions = [decision('old')]
  cases.get('OFF-old-obligations').worktreeObservations = [tree()]
  const full = cases.get('ON-full')
  full.records.workflows = [{ workflowId: 'F', revision: 2, value: { title: 'Task', axes: [] }, provenance: { author: { kind: 'agent', principalId: 'root' }, references: [], recordedAt: 1 } }]
  full.records.tickets = [{ workflowId: 'F', localTicketId: 'T', revision: 2, value: { title: 'Task', statuses: {} }, provenance: { author: { kind: 'agent', principalId: 'root' }, references: [], recordedAt: 1 } }]
  full.records.decisions = [decision('pending')]
  full.pendingRelease = [{ workflowId: 'F', localTicketId: 'T', generation: 2, label: 'Partial' }]
  full.nativeExecutions = [execution('live', { state: 'running', outcome: null, activity: 'running' })]
  full.nativeStops = [{ sessionId: 'failed', turn: 2, outcome: 'error', cancelCause: null, diagnostic: 'Synthetic error', lane: null, evidence: null }]
  full.worktreeObservations = [tree()]
  cases.get('eight-normal-ended').nativeExecutions = Array.from({ length: 8 }, (_, i) => execution('normal-' + i))
  cases.get('live-abnormal').nativeExecutions = [execution('live', { state: 'running', outcome: null, activity: 'running' }), execution('abnormal', { outcome: 'error' })]
  cases.get('long-ID-body').records.decisions = [decision('long-'.repeat(90), { question: '长正文'.repeat(1000) })]
  const child = cases.get('assigned-child')
  child.records.summary.countingScope = 'assignment'
  child.sessionId = 'child'
  child.records.scope = { kind: 'assigned', workflowId: null, ticketIds: [] }
  child.windows.scope = child.records.scope
  delete child.nativeExecutions
  delete child.worktreeObservations
  child.health.push({ scope: 'native-executions', status: 'restricted', reason: 'coordinator-only' },
    { scope: 'worktree-observations', status: 'restricted', reason: 'coordinator-only' })
  const size = value => ({ bytes: Buffer.byteLength(value), chars: value.length })
  const parts = text => {
    const notices = text.indexOf('Current runtime notices:')
    const facts = text.indexOf(marker)
    return { total: size(text), protocol: size(text.slice(0, notices)), notices: size(text.slice(notices, facts)), facts: size(text.slice(facts)) }
  }
  for (const [name, snapshot] of cases) {
    Object.assign(snapshot.records.summary, { totalTickets: snapshot.records.tickets.length,
      pendingDecisionCount: snapshot.records.decisions.filter(row => row.value.pending).length,
      awaitingImplementationCount: snapshot.records.decisions.filter(row => row.value.awaitingImplementation).length })
    const live = (snapshot.nativeExecutions ?? []).filter(row => row.activity === 'running').length
    Object.assign(snapshot.windows.S, { used: live, available: 3 - live, byState: { running: live, released: 0 },
      depth: { direct: live, deeper: 0, unknown: 0, levels: live ? { 1: live } : {} } })
    const who = snapshot.sessionId === 'root' ? identity : { ...identity, sessionId: 'child' }
    const frozen = structuredClone(snapshot)
    const oldText = (await feedFor(frozen, Baseline).readForConsumption(who)).text
    const newText = (await feedFor(frozen).readForConsumption(who)).text
    const baseline = parts(oldText), candidate = parts(newText)
    assert.deepEqual(frozen, snapshot, 'formatter must never mutate a source')
    assert.ok(candidate.total.bytes < baseline.total.bytes, name + ' should reduce this same fixture')
    if (name === 'assigned-child') assert.doesNotMatch(newText, /"tool":"mattpocock_history"/)
    t.diagnostic(JSON.stringify({ fixture: name, baselineCommit: '8ff0d7e8f4bc1fe72ff3a7327e907677c0fba8c9', baseline, candidate }))
  }
})

test('OFF known-empty categories share [] without confusing restricted or unknown coverage', async () => {
  const snapshot = fixture()
  const text = (await feedFor(snapshot).readForConsumption(identity)).text
  const facts = parse(text)
  assert.deepEqual(facts.records.decisions, [])
  assert.deepEqual(facts.nativeExecutions, [])
  assert.deepEqual(facts.worktreeObservations, [])
  assert.match(text, /\[\] means known empty/)
  assert.match(text, /OFF.*no new|OFF.*do not initiate/)
  assert.equal(facts.policy.sources, undefined)
  assert.deepEqual(facts.policy.query, { tool: 'mattpocock_record', action: 'read' })
  snapshot.health.push({ scope: 'resources', status: 'restricted', reason: 'coordinator-only' })
  const restricted = parse((await feedFor(snapshot).readForConsumption(identity)).text)
  assert.equal(restricted.resources.coverage, 'restricted')
  snapshot.health[1] = { scope: 'resources', status: 'unknown', reason: 'read failed' }
  assert.equal(parse((await feedFor(snapshot).readForConsumption(identity)).text).resources.coverage, 'unknown')
})
