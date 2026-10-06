import type { PolicySnapshot } from './policy.js';
export interface InstrumentInstance {
    readonly instrumentInstanceId: string;
    readonly ownerSessionId: string;
    readonly controlWorkspaceId: string;
}
export interface SessionAssociation {
    readonly sessionId: string;
    readonly parentSessionId: string | null;
    readonly instrumentInstanceId: string;
}
/** One atomic record: no half-persisted owner/child indexes. No leases/business state yet. */
export interface ControlsDocument {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly policy: PolicySnapshot;
    readonly instances: readonly InstrumentInstance[];
    readonly associations: readonly SessionAssociation[];
}
export declare const INITIAL_DOCUMENT: ControlsDocument;
/** Corruption/unknown versions reject; never silently reset a persisted ledger. */
export declare function parseControlsDocument(value: unknown): ControlsDocument;
