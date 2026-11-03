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
    /**
     * First readable child header cwd, kept only as a header source value. It does not prove
     * the child's actual initial directory, current directory or use of any tree; null means no
     * readable header value, not "no directory". Immutable after the first observed value.
     */
    readonly headerCwd: string | null;
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
export interface NativeExecutionView extends NativeExecutionFact {
    readonly activity: NativeExecutionActivity;
    readonly lane: NativeExecutionLane | null;
}
/** One read-time association shown on a worktree observation row; never a usage claim. */
export interface NativeExecutionChild {
    readonly sessionId: string;
    /** The creator's stored header value; null is retained, not treated as a missing row. */
    readonly headerCwd: string | null;
    /** Only an observed `create_worktree` creator relation; no path-equality relation exists. */
    readonly relation: 'created-tree';
    readonly source: 'observed';
}
/** Snapshot cap only; the durable owner document retains one row per child. */
export declare const NATIVE_EXECUTION_SNAPSHOT_LIMIT = 64;
/**
 * Strict storage parser; malformed rows are rejected, never silently reset. `initialCwd` is
 * accepted only as the legacy spelling of the same header value. A row that carries both keys
 * is accepted only when the values agree; conflicting values are rejected rather than choosing
 * one silently. Every read result exposes only `headerCwd`, and every new write stores only
 * `headerCwd`.
 */
export declare function parseNativeExecutionFact(value: unknown): NativeExecutionFact;
export interface NativeExecutionEventBase {
    readonly sessionId: string;
    readonly parentSessionId: string;
    readonly instrumentInstanceId: string;
    /** Readable child header cwd, or null when the host supplied none. Only a header value. */
    readonly headerCwd: string | null;
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
    readonly runId: string | null;
}) | (NativeExecutionEventBase & {
    readonly kind: 'disposed';
});
/**
 * Pure event fold for one native child session. Returns null when the event is equivalent to
 * the stored row, so repeated lifecycle edges never add a document revision. `agent/status`
 * has no event here: activity is read from the live Agent and never stored.
 *
 * An end edge is fenced by host run identity. When both the stored row and the event name a
 * run they must agree; when the event omits the run while the row belongs to one, the outcome
 * cannot be attributed and is rejected instead of guessed from arrival order. A row that never
 * learned a run id may learn it from the end edge. Repeated end of the same run/outcome is
 * equivalent and writes no revision.
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
/**
 * Read-time child association for one observed tree. Only the observed tree creator yields a
 * `created-tree` row; the creator's header cwd is carried as source data and may be null. No
 * path-equality relation is produced: a matching header path does not prove the child started
 * in, or uses, that tree.
 */
export declare function nativeChildrenForObservation(creatorSessionId: string, facts: readonly NativeExecutionFact[]): readonly NativeExecutionChild[];
export declare function projectNativeExecution(fact: NativeExecutionFact, assignment: NativeExecutionAssignmentSource | undefined, binding: NativeExecutionBindingSource | undefined, agent: {
    readonly status?: string;
} | undefined): NativeExecutionView;
