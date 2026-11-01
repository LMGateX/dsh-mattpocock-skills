import type { ReactElement } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { EffectivePolicy, PolicyField, PolicyIntent, PolicySnapshot } from './controls/policy.js';
import type { StartupDesired, StartupStatus } from './controls/startup-state.js';
import type { InstrumentSnapshot } from './controls/instruments.js';
import type { DecisionRecord, InstrumentCommand } from './controls/instrument-state.js';
import type { WindowSnapshot } from './controls/windows.js';
import type { WorktreeBindingCurrent } from './controls/worktree-bindings.js';
import type { WorktreeObservationView } from './controls/worktree-observations.js';
import type { ControlsRemote as HostControlsRemote, HostCaller, NativeStopRow, PolicyGrants, RuntimeSnapshot, SessionSummary, SessionSummaryBatch } from './controls/remote-contract.js';
export declare const PACKAGE_NAME = "@lmgatex/dsh-mattpocock-skills";
export declare const TAB_KIND = "mattpocock-collaboration";
export declare const TAB_ID: string;
export declare const ROW_KEY: string;
export declare const OWN_TOOL_NAMES: readonly ["mattpocock_record", "mattpocock_window", "mattpocock_resource", "mattpocock_controls", "mattpocock_execute", "mattpocock_assign", "mattpocock_history", "mattpocock_worktree", "mattpocock_delegate", "mattpocock_audit"];
export declare const UNSUPPORTED_SEATS: readonly {
    key: string;
    reason: string;
}[];
export interface CapabilityView {
    readonly key: string;
    readonly status: string;
    readonly reason: string | null;
}
export interface WorkspaceChoice {
    readonly workspaceId: string;
    readonly label: string;
    readonly verified: boolean;
    readonly sessionIds: readonly string[] | null;
}
export type ClientSessionSnapshot = RuntimeSnapshot;
type RemoteProjection<T> = {
    [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<RemoteResult<R>> : never;
};
export type ControlsRemote = RemoteProjection<HostControlsRemote>;
/** Additional UI boundary check: an arriving result must belong to the requested Session. */
export declare function decodeSession(value: unknown, sessionId: string): ClientSessionSnapshot;
export type Observation<T> = {
    readonly status: 'unknown';
    readonly value: null;
    readonly error: string | null;
} | {
    readonly status: 'ready';
    readonly value: T;
    readonly error: null;
};
/** Per-Session, mounted-only observation. It never creates an instance or wakes a model. */
export declare class SessionObserver {
    readonly sessionId: string;
    private readonly read;
    private readonly intervalMs;
    private state;
    private readonly listeners;
    private holds;
    private generation;
    private timer;
    private closed;
    private controller;
    private lastPolicy;
    getDisplay: () => EffectivePolicy["display"] | undefined;
    constructor(sessionId: string, read: (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<unknown>>, intervalMs?: number);
    getSnapshot: () => Observation<ClientSessionSnapshot>;
    subscribe: (listener: () => void) => (() => void);
    retain: () => (() => void);
    refresh: () => Promise<void>;
    dispose(): void;
    private clearTimer;
    private publish;
}
export type SessionObservation = Pick<SessionObserver, 'sessionId' | 'getSnapshot' | 'getDisplay' | 'subscribe' | 'retain' | 'refresh'>;
/** Faces carry lazy handles, never bare evictable observers. A render-to-effect gap and
 * even a previously evicted native face can reacquire the single current Session entry.
 * TTL is checked on registry activity; the last full holder already clears its snapshot.
 * Only transient UI metadata is evicted, never durable records or model consumption. */
export declare class SessionObserverCache {
    private readonly read;
    private readonly intervalMs;
    private readonly idleTtlMs;
    private readonly maxIdle;
    private readonly entries;
    private closed;
    constructor(read: (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<unknown>>, intervalMs?: number, idleTtlMs?: number, maxIdle?: number);
    get size(): number;
    observe(sessionId: string): SessionObservation;
    refreshAll(): void;
    dispose(): void;
    private prune;
}
type SummaryRead = (request: {
    readonly sessions: readonly {
        readonly sessionId: string;
        readonly version?: string;
    }[];
}, signal?: AbortSignal) => Promise<RemoteResult<SessionSummaryBatch>>;
/** A lightweight handle, not a second per-Session timer. Old handles route back through the
 * shared registry after idle eviction, so a native injected face cannot retain a dead observer. */
export declare class SummaryObserver {
    readonly sessionId: string;
    private readonly scheduler;
    constructor(sessionId: string, scheduler: SummaryScheduler);
    getSnapshot: () => Observation<SessionSummary>;
    getDisplay: () => EffectivePolicy["display"] | undefined;
    getConfigurationRevision: () => number | undefined;
    subscribe: (listener: () => void) => (() => void);
    retain: () => (() => void);
    refresh: () => void;
}
/** One scheduler per mounted plugin namespace: 32 identities per batch, two requests in flight,
 * one timer, and no host Session activation. Only mounted holders become query work. */
export declare class SummaryScheduler {
    private readonly read;
    private readonly intervalMs;
    private readonly idleTtlMs;
    private readonly maxIdle;
    private readonly entries;
    private readonly flights;
    private sequence;
    private timer;
    private closed;
    private hidden;
    private readonly onVisibility;
    constructor(read: SummaryRead, intervalMs?: number, idleTtlMs?: number, maxIdle?: number);
    get size(): number;
    observe(sessionId: string): SummaryObserver;
    snapshot(sessionId: string): Observation<SessionSummary>;
    display(sessionId: string): EffectivePolicy['display'] | undefined;
    configurationRevision(sessionId: string): number | undefined;
    subscribe(sessionId: string, listener: () => void): () => void;
    retain(sessionId: string): () => void;
    refresh(sessionId?: string): void;
    dispose(): void;
    private entry;
    private prune;
    private clearTimer;
    private arm;
    private pump;
    private attached;
    private current;
    private delay;
    private fail;
    private publish;
    private run;
}
/** Changes a draft only. undefined deletes a leaf and restores inheritance. */
export declare function setPolicyLeaf(intent: PolicyIntent, workspaceId: string | null, field: PolicyField, value: boolean | number | undefined): PolicyIntent;
export declare function savePolicyDraft(remote: Pick<ControlsRemote, 'savePolicy'>, draft: PolicyIntent, expectedRevision: number): Promise<PolicySnapshot>;
/** Policy-only impact snapshot: never an invented execution or convergence receipt. */
export declare function policyDraftImpact(saved: PolicySnapshot, draft: PolicyIntent, workspaceId: string | null, verified: boolean): {
    readonly readRevision: number;
    readonly scope: string;
    readonly changes: readonly {
        readonly field: string;
        readonly before: unknown;
        readonly after: unknown;
    }[];
    readonly executionEffects: string;
};
interface SessionFace {
    readonly observer: SessionObservation;
    readonly openDetails: () => void;
}
interface SummaryFace {
    readonly summary: SummaryObserver;
    readonly observe: () => SessionObservation;
    readonly openDetails: () => void;
}
type HeaderProps = PropsRuntime<'conversation.session.header.utilities'> & SummaryFace;
/** T is explicit bookkeeping; S tracking is not proof that all runtime work is known. */
/** State the published outcome; 'unobservable' reads as unobservable, never as a cause. */
export declare function nativeStopText(row: NativeStopRow): string;
export declare function windowSummary(windows: WindowSnapshot | null, health?: ClientSessionSnapshot['health']): readonly string[];
export declare function WindowProjection(props: {
    readonly view: ClientSessionSnapshot;
}): ReactElement;
/** Aggregate read health controls the count; per-resource physical inspection never erases metadata. */
export declare function resourceSummary(view: ClientSessionSnapshot): {
    readonly label: string;
    readonly count: number | null;
    readonly reason: string | null;
};
export declare function ResourceProjection(props: {
    readonly view: ClientSessionSnapshot;
}): ReactElement;
export declare function compactInstrumentSummary(view: ClientSessionSnapshot): {
    readonly parts: readonly string[];
    readonly detail: string;
};
export declare function HeaderEntry(props: HeaderProps): ReactElement | null;
export declare function ObservedHeaderEntry(props: PropsRuntime<'conversation.session.header.utilities'> & SessionFace): ReactElement | null;
export declare function InputSummary(props: PropsRuntime<'conversation.input.dock'> & SummaryFace): ReactElement | null;
export declare function ObservedInputSummary(props: PropsRuntime<'conversation.input.dock'> & SessionFace): ReactElement | null;
/** Explicit user answer; the Host RPC derives the real author, never the command. */
export declare function decisionAnswerCommand(records: InstrumentSnapshot, decision: DecisionRecord, answer: string, status: string, pending: boolean, awaitingImplementation: boolean, operationId: string): InstrumentCommand;
export declare function Details(props: PropsRuntime<'sidebar.right.pane.tab'> & SessionFace & {
    readonly remote: ControlsRemote;
}): ReactElement;
export declare function bindingSummary(view: ClientSessionSnapshot): string;
export declare function WorktreeBindingsPanel(props: {
    readonly view: ClientSessionSnapshot;
    readonly remote: ControlsRemote;
    readonly refresh: () => Promise<void>;
}): ReactElement;
export declare function observationSummary(view: ClientSessionSnapshot): string;
export declare function WorktreeObservationsPanel(props: {
    readonly view: ClientSessionSnapshot;
    readonly remote: ControlsRemote;
    readonly refresh: () => Promise<void>;
}): ReactElement;
export declare function WorktreeObservationEditor(props: {
    readonly sessionId: string;
    readonly row: WorktreeObservationView;
    readonly remote: ControlsRemote;
    readonly refresh: () => Promise<void>;
}): ReactElement;
export declare function WorktreeBindingEditor(props: {
    readonly sessionId: string;
    readonly row: WorktreeBindingCurrent;
    readonly remote: ControlsRemote;
    readonly refresh: () => Promise<void>;
}): ReactElement;
/** Effects only fence lifetime; all history reads are initiated by explicit clicks. */
export declare function HistoryPanel(props: {
    readonly sessionId: string;
    readonly instance: ClientSessionSnapshot['instance'];
    readonly remote: ControlsRemote;
    readonly refresh: () => Promise<void>;
}): ReactElement;
export declare function sessionListRequested(policy: PolicySnapshot | null): boolean;
export declare class PolicyObserver {
    private readonly read;
    private value;
    private generation;
    private closed;
    private pending;
    private timer;
    private hidden;
    private readonly listeners;
    private readonly onVisibility;
    constructor(read: () => Promise<RemoteResult<unknown>>);
    getSnapshot: () => PolicySnapshot | null;
    subscribe: (listener: () => void) => (() => void);
    refresh(): Promise<void>;
    private clearTimer;
    private arm;
    dispose(): void;
}
export declare function WorkspaceBadge(props: PropsRuntime<'sidebar.session.row.leading'> & {
    readonly observeSummary: (sessionId: string) => SummaryObserver;
    readonly visibility: PolicyObserver;
}): ReactElement | null;
export declare function decodeWorkspaces(value: unknown): readonly WorkspaceChoice[];
/** Navigation only. Listed ids grant neither ACL rights nor an owner-instance association. */
export declare function settingsSessionChoices(workspaces: readonly WorkspaceChoice[], workspaceId: string | null): {
    readonly ids: readonly string[];
    readonly unknown: boolean;
};
/** Explicit selected-session read projection on the settings page, independent of sidebar placement. */
export declare function SettingsInspection(props: {
    readonly sessionId: string;
    readonly observer: SessionObservation;
    readonly remote?: ControlsRemote;
}): ReactElement;
export declare function ObservedSettingsInspection(props: {
    readonly sessionId: string;
    readonly observer: SessionObservation;
    readonly remote?: ControlsRemote;
}): ReactElement;
export interface StartupSettingsView {
    readonly saved: StartupStatus | null;
    readonly draft: StartupDesired | null;
    readonly busy: 'loading' | 'saving' | null;
    readonly error: string | null;
    readonly notice: string | null;
}
type StartupRemote = Pick<ControlsRemote, 'startupStatus' | 'saveStartupSettings'>;
/** Global Profile startup intent only; no Workspace Policy revision or SDK write enters this seam. */
export declare class StartupSettingsController {
    private readonly remote;
    private state;
    private readonly listeners;
    private generation;
    private controller;
    private holds;
    private closed;
    constructor(remote: StartupRemote);
    getSnapshot: () => StartupSettingsView;
    subscribe: (listener: () => void) => (() => void);
    private publish;
    private cancel;
    retain: () => (() => void);
    refresh: () => Promise<void>;
    setDesired: (startupCwdEnabled: boolean) => void;
    save: () => Promise<void>;
    dispose: () => void;
}
/** Permanently separate from the Workspace Policy form, including while that form is unavailable. */
export declare function StartupSettingsPanel(props: {
    readonly remote: StartupRemote;
}): ReactElement;
export declare function SupervisionSettingsPanel(props: {
    readonly remote: ControlsRemote;
    readonly workspace: string | null;
}): ReactElement;
export declare function SupervisionHistory(props: {
    readonly remote: ControlsRemote;
    readonly sessionId: string | null;
}): ReactElement;
export declare function SettingsPage(props: PluginConfigViewProps & {
    readonly remote: ControlsRemote;
    readonly refreshAll: () => void;
    readonly observe: (sessionId: string) => SessionObservation;
}): ReactElement;
type SourceState = 'preparing' | 'running' | 'ok' | 'error' | 'stopped';
export interface SourceView {
    readonly state: SourceState;
    readonly summary: string;
    readonly color: string | null;
    readonly expandable: boolean;
}
/** Compact English summary from wire action/target values; no translated title map. */
export declare function sourceAction(toolName: string, request: Record<string, unknown> | null): string;
export declare function sourceTarget(request: Record<string, unknown> | null): string;
export declare function sourceView(props: ToolCallViewProps): SourceView;
/** Read only public call material; never serialize the lazy argument reader's internals. */
export declare function sourceRecord(props: ToolCallViewProps): unknown;
/** Only our own wire Tool names may claim a toolview; never another plugin's key. */
export declare function SourceCard(props: ToolCallViewProps & SummaryFace): ReactElement;
export declare const inject: string[];
/** Browser plugin activation, governed by Host Loader/package manifest, not DOM insertion. */
export declare function apply(ctx: Context): Promise<void>;
/** Existing Host authorization, not a model-supplied permission or business approval. */
export declare function grantPolicyFromSnapshot(remote: Pick<ControlsRemote, 'grantPolicy'>, view: RuntimeSnapshot & {
    readonly caller: HostCaller;
    readonly policyGrants: PolicyGrants;
}, targetSessionId: string, enabled: boolean): Promise<PolicyGrants>;
export {};
