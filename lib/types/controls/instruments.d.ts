import type { WorkspaceControls } from './index.js';
import type { InstrumentInstance } from './state.js';
import type { InstrumentStorage } from './instrument-storage.js';
import type { InstrumentAuthor, InstrumentCommand, InstrumentEvent, WorkflowRecord, TicketRecord, DecisionRecord, DecisionViewValue, InstrumentCompactInput, InstrumentPurgeHistoryInput, InstrumentCleanupCoverage } from './instrument-state.js';
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
    resolveAccess(principal: string, sessionId: string, instance: InstrumentInstance, access: 'read' | 'write'): Promise<InstrumentAccess>;
}
export interface InstrumentFilter {
    readonly workflowId?: string;
    readonly afterRevision?: number;
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
    /** Unfiltered authorized obligations; focusing a new workflow never erases old matters. */
    readonly decisions: readonly (DecisionRecord & {
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
export interface InstrumentApplyResult {
    readonly appliedRevision: number;
    readonly replayed: boolean;
    readonly snapshot: InstrumentSnapshot;
}
export interface InstrumentCleanupResult extends InstrumentApplyResult {
    readonly removedVersions: number;
    readonly checkpointRevision: number;
    readonly coverage: readonly InstrumentCleanupCoverage[];
}
export type { InstrumentCompactInput, InstrumentPurgeHistoryInput, InstrumentHistoryTarget, InstrumentCleanupCoverage } from './instrument-state.js';
/** Two-operation unmounted instrument seam; records model/user judgment, never judges it. */
export declare class SessionInstruments {
    private readonly controls;
    private readonly storage;
    private readonly authority;
    private readonly now;
    constructor(controls: WorkspaceControls, storage: InstrumentStorage, authority: InstrumentAuthority, now?: () => number);
    read(principal: string, sessionId: string, filter?: InstrumentFilter): Promise<InstrumentSnapshot>;
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
