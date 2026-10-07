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
      windows: { ticketWindowSize: 2, runningSubagentLimit: 2 },
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
  assert.match(result.text, /Register pending decisions when you judge them necessary/)
  assert.match(result.text, /mattpocock_record/); assert.match(result.text, /mattpocock_execute/); assert.match(result.text, /mattpocock_window/)
  assert.match(result.text, /explicit T reserve\/release\/reacquire/); assert.match(result.text, /T and S are this session's configured limits/)
  assert.match(result.text, /Ticketless work has no T requirement/)
  assert.match(result.text, /Partially complete/); assert.match(result.text, /child-author/); assert.match(result.text, /old-obligation/)
  assert.match(result.text, /native-admission/); assert.match(result.text, /unsupported/)
  assert.doesNotMatch(result.text, /candidate|development version|unvalidated|not model-validated|未验证|开发版本/i)
  assert.doesNotMatch(result.text, /advisory|admission gate|does not prohibit|approval gate|does not require approval|no forced cancellation|without requiring all work/i)
  assert.doesNotMatch(result.text, /"capability":/)
  assert.match(result.text, /Ticket discipline: T slots are held and worked in parallel up to the configured T limit/)
  assert.doesNotMatch(result.text, /work one held ticket to convergence before admitting another|one at a time/i)
  assert.match(result.text, /should not be released or reacquired merely to make room for a different ticket/)
  assert.doesNotMatch(result.text, /never split one ticket|shall not be released/i)
  assert.equal(result.snapshot.windows.S.used, 1)
  assert.equal(f.feed.cachedText(identity), result.text)
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
test('reader failure keeps the last verified snapshot as explicitly stale text, never as current', async () => {
  let fail = false
  const f = fixture({ readSnapshot: async () => { if (fail) throw Error('backend down'); return snapshot() } })
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
  fail = false
  const recovered = await f.feed.readForConsumption(identity)
  assert.equal(recovered.freshness, 'current'); assert.notEqual(recovered.text, null)
  assert.doesNotMatch(recovered.text, /state stale/)
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

test('categories without captured history carry no dead query locator', async () => {
  const f = fixture()
  const result = await f.feed.readForConsumption(identity)
  const view = JSON.parse(result.text.slice(result.text.indexOf(String.fromCharCode(10, 123)) + 1))
  assert.equal(view.capabilities.query, undefined)
  assert.equal(view.health.query, undefined)
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
  assert.match((await f.feed.readForConsumption(identity)).text, /new-file/)
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
  assert.match(result.text, /"records":null/); assert.match(result.text, /"windows":null/); assert.match(result.text, /"facts":null/)
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

  const globalClosed = fixture()
  globalClosed.current = { ...globalClosed.current, policy: { ...globalClosed.current.policy, extensionEnabled: false, workspaceEnabled: true } }
  const globalText = (await globalClosed.feed.readForConsumption(identity)).text
  assert.match(globalText, /Management feature is OFF: existing records/)
  assert.doesNotMatch(globalText, /OFF for this workspace/)

  const gateUnknown = fixture()
  const unknownText = (await gateUnknown.feed.readForConsumption(identity)).text
  assert.doesNotMatch(unknownText, /Management feature is OFF/)
})
