import type { Context } from '@deepseek-ai/cordis';
import type { AuthorizedGitRunner } from './controls/git-worktrees.js';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionEvent, SessionHeader, UserMessage } from '@deepseek-ai/dsh-session';
import type { ToolExecution, ToolExecutionResult, ToolRunContext, ToolGuard } from '@deepseek-ai/dsh-tools';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import type { ControlsStorage } from './controls/storage.js';
import type { ControlsAuthority, TrustedSession } from './controls/index.js';
import type { InstrumentStorage } from './controls/instrument-storage.js';
import type { InstrumentCommand } from './controls/instrument-state.js';
import type { PolicyIntent, PolicySnapshot } from './controls/policy.js';
import type { NativeSubagentActivity, WindowStorage, TicketWindowCommand } from './controls/windows.js';
import type { ResourceLifecycle, ResourceStorage } from './controls/resources.js';
import type { VersionedStorage } from './controls/versioned-storage.js';
import type { HostCaller, HostJson, PolicyGrants, ResourceAction, WorkspaceRow } from './controls/remote-contract.js';
import { StartupSupport } from './controls/startup-support.js';
import type { StartupStatus } from './controls/startup-state.js';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'mattpocock-controls-notification': {
            readonly kind: 'mattpocock-controls-notification';
            readonly form: 'notice';
            readonly summary: string;
            readonly notificationId: string;
            readonly ownerSessionId: string;
            readonly instrumentInstanceId: string;
            readonly businessRevision: number;
            readonly authorPrincipalId: string;
        };
        'mattpocock-controls': {
            readonly kind: 'mattpocock-controls';
            readonly form: 'snapshot';
            readonly sections: readonly {
                readonly name: string;
                readonly text: string;
            }[];
        };
    }
}
export declare function makeSnapshotMessage(text: string): UserMessage;
export declare const HOST_CAPABILITIES: {
    readonly nativeInitialChildCwd: "unsupported";
    readonly allNativeWakeAdmission: "unsupported";
    readonly multiRootGitWriteScopes: "unsupported";
    readonly managedToolRouting: "supported";
    readonly nativeLifecycleObservation: "supported";
    readonly dynamicContext: "supported";
};
export type HostCapabilities = Omit<typeof HOST_CAPABILITIES, 'nativeInitialChildCwd' | 'allNativeWakeAdmission'> & {
    readonly nativeInitialChildCwd: 'supported' | 'unsupported';
    readonly allNativeWakeAdmission: 'supported' | 'unsupported';
};
export interface NativeCountDrift {
    /** The counted run whose live Agent disappeared without a paired `subagent/end`. */
    readonly sessionId: string;
    /** The running-count delta the node event expected; +1 for every unpaired local start. */
    readonly expectedDelta: number;
    /** Live running descendants observed at the reconciling node. */
    readonly observed: number;
}
/** The published terminal outcome vocabulary for one child turn. `unobservable` is never a cause. */
export type NativeOutcomeKind = 'completed' | 'aborted' | 'blocked' | 'error' | 'max-tokens' | 'refusal' | 'interrupted' | 'unobservable';
/** One `turn/end` fact read from a child's own log, exactly as the session vocabulary publishes it. */
export interface NativeTurnEndFact {
    /** `unknown` marks a merge-extended kind this build cannot classify; it is never reported as a cause. */
    readonly kind: 'completed' | 'aborted' | 'blocked' | 'error' | 'max-tokens' | 'interrupted' | 'forked' | 'unknown';
    readonly turn: number;
    readonly seq: number;
    /** Published `TurnCancelCause` kind for an aborted turn; null when the log carried none. */
    readonly cause: string | null;
    /** Published `LlmFailure` code/message verbatim (joined for display); null when none was published. */
    readonly diagnostic: string | null;
}
/** A child's own log tail: its last `turn/end`, when one exists, plus the last observed turn/seq. */
export interface NativeTurnObservation {
    readonly end: NativeTurnEndFact | null;
    readonly lastTurn: number | null;
    readonly lastSeq: number | null;
}
/** Reads ONLY one child's own log. A rejected read is unobservable, never a guessed outcome. */
export type NativeTurnReader = (sessionId: string, signal?: AbortSignal) => Promise<NativeTurnObservation>;
/** One open terminal-outcome item the main agent is expected to handle. */
export interface NativeSubagentStop {
    /** Durable dedup key: child session id + turn, plus the host runId when the host supplied one. */
    readonly itemId: string;
    readonly sessionId: string;
    /** The turn whose outcome this item reports; null when no turn could be read. */
    readonly turn: number | null;
    /** The published outcome. `unobservable` states the absence of a readable fact, never a cause. */
    readonly outcome: NativeOutcomeKind;
    /** Published aborted cancel cause; null when unreadable or not an abort. */
    readonly cancelCause: string | null;
    /** Published failure facts (LlmFailure code/message verbatim); null when the host supplied none. */
    readonly diagnostic: string | null;
    /** Evidence pointer carried only by an `unobservable` outcome. */
    readonly evidence: {
        readonly sessionId: string;
        readonly turn: number | null;
        readonly seq: number | null;
    } | null;
    /** One-line mechanical observation; never a guessed cause. */
    readonly observed: string;
}
/** An outcome item plus its owner, queued for the main-agent wake notification. */
export interface NativeSubagentStopEvent extends NativeSubagentStop {
    readonly ownerSessionId: string;
}
/**
 * Read a child's own event suffix into the published turn-end vocabulary. Nothing is synthesized:
 * a reason kind this build does not recognize stays `unknown`, an aborted cause is the published
 * `TurnCancelCause` kind, and a failure diagnostic is the published `LlmFailure` code/message.
 */
export declare function observeNativeTurn(events: readonly SessionEvent[]): NativeTurnObservation;
export interface ContinuableChildRequest {
    readonly provider: 'spawn' | 'fork';
    readonly label: string;
    readonly prompt: string;
    readonly childId: string;
    readonly cwd?: string;
}
export interface SessionFacts {
    readonly header: SessionHeader;
    /** Only this session's owned suffix; never a fork-inherited descriptor. */
    readonly events: readonly SessionEvent[];
    readonly live: boolean;
}
export type HostEvent = ({
    readonly kind: 'agent-status';
    readonly sessionId: string;
    readonly status: 'idle' | 'running';
} | {
    readonly kind: 'agent-disposed';
    readonly sessionId: string;
} | {
    readonly kind: 'subagent-start';
    readonly sessionId: string;
    readonly runId: string;
    readonly provider: string;
    readonly local: boolean;
} | {
    readonly kind: 'subagent-end';
    readonly sessionId: string;
    readonly runId: string;
    readonly provider: string;
    readonly local: boolean;
    readonly stopReason: string;
} | {
    readonly kind: 'native-stop';
    readonly ownerSessionId: string;
    readonly item: NativeSubagentStop;
}) & {
    readonly actualAgent?: Agent;
};
/** The core is supplied by the package composition, not fabricated by this adapter. */
export interface RuntimeFacade {
    readPolicy(caller: HostCaller, signal: AbortSignal): Promise<PolicySnapshot>;
    savePolicy(caller: HostCaller, intent: PolicyIntent, expectedRevision: number, signal: AbortSignal): Promise<PolicySnapshot>;
    readSession(caller: HostCaller, sessionId: string, signal: AbortSignal): Promise<unknown>;
    applyInstrument(caller: HostCaller, sessionId: string, command: InstrumentCommand, signal: AbortSignal): Promise<unknown>;
    applyTicketWindow(caller: HostCaller, sessionId: string, command: TicketWindowCommand, signal: AbortSignal): Promise<unknown>;
    resourceAction(caller: HostCaller, sessionId: string, request: ResourceAction, signal: AbortSignal): Promise<unknown>;
    historyAction?(caller: HostCaller, sessionId: string, input: HostJson, signal: AbortSignal): Promise<unknown>;
    worktreeAction?(caller: HostCaller, sessionId: string, input: HostJson, signal: AbortSignal): Promise<unknown>;
    delegate?(caller: HostCaller, input: HostJson, exec: ToolRunContext): Promise<unknown>;
    created(caller: HostCaller, signal: AbortSignal, actualAgent: Agent): Promise<void>;
    observe(event: HostEvent): Promise<void>;
    /** Admitted-step consumption; must return freshly owned, attributed messages. `stepKey` identifies
     * the admitted model step (turn:step), so one step's repeated assembly passes stay one delivery step. */
    preStep(caller: HostCaller, signal: AbortSignal, acceptedMessages?: readonly UserMessage[], stepKey?: string): Promise<readonly UserMessage[]>;
    postExecute?(caller: HostCaller, exec: ToolExecution, result: Readonly<ToolExecutionResult>, stepKey?: string): Promise<readonly UserMessage[]>;
    executeManaged?(caller: HostCaller, request: HostJson, exec: ToolRunContext): Promise<unknown>;
    assign?(caller: HostCaller, request: HostJson, signal: AbortSignal): Promise<unknown>;
    serializePolicyPermission?<T>(effect: () => Promise<T>): Promise<T>;
    notificationCommitted?(ownerSessionId: string, notificationId: string, messageId: string): Promise<void>;
    context?(caller: HostCaller): string;
    dispose(): Promise<void>;
}
export interface OwnerNotificationInput {
    readonly notificationId: string;
    readonly ownerSessionId: string;
    readonly instrumentInstanceId: string;
    readonly businessRevision: number;
    readonly authorPrincipalId: string;
}
export interface OwnerNotificationResult {
    readonly status: 'accepted' | 'offline' | 'unavailable';
    readonly messageId: string | null;
}
export interface HostPorts {
    readonly controlsStorage: ControlsStorage;
    readonly instrumentStorage: InstrumentStorage;
    readonly windowStorage: WindowStorage;
    readonly resourceStorage: ResourceStorage;
    readonly authority: ControlsAuthority;
    readonly operatorPrincipal: string;
    readonly capabilities: HostCapabilities;
    readonly resourceLifecycle: ResourceLifecycle;
    /** Background startup notification retries await registration; factories must not await their flush. */
    readonly notificationObserverReady?: Promise<void>;
    /** Host-owned startup configuration and real native health; never a policy write port. */
    startupStatus?(signal?: AbortSignal): Promise<StartupStatus>;
    gitRunnerForSession(sessionId: string, signal: AbortSignal): AuthorizedGitRunner;
    makeSnapshotMessage(text: string): UserMessage;
    /** Program-only proof on the exact live model surface; preparation/log existence is not visibility. */
    snapshotVisible?(caller: HostCaller, actualAgent: Agent, message: UserMessage): boolean;
    notifyOwner(input: OwnerNotificationInput, signal: AbortSignal): Promise<OwnerNotificationResult>;
    executeNative(exec: ToolExecution, name: 'subagent' | 'subagent_fork' | 'send_message', args: unknown): Promise<ToolExecutionResult>;
    /** Technical scope preflight before runtime records intent; creates no native child or durable facts. */
    authorizeInitialChildCwd?(exec: ToolRunContext, cwd: string): Promise<void>;
    /** Returns native inbox acceptance only; runtime verifies actual session facts separately. */
    createContinuable?(exec: ToolRunContext, request: ContinuableChildRequest): Promise<{
        readonly childId: string;
        readonly messageId: string;
    }>;
    installNativeGuard(guard: ToolGuard): () => void;
    installManagedGuard(guard: ToolGuard): () => void;
    liveAgent(sessionId: string): Agent | undefined;
    liveAgents(): readonly Agent[];
    nativeActivity(sessionId: string): Promise<{
        readonly known: boolean;
        readonly reason: string | null;
        readonly liveAgents: readonly Agent[];
    }>;
    /** Native host descendant activity for one owner session; the projected S count source. */
    nativeSubagentActivity(ownerSessionId: string, signal?: AbortSignal): Promise<NativeSubagentActivity>;
    /** Node-reconciliation drifts for one owner; mechanical evidence, never a count source. */
    nativeSubagentDrift(ownerSessionId: string): readonly NativeCountDrift[];
    /** Open terminal-outcome items for one owner; the snapshot items the main agent must handle. */
    nativeSubagentStops(ownerSessionId: string): readonly NativeSubagentStop[];
    /** Monotone native-count state revision; part of snapshot freshness, never a count. */
    nativeSubagentCountRevision(ownerSessionId: string): number;
    openRuntimeStorage<T extends {
        readonly revision: number;
    }>(parse: (value: unknown) => T): Promise<VersionedStorage<T>>;
    openUnitStorage<T extends {
        readonly revision: number;
    }>(suffix: string, parse: (value: unknown) => T): Promise<VersionedStorage<T>>;
    readPolicyGrants(): Promise<PolicyGrants>;
    sessionFacts(sessionId: string, signal?: AbortSignal): Promise<SessionFacts>;
    /** Native acceptance/live facts are not durability; false never certifies persistence. */
    flushSession?(sessionId: string, signal: AbortSignal): Promise<boolean>;
    /** Authority checks are repeated at effect boundaries; never wire-supplied principals. */
    authorizeCaller(caller: HostCaller, sessionId?: string): Promise<void>;
}
export interface HostOptions {
    createRuntime(ports: HostPorts): Promise<RuntimeFacade>;
    /** Notified after a saved policy change so derived caches can be refreshed. */
    readonly onPolicyChanged?: () => void;
    /** Explicit trusted launch configuration; not a Remote/GUI/model path. */
    readonly sdkRoot?: string;
    /** Program-only test/embedding seam; production uses the actual process epoch. */
    readonly startup?: {
        readonly bootEpoch?: string;
    };
}
export interface HostMount {
    /** Workspace-scoped Skill delivery gate; unavailable policy keeps skills on. */
    readonly skillsEnabledForCwd: (cwd: string | undefined) => Promise<boolean>;
    readonly service: MattPocockControlsService;
    readonly ports: HostPorts;
    dispose(): Promise<void>;
}
export declare function operatorCaller(ctx: Context): HostCaller;
export declare function agentCaller(ctx: Context, agent: Agent | undefined): HostCaller;
/** Header classification distinguishes ordinary forks from delegated children. */
export declare function classifySession(facts: SessionFacts, retained?: TrustedSession): 'owner' | TrustedSession | undefined;
export declare function createHostAuthority(ctx: Context, storage: ControlsStorage, grants: VersionedStorage<PolicyGrants>): {
    readonly authority: ControlsAuthority;
    readonly sessionFacts: HostPorts['sessionFacts'];
    readonly authorizeCaller: HostPorts['authorizeCaller'];
    readonly operatorPrincipal: string;
};
/** A source-mode binding plus a strict descriptor contribution; no monkeypatch. */
export declare class MattPocockControlsService extends TypertRemoteService {
    private readonly runtime;
    private readonly ports;
    private readonly grants;
    private readonly startup;
    private readonly lifecycle;
    constructor(ctx: Context, runtime: RuntimeFacade, ports: HostPorts, grants: VersionedStorage<PolicyGrants>, startup: StartupSupport, lifecycle: {
        readonly signal: AbortSignal;
        track<T>(work: () => Promise<T>): Promise<T>;
        readonly onPolicyChanged?: () => void;
    });
    private run;
    startupStatus(suppliedSignal?: AbortSignal): Promise<StartupStatus>;
    saveStartupSettings(desired: unknown, expectedRevision: unknown, suppliedSignal?: AbortSignal): Promise<StartupStatus>;
    readPolicy(): Promise<PolicySnapshot>;
    savePolicy(intent: unknown, expectedRevision: unknown): Promise<PolicySnapshot>;
    listWorkspaces(): Promise<readonly WorkspaceRow[]>;
    readSession(sessionId: unknown, suppliedSignal?: AbortSignal): Promise<HostJson>;
    applyInstrument(sessionId: unknown, command: unknown): Promise<HostJson>;
    applyTicketWindow(sessionId: unknown, command: unknown): Promise<HostJson>;
    historyAction(sessionId: unknown, request: unknown, suppliedSignal?: AbortSignal): Promise<HostJson>;
    worktreeAction(sessionId: unknown, request: unknown): Promise<HostJson>;
    resourceAction(sessionId: unknown, request: unknown): Promise<HostJson>;
    grantPolicy(sessionId: unknown, enabled: unknown, expectedRevision: unknown): Promise<PolicyGrants>;
}
export declare function hostRemoteContribution(): TypertContribution;
/** Fixed Git argv execution; subprocess alone is not a sandbox or permission decision. */
export declare function createAuthorizedGitRunner(ctx: Context, rawSessionId: string, outerSignal: AbortSignal): AuthorizedGitRunner;
/** Mount actual SDK registrations over independently owned single-table domains. */
export declare function mountHost(ctx: Context, options: HostOptions): Promise<HostMount>;
