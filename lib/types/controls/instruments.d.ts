import type { DecisionPolicyReader, RecommendationOutcome } from './recommendation-contract.js';
import type { WorkspaceControls } from './index.js';
import type { InstrumentInstance } from './state.js';
import type { InstrumentStorage } from './instrument-storage.js';
import type { InstrumentAuthor, InstrumentCommand, InstrumentEvent, WorkflowRecord, TicketRecord, TaskReferenceRecord, DecisionRecord, DecisionViewValue, InstrumentCompactInput, InstrumentPurgeHistoryInput, InstrumentCleanupCoverage, Change } from './instrument-state.js';
export type InstrumentScope = {
    readonly kind: 'coordinator';
} | {
    readonly kind: 'assigned';
    readonly workflowId: string | null;
    readonly ticketIds: readonly string[];
};
export interface InstrumentAccess {
    readonly author: InstrumentAuthor;
    readonly scope: InstrumentScope;
}
/** The authenticated host derives actual author and delegated assignment, never the command. */
export interface InstrumentAuthority {
    resolveAccess(principal: string, sessionId: string, instance: InstrumentInstance, access: 'read' | 'write', signal?: AbortSignal): Promise<InstrumentAccess>;
}
export interface InstrumentFilter {
    readonly workflowId?: string;
    readonly afterRevision?: number;
}
/** Optional additive READ metadata; absent on older hosts, null when first-version proof/access is unavailable. */
export interface InstrumentDecisionTime {
    /** First put: epoch milliseconds and source revision (not a business CAS token). */
    readonly registration?: {
        readonly recordedAt: number;
        readonly revision: number;
    } | null;
    /** Latest business update, never a viewer update or idempotent replay. */
    readonly updatedAt?: number;
    readonly recommendationSupport?: RecommendationOutcome;
}
export interface InstrumentSnapshot {
    readonly instance: InstrumentInstance;
    readonly revision: number;
    readonly businessRevision: number;
    readonly viewerRevision: number;
    readonly scope: InstrumentScope;
    readonly focusedWorkflowId: string | null;
    readonly workflows: readonly WorkflowRecord[];
    readonly tickets: readonly TicketRecord[];
    readonly taskReferences: readonly TaskReferenceRecord[];
    readonly capabilities: {
        readonly taskReferences: true;
        readonly storageVersions: readonly [1, 2, 3, 4, 5];
        readonly structuredDecisionResults: true;
        readonly decisionRecommendationAdoption: boolean;
    };
    /** Unfiltered authorized obligations; focusing a new workflow never erases old matters. */
    readonly decisions: readonly (DecisionRecord & InstrumentDecisionTime & {
        readonly view: DecisionViewValue;
    })[];
    readonly changes: readonly InstrumentEvent[];
    readonly historyCoverage?: {
        readonly checkpointRevision: number;
        readonly purged: boolean;
    };
    readonly summary: {
        readonly countingScope: 'instance' | 'assignment';
        readonly totalTickets: number;
        readonly totalTaskReferences: number;
        readonly statusCounts: readonly {
            readonly workflowId: string;
            readonly axisKey: string;
            readonly label: string;
            readonly counting: 'exclusive' | 'overlapping';
            readonly unreported: number;
            readonly statuses: readonly {
                readonly statusKey: string;
                readonly label: string;
                readonly count: number;
                readonly meaning: string | null;
                readonly summaryPriority?: number;
            }[];
        }[];
        readonly pendingDecisionCount: number;
        readonly pendingUserDecisionCount: number;
        readonly pendingForPrincipalCount: number;
        readonly awaitingImplementationCount: number;
    };
}
/** Metadata of the latest business version, not a retained history entry. */
export type InstrumentCurrentProvenance = Pick<Change<unknown>, 'author' | 'recordedAt' | 'references'>;
export type InstrumentCurrentWorkflow = Omit<WorkflowRecord, 'history'> & {
    readonly provenance: InstrumentCurrentProvenance;
};
export type InstrumentCurrentTicket = Omit<TicketRecord, 'history'> & {
    readonly provenance: InstrumentCurrentProvenance;
};
export type InstrumentCurrentTaskReference = Omit<TaskReferenceRecord, 'history'> & {
    readonly provenance: InstrumentCurrentProvenance;
};
export type InstrumentCurrentDecision = Omit<DecisionRecord, 'history' | 'creator'> & InstrumentDecisionTime & {
    readonly creator: InstrumentAuthor;
    readonly provenance: InstrumentCurrentProvenance;
    readonly view: DecisionViewValue;
};
/** Authorized current bodies for model projection/detail; never contains histories or changes.
 * Bodies are intentionally complete here: the model adapter owns its byte budget and locators.
 */
export interface InstrumentCurrentSnapshot extends Omit<InstrumentSnapshot, 'workflows' | 'tickets' | 'taskReferences' | 'decisions' | 'changes' | 'historyCoverage'> {
    readonly workflows: readonly InstrumentCurrentWorkflow[];
    readonly tickets: readonly InstrumentCurrentTicket[];
    readonly taskReferences: readonly InstrumentCurrentTaskReference[];
    readonly decisions: readonly InstrumentCurrentDecision[];
}
/** Current authorized badge facts; no retained versions, changes or decision bodies. */
export interface InstrumentSummary {
    readonly instance: InstrumentInstance;
    readonly revision: number;
    readonly businessRevision: number;
    readonly viewerRevision: number;
    readonly scope: InstrumentScope;
    readonly summary: {
        readonly countingScope: 'instance' | 'assignment';
        readonly pendingUserDecisionCount: number;
    };
}
export interface InstrumentApplyResult {
    readonly appliedRevision: number;
    readonly replayed: boolean;
    readonly snapshot: InstrumentSnapshot;
    readonly recommendation?: RecommendationOutcome;
}
export interface InstrumentCleanupResult extends InstrumentApplyResult {
    readonly removedVersions: number;
    readonly checkpointRevision: number;
    readonly coverage: readonly InstrumentCleanupCoverage[];
}
export type { InstrumentCompactInput, InstrumentPurgeHistoryInput, InstrumentHistoryTarget, InstrumentCleanupCoverage } from './instrument-state.js';
/** Unmounted instrument seam; records model/user judgment, never judges it. */
export declare class SessionInstruments {
    private readonly controls;
    private readonly storage;
    private readonly authority;
    private readonly now;
    private readonly decisionPolicy?;
    constructor(controls: WorkspaceControls, storage: InstrumentStorage, authority: InstrumentAuthority, now?: () => number, decisionPolicy?: DecisionPolicyReader | undefined);
    private policyState;
    private supportSnapshot;
    private refreshWriteContext;
    private applyResult;
    read(principal: string, sessionId: string, filter?: InstrumentFilter, signal?: AbortSignal): Promise<InstrumentSnapshot>;
    readCurrent(principal: string, sessionId: string, signal?: AbortSignal): Promise<InstrumentCurrentSnapshot>;
    readSummary(principal: string, sessionId: string, signal?: AbortSignal): Promise<InstrumentSummary>;
    apply(principal: string, sessionId: string, input: InstrumentCommand): Promise<InstrumentApplyResult>;
    compact(principal: string, sessionId: string, input: InstrumentCompactInput, signal?: AbortSignal): Promise<InstrumentCleanupResult>;
    purgeHistory(principal: string, sessionId: string, input: InstrumentPurgeHistoryInput, signal?: AbortSignal): Promise<InstrumentCleanupResult>;
    private cleanupAccess;
    private cleanupResult;
    private context;
    private load;
    private viewerRevision;
    private checkChange;
    private checkFeature;
    private filter;
    private snapshot;
}
