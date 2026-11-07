import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, fixture, core, operator, caller, policy, signal } from './fixtures/runtime-host.mjs'

const { InstrumentConsumption } = await import('../src/controls/consumption.ts')
const identity = { principalId: 'agent:root', sessionId: 'root', instrumentInstanceId: 'I', ownerSessionId: 'root' }
const instance = { instrumentInstanceId: 'I', ownerSessionId: 'root', controlWorkspaceId: 'W' }
const factsMarker = 'Current runtime facts (null means unavailable/unknown, not zero):\n'
function snapshot() {
  return { sessionId: 'root', instance, policy: { configurationRevision: 1, controlWorkspaceId: 'W', extensionEnabled: true,
    workspaceEnabled: true, workspaceVerified: true, pendingDecisions: { interactionMode: 'native-question' }, sources: {},
    features: Object.fromEntries(['binding', 'lifecycle', 'windows', 'ticketProgress', 'pendingDecisions'].map(key => [key, { requested: true, status: 'configured', reason: null }])),
    windows: { ticketWindowSize: 2, runningSubagentLimit: 2 } }, records: null, windows: null,
    pendingRelease: [], resources: [], capabilities: [], health: [] }
}
function consumption() {
  let current = snapshot()
  const feed = new InstrumentConsumption({ readSnapshot: async () => current })
  return { feed, get current() { return current }, set current(value) { current = value }, read: () => feed.readForConsumption(identity) }
}

test('pending release alone is delivered on addition and clearing through the consumption interface', async () => {
  const f = consumption()
  const empty = await f.read()
  assert.equal(empty.freshness, 'current')
  f.current = { ...f.current, pendingRelease: [{ workflowId: 'flow', localTicketId: 'A', generation: 1, label: 'Delivered' }] }
  const added = await f.read()
  assert.equal(typeof added.text, 'string', 'facts-only equality must not consume a new release obligation')
  assert.match(added.text, /T pending release: A/)
  assert.equal((await f.read()).text, null)
  f.current = { ...f.current, pendingRelease: [] }
  const cleared = await f.read()
  assert.equal(typeof cleared.text, 'string', 'removing the last release notice must also be delivered')
  assert.doesNotMatch(cleared.text, /T pending release:/)
  assert.equal(cleared.text, empty.text)
  assert.equal((await f.read()).text, null)
  assert.equal(JSON.parse(cleared.text.split(factsMarker)[1]).sessionId, 'root')
})

const noticesMarker = 'Current runtime notices:\n'
const nativeExecution = (sessionId, outcome) => ({ executionId: sessionId, sessionId, parentSessionId: 'root', instrumentInstanceId: 'I',
  provider: 'spawn', runId: 'run-1', headerCwd: '/fixture', state: 'ended', outcome, observed: 'subagent/end',
  startedAt: 1, endedAt: 2, recordedAt: 2, activity: 'idle', lane: null })

test('ordinary native changes retain the complete policy guidance prefix before notices and final facts JSON', async () => {
  const f = consumption()
  const first = await f.read()
  assert.ok(first.text.includes(noticesMarker), 'the policy guidance and current notices have a discoverable partition')
  const prefix = first.text.split(noticesMarker)[0]
  assert.match(prefix, /Windows explicitly enabled/)
  assert.match(prefix, /Work-in-progress discipline/)
  for (const row of [nativeExecution('child-A', 'completed'), nativeExecution('child-B', 'error')]) {
    f.current = { ...f.current, nativeExecutions: [row], pendingRelease: [{ workflowId: 'flow', localTicketId: row.sessionId, generation: 1, label: null }] }
    const result = await f.read()
    assert.equal(result.text.split(noticesMarker)[0], prefix)
    const tail = result.text.split(noticesMarker)[1]
    assert.match(tail, /Native-observed executions:/)
    assert.match(tail, /T pending release:/)
    assert.equal(JSON.parse(result.text.split(factsMarker)[1]).nativeExecutions.rows[0].sessionId, row.sessionId)
    assert.ok(tail.indexOf('Native-observed executions:') < tail.indexOf(factsMarker))
    assert.ok(result.text.length <= 24000)
  }
  f.current = { ...f.current, nativeExecutions: [], pendingRelease: [] }
  const cleared = await f.read()
  assert.equal(cleared.text.split(noticesMarker)[0], prefix)
  assert.doesNotMatch(cleared.text, /Native-observed executions:|T pending release:/)
})

const { RefreshGate } = await import('../src/controls/refresh-gate.ts')

test('default TTL observes monotonic elapsed independently of epoch wall jumps', t => {
  let elapsed = 1000, wall = 1_000_000
  t.mock.method(performance, 'now', () => elapsed)
  t.mock.method(Date, 'now', () => wall)
  const gate = new RefreshGate(2000)
  gate.record('root', undefined, 'I')
  wall += 1_000_000
  assert.equal(gate.shouldRefresh('root', 'I'), false, 'a wall jump is not elapsed time')
  wall -= 2_000_000
  elapsed += 1999
  assert.equal(gate.shouldRefresh('root', 'I'), false)
  elapsed++
  assert.equal(gate.shouldRefresh('root', 'I'), true, 'wall rollback cannot extend TTL')
  gate.record('root', undefined, 'I')
  const cut = gate.epoch('I')
  gate.touch('I')
  gate.record('root', cut, 'I')
  assert.equal(gate.shouldRefresh('root', 'I'), true, 'elapsed clocks do not certify a concurrent mutation')
})

const { supervisionAgentText } = await import('../src/controls/supervision-audit.ts')

test('supervision reports evidence without assigning an extra checking subagent', () => {
  const episode = { episodeId: 'episode', ownerSessionId: 'root', ticketId: null, research: false, at: 123,
    trigger: 'suspicion', verdict: 'suspicion', severity: 'alert', observed: 'Three support writes were observed.',
    possibleIssue: 'This may be preparation, not a delivery issue.', confidence: 0.4, delivery: 'card+agent',
    evidence: { events: 3, productWrites: 0, supportWrites: 3, productFiles: [], supportFiles: [], noProductHours: null, rootsConfigured: false } }
  const text = supervisionAgentText(episode)
  assert.match(text, /Three support writes were observed/)
  assert.match(text, /This may be preparation/)
  assert.match(text, /仅供参考/)
  assert.match(text, /无需中断当前 subagents 的工作/)
  assert.doesNotMatch(text, /插入一个临时检查任务|插入.*subagents/)
  assert.match(text, /主代理.*任务约定/)
  assert.match(text, /不要求.*派发/)
  assert.equal(episode.at, 123)
})

function orderedRecords(tickets) {
  return { instance, revision: 1, businessRevision: 1, viewerRevision: 0, scope: { kind: 'coordinator' },
    workflows: [], tickets, decisions: [], summary: { countingScope: 'instance', totalTickets: tickets.length, statusCounts: [],
      pendingDecisionCount: 0, pendingUserDecisionCount: 0, pendingForPrincipalCount: 0, awaitingImplementationCount: 0 } }
}

test('current ticket ordering computes bounded key work per row without caching later projections', async t => {
  const counts = []
  for (const n of [32, 128, 512]) {
    let keyReads = 0
    // Reversible permutation keeps all IDs distinct but prevents a pre-sorted TimSort fast path.
    const rows = Array.from({ length: n }, (_, index) => {
      const number = (index * 13) % n
      const row = { workflowId: 'flow', localTicketId: String(number).padStart(4, '0'), revision: 1,
        value: { title: 'Task', statuses: {} }, provenance: { author: caller('root'), references: [], recordedAt: 1 } }
      return new Proxy(row, { get(target, property, receiver) {
        if (property === 'workflowId' || property === 'localTicketId') keyReads++
        return Reflect.get(target, property, receiver)
      } })
    })
    const f = consumption()
    f.current = { ...f.current, records: orderedRecords(rows) }
    const first = await f.read()
    const category = JSON.parse(first.text.split(factsMarker)[1]).records.tickets
    assert.equal(category.total, n)
    assert.equal(category.rows[0].localTicketId, '0000')
    assert.equal(category.rows[1].localTicketId, '0001')
    counts.push({ n, keyReads, textChars: first.text.length, textBytes: Buffer.byteLength(first.text) })
    t.diagnostic(JSON.stringify(counts.at(-1)))
    const signature = category.currentFactsSignature
    rows.find(row => row.localTicketId === String(n - 1).padStart(4, '0')).value.title = 'Updated beyond shown rows'
    const changed = await f.read()
    assert.equal(typeof changed.text, 'string')
    assert.notEqual(JSON.parse(changed.text.split(factsMarker)[1]).records.tickets.currentFactsSignature, signature)
  }
  for (const { n, keyReads } of counts) assert.ok(keyReads <= 4 * n, 'sorting and projection should each read both key fields once; n=' + n + ', reads=' + keyReads)
})

test('mounted preStep keeps native input, single-step delivery and compaction recovery with the partitioned snapshot', async t => {
  const { loadSDK } = await import('./fixtures/runtime-host.mjs')
  const { Session } = await loadSDK('@deepseek-ai/dsh-session')
  const { createUserMessage } = await loadSDK('@deepseek-ai/dsh-llm')
  const f = await mountedFixture(t, { futureNativeActivityKnown: true })
  f.root.session = Session.create(f.root.id, [], f.root.session.header)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const native = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Keep native business input.' }] })
  const propose = step => f.ctx.waterfall('agent/pre-step', { agent: f.root, messages: [native], turn: 1, step, signal: signal() },
    async () => ({ kind: 'enter', messages: [native] }))
  const snapshots = request => request.messages.filter(message => message.source.kind === 'mattpocock-controls')
  const first = await propose(1)
  assert.equal(first.messages[0], native)
  const owned = snapshots(first)
  assert.equal(owned.length, 1)
  const text = owned[0].content[0].text
  assert.ok(text.indexOf(noticesMarker) > text.indexOf('Windows explicitly enabled'))
  assert.equal(JSON.parse(text.split(factsMarker)[1]).sessionId, 'root')
  assert.equal(snapshots(await propose(1)).length, 0, 'an uncommitted candidate is still capped within its admitted step')
  const appended = f.root.session.append('user/message', owned[0], { surfaceOp: 'append' })
  assert.equal(snapshots(await propose(2)).length, 0, 'actual visibility proves an unchanged full baseline')
  f.root.session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Compacted unrelated conversation.' }] }),
    { surfaceOp: { op: 'replace', startSeq: appended.seq, endSeq: appended.seq }, sourceEventSeqs: [appended.seq] })
  const recovered = await propose(3)
  assert.equal(recovered.messages[0], native)
  assert.equal(snapshots(recovered).length, 1)
  assert.equal(snapshots(recovered)[0].content[0].text, text, 'recover the complete guidance and facts, not a tail-only delta')
})

test('a new effective scope cannot replay a former scope cache after a failed read', async () => {
  const wide = { ...identity, scopeFingerprint: 'assigned:A,B' }
  const narrow = { ...identity, scopeFingerprint: 'assigned:A' }
  let fail = false, observedIdentity
  const current = snapshot()
  current.contextConclusions = [{ workflowId: 'flow', decisionId: 'private-B', result: 'SCOPE_B_PRIVATE_BODY', sourceRevision: 1, source: null }]
  const feed = new InstrumentConsumption({ readSnapshot: async who => { observedIdentity = who; if (fail) throw new Error('scope read denied'); return current } })
  const first = await feed.readForConsumption(wide)
  assert.match(first.text, /SCOPE_B_PRIVATE_BODY/)
  fail = true
  assert.equal(feed.prepared(narrow), null)
  assert.equal(feed.cachedText(narrow), null)
  assert.equal(feed.degraded(narrow, 'read-denied'), null)
  const failed = await feed.readForConsumption(narrow)
  assert.equal(failed.freshness, 'unavailable')
  assert.equal(failed.reason, 'snapshot-read-failed')
  assert.doesNotMatch(failed.text, /SCOPE_B_PRIVATE_BODY/)
  assert.equal(observedIdentity.scopeFingerprint, narrow.scopeFingerprint)
  assert.match(feed.cachedText(wide), /SCOPE_B_PRIVATE_BODY/)
  const sameScopeFailure = await feed.readForConsumption(wide)
  assert.equal(sameScopeFailure.freshness, 'stale')
  assert.match(sameScopeFailure.text, /SCOPE_B_PRIVATE_BODY/)
})

test('scope cache tokens are bounded opaque values and invalid tokens fail before reading', async () => {
  let reads = 0, received
  const feed = new InstrumentConsumption({ readSnapshot: async who => { reads++; received = who; return snapshot() } })
  for (const scopeFingerprint of [null, 0, false, {}, [], '', ' ', 'a\0b', 'x'.repeat(1025)]) {
    await assert.rejects(feed.readForConsumption({ ...identity, scopeFingerprint }), TypeError)
    assert.throws(() => feed.prepared({ ...identity, scopeFingerprint }), TypeError)
  }
  assert.equal(reads, 0)
  const opaque = { ...identity, scopeFingerprint: ' scope ' }
  await feed.readForConsumption(opaque)
  assert.equal(received.scopeFingerprint, ' scope ', 'do not normalize an authenticated opaque token')
  assert.equal(feed.prepared({ ...identity, scopeFingerprint: 'scope' }), null)
  assert.equal((await feed.readForConsumption({ ...identity, scopeFingerprint: 'x'.repeat(1024) })).freshness, 'current')
})

test('scope-partitioned reads still wait for the same instance durability frontier', async () => {
  const commit = Promise.withResolvers()
  let port, reads = 0
  const feed = new InstrumentConsumption({ bindProgram(value) { port = value }, readSnapshot: async () => { reads++; return snapshot() } })
  port.trackCommit('I', commit.promise)
  const wide = feed.readForConsumption({ ...identity, scopeFingerprint: 'wide' })
  const narrow = feed.readForConsumption({ ...identity, scopeFingerprint: 'narrow' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reads, 0, 'partitioning cached text must not partition durable commit tracking')
  commit.resolve()
  const results = await Promise.all([wide, narrow])
  assert.equal(reads, 2)
  assert.deepEqual(results.map(result => result.freshness), ['current', 'current'])
})

test('authored task references join held T and pending questions without creating business tickets', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  const view = await f.read()
  const controls = new core.WorkspaceControls(f.controlsStorage, f.ports.authority)
  const authority = { async resolveAccess() { return { author: caller('root'), scope: { kind: 'coordinator' } } } }
  const instruments = new core.SessionInstruments(controls, f.instrumentStorage, authority, () => 1234)
  let revision = 0
  async function apply(action, fields) {
    const result = await instruments.apply('agent:root', 'root', { operationId: 'ref-context-' + revision,
      expectedRevision: revision, workflowId: 'flow', action, ...fields })
    revision = result.snapshot.businessRevision
  }
  await apply('put-workflow', { value: { title: 'Collaboration group', axes: [] } })
  await apply('put-task-reference', { localTicketId: 'R1', references: ['native-message:42'], value: {
    source: { kind: 'external', instance: 'tracker', project: 'project-A', taskId: '42' }, locator: 'https://tracker.example/project-A/42', label: 'Authored last-known label' } })
  await apply('put-decision', { decisionId: 'D', value: { question: 'Approve this source task?', status: 'open', pending: true,
    addressee: { kind: 'user' }, ticketIds: ['R1'] } })
  const windows = new core.SessionWindows(controls, f.windowStorage, authority,
    { runtimeId: 'reference-context', capability: 'cooperative', bindProgram() {} })
  await windows.apply('agent:root', 'root', { action: 'reserve', operationId: 'hold-R1', workflowId: 'flow', localTicketId: 'R1' })
  const records = await instruments.readCurrent('agent:root', 'root')
  const current = { ...snapshot(), instance: view.instance, policy: view.policy, records, windows: await windows.read('agent:root', 'root') }
  const who = { ...identity, instrumentInstanceId: view.instance.instrumentInstanceId }
  const feed = new InstrumentConsumption({ readSnapshot: async () => current })
  const result = await feed.readForConsumption(who)
  const facts = JSON.parse(result.text.split(factsMarker)[1])
  assert.deepEqual(facts.records.capabilities, { taskReferences: true, storageVersions: [1, 2, 3] })
  assert.equal(facts.records.summary.totalTaskReferences, 1)
  assert.equal(facts.records.summary.totalTickets, 0)
  assert.equal(facts.records.tickets.total, 0)
  const reference = facts.records.taskReferences.rows[0]
  assert.equal(reference.localTicketId, 'R1')
  assert.equal(reference.sourceState, 'unknown')
  assert.equal(reference.sourceEvidence, 'authored')
  assert.equal(reference.source.recordedAt, 1234)
  assert.equal(reference.value.source.taskId, '42')
  assert.equal(facts.windows.T.used, 1)
  assert.equal(facts.windows.tickets.rows[0].localTicketId, 'R1')
  assert.equal(facts.records.decisions.rows[0].value.ticketIds[0], 'R1')
  assert.equal(facts.records.summary.pendingUserDecisionCount, 1)
})

function referenceRecords(rows) {
  const records = orderedRecords([])
  return { ...records, capabilities: { taskReferences: true, storageVersions: [1, 2, 3] }, taskReferences: rows,
    summary: { ...records.summary, totalTaskReferences: rows.length } }
}
function referenceRow(index) {
  return { workflowId: 'flow', localTicketId: 'R' + String(index).padStart(3, '0'), revision: index + 1,
    value: { source: { kind: 'external', instance: 'tracker', project: 'project-A', taskId: String(index) },
      label: 'Authored long label '.repeat(200), locator: 'https://tracker.example/' + 'segment/'.repeat(200) + index },
    provenance: { author: caller('root'), recordedAt: 1234, references: ['message:source'] } }
}

test('bounded reference omissions keep authorized current locators and unknown source evidence', async () => {
  const f = consumption()
  const rows = Array.from({ length: 40 }, (_, index) => referenceRow(index))
  f.current = { ...f.current, records: referenceRecords(rows) }
  const first = await f.read()
  const category = JSON.parse(first.text.split(factsMarker)[1]).records.taskReferences
  assert.equal(category.total, 40)
  assert.ok(category.shown > 0 && category.shown < 40)
  assert.equal(category.more, true)
  assert.deepEqual(category.query, { tool: 'mattpocock_record', action: 'read', query: { kind: 'task-reference', limit: 20 } })
  const row = category.rows[0]
  assert.deepEqual(row.query, { tool: 'mattpocock_record', action: 'read', query: { kind: 'task-reference', recordId: '["flow","R000"]', limit: 20 } })
  assert.equal(row.sourceEvidence, 'authored')
  assert.equal(row.sourceState, 'unknown')
  assert.ok(row.value.label)
  assert.ok(row.value.locator)
  assert.ok(first.text.length <= 24000)
  rows.at(-1).value.label = 'Changed after all shown rows'
  const changed = await f.read()
  assert.notEqual(JSON.parse(changed.text.split(factsMarker)[1]).records.taskReferences.currentFactsSignature, category.currentFactsSignature)
})

test('reference capability gates new guidance and unknown counts never become business-ticket mirrors', async () => {
  const f = consumption()
  f.current = { ...f.current, records: orderedRecords([]) }
  let result = await f.read()
  let facts = JSON.parse(result.text.split(factsMarker)[1])
  assert.equal(facts.records.capabilities, null)
  assert.equal(facts.records.taskReferences, null)
  assert.equal(facts.records.summary.totalTaskReferences, null)
  assert.equal(facts.records.summary.totalTickets, 0)
  assert.match(result.text, /Task-reference capability is unknown or unsupported/)
  assert.doesNotMatch(result.text, /Record it first with mattpocock_record put-ticket/)
  f.current = { ...f.current, records: referenceRecords([]) }
  result = await f.read()
  facts = JSON.parse(result.text.split(factsMarker)[1])
  assert.equal(facts.records.taskReferences.total, 0)
  assert.equal(facts.records.summary.totalTaskReferences, 0)
  assert.equal(facts.records.summary.totalTickets, 0)
  assert.match(result.text, /put-task-reference/)
  assert.match(result.text, /local-current is not source-current/)
  assert.match(result.text, /source state remains unknown/)
  assert.match(result.text, /explicit release may mean pause or handoff/)
  assert.doesNotMatch(result.text, /Take each ticket to its declared delivered state|Record it first with mattpocock_record put-ticket/)
  const enabled = f.current.policy
  f.current = { ...f.current, policy: { ...enabled, features: Object.fromEntries(Object.entries(enabled.features).map(([key, value]) => [key, { ...value, requested: false, status: 'disabled' }])) } }
  result = await f.read()
  assert.match(result.text, /New task-reference registration is inactive/)
  assert.doesNotMatch(result.text, /register with mattpocock_record put-task-reference/)
  f.current = { ...f.current, policy: { ...enabled, extensionEnabled: false } }
  result = await f.read()
  assert.match(result.text, /Management feature is OFF/)
  assert.doesNotMatch(result.text, /register with mattpocock_record put-task-reference/)
  assert.equal(JSON.parse(result.text.split(factsMarker)[1]).records.summary.totalTaskReferences, 0)
})

test('reference and legacy categories share the existing snapshot budget without hiding unknown counts', async () => {
  const f = consumption(), large = 'Long authored report '.repeat(2000)
  const records = referenceRecords(Array.from({ length: 40 }, (_, n) => referenceRow(n)))
  const windows = { instance, configurationRevision: 1, status: 'reconciling', reason: null, scope: { kind: 'coordinator' },
    runtimeKnowledge: { known: false, reason: 'unavailable', runtimeId: null }, T: { used: 40, capacity: null },
    S: { used: null, capacity: null, byState: { unknown: 40 } }, tickets: [], executions: [] }
  const resources = [], capabilities = [], health = [], worktreeBindings = [], contextConclusions = []
  for (let n = 0; n < 40; n++) {
    const id = String(n).padStart(3, '0')
    records.workflows.push({ workflowId: id, revision: 1, history: [], value: { title: id, axes: [{ axisKey: 'custom', label: large, counting: 'exclusive', statuses: [] }] } })
    records.tickets.push({ workflowId: id, localTicketId: id, revision: 1, history: [], value: { title: id, statuses: { custom: ['partial'] }, summary: large } })
    records.decisions.push({ workflowId: id, decisionId: id, revision: 1, history: [], value: { question: id, status: 'open', context: large, pending: true, awaitingImplementation: true } })
    records.summary.statusCounts.push({ workflowId: id, axisKey: 'custom', label: large, counting: 'exclusive', statuses: [], unreported: 0 })
    windows.tickets.push({ workflowId: id, localTicketId: id, held: true, generation: 1 })
    windows.executions.push({ executionId: id, generation: 1, state: 'unknown', workflowId: id, localTicketId: id })
    resources.push({ resourceId: id, ownerInstanceId: 'I', identity: { path: '/tree/' + id, ownership: 'borrowed' }, status: 'retained', business: { status: large }, references: [], diagnostic: null, actualCanRetire: { facts: null } })
    capabilities.push({ key: id, status: 'unsupported', reason: large })
    health.push({ scope: id, status: 'ready', reason: large })
    worktreeBindings.push({ bindingId: id, revision: 1, value: { requestedCwd: '/tree/' + id, actualChildSessionId: 'child-' + id, business: { state: 'discarded', notes: large } }, source: 'agent', author: caller('root'), recordedAt: 1, cleanupDue: n === 0 })
    contextConclusions.push({ workflowId: id, decisionId: id, result: large, sourceRevision: 1, source: { author: 'owner' } })
  }
  health.push({ scope: 'zzz-not-shown', status: 'unknown', reason: 'source unavailable' })
  records.summary.totalTickets = 40
  records.summary.pendingDecisionCount = 40
  records.summary.awaitingImplementationCount = 40
  f.current = { ...f.current, records, windows, resources, capabilities, health, worktreeBindings, contextConclusions }
  const result = await f.read()
  assert.ok(result.text.length <= 24000, 'all categories including references: ' + result.text.length)
  const facts = JSON.parse(result.text.split(factsMarker)[1])
  assert.equal(facts.records.taskReferences.total, 40)
  assert.equal(facts.records.tickets.total, 40)
  assert.equal(facts.records.summary.totalTaskReferences, 40)
  assert.equal(facts.records.summary.totalTickets, 40)
  assert.equal(facts.records.summary.awaitingImplementationCount, 40)
  assert.equal(facts.windows.T.used, 40)
  assert.equal(facts.windows.S.used, null)
  assert.equal(facts.health.counts.unknown, 1)
  assert.equal(facts.worktreeRelations.counts.cleanupDue, 1)
  assert.ok(facts.records.taskReferences.shown > 0 && facts.records.taskReferences.more)
})
