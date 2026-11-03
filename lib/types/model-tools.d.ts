import type { RuntimeFacade } from './host.js';
import type { InstrumentScope } from './controls/instruments.js';
import type { InstrumentInstance } from './controls/state.js';
import type { HostCaller } from './controls/remote-contract.js';
/** Plugin-private model seam. Sources contain one authorized current object, never a document. */
export interface ModelIdentity {
    readonly instance: InstrumentInstance;
    readonly caller: HostCaller;
    readonly sessionId: string;
    readonly scope: InstrumentScope;
}
export interface ModelSource {
    readonly domain: string;
    readonly key: string;
    readonly sourceVersion: string;
    readonly value: unknown;
}
export interface ModelRow extends ModelSource {
    readonly recordId: string;
    readonly workflowId?: string;
    readonly durable: boolean;
    readonly preview: Readonly<Record<string, unknown>>;
}
export interface ModelCollection {
    readonly rows: readonly ModelRow[];
    readonly version: string;
    readonly coverage: 'current' | 'restricted' | 'unknown';
    readonly reason?: string;
}
export interface ModelCurrent extends ModelIdentity {
    readonly policy: unknown;
    readonly revisions: Readonly<Record<string, number | null>>;
    readonly records: Readonly<Record<string, unknown>> | null;
    readonly windows: Readonly<Record<string, unknown>> | null;
    readonly nativeCount: unknown;
    readonly collections: Readonly<Record<string, ModelCollection>>;
}
export declare function sourceKey(domain: string, ...ids: readonly unknown[]): string;
export declare function sourceVersion(value: unknown): string;
export declare function modelSource(domain: string, ids: readonly unknown[], version: number | string, value: unknown): ModelSource;
/** One model adapter per Host mount; all tools share these stateless authenticated selectors. */
export declare function createModelTools(runtime: RuntimeFacade): {
    identity: (caller: HostCaller, signal: AbortSignal) => Promise<ModelIdentity>;
    current: (caller: HostCaller, rawQuery: unknown, signal: AbortSignal) => Promise<({
        instance: InstrumentInstance;
        sessionId: string;
        scope: {
            readonly kind: "coordinator";
        } | {
            kind: "assigned";
            workflowId: string | null;
            ticketCount: number;
            fingerprint: string;
        };
    } & {
        query: {
            recordId?: string;
            workflowId?: string;
            kind: string;
        };
        coverage: "unknown" | "current" | "restricted";
        reason: string | null;
        sourceVersion: string;
        rows: ({
            detail: {
                tool: string;
                action: string;
                locator: string;
            };
            sourceVersion: string;
            workflowId?: string;
            recordId: string;
        } | {
            observation: {
                recordId: string;
                coverage: string;
            };
            sourceVersion: string;
            workflowId?: string;
            recordId: string;
        })[];
        shown: number;
        total: number;
        more: boolean;
        nextCursor: string | null;
    } & {
        schemaVersion: 2;
        kind: import("./controls/model-output.js").ModelKind;
    }) | ({
        instance: InstrumentInstance;
        sessionId: string;
        scope: {
            readonly kind: "coordinator";
        } | {
            kind: "assigned";
            workflowId: string | null;
            ticketCount: number;
            fingerprint: string;
        };
    } & (({
        revisions: Readonly<Record<string, number | null>>;
        policy: {
            configurationRevision: unknown;
            workspaceVerified: unknown;
            extensionEnabled: unknown;
            workspaceEnabled: unknown;
            features: unknown;
            windows: unknown;
            detail: {
                tool: string;
                action: string;
                locator: string;
            };
        };
        records: Readonly<Record<string, unknown>> | null;
        windows: Readonly<Record<string, unknown>> | null;
        nativeCount: unknown;
        collections: {
            [k: string]: {
                query: {
                    tool: string;
                    action: string;
                    query: {
                        kind: string;
                        limit: number;
                    };
                } | null;
                counts?: {
                    [k: string]: number;
                };
                rows: {
                    recordId: string;
                }[];
                shown: number;
                total: number | null;
                more: boolean;
                coverage: "unknown" | "current" | "restricted";
                reason: string | null;
            };
        };
        scopeDetail?: never;
    } | {
        revisions: Readonly<Record<string, number | null>>;
        policy: {
            configurationRevision: unknown;
            workspaceVerified: unknown;
            extensionEnabled: unknown;
            workspaceEnabled: unknown;
            features: unknown;
            windows: unknown;
            detail: {
                tool: string;
                action: string;
                locator: string;
            };
        };
        records: Readonly<Record<string, unknown>> | null;
        windows: Readonly<Record<string, unknown>> | null;
        nativeCount: unknown;
        collections: {
            [k: string]: {
                query: {
                    tool: string;
                    action: string;
                    query: {
                        kind: string;
                        limit: number;
                    };
                } | null;
                counts?: {
                    [k: string]: number;
                };
                rows: {
                    recordId: string;
                }[];
                shown: number;
                total: number | null;
                more: boolean;
                coverage: "unknown" | "current" | "restricted";
                reason: string | null;
            };
        };
        scopeDetail: {
            tool: string;
            action: string;
            locator: string;
        };
    }) & {
        schemaVersion: 2;
        kind: import("./controls/model-output.js").ModelKind;
    }))>;
    detail: (caller: HostCaller, request: Record<string, unknown>, signal: AbortSignal) => Promise<Record<string, unknown>>;
    worktrees: (caller: HostCaller, rawQuery: unknown, signal: AbortSignal) => Promise<({
        instance: InstrumentInstance;
        sessionId: string;
        scope: {
            readonly kind: "coordinator";
        } | {
            kind: "assigned";
            workflowId: string | null;
            ticketCount: number;
            fingerprint: string;
        };
    } & {
        query: {
            recordId?: string;
            workflowId?: string;
            kind: string;
        };
        coverage: "unknown" | "current" | "restricted";
        reason: string | null;
        sourceVersion: string;
        rows: ({
            detail: {
                tool: string;
                action: string;
                locator: string;
            };
            sourceVersion: string;
            workflowId?: string;
            recordId: string;
        } | {
            observation: {
                recordId: string;
                coverage: string;
            };
            sourceVersion: string;
            workflowId?: string;
            recordId: string;
        })[];
        shown: number;
        total: number;
        more: boolean;
        nextCursor: string | null;
    } & {
        schemaVersion: 2;
        kind: import("./controls/model-output.js").ModelKind;
    }) | ({
        instance: InstrumentInstance;
        sessionId: string;
        scope: {
            readonly kind: "coordinator";
        } | {
            kind: "assigned";
            workflowId: string | null;
            ticketCount: number;
            fingerprint: string;
        };
    } & {
        collections: {
            [k: string]: {
                shown: number;
                total: number | null;
                more: boolean;
                coverage: "unknown" | "current" | "restricted";
                query: {
                    tool: string;
                    action: string;
                    query: {
                        kind: string;
                        limit: number;
                    };
                };
            };
        };
        note: string;
    } & {
        schemaVersion: 2;
        kind: import("./controls/model-output.js").ModelKind;
    })>;
    project: (name: string, who: ModelIdentity, raw: Record<string, unknown>, result: unknown, signal: AbortSignal) => Promise<unknown>;
    audit: (caller: HostCaller, rawQuery: unknown, result: unknown, signal: AbortSignal) => Promise<({
        instance: InstrumentInstance;
        sessionId: string;
        scope: {
            readonly kind: "coordinator";
        } | {
            kind: "assigned";
            workflowId: string | null;
            ticketCount: number;
            fingerprint: string;
        };
    } & {
        query: {
            recordId?: string;
            workflowId?: string;
            kind: string;
        };
        coverage: "unknown" | "current" | "restricted";
        reason: string | null;
        sourceVersion: string;
        rows: ({
            detail: {
                tool: string;
                action: string;
                locator: string;
            };
            sourceVersion: string;
            workflowId?: string;
            recordId: string;
        } | {
            observation: {
                recordId: string;
                coverage: string;
            };
            sourceVersion: string;
            workflowId?: string;
            recordId: string;
        })[];
        shown: number;
        total: number;
        more: boolean;
        nextCursor: string | null;
    } & {
        schemaVersion: 2;
        kind: import("./controls/model-output.js").ModelKind;
    }) | ({
        instance: InstrumentInstance;
        sessionId: string;
        scope: {
            readonly kind: "coordinator";
        } | {
            kind: "assigned";
            workflowId: string | null;
            ticketCount: number;
            fingerprint: string;
        };
    } & {
        generatedAt: unknown;
        coverage: Record<string, unknown>;
        summary: {
            [x: string]: unknown;
        };
        collections: {
            episode: {
                shown: number;
                total: number;
                more: boolean;
                query: {
                    tool: string;
                    action: string;
                    query: {
                        kind: string;
                        limit: number;
                    };
                };
            };
            session: {
                shown: number;
                total: number;
                ownerSessions: unknown;
                coverage: string;
                more: boolean;
                query: {
                    tool: string;
                    action: string;
                    query: {
                        kind: string;
                        limit: number;
                    };
                };
            };
        };
        note: unknown;
    } & {
        schemaVersion: 2;
        kind: import("./controls/model-output.js").ModelKind;
    })>;
    finish: (value: unknown, name: string, raw: Record<string, unknown>) => Record<string, unknown>;
    projectionFailure: (name: string, who: ModelIdentity, raw: Record<string, unknown>, result: unknown, error: unknown) => ({
        instance: InstrumentInstance;
        sessionId: string;
        scope: {
            readonly kind: "coordinator";
        } | {
            kind: "assigned";
            workflowId: string | null;
            ticketCount: number;
            fingerprint: string;
        };
    } & Record<string, unknown> & {
        schemaVersion: 2;
        kind: import("./controls/model-output.js").ModelKind;
    }) | ({
        instance: InstrumentInstance;
        sessionId: string;
        scope: {
            readonly kind: "coordinator";
        } | {
            kind: "assigned";
            workflowId: string | null;
            ticketCount: number;
            fingerprint: string;
        };
    } & {
        omittedOptional: boolean;
        projected: boolean;
    } & {
        schemaVersion: 2;
        kind: import("./controls/model-output.js").ModelKind;
    });
    setAuditReader(reader: ((caller: HostCaller, signal: AbortSignal) => Promise<unknown>) | undefined): void;
};
