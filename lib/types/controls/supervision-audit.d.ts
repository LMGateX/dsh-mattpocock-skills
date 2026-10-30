import type { SupervisionSettings } from './supervision-config.js';
import type { SupervisionLedgerSummary } from './supervision-ledger.js';
export declare const SUPERVISION_TRIGGERS: readonly ["scheduled", "suspicion"];
export declare const SUPERVISION_VERDICTS: readonly ["on-track", "suspicion", "uncertain"];
export declare const SUPERVISION_SEVERITIES: readonly ["info", "concern", "alert"];
export type SupervisionTrigger = typeof SUPERVISION_TRIGGERS[number];
export type SupervisionVerdict = typeof SUPERVISION_VERDICTS[number];
export type SupervisionSeverity = typeof SUPERVISION_SEVERITIES[number];
export type SupervisionDelivery = 'none' | 'card' | 'card+agent';
export interface SupervisionReview {
    readonly verdict: SupervisionVerdict;
    readonly severity: SupervisionSeverity;
    readonly observed: string;
    readonly possibleIssue: string;
    readonly confidence: number;
}
export interface SupervisionEvidence {
    readonly events: number;
    readonly productWrites: number;
    readonly supportWrites: number;
    readonly productFiles: readonly string[];
    readonly supportFiles: readonly string[];
    readonly noProductHours: number | null;
    readonly rootsConfigured: boolean;
}
export interface SupervisionEpisode {
    readonly episodeId: string;
    readonly ownerSessionId: string;
    /** Assigned ticket visible to this check, or null when attribution is unavailable. */
    readonly ticketId: string | null;
    /** The check ran for a ticket whose program-suspicion mode is off (research/review marker). */
    readonly research: boolean;
    readonly at: number;
    readonly trigger: SupervisionTrigger;
    readonly verdict: SupervisionVerdict;
    readonly severity: SupervisionSeverity;
    readonly observed: string;
    readonly possibleIssue: string;
    readonly confidence: number;
    readonly delivery: SupervisionDelivery;
    readonly evidence: SupervisionEvidence;
}
export interface SupervisionDocument {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly ownerSessionId: string;
    readonly workspaceId: string;
    readonly createdAt: number;
    readonly lastScheduledAt: number;
    readonly lastSuspicionAt: number | null;
    readonly consecutiveOnTrack: number;
    readonly backoffUntil: number | null;
    readonly hourKey: string;
    readonly hourCalls: number;
    readonly dailyKey: string;
    readonly dailyCalls: number;
    readonly dailyTokens: number;
    readonly episodes: readonly SupervisionEpisode[];
}
export declare function initialSupervisionDocument(ownerSessionId: string, workspaceId: string, now: number): SupervisionDocument;
export declare function parseSupervisionDocument(value: unknown): SupervisionDocument;
export declare function decideSupervisionTrigger(document: SupervisionDocument, settings: SupervisionSettings, summary: SupervisionLedgerSummary, now: number, ticketSuspicionMode?: 'auto' | 'off'): SupervisionTrigger | null;
export declare function deterministicReview(trigger: SupervisionTrigger, summary: SupervisionLedgerSummary): SupervisionReview;
export declare function makeSupervisionEpisode(input: {
    readonly document: SupervisionDocument;
    readonly trigger: SupervisionTrigger;
    readonly review: SupervisionReview;
    readonly summary: SupervisionLedgerSummary;
    readonly now: number;
    readonly delivery: SupervisionDelivery;
    readonly ticketId?: string | null;
    readonly research?: boolean;
}): SupervisionEpisode;
export declare function withSupervisionEpisode(document: SupervisionDocument, episode: SupervisionEpisode, settings: SupervisionSettings, now: number, tokens?: number): SupervisionDocument;
export declare function supervisionAgentText(episode: SupervisionEpisode): string;
