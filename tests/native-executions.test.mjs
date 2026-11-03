import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Source-only mechanical probe; no lib emission, host install or model call.
const sourceRoot = new URL('../src/controls/', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (existsSync(url)) return { url: url.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true,
      } }).outputText }
    return nextLoad(url, context)
  },
})
const {
  applyNativeExecutionEvent, latestNativeExecutions, nativeChildrenForObservation, nativeExecutionActivity,
  nativeExecutionLane, parseNativeExecutionFact, projectNativeExecution,
} = await import('../src/controls/native-executions.ts')
const { parseRuntimeDocument } = await import('../src/controls/runtime-state.ts')

const base = { sessionId: 'child', parentSessionId: 'root', instrumentInstanceId: 'instance-A', headerCwd: '/trees/A' }
const created = (extra = {}) => ({ kind: 'created', ...base, createdAt: 100, ...extra })
const start = (extra = {}) => ({ kind: 'start', ...base, provider: 'spawn', runId: 'run-1', ...extra })
const end = (outcome = 'completed', extra = {}) => ({ kind: 'end', ...base, outcome, runId: 'run-1', ...extra })
const disposed = () => ({ kind: 'disposed', ...base })
const fold = events => { let row; for (const [event, at] of events) row = applyNativeExecutionEvent(row, event, at) ?? row; return row }
const legacyRow = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key === 'headerCwd' ? 'initialCwd' : key, value]))

test('created, start and end fold into one row with the header cwd and host stopReason', () => {
  const row = fold([[created(), 100], [start(), 110], [end('completed'), 120]])
  assert.equal(row.executionId, 'child')
  assert.equal(row.sessionId, 'child')
  assert.equal(row.state, 'ended')
  assert.equal(row.outcome, 'completed')
  assert.equal(row.observed, 'subagent/end: completed')
  assert.equal(row.provider, 'spawn')
  assert.equal(row.runId, 'run-1')
  assert.equal(row.headerCwd, '/trees/A')
  assert.equal(Object.hasOwn(row, 'initialCwd'), false, 'new rows never store the legacy key')
  assert.equal(row.startedAt, 110)
  assert.equal(row.endedAt, 120)
  assert.equal(row.recordedAt, 120)
  assert.equal(nativeExecutionActivity({ status: 'running' }), 'running')
  assert.equal(nativeExecutionActivity({ status: 'idle' }), 'idle')
  assert.equal(nativeExecutionActivity(undefined), 'gone')
})

test('duplicate start/end and a creation replay do not produce a new document row or revision', () => {
  let row = fold([[created(), 100], [start(), 110]])
  assert.equal(applyNativeExecutionEvent(row, start(), 111), null, 'a repeated start for the same run is equivalent')
  row = applyNativeExecutionEvent(row, end('completed'), 120)
  assert.notEqual(row, null)
  assert.equal(applyNativeExecutionEvent(row, end('completed'), 121), null, 'a repeated end of the same run is equivalent')
  assert.equal(applyNativeExecutionEvent(row, created(), 122), null, 'a creation replay never rewrites an existing state')
})

test('disposed without a published end stays disposed with outcome null', () => {
  const row = fold([[created(), 100], [start(), 110], [disposed(), 120]])
  assert.equal(row.state, 'disposed')
  assert.equal(row.outcome, null)
  assert.equal(row.endedAt, null)
  assert.equal(row.observed, 'agent/disposed')
  assert.equal(row.runId, 'run-1', 'disposal does not erase the run identity')
  assert.equal(applyNativeExecutionEvent(row, disposed(), 121), null)
  // A genuine late end is a published fact and still wins over the earlier disposal.
  const ended = applyNativeExecutionEvent(row, end('error'), 130)
  assert.equal(ended.state, 'ended')
  assert.equal(ended.outcome, 'error')
  assert.equal(ended.endedAt, 130)
})

test('the header cwd is immutable after the first readable value and the same row survives a re-run', () => {
  let row = fold([[created({ headerCwd: '/trees/A' }), 100], [start(), 110], [end('completed'), 120]])
  assert.equal(parseNativeExecutionFact(row).headerCwd, '/trees/A')
  const startedAgain = applyNativeExecutionEvent({ ...row, headerCwd: '/trees/A' }, start({ headerCwd: '/trees/B', runId: 'run-2' }), 130)
  assert.equal(startedAgain.state, 'running')
  assert.equal(startedAgain.headerCwd, '/trees/A', 'a later header cwd never rewrites the stored header value')
  assert.equal(startedAgain.outcome, null, 'a new activation clears the previous outcome')
  assert.equal(startedAgain.endedAt, null)
  assert.equal(startedAgain.runId, 'run-2')
  assert.equal(startedAgain.executionId, row.executionId)
  assert.equal(parseNativeExecutionFact({ ...row, headerCwd: null }).headerCwd, null)
})

test('legacy initialCwd is read as headerCwd, equal keys are normalized, and conflicting keys are rejected', () => {
  const modern = fold([[created(), 100], [start(), 110], [end('completed'), 120]])
  const legacy = legacyRow(modern)
  assert.equal(Object.hasOwn(legacy, 'headerCwd'), false)
  const parsed = parseNativeExecutionFact(legacy)
  assert.equal(parsed.headerCwd, '/trees/A')
  assert.equal(Object.hasOwn(parsed, 'initialCwd'), false, 'the read model exposes only the header meaning')
  assert.equal(parseNativeExecutionFact({ ...legacy, initialCwd: null }).headerCwd, null)
  // Equal values describe the same header fact and normalize to the one read/write key.
  assert.equal(parseNativeExecutionFact({ ...modern, initialCwd: '/trees/A' }).headerCwd, '/trees/A')
  assert.throws(() => parseNativeExecutionFact({ ...modern, initialCwd: '/trees/B' }), /conflicting headerCwd/)
  const { headerCwd, ...withoutBoth } = modern
  assert.throws(() => parseNativeExecutionFact(withoutBoth), /requires headerCwd/)
  assert.throws(() => parseNativeExecutionFact({ ...legacy, initialCwd: 'relative/tree' }), /initialCwd/)
  assert.throws(() => parseNativeExecutionFact({ ...modern, headerCwd: 'relative/tree' }), /headerCwd/)
  const document = { schemaVersion: 1, revision: 1, assignments: [], bindings: [], notifications: [], nativeExecutions: [legacy] }
  const stored = parseRuntimeDocument(document).nativeExecutions[0]
  assert.equal(stored.headerCwd, '/trees/A')
  assert.equal(Object.hasOwn(stored, 'initialCwd'), false)
  const serialized = JSON.stringify(parseRuntimeDocument({ ...document, nativeExecutions: [modern] }))
  assert.match(serialized, /"headerCwd":"\/trees\/A"/)
  assert.doesNotMatch(serialized, /"initialCwd"/)
})

test('old runtime documents without nativeExecutions parse as empty and malformed rows reject', () => {
  const old = parseRuntimeDocument({ schemaVersion: 1, revision: 0, assignments: [], bindings: [], notifications: [] })
  assert.deepEqual(old.nativeExecutions, [])
  const row = fold([[created(), 100], [end('completed'), 120]])
  const document = { schemaVersion: 1, revision: 1, assignments: [], bindings: [], notifications: [], nativeExecutions: [row] }
  assert.equal(parseRuntimeDocument(document).nativeExecutions[0].outcome, 'completed')
  assert.throws(() => parseRuntimeDocument({ ...document, nativeExecutions: [row, row] }), /duplicate native execution/)
  assert.throws(() => parseRuntimeDocument({ ...document, nativeExecutions: [{ ...row, outcome: 'completed', state: 'running', endedAt: null }] }), /outcome/)
  assert.throws(() => parseRuntimeDocument({ ...document, nativeExecutions: [{ ...row, state: 'failed' }] }), /state/)
})

test('an end edge is fenced by host run identity and never guesses from arrival order', () => {
  const running = fold([[created(), 100], [start({ runId: 'run-1' }), 110]])
  // A different, still-live run owns the row: an older run's late end cannot overwrite it.
  assert.throws(() => applyNativeExecutionEvent(running, end('completed', { runId: 'run-0' }), 120), { code: 'association-conflict' })
  // Missing run identity is not attributable either; the stored run remains untouched.
  assert.throws(() => applyNativeExecutionEvent(running, end('completed', { runId: null }), 121), { code: 'association-conflict' })
  assert.equal(running.state, 'running')
  assert.equal(running.runId, 'run-1')
  assert.equal(running.outcome, null)
  // Same run applies, and a duplicate does not advance the stored end time.
  const ended = applyNativeExecutionEvent(running, end('completed', { runId: 'run-1' }), 130)
  assert.equal(ended.state, 'ended')
  assert.equal(ended.endedAt, 130)
  assert.equal(applyNativeExecutionEvent(ended, end('completed', { runId: 'run-1' }), 140), null)
  // A later start of a new run is not overwritten by the old run's end.
  const rerun = applyNativeExecutionEvent(ended, start({ runId: 'run-2' }), 150)
  assert.equal(rerun.runId, 'run-2')
  assert.equal(rerun.state, 'running')
  assert.throws(() => applyNativeExecutionEvent(rerun, end('completed', { runId: 'run-1' }), 160), { code: 'association-conflict' })
  // A published outcome is final for that run; a later different end is a coverage gap, not a rewrite.
  assert.throws(() => applyNativeExecutionEvent(ended, end('error', { runId: 'run-1' }), 145), { code: 'association-conflict' })
  assert.equal(ended.outcome, 'completed')
  // The still-running new run can publish its own first outcome.
  assert.equal(applyNativeExecutionEvent(rerun, end('error', { runId: 'run-2' }), 170).outcome, 'error')
  // A new activation without a run identity cannot inherit the previous run and let its late end pass.
  assert.throws(() => applyNativeExecutionEvent(ended, start({ runId: null }), 180), { code: 'association-conflict' })
  assert.equal(ended.runId, 'run-1')
  assert.equal(ended.state, 'ended')
})

test('a row that never learned a run id applies both empty and first-seen run identities', () => {
  const empty = fold([[created(), 100]])
  const endedEmpty = applyNativeExecutionEvent(empty, end('completed', { runId: null }), 110)
  assert.equal(endedEmpty.state, 'ended')
  assert.equal(endedEmpty.runId, null)
  const learned = applyNativeExecutionEvent(empty, end('completed', { runId: 'run-1' }), 120)
  assert.equal(learned.runId, 'run-1')
  assert.equal(learned.state, 'ended')
})

test('the snapshot list is bounded to the latest 64 rows newest first', () => {
  const rows = Array.from({ length: 70 }, (_, index) => parseNativeExecutionFact({
    executionId: 'child-' + index, sessionId: 'child-' + index, parentSessionId: 'root', instrumentInstanceId: 'instance-A',
    provider: 'spawn', runId: 'run', headerCwd: '/trees/' + index, state: 'ended', outcome: 'completed',
    observed: 'subagent/end: completed', startedAt: index, endedAt: index + 1, recordedAt: index,
  }))
  const latest = latestNativeExecutions(rows)
  assert.equal(latest.length, 64)
  assert.equal(latest[0].executionId, 'child-69')
  assert.equal(latest.at(-1).executionId, 'child-6')
})

test('nativeChildren is only the created-tree relation and keeps a null creator header', () => {
  const creator = fold([[created({ headerCwd: '/trees' }), 100], [start(), 110], [end('completed'), 120]])
  const sibling = parseNativeExecutionFact({ ...creator, executionId: 'sibling', sessionId: 'sibling', parentSessionId: 'root', headerCwd: '/trees' })
  const noHeader = parseNativeExecutionFact({ ...creator, executionId: 'no-header', sessionId: 'no-header', headerCwd: null })
  const other = parseNativeExecutionFact({ ...creator, executionId: 'other', sessionId: 'other', headerCwd: '/trees/A' })
  const children = nativeChildrenForObservation('child', [sibling, noHeader, other, creator])
  assert.deepEqual(children, [
    { sessionId: 'child', headerCwd: '/trees', relation: 'created-tree', source: 'observed' },
  ], 'same path and other children never create a path-equality relation')
  assert.deepEqual(nativeChildrenForObservation('no-header', [creator, noHeader]), [
    { sessionId: 'no-header', headerCwd: null, relation: 'created-tree', source: 'observed' },
  ], 'a creator row survives even without a readable header cwd, with an explicit null')
  assert.deepEqual(nativeChildrenForObservation('nobody', [creator]), [])
  assert.deepEqual(nativeChildrenForObservation('child', []), [])
})

test('lane and view projection label assignment/binding associations as inferred and carry no worktree claim', () => {
  const row = fold([[created(), 100], [start(), 110], [end('completed'), 120]])
  const assignment = { workflowId: 'flow', ticketIds: ['A'] }
  const lane = nativeExecutionLane(assignment, { task: 'Build A', ticketIds: ['A'] })
  assert.deepEqual(lane, { workflowId: 'flow', ticketIds: ['A'], task: 'Build A', source: 'inferred' })
  assert.deepEqual(nativeExecutionLane(undefined, { task: 'unbound', ticketIds: ['B'] }), { workflowId: null, ticketIds: ['B'], task: 'unbound', source: 'inferred' })
  assert.equal(nativeExecutionLane(undefined, undefined), null)
  const view = projectNativeExecution(row, assignment, { task: 'Build A', ticketIds: ['A'] }, { status: 'running' })
  assert.equal(view.activity, 'running')
  assert.equal(view.lane.source, 'inferred')
  assert.equal(Object.hasOwn(view, 'worktree'), false, 'the view no longer exposes a header-path worktree association')
  assert.equal(view.headerCwd, '/trees/A')
  assert(Object.isFrozen(view))
})
