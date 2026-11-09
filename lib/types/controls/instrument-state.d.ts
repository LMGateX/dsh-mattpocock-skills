import type { InstrumentInstance } from './state.js';
import type { DecisionPolicyBinding, DecisionPolicySelection, DecisionPolicyEventEffect } from './recommendation-contract.js';
export interface InstrumentAuthor {
    readonly kind: 'agent' | 'user';
    readonly principalId: string;
    readonly sessionId: string | null;
}
export interface StatusDefinition {
    readonly statusKey: string;
    readonly label: string;
    readonly meaning?: string | null;
    readonly summaryPriority?: number;
    readonly terminal?: boolean;
}
export interface StatusAxis {
    readonly axisKey: string;
    readonly label: string;
    readonly counting: 'exclusive' | 'overlapping';
    readonly statuses: readonly StatusDefinition[];
}
export interface WorkflowValue {
    readonly title: string;
    readonly axes: readonly StatusAxis[];
}
export interface TicketValue {
    readonly title: string;
    readonly externalRef?: string | null;
    readonly statuses: Readonly<Record<string, readonly string[]>>;
    readonly summary?: string | null;
    readonly disposition?: string | null;
    /** Ticket-level supervision override: off disables program suspicion, not periodic audit. */
    readonly suspicionMode?: 'auto' | 'off';
}
/** Authored identity and navigation only; never a source authorization or status receipt. */
export type TaskReferenceSource = {
    readonly kind: 'external';
    readonly instance: string;
    readonly project: string;
    readonly taskId: string;
} | {
    readonly kind: 'repository';
    readonly repositoryAnchor: string;
    readonly relativePath: string;
    readonly anchor?: string;
} | {
    readonly kind: 'unverified';
};
export interface TaskReferenceValue {
    readonly source: TaskReferenceSource;
    readonly locator: string;
    readonly label?: string;
}
export interface DecisionValue {
    readonly question: string;
    readonly status: string;
    readonly pending?: boolean;
    readonly awaitingImplementation?: boolean;
    readonly ticketIds?: readonly string[];
    readonly context?: string | null;
    readonly options?: readonly {
        readonly key: string;
        readonly label: string;
    }[];
    readonly recommendation?: string | null;
    readonly impact?: string | null;
    readonly addressee?: {
        readonly kind: 'user' | 'agent' | 'unspecified';
        readonly principalId?: string | null;
        readonly label?: string | null;
    };
    readonly result?: string | null;
}
export interface DecisionViewValue {
    readonly read: boolean;
    readonly hidden: boolean;
}
interface CommandBase {
    readonly operationId: string;
    readonly expectedRevision: number;
    readonly workflowId: string;
    readonly references?: readonly string[];
}
export type InstrumentCommand = CommandBase & ({
    readonly action: 'put-workflow';
    readonly value: WorkflowValue;
} | {
    readonly action: 'put-ticket';
    readonly localTicketId: string;
    readonly value: TicketValue;
} | {
    readonly action: 'put-task-reference';
    readonly localTicketId: string;
    readonly value: TaskReferenceValue;
} | {
    readonly action: 'put-decision';
    readonly decisionId: string;
    readonly value: DecisionValue;
} | {
    readonly action: 'adopt-decision-recommendation';
    readonly decisionId: string;
    readonly value: {
        readonly optionKey: string;
        readonly decisionRevision: number;
        readonly policyEpochId: string;
        readonly policyRevision: number;
    };
} | {
    readonly action: 'set-decision-view';
    readonly decisionId: string;
    readonly value: DecisionViewValue;
});
export interface InstrumentEvent {
    readonly revision: number;
    readonly recordedAt: number;
    readonly author: InstrumentAuthor;
    readonly command: InstrumentCommand;
    readonly decisionPolicy?: DecisionPolicyEventEffect;
}
export interface InstrumentDocumentV1 extends InstrumentInstance {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly events: readonly InstrumentEvent[];
}
export interface InstrumentDocumentV2 extends InstrumentInstance {
    readonly schemaVersion: 2;
    readonly revision: number;
    readonly events: readonly InstrumentEvent[];
    readonly checkpoint: {
        readonly throughRevision: number;
        readonly state: Omit<InstrumentState, 'taskReferences'>;
    };
    readonly dedup: readonly InstrumentDedup[];
    readonly coverage: readonly InstrumentCleanupCoverage[];
}
export interface InstrumentDocumentV3 extends Omit<InstrumentDocumentV2, 'schemaVersion' | 'checkpoint'> {
    readonly schemaVersion: 3;
    readonly checkpoint: {
        readonly throughRevision: number;
        readonly state: InstrumentState;
    };
}
export interface InstrumentDocumentV4 extends Omit<InstrumentDocumentV3, 'schemaVersion'> {
    readonly schemaVersion: 4;
}
export type InstrumentDocument = InstrumentDocumentV1 | InstrumentDocumentV2 | InstrumentDocumentV3 | InstrumentDocumentV4;
export interface InstrumentDedup {
    readonly operationId: string;
    readonly author: InstrumentAuthor;
    readonly digest: string;
    readonly appliedRevision: number;
    readonly kind: 'command' | 'compact' | 'purge-history';
    readonly command?: InstrumentCommandMetadata;
}
export interface InstrumentCommandMetadata {
    readonly action: InstrumentCommand['action'];
    readonly target: InstrumentHistoryTarget;
    readonly expectedRevision: number;
    readonly recordedAt: number;
    readonly decisionPolicy?: DecisionPolicyEventEffect;
}
export declare function instrumentCommandMetadata(event: InstrumentEvent): InstrumentCommandMetadata;
export type InstrumentHistoryTarget = {
    readonly kind: 'workflow';
    readonly workflowId: string;
} | {
    readonly kind: 'ticket';
    readonly workflowId: string;
    readonly localTicketId: string;
} | {
    readonly kind: 'task-reference';
    readonly workflowId: string;
    readonly localTicketId: string;
} | {
    readonly kind: 'decision';
    readonly workflowId: string;
    readonly decisionId: string;
};
export interface InstrumentCleanupCoverage {
    readonly operationId: string;
    readonly action: 'compact' | 'purge-history';
    readonly appliedRevision: number;
    readonly author: InstrumentAuthor;
    readonly recordedAt: number;
    readonly throughRevision: number;
    readonly targets: readonly InstrumentHistoryTarget[];
    readonly removedVersions: number;
    readonly removedRevisions: readonly number[];
}
export interface InstrumentCompactInput {
    readonly operationId: string;
    readonly expectedRevision: number;
}
export interface InstrumentPurgeHistoryInput extends InstrumentCompactInput {
    readonly throughRevision: number;
    readonly targets: readonly InstrumentHistoryTarget[];
}
export declare function upgradeInstrumentDocument(document: InstrumentDocument, references?: boolean, policy?: boolean): InstrumentDocumentV2 | InstrumentDocumentV3 | InstrumentDocumentV4;
export interface Change<T> {
    readonly revision: number;
    readonly recordedAt: number;
    readonly author: InstrumentAuthor;
    readonly references: readonly string[];
    readonly value: T;
    readonly policySelection?: DecisionPolicySelection;
}
export interface WorkflowRecord {
    readonly workflowId: string;
    readonly revision: number;
    readonly value: WorkflowValue;
    readonly history: readonly Change<WorkflowValue>[];
}
export interface TicketRecord {
    readonly workflowId: string;
    readonly localTicketId: string;
    readonly revision: number;
    readonly value: TicketValue;
    readonly history: readonly Change<TicketValue>[];
}
export interface TaskReferenceRecord {
    readonly workflowId: string;
    readonly localTicketId: string;
    readonly revision: number;
    readonly value: TaskReferenceValue;
    readonly history: readonly Change<TaskReferenceValue>[];
}
export interface DecisionRecord {
    readonly workflowId: string;
    readonly decisionId: string;
    readonly revision: number;
    readonly value: DecisionValue;
    readonly history: readonly Change<DecisionValue>[];
    readonly creator?: InstrumentAuthor;
    readonly policyBinding?: DecisionPolicyBinding;
    readonly policySelection?: DecisionPolicySelection;
}
export interface DecisionViewRecord {
    readonly workflowId: string;
    readonly decisionId: string;
    readonly principalId: string;
    readonly revision: number;
    readonly value: DecisionViewValue;
}
export interface InstrumentState {
    readonly businessRevision: number;
    readonly viewerRevisions: Readonly<Record<string, number>>;
    readonly workflows: readonly WorkflowRecord[];
    readonly tickets: readonly TicketRecord[];
    readonly taskReferences: readonly TaskReferenceRecord[];
    readonly decisions: readonly DecisionRecord[];
    readonly decisionViews: readonly DecisionViewRecord[];
}
export declare function parseAuthor(value: unknown): InstrumentAuthor;
/** Thin business declarations. No author/instance/config/lease fields accepted. */
export declare function parseInstrumentCommand(value: unknown): InstrumentCommand;
/** Replaying task-defined records also checks reference integrity; no semantic judge. */
export declare function parseInstrumentHistoryTarget(value: unknown): InstrumentHistoryTarget;
export declare function projectInstrumentDocument(document: InstrumentDocument): InstrumentState;
export declare function initialInstrumentDocument(instance: InstrumentInstance): InstrumentDocument;
export declare function parseInstrumentDocument(value: unknown): InstrumentDocument;
export {};
