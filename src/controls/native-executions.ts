import { isAbsolute, normalize } from 'node:path'
import { ControlsError, freeze, id, invalid, record, revision } from './validation.js'

/** One native child session's latest observed lifecycle facts. Program facts only. */
export type NativeExecutionState = 'created' | 'running' | 'ended' | 'disposed'

export interface NativeExecutionFact {
  /** One row per native child session; always equal to `sessionId`. */
  readonly executionId: string
  readonly sessionId: string
  readonly parentSessionId: string
  readonly instrumentInstanceId: string
  /** Provider reported by `subagent/start`; null until an actual run starts. */
  readonly provider: string | null
  /** Host run identity of the latest observed start; cleared by neither end nor disposal. */
  readonly runId: string | null
  /** First readable child header cwd; immutable after the first observed value. */
  readonly initialCwd: string | null
  readonly state: NativeExecutionState
  /** Host-published stopReason; null unless a `subagent/end` published one. */
  readonly outcome: string | null
  /** Latest fact source, e.g. `agent/created`, `subagent/start` or `subagent/end: completed`. */
  readonly observed: string
  readonly startedAt: number
  readonly endedAt: number | null
  readonly recordedAt: number
}

export type NativeExecutionActivity = 'running' | 'idle' | 'gone'
/** Read-time activity from the live Agent; never persisted, so it cannot go stale. */
export interface NativeExecutionLane {
  readonly workflowId: string | null
  readonly ticketIds: readonly string[]
  readonly task: string | null
  /** Associations resolved from assignment/binding are inferred, never a strong binding. */
  readonly source: 'inferred'
}
export interface NativeExecutionWorktree {
  readonly path: string
  readonly observationId: string
  /** Exact initialCwd/path match with a current create_worktree observation. */
  readonly source: 'observed'
}
export interface NativeExecutionView extends NativeExecutionFact {
  readonly activity: NativeExecutionActivity
  readonly lane: NativeExecutionLane | null
  readonly worktree: NativeExecutionWorktree | null
}
/** One read-time association shown on a worktree observation row; never a usage claim. */
export interface NativeExecutionChild {
  readonly sessionId: string
  readonly initialCwd: string
  readonly relation: 'created-tree' | 'initial-cwd'
  readonly source: 'observed'
}

/** Snapshot cap only; the durable owner document retains one row per child. */
export const NATIVE_EXECUTION_SNAPSHOT_LIMIT = 64

const STATES: readonly NativeExecutionState[] = ['created', 'running', 'ended', 'disposed']

function boundedText(value: unknown, where: string, maximum = 1024): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) invalid(where + ' must be bounded non-empty text')
  return value
}
function optionalText(value: unknown, where: string): string | null {
  if (value === null) return null
  return boundedText(value, where, 512)
}
function absolutePath(value: unknown, where: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || normalize(value) !== value || /[\u0000-\u001f\u007f]/u.test(value)) invalid(where + ' must be a normalized absolute path')
  return value
}
function optionalPath(value: unknown, where: string): string | null {
  return value === null ? null : absolutePath(value, where)
}
function optionalRevision(value: unknown, where: string): number | null {
  return value === null ? null : revision(value, where)
}

/** Strict storage parser; malformed rows are rejected, never silently reset. */
export function parseNativeExecutionFact(value: unknown): NativeExecutionFact {
  const r = record(value, 'native execution fact', ['executionId', 'sessionId', 'parentSessionId', 'instrumentInstanceId',
    'provider', 'runId', 'initialCwd', 'state', 'outcome', 'observed', 'startedAt', 'endedAt', 'recordedAt'])
  const executionId = id(r.executionId, 'native executionId'), sessionId = id(r.sessionId, 'native sessionId')
  if (executionId !== sessionId) invalid('native execution identity must equal its child session')
  if (!STATES.includes(r.state as NativeExecutionState)) invalid('unknown native execution state')
  const state = r.state as NativeExecutionState
  const outcome = optionalText(r.outcome, 'native outcome')
  const endedAt = optionalRevision(r.endedAt, 'native endedAt')
  if (state === 'ended' ? outcome === null || endedAt === null : outcome !== null || endedAt !== null) invalid('native execution outcome/end belong only to an ended row')
  return freeze({ executionId, sessionId, parentSessionId: id(r.parentSessionId, 'native parentSessionId'),
    instrumentInstanceId: id(r.instrumentInstanceId, 'native instrumentInstanceId'),
    provider: optionalText(r.provider, 'native provider'), runId: optionalText(r.runId, 'native runId'),
    initialCwd: optionalPath(r.initialCwd, 'native initialCwd'), state, outcome,
    observed: boundedText(r.observed, 'native observed'), startedAt: revision(r.startedAt, 'native startedAt'),
    endedAt, recordedAt: revision(r.recordedAt, 'native recordedAt') })
}

export interface NativeExecutionEventBase {
  readonly sessionId: string
  readonly parentSessionId: string
  readonly instrumentInstanceId: string
  /** Readable child header cwd, or null when the host supplied none. */
  readonly initialCwd: string | null
}
export type NativeExecutionEvent =
  | (NativeExecutionEventBase & { readonly kind: 'created'; readonly createdAt: number | null })
  | (NativeExecutionEventBase & { readonly kind: 'start'; readonly provider: string | null; readonly runId: string | null })
  | (NativeExecutionEventBase & { readonly kind: 'end'; readonly outcome: string })
  | (NativeExecutionEventBase & { readonly kind: 'disposed' })

function sameFact(a: NativeExecutionFact, b: NativeExecutionFact): boolean {
  return a.executionId === b.executionId && a.sessionId === b.sessionId && a.parentSessionId === b.parentSessionId
    && a.instrumentInstanceId === b.instrumentInstanceId && a.provider === b.provider && a.runId === b.runId
    && a.initialCwd === b.initialCwd && a.state === b.state && a.outcome === b.outcome
    && a.observed === b.observed && a.startedAt === b.startedAt && a.endedAt === b.endedAt
}
function committed(existing: NativeExecutionFact | undefined, candidate: NativeExecutionFact, at: number): NativeExecutionFact | null {
  if (existing === undefined) return freeze({ ...candidate, recordedAt: at })
  if (sameFact(candidate, existing)) return null
  return freeze({ ...candidate, recordedAt: at })
}

/**
 * Pure event fold for one native child session. Returns null when the event is equivalent to
 * the stored row, so repeated lifecycle edges never add a document revision. `agent/status`
 * has no event here: activity is read from the live Agent and never stored.
 */
export function applyNativeExecutionEvent(existing: NativeExecutionFact | undefined, event: NativeExecutionEvent, at: number): NativeExecutionFact | null {
  const timestamp = revision(at, 'native recordedAt')
  if (existing !== undefined && (existing.parentSessionId !== event.parentSessionId || existing.instrumentInstanceId !== event.instrumentInstanceId))
    throw new ControlsError('association-conflict', 'native execution row belongs to another parent or instrument instance')
  const initialCwd = existing?.initialCwd ?? event.initialCwd ?? null
  const base: NativeExecutionFact = existing ?? { executionId: event.sessionId, sessionId: event.sessionId,
    parentSessionId: event.parentSessionId, instrumentInstanceId: event.instrumentInstanceId, provider: null, runId: null,
    initialCwd: null, state: 'created', outcome: null, observed: 'agent/created', startedAt: timestamp, endedAt: null, recordedAt: timestamp }
  let candidate: NativeExecutionFact
  switch (event.kind) {
    case 'created':
      // A creation edge fills an absent row. On an existing row it may fill the immutable
      // initial cwd but never rewrites a recorded state: a wake is proven by its start edge.
      candidate = existing === undefined
        ? { ...base, initialCwd, state: 'created', outcome: null, endedAt: null, observed: 'agent/created', startedAt: event.createdAt ?? timestamp }
        : { ...base, initialCwd }
      break
    case 'start': {
      const newActivation = base.state !== 'running' || base.runId !== event.runId
      candidate = { ...base, initialCwd, state: 'running', provider: event.provider ?? base.provider,
        runId: event.runId ?? base.runId, outcome: null, endedAt: null, observed: 'subagent/start',
        startedAt: newActivation ? timestamp : base.startedAt }
      break
    }
    case 'end': {
      const observed = 'subagent/end: ' + event.outcome
      const duplicate = base.state === 'ended' && base.outcome === event.outcome && base.observed === observed
      candidate = { ...base, initialCwd, state: 'ended', outcome: event.outcome,
        endedAt: duplicate ? base.endedAt : timestamp, observed }
      break
    }
    default:
      candidate = base.state === 'ended' ? { ...base, initialCwd } : { ...base, initialCwd, state: 'disposed', outcome: null, endedAt: null, observed: 'agent/disposed' }
      break
  }
  return committed(existing, candidate, timestamp)
}

/** Latest rows first; ties use the stable execution id so a snapshot is deterministic. */
export function latestNativeExecutions(facts: readonly NativeExecutionFact[], limit = NATIVE_EXECUTION_SNAPSHOT_LIMIT): readonly NativeExecutionFact[] {
  const maximum = Math.max(0, Math.floor(limit))
  return [...facts].sort((a, b) => b.recordedAt - a.recordedAt || (a.executionId < b.executionId ? -1 : a.executionId > b.executionId ? 1 : 0)).slice(0, maximum)
}

export function nativeExecutionActivity(agent: { readonly status?: string } | undefined): NativeExecutionActivity {
  return agent === undefined ? 'gone' : agent.status === 'running' ? 'running' : 'idle'
}

export interface NativeExecutionAssignmentSource {
  readonly workflowId: string | null
  readonly ticketIds: readonly string[]
}
export interface NativeExecutionBindingSource {
  readonly task?: string
  readonly ticketIds?: readonly string[]
}
/** Assignment/binding association is inferred; it never creates or rewrites a binding. */
export function nativeExecutionLane(assignment: NativeExecutionAssignmentSource | undefined,
  binding: NativeExecutionBindingSource | undefined): NativeExecutionLane | null {
  if (assignment === undefined && binding === undefined) return null
  return freeze({ workflowId: assignment?.workflowId ?? null, ticketIds: assignment?.ticketIds ?? binding?.ticketIds ?? [],
    task: binding?.task ?? null, source: 'inferred' })
}

export interface NativeExecutionObservationSource {
  readonly path: string
  readonly observationId: string
  readonly recordedAt: number
}
/** A worktree association requires an exact initialCwd/path match; no prefix or link inference. */
export function nativeExecutionWorktree(fact: NativeExecutionFact, observations: readonly NativeExecutionObservationSource[]): NativeExecutionWorktree | null {
  if (fact.initialCwd === null) return null
  let latest: NativeExecutionObservationSource | undefined
  for (const observation of observations) {
    if (observation.path !== fact.initialCwd) continue
    if (latest === undefined || observation.recordedAt > latest.recordedAt
      || observation.recordedAt === latest.recordedAt && observation.observationId > latest.observationId) latest = observation
  }
  return latest === undefined ? null : freeze({ path: latest.path, observationId: latest.observationId, source: 'observed' })
}

export interface NativeExecutionObservationIdentity {
  readonly path: string
  readonly creatorSessionId: string
}
/**
 * Read-time child association for one observed tree. `created-tree` only says that child
 * created the tree; `initial-cwd` only says the child started in that exact path. Neither
 * claims the directory is in use.
 */
export function nativeChildrenForObservation(observation: NativeExecutionObservationIdentity,
  facts: readonly NativeExecutionFact[]): readonly NativeExecutionChild[] {
  const rows: NativeExecutionChild[] = []
  for (const fact of facts) {
    if (fact.initialCwd === null) continue
    const relation = fact.sessionId === observation.creatorSessionId ? 'created-tree'
      : fact.initialCwd === observation.path ? 'initial-cwd' : null
    if (relation === null) continue
    rows.push(freeze({ sessionId: fact.sessionId, initialCwd: fact.initialCwd, relation, source: 'observed' }))
  }
  return freeze(rows.sort((a, b) => a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0))
}

export function projectNativeExecution(fact: NativeExecutionFact, assignment: NativeExecutionAssignmentSource | undefined,
  binding: NativeExecutionBindingSource | undefined, observations: readonly NativeExecutionObservationSource[],
  agent: { readonly status?: string } | undefined): NativeExecutionView {
  return freeze({ ...fact, activity: nativeExecutionActivity(agent), lane: nativeExecutionLane(assignment, binding),
    worktree: nativeExecutionWorktree(fact, observations) })
}
