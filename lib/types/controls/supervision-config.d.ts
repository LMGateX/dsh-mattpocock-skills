export declare const SUPERVISION_SCHEMA_VERSION: 1;
export declare const SUPERVISION_START_MODES: readonly ["ticket-held", "first-support-surge"];
export declare const SUPERVISION_ROUTE_MODES: readonly ["inherit", "explicit"];
export declare const SUPERVISION_DELIVERY_MODES: readonly ["card", "card+agent-check"];
export declare const SUPERVISION_SUSPICION_MODES: readonly ["auto", "off"];
export type SupervisionStartMode = typeof SUPERVISION_START_MODES[number];
export type SupervisionRouteMode = typeof SUPERVISION_ROUTE_MODES[number];
export type SupervisionDeliveryMode = typeof SUPERVISION_DELIVERY_MODES[number];
export type SupervisionSuspicionMode = typeof SUPERVISION_SUSPICION_MODES[number];
export interface SupervisionReviewerPatch {
    readonly routeMode?: SupervisionRouteMode;
    readonly provider?: string;
    readonly model?: string;
    readonly reasoningEffort?: string;
    readonly maxTokens?: number;
    readonly timeoutMs?: number;
    readonly toolRounds?: number;
}
export interface SupervisionDeliveryPatch {
    readonly concern?: SupervisionDeliveryMode;
    readonly alert?: SupervisionDeliveryMode;
    readonly alertMinNoProductHours?: number;
    readonly alertMinSupportFiles?: number;
}
export interface SupervisionConfigPatch {
    readonly enabled?: boolean;
    readonly scheduledIntervalMinutes?: number;
    readonly scheduledMaxPerHour?: number;
    readonly scheduledMaxPerDay?: number;
    readonly scheduledDailyTokenBudget?: number;
    readonly rollingSummaryHours?: number;
    readonly scheduledSummaryTopLanes?: number;
    readonly suspicionStartMode?: SupervisionStartMode;
    readonly suspicionMode?: SupervisionSuspicionMode;
    readonly checkIntervalMinutes?: number;
    readonly noProgressChecks?: number;
    readonly fastWindowMinutes?: number;
    readonly supportWriteThreshold?: number;
    readonly supportReadBackThreshold?: number;
    readonly cooldownMinutes?: number;
    readonly maxAuditsPer6h?: number;
    readonly backoffFactor?: number;
    readonly lazyCheck?: boolean;
    readonly dryRun?: boolean;
    readonly episodeRetentionDays?: number;
    readonly episodeMaxEntries?: number;
    readonly reviewer?: SupervisionReviewerPatch;
    readonly delivery?: SupervisionDeliveryPatch;
    readonly softBudgetHours?: number | null;
    readonly deliverableRoots?: readonly string[];
    readonly supportRoots?: readonly string[];
    readonly excludeGlobs?: readonly string[];
}
export interface SupervisionReviewerSettings {
    readonly routeMode: SupervisionRouteMode;
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort: string;
    readonly maxTokens: number;
    readonly timeoutMs: number;
    readonly toolRounds: number;
}
export interface SupervisionDeliverySettings {
    readonly concern: SupervisionDeliveryMode;
    readonly alert: SupervisionDeliveryMode;
    readonly alertMinNoProductHours: number;
    readonly alertMinSupportFiles: number;
}
export interface SupervisionSettings {
    readonly enabled: boolean;
    readonly scheduledIntervalMinutes: number;
    readonly scheduledMaxPerHour: number;
    readonly scheduledMaxPerDay: number;
    readonly scheduledDailyTokenBudget: number;
    readonly rollingSummaryHours: number;
    readonly scheduledSummaryTopLanes: number;
    readonly suspicionStartMode: SupervisionStartMode;
    readonly suspicionMode: SupervisionSuspicionMode;
    readonly checkIntervalMinutes: number;
    readonly noProgressChecks: number;
    readonly fastWindowMinutes: number;
    readonly supportWriteThreshold: number;
    readonly supportReadBackThreshold: number;
    readonly cooldownMinutes: number;
    readonly maxAuditsPer6h: number;
    readonly backoffFactor: number;
    readonly lazyCheck: boolean;
    readonly dryRun: boolean;
    readonly episodeRetentionDays: number;
    readonly episodeMaxEntries: number;
    readonly reviewer: SupervisionReviewerSettings;
    readonly delivery: SupervisionDeliverySettings;
    readonly softBudgetHours: number | null;
    readonly deliverableRoots: readonly string[];
    readonly supportRoots: readonly string[];
    readonly excludeGlobs: readonly string[];
}
export interface SupervisionConfigIntent {
    readonly defaults: SupervisionConfigPatch;
    readonly workspaceOverrides: Readonly<Record<string, SupervisionConfigPatch>>;
}
export interface SupervisionConfigSnapshot extends SupervisionConfigIntent {
    readonly schemaVersion: 1;
    readonly revision: number;
}
export declare const SUPERVISION_DEFAULTS: SupervisionSettings;
export declare const INITIAL_SUPERVISION_CONFIG: SupervisionConfigSnapshot;
export declare function resolveSupervisionSettings(snapshot: SupervisionConfigIntent, workspaceId: string | null): SupervisionSettings;
export declare function parseSupervisionConfigIntent(value: unknown): SupervisionConfigIntent;
export declare function parseSupervisionConfigSnapshot(value: unknown): SupervisionConfigSnapshot;
export declare const parseSupervisionConfigDocument: typeof parseSupervisionConfigSnapshot;
export declare function supervisionIntentOf(snapshot: SupervisionConfigSnapshot): SupervisionConfigIntent;
export declare function ownSupervisionLeaf(intent: SupervisionConfigIntent, workspaceId: string | null, field: SupervisionField): unknown;
export type SupervisionField = 'enabled' | 'scheduledIntervalMinutes' | 'scheduledMaxPerHour' | 'scheduledMaxPerDay' | 'scheduledDailyTokenBudget' | 'rollingSummaryHours' | 'scheduledSummaryTopLanes' | 'suspicionStartMode' | 'checkIntervalMinutes' | 'noProgressChecks' | 'fastWindowMinutes' | 'supportWriteThreshold' | 'supportReadBackThreshold' | 'cooldownMinutes' | 'maxAuditsPer6h' | 'backoffFactor' | 'lazyCheck' | 'dryRun' | 'episodeRetentionDays' | 'episodeMaxEntries' | 'softBudgetHours' | 'suspicionMode' | 'deliverableRoots' | 'supportRoots' | 'excludeGlobs' | 'reviewer.routeMode' | 'reviewer.provider' | 'reviewer.model' | 'reviewer.reasoningEffort' | 'reviewer.maxTokens' | 'reviewer.timeoutMs' | 'reviewer.toolRounds' | 'delivery.concern' | 'delivery.alert' | 'delivery.alertMinNoProductHours' | 'delivery.alertMinSupportFiles';
export declare function setSupervisionLeaf(intent: SupervisionConfigIntent, workspaceId: string | null, field: SupervisionField, value: unknown): SupervisionConfigIntent;
