/** Model-facing output only. Adapters select authorized domain facts before calling. */
export interface ModelBinding {
    instanceId: string;
    workspaceId: string;
    callerSessionId: string;
    principal: string;
    scopeFingerprint: string;
}
export type ModelSourceDomain = 'records' | 'windows' | 'assignment' | 'worktree-binding' | 'observation' | 'policy' | 'resource' | 'audit' | 'history';
export interface ModelSource {
    domain: ModelSourceDomain;
    /** Stable bounded key from sourceKey(), not an arbitrary storage key or JSONPath. */
    key: string;
    sourceVersion: string | number;
    value: unknown;
    coverage?: unknown;
}
/** Must re-authorize the real caller on every call; a locator is never a credential. */
export type AuthorizedSourceResolver = (selector: {
    domain: ModelSourceDomain;
    key: string;
}, signal?: AbortSignal) => ModelSource | null | Promise<ModelSource | null>;
export declare const MODEL_READ_LIMIT = 65536;
export declare const MODEL_RECEIPT_LIMIT = 8192;
export type ModelKind = 'current' | 'page' | 'receipt' | 'detail' | 'content' | 'error';
export declare class ModelOutputError extends Error {
    readonly code: string;
    readonly reason?: string | undefined;
    constructor(code: string, message: string, reason?: string | undefined);
}
/** Byte-limited code-point prefix; JSON escaping is counted later by modelEnvelope. */
export declare function previewText(text: string, maxBytes?: number): {
    text: string;
    totalBytes: number;
    shownBytes: number;
    truncated: boolean;
};
/** Explicit representation for a long identity, never a silently shortened ID. */
export declare function referenceText(text: string, maxBytes?: number): string | {
    sha256: string;
    text: string;
    totalBytes: number;
    shownBytes: number;
    truncated: boolean;
};
/** Plugin diagnostics only: do not pass commands, snapshots, or foreign errors here. */
export declare function modelError(code: string, message: string, reason?: string): {
    reason?: string;
    code: string;
    message: string;
} & {
    schemaVersion: 2;
    representationVersion: number;
    kind: ModelKind;
};
/** Required and minimal facts are explicitly selected by the domain Adapter. */
export declare function modelReceipt<I extends object, F extends object>(identity: I, facts: F, optional?: object, minimalFacts?: object): (I & F & {
    schemaVersion: 2;
    representationVersion: number;
    kind: ModelKind;
}) | (I & {
    omittedOptional: boolean;
    projected: boolean;
} & {
    schemaVersion: 2;
    representationVersion: number;
    kind: ModelKind;
});
/** Packs already-authorized, already-projected rows, never raw history/snapshot values.
 * makeEnvelope must be pure; its cursor uses the supplied delivered lastIndex.
 * An oversized first row needs a domain preview/locator, not an endlessly empty page. */
export declare function packModelRows<T, E>(options: {
    rows: readonly T[];
    limit?: number;
    budget?: number;
    makeEnvelope: (rows: T[], lastIndex: number, more: boolean) => E;
}): E;
/** Deterministic JSON for ONE selected authorized source, never a complete runtime result. */
export declare function canonicalJson(value: unknown, signal?: AbortSignal): string;
export declare function sourceKey(domain: string, recordId: string): string;
/** One instance per plugin mount, shared by every model tool and record.detail.
 * Only cryptographic configuration is retained: no body, row, locator or old-version cache.
 * Caller authorization and FIFO/cancellation remain the domain Adapter's responsibility. */
export declare function createModelOutput(options?: {
    secret?: Uint8Array;
    mountEpoch?: string;
    representationVersion?: number;
}): {
    pageCursor(binding: ModelBinding, query: unknown, sourceVersion: unknown, lastKey: string): string;
    readPageCursor(binding: ModelBinding, query: unknown, sourceVersion: unknown, cursor: string): string;
    locator(binding: ModelBinding, source: ModelSource): string;
    readContent(binding: ModelBinding, request: {
        locator: string;
        offset?: number;
    }, resolve: AuthorizedSourceResolver, signal?: AbortSignal): Promise<{
        coverage?: {} | null;
        schemaVersion: 2;
        representationVersion: number;
        kind: "content";
        contentType: "application/json";
        encoding: "utf-8";
        next: {
            tool: string;
            request: {
                action: string;
                locator: string;
                offset: number;
            };
        } | null;
        locator: string;
        sourceVersion: string | number;
        contentHash: string;
        totalBytes: number;
        offset: number;
        nextOffset: number;
        done: boolean;
        data: string;
        instanceId: string;
        workspaceId: string;
        callerSessionId: string;
        principal: string;
        scopeFingerprint: string;
    }>;
};
export declare function jsonBytes(value: unknown): number;
/** A final check, never an arbitrary-object truncator or full-result fallback. */
export declare function modelEnvelope<I extends object, P extends object>(kind: ModelKind, identity: I, payload: P, budget?: number): I & P & {
    schemaVersion: 2;
    representationVersion: number;
    kind: ModelKind;
};
