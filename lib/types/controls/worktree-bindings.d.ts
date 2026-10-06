import type { InstrumentInstance } from './state.js';
import type { InstrumentAuthor } from './instrument-state.js';
import type { VersionedStorage } from './versioned-storage.js';
export interface WorktreeBindingIntent {
    readonly operationId: string;
    readonly parentSessionId: string;
    /** Caller supplies this as native spec.sessionId; never generate a new identity on retry. */
    readonly plannedChildSessionId: string;
    readonly requestedCwd: string;
    readonly task?: string;
}
export interface WorktreeBindingValue extends WorktreeBindingIntent {
    readonly actualChildSessionId: string | null;
    readonly actualCwd: string | null;
    readonly acceptance: 'unknown' | 'accepted' | 'rejected';
    readonly outcome: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'accepted-unknown';
    readonly diagnostic: string | null;
    readonly business: {
        readonly state: 'active' | 'discarded' | 'cleaned';
        readonly notes?: string;
    };
}
export interface WorktreeBindingBusinessUpdate {
    readonly operationId: string;
    readonly bindingId: string;
    /** Latest row revision, not the owner document revision. */
    readonly expectedRevision: number;
    readonly state: 'active' | 'discarded' | 'cleaned';
    readonly notes?: string;
}
export interface WorktreeBindingVersion {
    readonly command?: WorktreeBindingBusinessUpdate;
    readonly revision: number;
    readonly recordedAt: number;
    readonly operationId: string;
    readonly source: 'intent' | 'program' | 'agent';
    readonly author: InstrumentAuthor;
    readonly value: WorktreeBindingValue;
}
export interface WorktreeBindingRow {
    readonly bindingId: string;
    readonly revision: number;
    readonly value: WorktreeBindingValue;
    readonly history: readonly WorktreeBindingVersion[];
}
export interface WorktreeBindingsLegacyDocument {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly owner: InstrumentInstance;
    readonly rows: readonly WorktreeBindingRow[];
}
export interface WorktreeBindingTechnical {
    readonly operationId: string;
    readonly parentSessionId: string;
    readonly plannedChildSessionId: string;
    readonly requestedCwd: string;
    readonly actualChildSessionId: string | null;
    readonly actualCwd: string | null;
    readonly acceptance: WorktreeBindingValue['acceptance'];
    readonly businessState: WorktreeBindingValue['business']['state'];
}
export interface WorktreeBindingManifest {
    readonly bindingId: string;
    readonly revision: number;
    readonly recordedAt: number;
    readonly operationId: string;
    readonly source: WorktreeBindingVersion['source'];
    readonly author: InstrumentAuthor;
    readonly technical: WorktreeBindingTechnical;
    readonly valueDigest: string;
    readonly notesDigest: string;
    readonly retained: boolean;
}
export interface WorktreeBindingMaterializedRow extends WorktreeBindingRow {
    readonly creationAuthor: InstrumentAuthor;
    readonly creationDigest: string;
    readonly identity: Omit<WorktreeBindingIntent, 'task'>;
}
export interface WorktreeBindingsSourceCoverage {
    readonly kind: 'history-only';
    readonly throughRevision: number;
    readonly removedVersions: number;
    readonly removed: readonly {
        readonly bindingId: string;
        readonly revision: number;
    }[];
}
export interface WorktreeBindingsCleanupResult {
    readonly revision: number;
    readonly removedVersions: number;
    readonly checkpointRev: number;
    readonly sourceCoverage: WorktreeBindingsSourceCoverage;
    readonly replayed: boolean;
}
export interface WorktreeBindingsCompact {
    readonly operationId: string;
    readonly expectedRevision: number;
}
export interface WorktreeBindingsPurgeHistory extends WorktreeBindingsCompact {
    readonly throughRevision: number;
    readonly bindingIds: readonly string[];
}
export interface WorktreeBindingOperation {
    readonly operationId: string;
    readonly kind: 'creation' | 'business' | 'compact' | 'purge-history';
    readonly digest: string;
    readonly author: InstrumentAuthor;
    readonly bindingId: string | null;
    readonly revision: number;
    readonly result?: Omit<WorktreeBindingsCleanupResult, 'replayed'>;
}
export interface WorktreeBindingsMaterializedDocument {
    readonly schemaVersion: 2;
    readonly revision: number;
    readonly owner: InstrumentInstance;
    readonly checkpointRev: number;
    readonly purgedThroughRevision: number;
    readonly rows: readonly WorktreeBindingMaterializedRow[];
    /** Technical metadata only: deleted body holes are explicit, never fake empty reports. */
    readonly manifest: readonly WorktreeBindingManifest[];
    /** SHA-256 receipts, never raw command/fingerprint bodies. */
    readonly operations: readonly WorktreeBindingOperation[];
}
export type WorktreeBindingsDocument = WorktreeBindingsLegacyDocument | WorktreeBindingsMaterializedDocument;
export interface WorktreeBindingCurrent {
    readonly bindingId: string;
    readonly revision: number;
    readonly value: WorktreeBindingValue;
    readonly source: WorktreeBindingVersion['source'];
    readonly author: InstrumentAuthor;
    readonly recordedAt: number;
}
export interface WorktreeBindingsSnapshot {
    readonly checkpointRev: number;
    readonly sourceCoverage: WorktreeBindingsSourceCoverage;
    readonly revision: number;
    /** Entire retained registry, including cleaned rows and their authored old versions. */
    readonly rows: readonly WorktreeBindingRow[];
    readonly current: readonly WorktreeBindingCurrent[];
}
/** Derived by runtime from native persisted session header, never model input. */
export interface WorktreeBindingHeader {
    readonly sessionId: string;
    readonly parentSessionId: string;
    readonly cwd: string;
}
export interface WorktreeBindingOutcome {
    readonly acceptance: 'unknown' | 'accepted' | 'rejected';
    readonly outcome: 'failed' | 'cancelled' | 'accepted-unknown';
    readonly diagnostic?: string;
}
export interface WorktreeBindings {
    compact(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, command: WorktreeBindingsCompact, signal?: AbortSignal): Promise<WorktreeBindingsCleanupResult>;
    purgeHistory(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, command: WorktreeBindingsPurgeHistory, signal?: AbortSignal): Promise<WorktreeBindingsCleanupResult>;
    recordOutcome(owner: InstrumentInstance, operationId: string, outcome: WorktreeBindingOutcome, actualAuthor: InstrumentAuthor): Promise<WorktreeBindingRow>;
    reconcile(owner: InstrumentInstance, operationId: string, actualHeader: WorktreeBindingHeader | null, actualAuthor: InstrumentAuthor): Promise<WorktreeBindingRow>;
    updateBusiness(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, command: WorktreeBindingBusinessUpdate): Promise<WorktreeBindingRow>;
    confirm(owner: InstrumentInstance, operationId: string, actualHeader: WorktreeBindingHeader, actualAuthor: InstrumentAuthor): Promise<WorktreeBindingRow>;
    registerIntent(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, intent: WorktreeBindingIntent): Promise<{
        readonly dispatch: boolean;
        readonly replayed: boolean;
        readonly row: WorktreeBindingRow;
    }>;
    query(owner: InstrumentInstance): Promise<WorktreeBindingsSnapshot>;
}
export type WorktreeBindingsStorage = (ownerSessionId: string) => VersionedStorage<WorktreeBindingsDocument>;
/** V1 is read compatibly, never written back as V1; normalization alone deletes nothing. */
export declare function parseWorktreeBindingsDocument(value: unknown): WorktreeBindingsMaterializedDocument;
/** Trusted program seam, not an authorization module. Runtime MUST authenticate
 * owner/parent/author and authorize every call before exposing any part to tools. */
export declare function createWorktreeBindings(storageForOwner: WorktreeBindingsStorage, now?: () => number): WorktreeBindings;
