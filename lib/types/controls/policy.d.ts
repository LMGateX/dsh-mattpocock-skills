export interface FeaturePatch {
    readonly enabled?: boolean;
}
export interface WindowPatch extends FeaturePatch {
    readonly ticketWindowSize?: number;
    readonly runningSubagentLimit?: number;
}
export interface DisplayPatch {
    readonly header?: boolean;
    readonly inputSummary?: boolean;
    readonly rightPanel?: boolean;
    readonly sessionList?: boolean;
    readonly timeline?: boolean;
}
export interface WorkspacePolicyPatch {
    /** Per-workspace master gate; the safe initial is closed. */
    readonly workspace?: FeaturePatch;
    /** Per-workspace Skill distribution; the safe initial is open. */
    readonly skills?: FeaturePatch;
    readonly binding?: FeaturePatch;
    readonly lifecycle?: FeaturePatch;
    readonly windows?: WindowPatch;
    readonly ticketProgress?: FeaturePatch;
    readonly pendingDecisions?: FeaturePatch;
    readonly display?: DisplayPatch;
}
export interface PolicyIntent {
    readonly extensionEnabled: boolean;
    readonly defaults: WorkspacePolicyPatch;
    readonly workspaceOverrides: Readonly<Record<string, WorkspacePolicyPatch>>;
}
export interface PolicySnapshot extends PolicyIntent {
    readonly revision: number;
}
export declare const FEATURE_NAMES: readonly ["binding", "lifecycle", "windows", "ticketProgress", "pendingDecisions"];
export declare const DISPLAY_NAMES: readonly ["header", "inputSummary", "rightPanel", "sessionList", "timeline"];
export type FeatureName = typeof FEATURE_NAMES[number];
export type PolicySource = 'workspace' | 'global' | 'safe-initial';
export type PolicyField = 'workspace.enabled' | 'skills.enabled' | 'binding.enabled' | 'lifecycle.enabled' | 'windows.enabled' | 'ticketProgress.enabled' | 'pendingDecisions.enabled' | 'windows.ticketWindowSize' | 'windows.runningSubagentLimit' | 'display.header' | 'display.inputSummary' | 'display.rightPanel' | 'display.sessionList' | 'display.timeline';
export interface EffectivePolicy {
    readonly configurationRevision: number;
    readonly controlWorkspaceId: string;
    readonly workspaceVerified: boolean;
    readonly extensionEnabled: boolean;
    /** Per-workspace gate, resolved; the safe initial is closed. */
    readonly workspaceEnabled: boolean;
    /** Skill distribution for this workspace, resolved; the safe initial is open. */
    readonly skillsEnabled: boolean;
    readonly features: Readonly<Record<FeatureName, {
        readonly requested: boolean;
        /** configured is policy intent, NOT a claim of installed/enforced host capability. */
        readonly status: 'disabled' | 'configured' | 'unsupported';
        readonly reason: 'extension-disabled' | 'workspace-disabled' | 'feature-disabled' | 'workspace-unverified' | 'window-capacity-unset' | null;
    }>>;
    readonly windows: {
        readonly ticketWindowSize: number | null;
        readonly runningSubagentLimit: number | null;
    };
    readonly display: Required<DisplayPatch>;
    readonly sources: Readonly<Record<PolicyField, PolicySource>>;
}
/** No new-work automation and no guessed numeric capacities. */
export declare const INITIAL_POLICY: PolicySnapshot;
/** A save replaces a complete sparse intent; removing a field restores inheritance. */
export declare function parsePolicyIntent(value: unknown): PolicyIntent;
export declare function parsePolicySnapshot(value: unknown): PolicySnapshot;
/** Pure server-side resolution; display preferences never control functional eligibility. */
export declare function resolvePolicy(policy: PolicySnapshot, controlWorkspaceId: string, workspaceVerified: boolean): EffectivePolicy;
