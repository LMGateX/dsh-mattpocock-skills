import type { WorkspaceControls } from './index.js';
import type { InstrumentAuthority, InstrumentScope } from './instruments.js';
import type { InstrumentInstance } from './state.js';
import type { VersionedTable } from './versioned-storage.js';
/** Actual host execution observation coverage; never an advisory reservation gate. */
export type WindowCapability = 'unsupported' | 'cooperative';
export type ExecutionState = 'reserved' | 'accepted' | 'scheduled' | 'running' | 'stopping' | 'unknown' | 'released';
export interface TicketLease {
    readonly workflowId: string;
    readonly localTicketId: string;
    readonly generation: number;
    readonly held: boolean;
}
export type TicketWindowCommand = {
    readonly operationId: string;
    readonly workflowId: string;
    readonly localTicketId: string;
} & ({
    readonly action: 'reserve';
} | {
    readonly action: 'release' | 'reacquire';
    readonly generation: number;
});
export interface ExecutionRequest {
    readonly operationId: string;
    /** Stable host task/activation identity, not a message or historical child count. */
    readonly executionId: string;
    /** null is real pre-workflow research, never a fabricated business workflow. */
    readonly workflowId: string | null;
    readonly localTicketId: string | null;
}
export interface ExecutionToken {
    readonly instrumentInstanceId: string;
    readonly executionId: string;
    readonly generation: number;
    readonly leaseId: string;
}
export interface ExecutionReceipt extends ExecutionToken {
    readonly operationId: string;
    readonly state: ExecutionState;
}
export interface ExecutionLease extends ExecutionToken {
    readonly workflowId: string | null;
    readonly localTicketId: string | null;
    readonly runtimeId: string;
    readonly state: ExecutionState;
}
export interface ExecutionWindowView extends ExecutionLease {
    readonly ticketApplicable: boolean;
    readonly ticketReason: 'no-ticket-assignment' | null;
}
export interface RuntimeKnowledge {
    readonly runtimeId: string | null;
    readonly known: boolean;
    readonly reason: string | null;
}
export interface RuntimeObservation {
    readonly operationId: string;
    readonly state: 'known' | 'unknown';
    readonly reason: string | null;
}
export interface WindowOperation {
    readonly operationId: string;
    readonly kind: 'ticket' | 'execution' | 'receipt' | 'knowledge';
    readonly caller: string | null;
    readonly fingerprint: string;
    readonly runtimeId: string | null;
    readonly revision: number;
    readonly generation: number;
    readonly leaseId: string | null;
    readonly ignored: boolean;
}
export interface LegacyWindowDocument extends InstrumentInstance {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly knowledge: RuntimeKnowledge;
    readonly tickets: readonly TicketLease[];
    /** Released generations remain as fencing tombstones. */
    readonly executions: readonly ExecutionLease[];
    readonly operations: readonly WindowOperation[];
}
export type WindowHistoryTarget = {
    readonly kind: 'knowledge';
} | {
    readonly kind: 'ticket';
    readonly workflowId: string;
    readonly localTicketId: string;
} | {
    readonly kind: 'execution';
    readonly executionId: string;
};
export interface WindowReservationOrigin {
    readonly leaseId: string;
    readonly revision: number;
}
export interface WindowCheckpoint {
    readonly throughRevision: number;
    readonly knowledge: RuntimeKnowledge;
    readonly tickets: readonly TicketLease[];
    readonly executions: readonly ExecutionLease[];
    readonly reservationOrigins: readonly WindowReservationOrigin[];
    readonly stateDigest: string;
}
export interface WindowDedupOperation extends Omit<WindowOperation, 'fingerprint'> {
    readonly digest: string;
    readonly target: WindowHistoryTarget;
}
export interface WindowHistoryResult {
    readonly appliedRevision: number;
    readonly replayed: boolean;
    readonly compactedThroughRevision: number;
    readonly purgedOperationIds: readonly string[];
}
export interface WindowHistoryAction extends Omit<WindowHistoryResult, 'appliedRevision' | 'replayed'> {
    readonly operationId: string;
    readonly kind: 'compact' | 'purge';
    readonly caller: string;
    readonly runtimeId: string;
    readonly digest: string;
    readonly revision: number;
}
export interface CheckpointWindowDocument extends Omit<LegacyWindowDocument, 'schemaVersion'> {
    readonly schemaVersion: 2;
    readonly checkpoint: WindowCheckpoint;
    readonly dedup: readonly WindowDedupOperation[];
    readonly retainedOperations: readonly WindowOperation[];
    readonly historyActions: readonly WindowHistoryAction[];
}
export type WindowDocument = LegacyWindowDocument | CheckpointWindowDocument;
export interface WindowCompactRequest {
    readonly operationId: string;
    readonly expectedRevision: number;
}
export interface WindowPurgeRequest extends WindowCompactRequest {
    readonly throughRevision: number;
    readonly targets: readonly WindowHistoryTarget[];
}
export interface WindowStorage {
    read(instanceId: string): Promise<unknown | undefined>;
    compareAndSwap(instanceId: string, expectedRevision: number, next: WindowDocument): Promise<boolean>;
}
export interface WindowUsage {
    /** Saved advisory reference, never an execution authorization limit. */
    readonly capacity: number | null;
    /** Registered held tickets/execution leases; S is not an unobserved native total. */
    readonly used: number;
    /** Registered-ledger headroom; null means disabled/unconfigured. Never gates dispatch. */
    readonly available: number | null;
    readonly overcommitted: boolean;
    /** Amount above the reference; null when no reference is configured. */
    readonly overage: number | null;
    /** Signed reference minus registered usage, including negative overage. */
    readonly gap: number | null;
}
export interface WindowSnapshot {
    readonly instance: InstrumentInstance;
    readonly revision: number;
    readonly configurationRevision: number;
    readonly capability: WindowCapability;
    /** Observational/advisory status, not authority to deny an otherwise valid dispatch. */
    readonly status: 'disabled' | 'unsupported' | 'reconciling' | 'overcommitted' | 'ready';
    readonly reason: string | null;
    readonly scope: InstrumentScope;
    readonly runtimeKnowledge: RuntimeKnowledge;
    readonly tickets: readonly TicketLease[];
    readonly executions: readonly ExecutionWindowView[];
    /** Always instance totals, even when detail is assignment-filtered. */
    readonly T: WindowUsage;
    readonly S: WindowUsage & {
        /** False means used is only the registered count, not a known complete native count. */
        readonly countKnown: boolean;
        readonly byState: Readonly<Record<ExecutionState, number>>;
    };
}
export interface TicketWindowResult {
    readonly appliedRevision: number;
    readonly replayed: boolean;
    readonly ignored: boolean;
    readonly generation: number;
    readonly snapshot: WindowSnapshot;
}
export interface ExecutionReservation {
    readonly appliedRevision: number;
    readonly replayed: boolean;
    /** Only the first reservation of a current-runtime reserved generation can dispatch. */
    readonly dispatchable: boolean;
    readonly token: ExecutionToken;
    readonly snapshot: WindowSnapshot;
}
export interface ReceiptResult {
    readonly appliedRevision: number;
    readonly replayed: boolean;
    readonly ignored: boolean;
}
/** Object capability captured only by trusted construction; never serialize as a tool. */
export interface WindowProgramPort {
    reserveExecution(principal: string, sessionId: string, request: ExecutionRequest): Promise<ExecutionReservation>;
    receipt(receipt: ExecutionReceipt): Promise<ReceiptResult>;
    reconcileKnowledge(principal: string, sessionId: string, observation: RuntimeObservation): Promise<ReceiptResult>;
    compactHistory(principal: string, sessionId: string, request: WindowCompactRequest, signal?: AbortSignal): Promise<WindowHistoryResult>;
    purgeHistory(principal: string, sessionId: string, request: WindowPurgeRequest, signal?: AbortSignal): Promise<WindowHistoryResult>;
}
export interface WindowOptions {
    /** Shared by coordinators in one host lifetime; MUST change on host restart. */
    readonly runtimeId: string;
    readonly capability: WindowCapability;
    /** Compatibility flag: marks uninspected runtime reconciling, but never blocks reservations. */
    readonly requireKnownRuntime?: boolean;
    readonly bindProgram: (port: WindowProgramPort) => void;
    readonly newLeaseId?: () => string;
}
export declare function parseTicketWindowCommand(value: unknown): TicketWindowCommand;
export declare function parseWindowDocument(value: unknown): WindowDocument;
export declare function initialWindowDocument(instance: InstrumentInstance): WindowDocument;
/** Explicit non-durable helper, NEVER a fallback for storage errors. */
export declare class MemoryWindowStorage implements WindowStorage {
    #private;
    read(instanceId: string): Promise<unknown | undefined>;
    compareAndSwap(instanceId: string, expectedRevision: number, next: WindowDocument): Promise<boolean>;
}
/** Dedicated SINGLE-TABLE domain/handle. No cross-process or sibling-table CAS. */
export declare function createDomainWindowStorage(table: VersionedTable<WindowDocument>): WindowStorage;
/** Two-operation BUSINESS interface. All S mutations live in private closures. */
export declare class SessionWindows {
    #private;
    constructor(controls: WorkspaceControls, storage: WindowStorage, authority: InstrumentAuthority, options: WindowOptions);
    read(principal: string, sessionId: string): Promise<WindowSnapshot>;
    apply(principal: string, sessionId: string, input: TicketWindowCommand): Promise<TicketWindowResult>;
}
