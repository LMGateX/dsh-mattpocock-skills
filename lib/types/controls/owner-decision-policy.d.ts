import type { InstrumentInstance } from './state.js';
import type { VersionedStorage } from './versioned-storage.js';
import type { DecisionPolicyReader, OperatorAuthor, OwnerDecisionPolicySaveRequest, OwnerDecisionPolicySaveResult, OwnerDecisionPolicyState } from './recommendation-contract.js';
interface PolicyReceipt {
    readonly operationId: string;
    readonly author: OperatorAuthor;
    readonly digest: string;
    readonly appliedRevision: number;
    readonly operation: OwnerDecisionPolicySaveResult['operation'];
}
export interface OwnerDecisionPolicyDocument extends InstrumentInstance, OwnerDecisionPolicyState {
    readonly schemaVersion: 1;
    readonly updatedAt: number;
    readonly updatedBy: OperatorAuthor;
    readonly receipts: readonly PolicyReceipt[];
}
export interface OwnerDecisionPolicyStoreOptions {
    readonly storageFor: (instance: InstrumentInstance) => VersionedStorage<OwnerDecisionPolicyDocument> | Promise<VersionedStorage<OwnerDecisionPolicyDocument>>;
    readonly authorizeOperator: (author: OperatorAuthor, instance: InstrumentInstance) => Promise<void>;
    readonly authorizeEnable: (instance: InstrumentInstance) => Promise<void>;
    readonly now?: () => number;
    readonly newEpochId?: () => string;
}
export interface OwnerDecisionPolicyStoreResult {
    readonly appliedRevision: number;
    readonly replayed: boolean;
    readonly operation: OwnerDecisionPolicySaveResult['operation'];
    readonly state: OwnerDecisionPolicyState;
}
export declare function ownerDecisionPolicyTableName(instanceId: string): string;
export declare function parseOwnerDecisionPolicyDocument(value: unknown): OwnerDecisionPolicyDocument;
export declare class OwnerDecisionPolicyStore implements DecisionPolicyReader {
    private readonly options;
    constructor(options: OwnerDecisionPolicyStoreOptions);
    private load;
    read(input: InstrumentInstance): Promise<OwnerDecisionPolicyState>;
    save(input: InstrumentInstance, request: OwnerDecisionPolicySaveRequest, inputAuthor: OperatorAuthor): Promise<OwnerDecisionPolicyStoreResult>;
}
export {};
