import type { InstrumentInstance } from './state.js';
import type { InstrumentAuthor } from './instrument-state.js';
import type { VersionedStorage } from './versioned-storage.js';
/** One native create_worktree call observed through the tool pipeline. Immutable creation facts. */
export interface WorktreeObservationInput {
    readonly creatorSessionId: string;
    /** Tool call identity; a PTC sub-dispatch uses its own sub-call id. */
    readonly callId: string;
    readonly rootCallId: string;
    readonly turn: number | null;
    readonly step: number | null;
    readonly path: string;
    readonly branch: string;
    readonly baseCommit: string;
    readonly repositoryRoot: string;
}
/** Author-visible, strictly bounded Git facts for one observed checkout; never inferred. */
export interface WorktreeObservationFacts {
    readonly repositoryPath: string;
    readonly gitCommonDir: string;
    readonly gitDir: string;
    readonly pathIdentity: string;
    readonly branchRef: string | null;
    readonly branchOid: string | null;
    readonly headOid: string;
}
export interface WorktreeObservationCheck {
    readonly state: 'unverified' | 'verified' | 'failed' | 'absent';
    readonly checkedAt: number | null;
    readonly diagnostic: string | null;
    /** Last proven facts; retained across a later failed check, never invented. */
    readonly facts: WorktreeObservationFacts | null;
}
export interface WorktreeObservationValue extends WorktreeObservationInput {
    readonly check: WorktreeObservationCheck;
    readonly business: {
        readonly state: 'open' | 'cleaned';
        readonly notes?: string;
    };
}
export interface WorktreeObservationVersion {
    readonly revision: number;
    readonly recordedAt: number;
    readonly event: 'observed' | 'verified' | 'verification-failed' | 'absent' | 'cleaned';
    /** 'replay' is a lower-evidence reconstruction from durable session events, never a live observation. */
    readonly source: 'program' | 'replay' | 'agent';
    readonly author: InstrumentAuthor;
    readonly value: WorktreeObservationValue;
}
export interface WorktreeObservationRow {
    readonly observationId: string;
    readonly revision: number;
    readonly value: WorktreeObservationValue;
    readonly history: readonly WorktreeObservationVersion[];
}
export interface WorktreeObservationsDocument {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly owner: InstrumentInstance;
    readonly rows: readonly WorktreeObservationRow[];
}
export interface WorktreeObservationCurrent {
    readonly observationId: string;
    readonly revision: number;
    readonly value: WorktreeObservationValue;
    readonly source: WorktreeObservationVersion['source'];
    readonly recordedAt: number;
}
/** Lane association resolved at read time from durable lane bindings; null when no binding names the creator. */
export interface WorktreeObservationLane {
    readonly workflowId: string | null;
    readonly ticketIds: readonly string[];
    readonly task: string | null;
}
/** One current row as projected to the model/GUI: durable facts plus read-time live facts. */
export interface WorktreeObservationView extends WorktreeObservationCurrent {
    /** Creator session activity right now; never stored, so it cannot go stale. */
    readonly creatorActivity: 'running' | 'idle' | 'gone';
    readonly lane: WorktreeObservationLane | null;
}
export interface WorktreeObservationsSnapshot {
    readonly revision: number;
    /** Entire retained registry, including author-cleaned rows and their retained versions. */
    readonly rows: readonly WorktreeObservationRow[];
    /** Open rows only; the runtime adds read-time creator activity and ticket association. */
    readonly current: readonly WorktreeObservationCurrent[];
}
/** Program-only checks. A failed check keeps the unknown explicit instead of reporting success. */
export type WorktreeObservationCheckInput = {
    readonly observationId: string;
    readonly kind: 'facts';
    readonly facts: WorktreeObservationFacts;
} | {
    readonly observationId: string;
    readonly kind: 'absent';
} | {
    readonly observationId: string;
    readonly kind: 'failed';
    readonly diagnostic: string;
};
export interface WorktreeObservationBusinessUpdate {
    readonly operationId: string;
    readonly observationId: string;
    /** Latest row revision, not the owner document revision. */
    readonly expectedRevision: number;
    readonly state: 'open' | 'cleaned';
    readonly notes?: string;
}
export interface WorktreeObservations {
    observe(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, input: WorktreeObservationInput, source: 'program' | 'replay'): Promise<{
        readonly recorded: boolean;
        readonly row: WorktreeObservationRow;
    }>;
    check(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, input: WorktreeObservationCheckInput): Promise<WorktreeObservationRow>;
    updateBusiness(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, command: WorktreeObservationBusinessUpdate): Promise<WorktreeObservationRow>;
    query(owner: InstrumentInstance): Promise<WorktreeObservationsSnapshot>;
}
export type WorktreeObservationsStorage = (ownerSessionId: string) => VersionedStorage<WorktreeObservationsDocument>;
/** Storage parser: malformed history is rejected, never reset to an empty registry. */
export declare function parseWorktreeObservationsDocument(value: unknown): WorktreeObservationsDocument;
/** Trusted program seam, not an authorization module. Runtime MUST authenticate the owner and
 * authorize every call before exposing any part to tools; no model tool writes observations. */
export declare function createWorktreeObservations(storageForOwner: WorktreeObservationsStorage, now?: () => number): WorktreeObservations;
