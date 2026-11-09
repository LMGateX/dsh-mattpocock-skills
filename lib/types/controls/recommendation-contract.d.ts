import type { InstrumentInstance } from './state.js';
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
/** Browser-pure wire contract. Policy facts are server-authored, never command values. */
export interface OperatorAuthor {
    readonly kind: 'user';
    readonly principalId: string;
    readonly sessionId: null;
}
export interface OwnerDecisionPolicyEpoch {
    readonly epochId: string;
    readonly policyRevision: number;
    readonly scope: 'new-decisions';
    readonly enabledAt: number;
    readonly expiresAt: number | null;
    readonly authorizedBy: OperatorAuthor;
}
export type OwnerDecisionPolicyStatus = 'active' | 'disabled' | 'expired' | 'feature-disabled' | 'unknown';
export type OwnerDecisionPolicySaveRequest = {
    readonly operationId: string;
    readonly expectedRevision: number;
    readonly expectedScope: InstrumentInstance;
} & ({
    readonly action: 'enable';
    readonly durationMs: number | null;
} | {
    readonly action: 'disable';
});
export interface OwnerDecisionPolicyState {
    readonly revision: number;
    readonly enabled: boolean;
    readonly epoch: OwnerDecisionPolicyEpoch | null;
}
export interface DecisionPolicyReader {
    read(instance: InstrumentInstance): Promise<OwnerDecisionPolicyState>;
}
export interface OwnerDecisionPolicySnapshot {
    readonly schemaVersion: 1;
    readonly instance: InstrumentInstance;
    readonly revision: number;
    readonly saved: {
        readonly enabled: boolean;
        readonly epoch: OwnerDecisionPolicyEpoch | null;
    };
    readonly effective: {
        readonly status: OwnerDecisionPolicyStatus;
        readonly reason: string | null;
    };
}
export interface OwnerDecisionPolicySaveResult {
    readonly appliedRevision: number;
    readonly replayed: boolean;
    readonly operation: {
        readonly action: 'enable' | 'disable';
        readonly epochId: string | null;
        readonly expiresAt: number | null;
    };
    readonly snapshot: OwnerDecisionPolicySnapshot;
}
export interface DecisionPolicyBinding {
    readonly createdRevision: number;
    readonly optionKey: string;
    readonly policy: OwnerDecisionPolicyEpoch;
}
export interface DecisionPolicySelection {
    readonly kind: 'owner-policy';
    readonly selectedOptionKey: string;
    readonly decisionSourceRevision: number;
    readonly policy: OwnerDecisionPolicyEpoch;
    readonly authorizedAt: number;
}
export type DecisionPolicyEventEffect = {
    readonly kind: 'bound';
    readonly binding: DecisionPolicyBinding;
} | {
    readonly kind: 'adopted';
    readonly selection: DecisionPolicySelection;
};
export interface RecommendationCandidate {
    readonly optionKey: string;
    readonly decisionRevision: number;
    readonly policyEpochId: string;
    readonly policyRevision: number;
    readonly expiresAt: number | null;
}
export type RecommendationReason = 'policy-disabled' | 'policy-expired' | 'feature-disabled' | 'no-creation-binding' | 'decision-changed' | 'not-pending-user' | 'no-exact-recommendation' | 'policy-epoch-changed' | 'different-addressee';
export type RecommendationOutcome = {
    readonly status: 'candidate';
    readonly candidate: RecommendationCandidate;
} | {
    readonly status: 'adopted';
    readonly selection: DecisionPolicySelection;
} | {
    readonly status: 'not-eligible';
    readonly reason: RecommendationReason;
} | {
    readonly status: 'unknown';
    readonly reason: 'policy-unavailable' | 'projection-unavailable';
};
export interface OwnerDecisionPolicyPublic {
    readonly revision: number | null;
    readonly status: OwnerDecisionPolicyStatus;
    readonly epochId: string | null;
    readonly expiresAt: number | null;
    readonly scope: 'new-decisions';
    readonly reason: string | null;
}
export declare const RECOMMENDATION_REMOTE_NAMESPACE: "mattpocockRecommendationSupport";
export declare const RECOMMENDATION_REMOTE_METHODS: readonly ["readOwnerDecisionPolicy", "saveOwnerDecisionPolicy"];
export interface RecommendationRemote {
    readOwnerDecisionPolicy(sessionId: string, signal?: AbortSignal): Promise<OwnerDecisionPolicySnapshot>;
    saveOwnerDecisionPolicy(sessionId: string, request: OwnerDecisionPolicySaveRequest): Promise<OwnerDecisionPolicySaveResult>;
}
export declare function parseRecommendationInstance(value: unknown): InstrumentInstance;
export declare function parseOperatorAuthor(value: unknown): OperatorAuthor;
export declare function parseOwnerDecisionPolicyEpoch(value: unknown): OwnerDecisionPolicyEpoch;
export declare function parseOwnerDecisionPolicyState(value: unknown): OwnerDecisionPolicyState;
export declare function parseOwnerDecisionPolicySaveRequest(value: unknown): OwnerDecisionPolicySaveRequest;
export declare function parseOwnerDecisionPolicySnapshot(value: unknown): OwnerDecisionPolicySnapshot;
export declare function parseOwnerDecisionPolicyOperation(value: unknown): OwnerDecisionPolicySaveResult['operation'];
export declare function parseOwnerDecisionPolicySaveResult(value: unknown): OwnerDecisionPolicySaveResult;
export declare function parseDecisionPolicyBinding(value: unknown): DecisionPolicyBinding;
export declare function parseDecisionPolicySelection(value: unknown): DecisionPolicySelection;
export declare function parseDecisionPolicyEventEffect(value: unknown): DecisionPolicyEventEffect;
/** Stable effective buckets; caller samples its trusted clock, never a model timestamp. */
export declare function evaluateOwnerDecisionPolicy(state: OwnerDecisionPolicyState, featureConfigured: boolean, now: number): OwnerDecisionPolicySnapshot['effective'];
/** Decision-local eligibility; no task/business semantic inference. */
export declare function evaluateRecommendationSupport(row: {
    readonly revision: number;
    readonly value: {
        readonly pending?: boolean;
        readonly recommendation?: string | null;
        readonly options?: readonly {
            readonly key: string;
        }[];
        readonly addressee?: {
            readonly kind: string;
            readonly principalId?: string | null;
        };
    };
    readonly policyBinding?: DecisionPolicyBinding;
    readonly policySelection?: DecisionPolicySelection;
}, state: OwnerDecisionPolicyState | undefined, featureConfigured: boolean, now: number): RecommendationOutcome;
export declare const RECOMMENDATION_REMOTE_CONTRIBUTION: TypertRemoteContribution;
