/** One native child session's latest observed lifecycle facts. Program facts only. */
export type NativeExecutionState = 'created' | 'running' | 'ended' | 'disposed';
export interface NativeExecutionFact {
    /** One row per native child session; always equal to `sessionId`. */
    readonly executionId: string;
    readonly sessionId: string;
    readonly parentSessionId: string;
    readonly instrumentInstanceId: string;
    /** Provider reported by `subagent/start`; null until an actual run starts. */
    readonly provider: string | null;
    /** Host run identity of the latest observed start; cleared by neither end nor disposal. */
    readonly runId: string | null;
    /** First readable child header cwd; immutable after the first observed value. */
    readonly initialCwd: string | null;
    readonly state: NativeExecutionState;
    /** Host-published stopReason; null unless a `subagent/end` published one. */
    readonly outcome: string | null;
    /** Latest fact source, e.g. `agent/created`, `subagent/start` or `subagent/end: completed`. */
    readonly observed: string;
    readonly startedAt: number;
    readonly endedAt: number | null;
    readonly recordedAt: number;
}
export type NativeExecutionActivity = 'running' | 'idle' | 'gone';
/** Read-time activity from the live Agent; never persisted, so it cannot go stale. */
export interface NativeExecutionLane {
    readonly workflowId: string | null;
    readonly ticketIds: readonly string[];
    readonly task: string | null;
    /** Associations resolved from assignment/binding are inferred, never a strong binding. */
    readonly source: 'inferred';
}
export interface NativeExecutionWorktree {
    readonly path: string;
    readonly observationId: string;
    /** Exact initialCwd/path match with a current create_worktree observation. */
    readonly source: 'observed';
}
export interface NativeExecutionView extends NativeExecutionFact {
    readonly activity: NativeExecutionActivity;
    readonly lane: NativeExecutionLane | null;
    readonly worktree: NativeExecutionWorktree | null;
}
/** One read-time association shown on a worktree observation row; never a usage claim. */
export interface NativeExecutionChild {
    readonly sessionId: string;
    readonly initialCwd: string;
    readonly relation: 'created-tree' | 'initial-cwd';
    readonly source: 'observed';
}
/** Snapshot cap only; the durable owner document retains one row per child. */
export declare const NATIVE_EXECUTION_SNAPSHOT_LIMIT = 64;
/** Strict storage parser; malformed rows are rejected, never silently reset. */
export declare function parseNativeExecutionFact(value: unknown): NativeExecutionFact;
export interface NativeExecutionEventBase {
    readonly sessionId: string;
    readonly parentSessionId: string;
    readonly instrumentInstanceId: string;
    /** Readable child header cwd, or null when the host supplied none. */
    readonly initialCwd: string | null;
}
export type NativeExecutionEvent = (NativeExecutionEventBase & {
    readonly kind: 'created';
    readonly createdAt: number | null;
}) | (NativeExecutionEventBase & {
    readonly kind: 'start';
    readonly provider: string | null;
    readonly runId: string | null;
}) | (NativeExecutionEventBase & {
    readonly kind: 'end';
    readonly outcome: string;
}) | (NativeExecutionEventBase & {
    readonly kind: 'disposed';
});
/**
 * Pure event fold for one native child session. Returns null when the event is equivalent to
 * the stored row, so repeated lifecycle edges never add a document revision. `agent/status`
 * has no event here: activity is read from the live Agent and never stored.
 */
export declare function applyNativeExecutionEvent(existing: NativeExecutionFact | undefined, event: NativeExecutionEvent, at: number): NativeExecutionFact | null;
/** Latest rows first; ties use the stable execution id so a snapshot is deterministic. */
export declare function latestNativeExecutions(facts: readonly NativeExecutionFact[], limit?: number): readonly NativeExecutionFact[];
export declare function nativeExecutionActivity(agent: {
    readonly status?: string;
} | undefined): NativeExecutionActivity;
export interface NativeExecutionAssignmentSource {
    readonly workflowId: string | null;
    readonly ticketIds: readonly string[];
}
export interface NativeExecutionBindingSource {
    readonly task?: string;
    readonly ticketIds?: readonly string[];
}
/** Assignment/binding association is inferred; it never creates or rewrites a binding. */
export declare function nativeExecutionLane(assignment: NativeExecutionAssignmentSource | undefined, binding: NativeExecutionBindingSource | undefined): NativeExecutionLane | null;
export interface NativeExecutionObservationSource {
    readonly path: string;
    readonly observationId: string;
    readonly recordedAt: number;
}
/** A worktree association requires an exact initialCwd/path match; no prefix or link inference. */
export declare function nativeExecutionWorktree(fact: NativeExecutionFact, observations: readonly NativeExecutionObservationSource[]): NativeExecutionWorktree | null;
export interface NativeExecutionObservationIdentity {
    readonly path: string;
    readonly creatorSessionId: string;
}
/**
 * Read-time child association for one observed tree. `created-tree` only says that child
 * created the tree; `initial-cwd` only says the child started in that exact path. Neither
 * claims the directory is in use.
 */
export declare function nativeChildrenForObservation(observation: NativeExecutionObservationIdentity, facts: readonly NativeExecutionFact[]): readonly NativeExecutionChild[];
export declare function projectNativeExecution(fact: NativeExecutionFact, assignment: NativeExecutionAssignmentSource | undefined, binding: NativeExecutionBindingSource | undefined, observations: readonly NativeExecutionObservationSource[], agent: {
    readonly status?: string;
} | undefined): NativeExecutionView;
