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
  nativeExecutionLane, nativeExecutionWorktree, parseNativeExecutionFact, projectNativeExecution,
} = await import('../src/controls/native-executions.ts')
const { parseRuntimeDocument } = await import('../src/controls/runtime-state.ts')

const base = { sessionId: 'child', parentSessionId: 'root', instrumentInstanceId: 'instance-A', initialCwd: '/trees/A' }
const created = (extra = {}) => ({ kind: 'created', ...base, createdAt: 100, ...extra })
const start = (extra = {}) => ({ kind: 'start', ...base, provider: 'spawn', runId: 'run-1', ...extra })
const end = (outcome = 'completed') => ({ kind: 'end', ...base, outcome })
const disposed = () => ({ kind: 'disposed', ...base })
const fold = events => { let row; for (const [event, at] of events) row = applyNativeExecutionEvent(row, event, at) ?? row; return row }

test('created, start and end fold into one row with the host stopReason as outcome', () => {
  const row = fold([[created(), 100], [start(), 110], [end('completed'), 120]])
  assert.equal(row.executionId, 'child')
  assert.equal(row.sessionId, 'child')
  assert.equal(row.state, 'ended')
  assert.equal(row.outcome, 'completed')
  assert.equal(row.observed, 'subagent/end: completed')
  assert.equal(row.provider, 'spawn')
  assert.equal(row.runId, 'run-1')
  assert.equal(row.initialCwd, '/trees/A')
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
  assert.equal(applyNativeExecutionEvent(row, end('completed'), 121), null, 'a repeated end is equivalent')
  assert.equal(applyNativeExecutionEvent(row, created(), 122), null, 'a creation replay never rewrites an existing state')
})

test('disposed without a published end stays disposed with outcome null', () => {
  const row = fold([[created(), 100], [start(), 110], [disposed(), 120]])
  assert.equal(row.state, 'disposed')
  assert.equal(row.outcome, null)
  assert.equal(row.endedAt, null)
  assert.equal(row.observed, 'agent/disposed')
  assert.equal(applyNativeExecutionEvent(row, disposed(), 121), null)
  // A genuine late end is a published fact and still wins over the earlier disposal.
  const ended = applyNativeExecutionEvent(row, end('error'), 130)
  assert.equal(ended.state, 'ended')
  assert.equal(ended.outcome, 'error')
  assert.equal(ended.endedAt, 130)
})

test('initial cwd is immutable after the first readable value and the same row survives a re-run', () => {
  let row = fold([[created({ initialCwd: '/trees/A' }), 100], [start(), 110], [end('completed'), 120]])
  assert.equal(parseNativeExecutionFact(row).initialCwd, '/trees/A')
  const startedAgain = applyNativeExecutionEvent({ ...row, initialCwd: '/trees/A' }, start({ initialCwd: '/trees/B', runId: 'run-2' }), 130)
  assert.equal(startedAgain.state, 'running')
  assert.equal(startedAgain.initialCwd, '/trees/A', 'a later header cwd never rewrites the initial cwd')
  assert.equal(startedAgain.outcome, null, 'a new activation clears the previous outcome')
  assert.equal(startedAgain.endedAt, null)
  assert.equal(startedAgain.runId, 'run-2')
  assert.equal(startedAgain.executionId, row.executionId)
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
  assert.throws(() => parseRuntimeDocument({ ...document, nativeExecutions: [{ ...row, initialCwd: 'relative/tree' }] }), /initialCwd/)
})

test('the snapshot list is bounded to the latest 64 rows newest first', () => {
  const rows = Array.from({ length: 70 }, (_, index) => parseNativeExecutionFact({
    executionId: 'child-' + index, sessionId: 'child-' + index, parentSessionId: 'root', instrumentInstanceId: 'instance-A',
    provider: 'spawn', runId: 'run', initialCwd: '/trees/' + index, state: 'ended', outcome: 'completed',
    observed: 'subagent/end: completed', startedAt: index, endedAt: index + 1, recordedAt: index,
  }))
  const latest = latestNativeExecutions(rows)
  assert.equal(latest.length, 64)
  assert.equal(latest[0].executionId, 'child-69')
  assert.equal(latest.at(-1).executionId, 'child-6')
})

test('worktree association requires an exact initialCwd/path match and the latest observation wins', () => {
  const row = fold([[created(), 100], [start(), 110], [end('completed'), 120]])
  assert.equal(nativeExecutionWorktree(row, []), null)
  assert.equal(nativeExecutionWorktree(row, [{ path: '/trees/A/deeper', observationId: 'obs-prefix', recordedAt: 300 }]), null)
  const match = nativeExecutionWorktree(row, [
    { path: '/trees/A', observationId: 'obs-old', recordedAt: 200 },
    { path: '/trees/A', observationId: 'obs-new', recordedAt: 300 },
  ])
  assert.deepEqual(match, { path: '/trees/A', observationId: 'obs-new', source: 'observed' })
  const noCwd = parseNativeExecutionFact({ ...row, initialCwd: null })
  assert.equal(nativeExecutionWorktree(noCwd, [{ path: '/trees/A', observationId: 'obs', recordedAt: 1 }]), null)
})

test('nativeChildren separates the creator from same-initial-cwd children and never invents a path', () => {
  const creator = fold([[created(), 100], [start(), 110], [end('completed'), 120]])
  const sameCwd = parseNativeExecutionFact({ ...creator, executionId: 'sibling', sessionId: 'sibling', parentSessionId: 'root' })
  const otherCwd = parseNativeExecutionFact({ ...creator, executionId: 'other', sessionId: 'other', initialCwd: '/trees/B' })
  const noCwd = parseNativeExecutionFact({ ...creator, executionId: 'unknown', sessionId: 'unknown', initialCwd: null })
  const children = nativeChildrenForObservation({ path: '/trees/A', creatorSessionId: 'child' }, [sameCwd, otherCwd, noCwd, creator])
  assert.deepEqual(children, [
    { sessionId: 'child', initialCwd: '/trees/A', relation: 'created-tree', source: 'observed' },
    { sessionId: 'sibling', initialCwd: '/trees/A', relation: 'initial-cwd', source: 'observed' },
  ])
  assert.deepEqual(nativeChildrenForObservation({ path: '/trees/Z', creatorSessionId: 'nobody' }, [creator]), [])
})

test('lane and view projection label assignment/binding associations as inferred', () => {
  const row = fold([[created(), 100], [start(), 110], [end('completed'), 120]])
  const assignment = { workflowId: 'flow', ticketIds: ['A'] }
  const lane = nativeExecutionLane(assignment, { task: 'Build A', ticketIds: ['A'] })
  assert.deepEqual(lane, { workflowId: 'flow', ticketIds: ['A'], task: 'Build A', source: 'inferred' })
  assert.deepEqual(nativeExecutionLane(undefined, { task: 'unbound', ticketIds: ['B'] }), { workflowId: null, ticketIds: ['B'], task: 'unbound', source: 'inferred' })
  assert.equal(nativeExecutionLane(undefined, undefined), null)
  const view = projectNativeExecution(row, assignment, { task: 'Build A', ticketIds: ['A'] },
    [{ path: '/trees/A', observationId: 'obs-1', recordedAt: 200 }], { status: 'running' })
  assert.equal(view.activity, 'running')
  assert.equal(view.lane.source, 'inferred')
  assert.deepEqual(view.worktree, { path: '/trees/A', observationId: 'obs-1', source: 'observed' })
  assert(Object.isFrozen(view))
})
