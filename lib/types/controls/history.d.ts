import type { InstrumentInstance } from './state.js';
import { MemoryVersionedStorage } from './versioned-storage.js';
import type { VersionedStorage, VersionedTable } from './versioned-storage.js';
export type HistoryJSON = null | boolean | number | string | readonly HistoryJSON[] | {
    readonly [key: string]: HistoryJSON;
};
export interface HistorySource {
    readonly kind: 'authored' | 'program' | 'snapshot';
    readonly domain: string;
    readonly author: HistoryJSON;
    readonly recordedAt: number | null;
    readonly coverage: 'recorded-history' | 'snapshot-only';
}
export interface HistoryObservation {
    readonly kind: string;
    readonly recordId: string;
    readonly recordKey: string;
    readonly version: number;
    readonly snapshot: HistoryJSON;
    readonly source: HistorySource;
    readonly flags?: {
        readonly done?: boolean;
        readonly cleanedWorktree?: boolean;
    };
    readonly summary?: string;
}
export interface HistoryRow extends Omit<HistoryObservation, 'source'> {
    readonly source: HistorySource | null;
    readonly sourceDomain: string;
    readonly purged: boolean;
    readonly historyId: string;
    readonly sequence: number;
    readonly capturedAt: number;
}
export interface HistoryDocument extends InstrumentInstance {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly rows: readonly HistoryRow[];
    readonly contexts: readonly HistoryContext[];
    readonly actions: readonly HistoryActionRecord[];
    readonly suppression: readonly HistorySuppression[];
}
export interface HistorySuppression {
    readonly kind: string;
    readonly recordId: string;
    readonly sourceDomain: string;
    readonly throughVersion: number;
}
export interface HistoryContext {
    readonly kind: string;
    readonly recordId: string;
    readonly included: boolean;
}
export type HistoryAction = {
    readonly action: 'set-context';
    readonly kind: string;
    readonly recordId: string;
    readonly included: boolean;
} | {
    readonly action: 'purge';
    readonly historyIds?: readonly string[];
    readonly range?: {
        readonly fromSequence: number;
        readonly toSequence: number;
    };
    readonly archivedOnly?: boolean;
};
export interface HistoryActionRecord {
    readonly revision: number;
    readonly action: HistoryAction;
    readonly source: HistorySource;
    readonly capturedAt: number;
}
export interface HistoryApplyResult {
    readonly revision: number;
    readonly operation: HistoryActionRecord | null;
}
export type HistoryStorage = VersionedStorage<HistoryDocument>;
export interface HistoryCursor {
    readonly instrumentInstanceId: string;
    readonly ownerSessionId: string;
    readonly controlWorkspaceId: string;
    readonly cut: number;
    readonly after: number;
    readonly kind: string | null;
    readonly recordId: string | null;
}
export interface HistoryQuery {
    readonly kind?: string;
    readonly recordId?: string;
    readonly limit?: number;
    readonly cursor?: HistoryCursor;
}
export type HistorySummary = Omit<HistoryRow, 'snapshot'>;
export interface HistoryCoverage {
    readonly sources: readonly {
        readonly domain: string;
        readonly coverage: 'recorded-history' | 'snapshot-only';
    }[];
    readonly purged: boolean;
    readonly notRecorded: boolean;
}
export interface HistoryPage {
    readonly instance: InstrumentInstance;
    readonly revision: number;
    readonly cut: number;
    readonly total: number;
    readonly rows: readonly HistorySummary[];
    readonly nextCursor: HistoryCursor | null;
    readonly coverage: HistoryCoverage;
    readonly notRecorded: boolean;
}
export interface HistoryDetail {
    readonly revision: number;
    readonly rows: readonly HistoryRow[];
    readonly missingHistoryIds: readonly string[];
    readonly coverage: HistoryCoverage;
    readonly notRecorded: boolean;
}
export declare function initialHistoryDocument(instance: InstrumentInstance): HistoryDocument;
export declare function parseHistoryDocument(value: unknown): HistoryDocument;
export declare class MemoryHistoryStorage extends MemoryVersionedStorage<HistoryDocument> {
    constructor(instance: InstrumentInstance, seed?: unknown);
}
export declare function createDomainHistoryStorage(table: VersionedTable<HistoryDocument>, instance: InstrumentInstance): HistoryStorage;
/** Trusted scoped core. Runtime must authorize owner/assignment before every call. */
export declare class SessionHistory {
    private readonly storage;
    private readonly now;
    private readonly instance;
    constructor(instance: InstrumentInstance, storage: HistoryStorage, now?: () => number);
    private load;
    capture(input: readonly HistoryObservation[]): Promise<{
        readonly revision: number;
    }>;
    activeContext(): Promise<readonly HistorySummary[]>;
    apply(input: HistoryAction, trustedSource: HistorySource, signal?: AbortSignal): Promise<HistoryApplyResult>;
    /** Aggregate documents already are lossless materializations, not destructive event replay. */
    compact(): Promise<{
        readonly revision: number;
    }>;
    query(input?: HistoryQuery): Promise<HistoryPage>;
    detail(historyIds: readonly string[]): Promise<HistoryDetail>;
}
