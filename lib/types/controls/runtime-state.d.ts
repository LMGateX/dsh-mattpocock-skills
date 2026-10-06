import type { ExecutionToken } from './windows.js';
import type { VersionedStorage } from './versioned-storage.js';
/** Host-produced task permissions and exact execution associations; never model receipts. */
export interface TaskAssignment {
    readonly sessionId: string;
    readonly parentSessionId: string;
    readonly instrumentInstanceId: string;
    readonly workflowId: string | null;
    readonly ticketIds: readonly string[];
}
export interface ExecutionBinding extends ExecutionToken {
    readonly sessionId: string;
    readonly parentSessionId: string;
    readonly runtimeId: string;
    readonly released: boolean;
}
export interface OwnerNotification {
    readonly notificationId: string;
    readonly instrumentInstanceId: string;
    readonly ownerSessionId: string;
    readonly businessRevision: number;
    readonly authorPrincipalId: string;
    readonly state: 'pending' | 'accepted' | 'consumed';
    readonly messageId: string | null;
}
export interface RuntimeDocument {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly assignments: readonly TaskAssignment[];
    readonly bindings: readonly ExecutionBinding[];
    readonly notifications: readonly OwnerNotification[];
}
export type RuntimeStorage = VersionedStorage<RuntimeDocument>;
export declare const INITIAL_RUNTIME_DOCUMENT: RuntimeDocument;
export declare function parseRuntimeDocument(value: unknown): RuntimeDocument;
