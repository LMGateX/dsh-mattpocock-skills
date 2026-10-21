import assert from 'node:assert/strict'
import { test } from 'node:test'
import { performance } from 'node:perf_hooks'
import { caller, core, deferred, fixture, operator, policy, signal } from './fixtures/runtime-host.mjs'

const HISTORY_MARKER = 'SUMMARY_PERFORMANCE_OLD_BODY'
const CURRENT_MARKER = 'SUMMARY_PERFORMANCE_CURRENT_BODY'
const SAMPLES = 50
const settle = () => new Promise(resolve => setImmediate(resolve))
const bytes = value => Buffer.byteLength(JSON.stringify(value))
const round = value => Number(value.toFixed(4))
function distribution(samples) {
  const ordered = [...samples].sort((a, b) => a - b)
  return { samples: samples.length, p50: round(ordered[Math.ceil(samples.length * .5) - 1]),
    p95: round(ordered[Math.ceil(samples.length * .95) - 1]) }
}

function sourceDocument(instance, oldVersions) {
  const author = { kind: 'agent', principalId: 'agent:root', sessionId: 'root' }
  const events = [{ revision: 1, recordedAt: 1, author, command: {
    action: 'put-workflow', workflowId: 'flow', operationId: 'perf-flow', expectedRevision: 0,
    value: { title: 'Fixed current workflow', axes: [] },
  } }]
  for (let version = 0; version <= oldVersions; version++) {
    const revision = version + 2
    events.push({ revision, recordedAt: revision, author, command: {
      action: 'put-decision', workflowId: 'flow', decisionId: 'fixed-current-decision',
      operationId: 'perf-decision-' + version, expectedRevision: revision - 1,
      value: { question: version === oldVersions ? CURRENT_MARKER : HISTORY_MARKER + '-' + version,
        context: 'Retained authored context: ' + 'x'.repeat(192), status: 'task-defined', pending: true,
        addressee: { kind: 'user', principalId: 'user:operator' } },
    } })
  }
  return { schemaVersion: 1, ...instance, revision: events.length, events }
}

async function sourceFixture(t, oldVersions, buildSource = sourceDocument, options = {}) {
  const f = await fixture(t, { known: true, initialPolicy: policy(), ...options })
  await settle()
  const controls = new core.WorkspaceControls(f.controlsStorage, f.ports.authority)
  const { instance } = await controls.readSession(operator.principalId, 'root')
  const document = buildSource(instance, oldVersions)
  const state = { document, gets: 0, portReads: 0, writes: 0, readError: null }
  // Real Domain InstrumentStorage/VersionedStorage adapters over a stable in-memory
  // table. This measures the hot production adapter, NOT MemoryInstrumentStorage's
  // intentional full-document read cloning or an actual durable backend's I/O.
  const table = { get(key) {
    if (key !== instance.instrumentInstanceId) return undefined
    state.gets++
    if (state.readError) throw state.readError
    return state.document
  }, async put() { state.writes++; assert.fail('performance reads must not write instrument sources') },
    async update() { state.writes++; assert.fail('performance reads must not write instrument sources') } }
  const domain = core.createDomainInstrumentStorage(table)
  const hydrateStart = performance.now(), hydrated = await domain.read(instance.instrumentInstanceId)
  const sourceHydrateValidateMs = performance.now() - hydrateStart
  assert(Object.isFrozen(hydrated))
  assert.equal(await domain.read(instance.instrumentInstanceId), hydrated, 'unchanged Domain reads reuse the frozen source')
  // Redirect only the public InstrumentStorage port already captured by Runtime.
  f.instrumentStorage.read = async id => { state.portReads++; return domain.read(id) }
  f.instrumentStorage.compareAndSwap = (...args) => domain.compareAndSwap(...args)
  return { f, state, sourceHydrateValidateMs, sourceBytes: bytes(document) }
}

test('summary scale matrix keeps current payloads history-free and checks hot Domain source health', async t => {
  const matrix = []
  for (const oldVersions of [0, 30, 3000]) {
    // Separate runtimes: full read's history capture/replay cannot contaminate
    // summary hot samples. Cold source validation is measured, not wished away.
    const summaryCase = await sourceFixture(t, oldVersions)
    const { f, state } = summaryCase
    const coldStart = performance.now()
    const initial = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root' }] }, signal())
    const firstRuntimeSummaryMs = performance.now() - coldStart
    assert.equal(initial.rows[0].status, 'current')
    assert.equal(initial.rows[0].summary.records.summary.pendingUserDecisionCount, 1)
    const version = initial.rows[0].version
    const currentBytes = bytes(initial), currentTimes = [], unchangedTimes = []
    const beforeGets = state.gets, beforePortReads = state.portReads
    let unchangedBytes
    for (let sample = 0; sample < SAMPLES; sample++) {
      const start = performance.now()
      const current = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root' }] }, signal())
      currentTimes.push(performance.now() - start)
      assert.equal(current.rows[0].status, 'current')
      assert.equal(current.rows[0].summary.records.summary.pendingUserDecisionCount, 1)
      assert.equal(bytes(current), currentBytes)
      assert.equal(JSON.stringify(current).includes('SUMMARY_PERFORMANCE_'), false)
    }
    for (let sample = 0; sample < SAMPLES; sample++) {
      const start = performance.now()
      const unchanged = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root', version }] }, signal())
      unchangedTimes.push(performance.now() - start)
      assert.deepEqual(unchanged.rows, [{ sessionId: 'root', status: 'unchanged', version }])
      unchangedBytes ??= bytes(unchanged)
      assert.equal(bytes(unchanged), unchangedBytes)
    }
    const hotSourceChecks = state.gets - beforeGets
    assert.equal(hotSourceChecks, SAMPLES * 2, 'current AND unchanged reads consult source health every time')
    assert.equal(state.portReads - beforePortReads, SAMPLES * 2)
    assert.equal(state.writes, 0)
    assert(currentBytes < 2_048)
    assert(unchangedBytes < currentBytes)
    state.readError = new Error('public source-health probe unavailable')
    const degraded = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root', version }] }, signal())
    assert.equal(degraded.rows[0].status, 'current', 'knownVersion must not conceal current source failure')
    assert.equal(degraded.rows[0].summary.records, null)
    assert.deepEqual(degraded.rows[0].summary.health, [{ scope: 'records', status: 'unknown', reason: 'records-unavailable' }])
    state.readError = null
    const recovered = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root', version: degraded.rows[0].version }] }, signal())
    assert.equal(recovered.rows[0].status, 'current')
    assert.equal(recovered.rows[0].summary.records.summary.pendingUserDecisionCount, 1)

    const fullCase = await sourceFixture(t, oldVersions)
    const fullStart = performance.now()
    const full = await fullCase.f.runtime.readSession(operator, 'root', signal())
    const firstFullRuntimeMs = performance.now() - fullStart, fullBytes = bytes(full)
    assert.equal(full.records.summary.pendingUserDecisionCount, 1)
    assert.equal(full.records.decisions.length, 1)
    assert.equal(full.records.decisions[0].history.length, oldVersions + 1)
    assert.equal(JSON.stringify(full).includes(CURRENT_MARKER), true)
    assert.equal(JSON.stringify(full).includes(HISTORY_MARKER), oldVersions > 0)
    assert(fullBytes > currentBytes)
    assert.equal(fullCase.state.writes, 0)
    matrix.push({ oldDecisionVersions: oldVersions, currentDecisionCount: 1, sourceEvents: oldVersions + 2,
      sourceBytes: summaryCase.sourceBytes,
      payloadBytes: { fullRuntime: fullBytes, currentSummary: currentBytes, unchangedSummary: unchangedBytes },
      coldMs: { summarySourceHydrateValidate: round(summaryCase.sourceHydrateValidateMs),
        firstRuntimeSummaryAfterHydrate: round(firstRuntimeSummaryMs),
        fullSourceHydrateValidate: round(fullCase.sourceHydrateValidateMs),
        firstFullRuntimeIncludingCapture: round(firstFullRuntimeMs) },
      hotUncontendedFacadeMs: { current: distribution(currentTimes), unchanged: distribution(unchangedTimes) },
      hotSourceChecks: { currentAndUnchanged: hotSourceChecks, expected: SAMPLES * 2 },
    })
  }
  assert(matrix[1].payloadBytes.fullRuntime > matrix[0].payloadBytes.fullRuntime)
  assert(matrix[2].payloadBytes.fullRuntime > matrix[1].payloadBytes.fullRuntime)
  assert.equal(new Set(matrix.map(row => row.payloadBytes.unchangedSummary)).size, 1)
  console.log(JSON.stringify({ metric: 'summary-history-scale', backend: 'real Domain InstrumentStorage adapter; stable in-memory table',
    boundary: 'JSON facade payloads, no RPC envelope/compression/browser decoding; uncontended facade latency includes authorization and microtask scheduling',
    cold: 'Source hydrate/validation and first Runtime summary are separate; cold parse can scale with history. Full reads use separate runtimes and include history capture.',
    defaultHistoryLimit: 3000, matrix }))
})

test('summary waits behind an earlier full read in the permission FIFO instead of hiding head-of-line blocking', async t => {
  const fullEntered = deferred(), releaseFull = deferred(), outerAuthorized = deferred()
  t.after(() => releaseFull.resolve())
  const { f, state } = await sourceFixture(t, 0)
  await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root' }] }, signal())
  const readWindows = f.windowStorage.read.bind(f.windowStorage)
  let held = false, fullGateEnteredAt
  f.windowStorage.read = async (...args) => {
    if (!held) {
      held = true; fullGateEnteredAt = performance.now(); fullEntered.resolve()
      await releaseFull.promise
    }
    return readWindows(...args)
  }
  const authorize = f.ports.authorizeCaller.bind(f.ports)
  let measuring = false, outerAuthorizedAt, fifoEnteredAt, summaryResolvedAt
  f.ports.authorizeCaller = async (who, sessionId) => {
    // The blocked full read uses the agent; only the later operator summary can
    // reach this marker. It is a PUBLIC port, not a spy on Runtime's private FIFO.
    if (measuring && who.principalId === operator.principalId && sessionId === 'root' && fifoEnteredAt === undefined) fifoEnteredAt = performance.now()
    await authorize(who, sessionId)
    if (measuring && who.principalId === operator.principalId && sessionId === undefined && outerAuthorizedAt === undefined) {
      outerAuthorizedAt = performance.now(); outerAuthorized.resolve()
    }
  }
  const fullStart = performance.now()
  let fullResolvedAt
  const fullRead = f.runtime.readSession(caller('root'), 'root', signal()).then(value => {
    fullResolvedAt = performance.now(); return value
  })
  let summaryRead
  try {
    await fullEntered.promise
    const sourceChecksAtGate = state.gets
    measuring = true
    const submittedAt = performance.now()
    summaryRead = f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root' }] }, signal()).then(value => {
      summaryResolvedAt = performance.now(); return value
    })
    await outerAuthorized.promise
    await settle()
    assert.equal(fifoEnteredAt, undefined, 'summary body cannot enter while the earlier full read owns FIFO')
    assert.equal(summaryResolvedAt, undefined)
    assert.equal(state.gets, sourceChecksAtGate, 'blocked summary cannot touch its current instrument source yet')
    const gateReleasedAt = performance.now()
    releaseFull.resolve()
    const [full, summary] = await Promise.all([fullRead, summaryRead])
    assert.equal(full.records.summary.pendingUserDecisionCount, 1)
    assert.equal(summary.rows[0].status, 'current')
    assert.equal(summary.rows[0].summary.records.summary.pendingUserDecisionCount, 1)
    assert(fifoEnteredAt >= gateReleasedAt)
    assert(summaryResolvedAt >= fifoEnteredAt)
    assert.equal(state.gets - sourceChecksAtGate, 1)
    console.log(JSON.stringify({ metric: 'summary-public-fifo-gate',
      boundary: 'Pre-execution wait is outer public authorization completion to first in-FIFO authorizeCaller(sessionId) entry; includes continuation/microtask scheduling. After-entry duration includes facade completion, not a private-body CPU counter.',
      cause: 'Earlier readSession blocked at public WindowStorage.read; gate released by test, no wall-time threshold',
      observedMs: { fullRequestTotal: round(fullResolvedAt - fullStart), fullStorageGateHeld: round(gateReleasedAt - fullGateEnteredAt),
        summaryOuterAuthorization: round(outerAuthorizedAt - submittedAt),
        summaryPreExecutionWait: round(fifoEnteredAt - outerAuthorizedAt),
        summaryProvablyGateBlocked: round(gateReleasedAt - outerAuthorizedAt),
        summaryAfterFifoEntryToReturn: round(summaryResolvedAt - fifoEnteredAt),
        summaryRequestTotal: round(summaryResolvedAt - submittedAt) },
      blockedSummarySourceChecks: 0, completedSummarySourceChecks: 1, headOfLineBlockingEliminated: false }))
  } finally {
    releaseFull.resolve()
    await Promise.allSettled([fullRead, ...(summaryRead ? [summaryRead] : [])])
  }
})

function currentRowsDocument(instance, currentRows) {
  const base = sourceDocument(instance, 0), template = base.events[1]
  const events = [base.events[0]]
  for (let row = 0; row < currentRows; row++) {
    const revision = row + 2
    events.push({ ...template, revision, recordedAt: revision, command: { ...template.command,
      decisionId: 'current-decision-' + row, operationId: 'current-row-' + row, expectedRevision: revision - 1 } })
  }
  return { ...base, revision: events.length, events }
}

test('summary current-row matrix keeps bounded payloads while allowing CPU to scale with current decisions', async t => {
  const matrix = []
  for (const currentRows of [1, 100, 1000]) {
    // A fresh adapter per size has no same-revision mutable-table cache loophole.
    const sample = await sourceFixture(t, 0, instance => currentRowsDocument(instance, currentRows))
    const { f, state } = sample
    const firstStart = performance.now()
    const first = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root' }] }, signal())
    const firstRuntimeSummaryMs = performance.now() - firstStart
    assert.equal(first.rows[0].status, 'current')
    assert.equal(first.rows[0].summary.records.summary.pendingUserDecisionCount, currentRows)
    const version = first.rows[0].version, currentBytes = bytes(first)
    const currentTimes = [], unchangedTimes = [], beforeChecks = state.gets
    let unchangedBytes
    for (let index = 0; index < SAMPLES; index++) {
      const start = performance.now()
      const response = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root' }] }, signal())
      currentTimes.push(performance.now() - start)
      assert.equal(response.rows[0].summary.records.summary.pendingUserDecisionCount, currentRows)
      assert.equal(bytes(response), currentBytes)
      assert.equal(JSON.stringify(response).includes('SUMMARY_PERFORMANCE_'), false)
    }
    for (let index = 0; index < SAMPLES; index++) {
      const start = performance.now()
      const response = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root', version }] }, signal())
      unchangedTimes.push(performance.now() - start)
      assert.deepEqual(response.rows, [{ sessionId: 'root', status: 'unchanged', version }])
      unchangedBytes ??= bytes(response)
      assert.equal(bytes(response), unchangedBytes)
    }
    const checks = state.gets - beforeChecks
    assert.equal(checks, SAMPLES * 2, 'even a large current index must consult current Domain source health')
    assert.equal(state.writes, 0)
    assert(currentBytes < 2048 && unchangedBytes < currentBytes)
    matrix.push({ oldDecisionVersions: 0, currentDecisionRows: currentRows, sourceEvents: currentRows + 1,
      sourceBytes: sample.sourceBytes, payloadBytes: { currentSummary: currentBytes, unchangedSummary: unchangedBytes },
      coldMs: { sourceHydrateValidate: round(sample.sourceHydrateValidateMs), firstRuntimeSummaryAfterHydrate: round(firstRuntimeSummaryMs) },
      hotUncontendedFacadeMs: { current: distribution(currentTimes), unchanged: distribution(unchangedTimes) },
      hotSourceChecks: checks })
  }
  console.log(JSON.stringify({ metric: 'summary-current-row-scale',
    boundary: 'Fresh real Domain adapter per size; stable in-memory table. No old versions; every decision is current. CPU may scale with current rows; no wall-time comparison threshold.', matrix }))
})

function assertConsumedObligation(messages) {
  assert.equal(messages.length, 1)
  assert.equal(messages[0].source.kind, 'mattpocock-controls')
  const text = messages[0].content.map(part => part.text ?? '').join('')
  const facts = JSON.parse(text.split(String.fromCharCode(10)).at(-1))
  assert.equal(facts.records.summary.pendingUserDecisionCount, 1)
  assert.equal(facts.records.decisions.total, 1)
  assert.equal(facts.records.decisions.rows.length, 1)
  const decision = facts.records.decisions.rows[0]
  assert.equal(decision.value.pending, true)
  assert.equal(decision.value.question, CURRENT_MARKER)
  assert.deepEqual(decision.source.author, { kind: 'agent', principalId: 'agent:root', sessionId: 'root' })
  return Buffer.byteLength(text)
}

test('hot preStep latency is characterized with two independent summary clients and an earlier summary FIFO gate', async t => {
  // Freeze only Date-based reconciliation windows, not performance.now(). These
  // synthetic turn:step keys exercise message de-duplication, not real model/S receipts.
  t.mock.timers.enable({ apis: ['Date'], now: 2_000_000 })
  const releaseSummary = deferred(), summaryEntered = deferred()
  t.after(() => releaseSummary.resolve())
  const modes = []
  let gateCase
  for (const summaryClients of [0, 2]) {
    const sample = await sourceFixture(t, 0, sourceDocument, { consumptionTimeoutMs: 1000 })
    const { f, state } = sample
    f.ports.snapshotVisible = () => false
    await f.runtime.readSession(caller('root'), 'root', signal())
    await settle()
    await f.runtime.readSession(caller('root'), 'root', signal())
    const turnKey = summaryClients === 0 ? 200 : 201
    const warm = await f.runtime.preStep(caller('root'), signal(), [], turnKey + ':0')
    assertConsumedObligation(warm)
    await settle()
    const beforeChecks = state.gets, stepTimes = [], allRequestTimes = [], messageBytes = []
    for (let index = 0; index < SAMPLES; index++) {
      const iterationStart = performance.now()
      // Separate calls/signals represent two clients polling the same session;
      // they are not duplicate IDs in one batch and no model is invoked.
      const summaries = Array.from({ length: summaryClients }, () => f.runtime.readSummaries(operator,
        { sessions: [{ sessionId: 'root' }] }, signal()))
      const stepStart = performance.now()
      const step = f.runtime.preStep(caller('root'), signal(), [], turnKey + ':' + (index + 1)).then(messages => {
        stepTimes.push(performance.now() - stepStart); return messages
      })
      const [messages, ...responses] = await Promise.all([step, ...summaries])
      allRequestTimes.push(performance.now() - iterationStart)
      messageBytes.push(assertConsumedObligation(messages))
      for (const response of responses) {
        assert.equal(response.rows[0].status, 'current')
        assert.equal(response.rows[0].summary.records.summary.pendingUserDecisionCount, 1)
      }
    }
    const checks = state.gets - beforeChecks
    assert(checks >= summaryClients * SAMPLES)
    assert.equal(new Set(messageBytes).size, 1, 'summary traffic must not replace or truncate full consumed obligations')
    assert.equal(state.writes, 0)
    modes.push({ simultaneousSummaryClients: summaryClients, samples: SAMPLES,
      stepKeyTurn: turnKey, preStepMs: distribution(stepTimes), allConcurrentRequestsMs: distribution(allRequestTimes),
      consumedMessageBytes: messageBytes[0], sourceHealthChecks: checks })
    if (summaryClients === 2) gateCase = sample
  }
  console.log(JSON.stringify({ metric: 'prestep-two-summary-clients',
    boundary: 'Public preStep/RuntimeFacade over fixture native ports and a real Domain adapter with stable in-memory table; no live model. Full snapshot and first consumption warmed before samples; Date-only clock freezes the existing refresh window. Synthetic step keys are not execution receipts.',
    summaryMode: 'Two independent current-summary RPCs to the same session per step, no shared request hint or batch', modes }))

  // A hot reused prepared view need not enter FIFO. Advance the public freshness
  // window to exercise a fresh read of already-warmed sources, not cold hydrate.
  t.mock.timers.tick(2001)
  const { f, state } = gateCase, readSource = f.instrumentStorage.read.bind(f.instrumentStorage)
  let held = false, stepSubmittedAt, stepSourceEnteredAt, stepReturnedAt
  f.instrumentStorage.read = async (...args) => {
    if (!held) {
      held = true; summaryEntered.resolve()
      await releaseSummary.promise
    } else if (stepSubmittedAt !== undefined && stepSourceEnteredAt === undefined) stepSourceEnteredAt = performance.now()
    return readSource(...args)
  }
  const blockedSummary = f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root' }] }, signal())
  let pendingStep
  try {
    await summaryEntered.promise
    const beforeChecks = state.gets
    stepSubmittedAt = performance.now()
    pendingStep = f.runtime.preStep(caller('root'), signal(), [], '202:1').then(messages => {
      stepReturnedAt = performance.now(); return messages
    })
    await settle()
    assert.equal(stepReturnedAt, undefined, 'fresh preStep cannot pass an earlier summary holding the permission FIFO')
    assert.equal(stepSourceEnteredAt, undefined)
    assert.equal(state.gets, beforeChecks, 'neither the gated summary nor queued step has reached Domain get')
    const releasedAt = performance.now()
    releaseSummary.resolve()
    const [summary, messages] = await Promise.all([blockedSummary, pendingStep])
    assert.equal(summary.rows[0].summary.records.summary.pendingUserDecisionCount, 1)
    const consumedBytes = assertConsumedObligation(messages)
    assert(stepSourceEnteredAt >= releasedAt && stepReturnedAt >= stepSourceEnteredAt)
    assert(state.gets - beforeChecks >= 2)
    console.log(JSON.stringify({ metric: 'prestep-behind-summary-source-gate',
      boundary: 'Public InstrumentStorage.read gates an earlier summary. PreStep first source-entry timing includes its authorization, FIFO wait and work before that public source port; it is not a private enqueue/CPU counter. Date-only freshness advanced after full-source warmup.',
      syntheticStepKey: '202:1', noLiveModel: true, headOfLineBlockingEliminated: false,
      observedMs: { preStepProvablyGateBlocked: round(releasedAt - stepSubmittedAt),
        preStepToFirstSourceEntry: round(stepSourceEnteredAt - stepSubmittedAt),
        firstSourceEntryToPreStepReturn: round(stepReturnedAt - stepSourceEnteredAt),
        preStepRequestTotal: round(stepReturnedAt - stepSubmittedAt) },
      sourceChecksWhileGated: 0, sourceChecksAfterRelease: state.gets - beforeChecks, consumedMessageBytes: consumedBytes,
      pendingUserDecisions: 1, retainedSourceAuthor: 'agent:root' }))
  } finally {
    releaseSummary.resolve()
    await Promise.allSettled([blockedSummary, ...(pendingStep ? [pendingStep] : [])])
  }
})
