import type { StartupDesired, StartupStatus } from './startup-state.js';
import type { EffectivePolicy, PolicyIntent, PolicySnapshot } from './policy.js';
import type { InstrumentSnapshot } from './instruments.js';
import type { WindowSnapshot } from './windows.js';
import type { ResourceView } from './resources.js';
import type { InstrumentInstance } from './state.js';
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { InstrumentCommand } from './instrument-state.js';
import type { TicketWindowCommand } from './windows.js';
import type { CreateWorktree, ResourceBusiness, RetireDisposition } from './resources.js';
/** Shared by Host and Client; no Host SDK or Node imports enter the browser. */
export declare const REMOTE_NAMESPACE: "mattpocockControls";
export declare const REMOTE_METHODS: readonly ["readPolicy", "savePolicy", "listWorkspaces", "readSession", "applyInstrument", "applyTicketWindow", "resourceAction", "grantPolicy", "historyAction", "worktreeAction", "startupStatus", "saveStartupSettings"];
export type RemoteMethod = typeof REMOTE_METHODS[number];
export type HostJson = null | boolean | number | string | HostJson[] | {
    [key: string]: HostJson;
};
export interface HostCaller {
    readonly kind: 'user' | 'agent';
    readonly principalId: string;
    readonly sessionId: string | null;
}
export interface WorkspaceRow {
    readonly id: string;
    readonly path: string;
    readonly title: string;
    readonly status: 'ok' | 'missing-dir';
    readonly sessionIds?: readonly string[];
}
/** One open terminal-outcome row for the main agent: the published outcome, never a guessed cause. */
export interface NativeStopRow {
    /** Durable dedup key: child session id + turn, plus the host runId when the host supplied one. */
    readonly itemId: string;
    readonly sessionId: string;
    /** The turn whose outcome this row reports; null when no turn could be read. */
    readonly turn: number | null;
    /** Published outcome vocabulary, or 'unobservable' when no readable fact exists. */
    readonly outcome: string;
    /** Published aborted cancel cause; null when unreadable or not an abort. */
    readonly cancelCause: string | null;
    /** Published LlmFailure facts (code/message verbatim); null when the host supplied none. */
    readonly diagnostic: string | null;
    /** Evidence pointer carried only by an 'unobservable' outcome. */
    readonly evidence: {
        readonly sessionId: string;
        readonly turn: number | null;
        readonly seq: number | null;
    } | null;
    /** One-line mechanical observation; never a guessed cause. */
    readonly observed: string;
    readonly lane: {
        readonly workflowId: string | null;
        readonly localTicketId: string | null;
    } | null;
}
export interface RuntimeSnapshot {
    readonly sessionId: string;
    readonly caller: HostCaller;
    readonly policyGrants: PolicyGrants;
    readonly instance: InstrumentInstance;
    readonly policy: EffectivePolicy;
    readonly records: InstrumentSnapshot | null;
    readonly windows: WindowSnapshot | null;
    readonly resources: readonly ResourceView[];
    readonly worktreeBindings?: readonly import('./worktree-bindings.js').WorktreeBindingCurrent[];
    /** Native count provenance: a runtime re-establishment is never a terminal-outcome signal. */
    readonly nativeCount?: {
        readonly reestablished: boolean;
        readonly runtimeId: string;
        readonly previousRuntimeId: string | null;
    };
    /** Open terminal-outcome items the main agent must handle; never a count source. */
    readonly nativeStops?: readonly NativeStopRow[];
    readonly capabilities: readonly {
        readonly key: string;
        readonly status: string;
        readonly reason: string | null;
    }[];
    readonly health: readonly {
        readonly scope: string;
        readonly status: string;
        readonly reason: string | null;
    }[];
}
export interface PolicyGrant {
    readonly sessionId: string;
    readonly enabled: boolean;
}
export interface PolicyGrants {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly grants: readonly PolicyGrant[];
}
export type ResourceAction = {
    readonly action: 'create';
    readonly spec: CreateWorktree;
} | {
    readonly action: 'borrow';
    readonly path: string;
} | {
    readonly action: 'read' | 'retain' | 'actual-retire';
    readonly resourceId: string;
} | {
    readonly action: 'update-business';
    readonly resourceId: string;
    readonly business: ResourceBusiness;
} | {
    readonly action: 'request-retire';
    readonly resourceId: string;
    readonly disposition: RetireDisposition;
};
export interface ControlsRemote {
    startupStatus(signal?: AbortSignal): Promise<StartupStatus>;
    saveStartupSettings(desired: StartupDesired, expectedRevision: number, signal?: AbortSignal): Promise<StartupStatus>;
    readPolicy(): Promise<PolicySnapshot>;
    savePolicy(intent: PolicyIntent, expectedRevision: number): Promise<PolicySnapshot>;
    listWorkspaces(): Promise<readonly WorkspaceRow[]>;
    readSession(sessionId: string, signal?: AbortSignal): Promise<HostJson>;
    applyInstrument(sessionId: string, command: InstrumentCommand): Promise<HostJson>;
    applyTicketWindow(sessionId: string, command: TicketWindowCommand): Promise<HostJson>;
    resourceAction(sessionId: string, request: ResourceAction): Promise<HostJson>;
    grantPolicy(sessionId: string, enabled: boolean, expectedRevision: number): Promise<PolicyGrants>;
    historyAction(sessionId: string, request: HostJson, signal?: AbortSignal): Promise<HostJson>;
    worktreeAction(sessionId: string, request: HostJson): Promise<HostJson>;
}
/** A complete lossless JSON boundary, not JSON.stringify-based repair. */
export declare function parseHostJson(value: unknown): HostJson;
export declare function parsePolicyGrants(value: unknown): PolicyGrants;
/** Browser-safe equivalent of the window business command boundary, never execution receipts. */
export declare function parseRemoteTicketWindow(value: unknown): TicketWindowCommand;
export declare function parseResourceAction(value: unknown): ResourceAction;
/** The same strict contract is registered on Host and selected by Client $mount. */
export declare const REMOTE_CONTRIBUTION: TypertRemoteContribution;
