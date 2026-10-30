export type SupervisionPathKind = 'product' | 'support' | 'other';
export interface SupervisionTicketRef {
    readonly workflowId: string | null;
    readonly ticketId: string;
}
export interface SupervisionLedgerEvent {
    readonly at: number;
    readonly sessionId: string;
    readonly callId: string;
    readonly rootCallId: string | null;
    readonly tool: string;
    readonly path: string | null;
    readonly write: boolean;
    readonly read: boolean;
    /** Assignment facts observed at record/tag time; absent means attribution is unknown. */
    readonly tickets?: readonly SupervisionTicketRef[];
}
export interface SupervisionLedgerRoots {
    readonly deliverableRoots: readonly string[];
    readonly supportRoots: readonly string[];
    readonly excludeGlobs: readonly string[];
}
export interface SupervisionLedgerSummary {
    readonly windowHours: number;
    readonly events: number;
    readonly sessions: number;
    readonly dropped: number;
    readonly productWrites: number;
    readonly supportWrites: number;
    readonly otherWrites: number;
    readonly productFiles: readonly string[];
    readonly supportFiles: readonly string[];
    readonly lastProductAt: string | null;
    readonly noProductHours: number | null;
    readonly supportOnly: boolean;
    readonly rootsConfigured: boolean;
    readonly tickets: readonly SupervisionTicketSummary[];
    readonly unattributedWrites: number;
    readonly recent: readonly SupervisionLedgerEvent[];
}
export interface SupervisionTicketSummary {
    readonly workflowId: string | null;
    readonly ticketId: string;
    readonly productWrites: number;
    readonly supportWrites: number;
    readonly otherWrites: number;
    readonly productFiles: readonly string[];
    readonly supportFiles: readonly string[];
    readonly lastProductAt: string | null;
    readonly noProductHours: number | null;
    readonly supportOnly: boolean;
    readonly lastActivityAt: string;
}
/** Bounded, memory-only observation. It never writes storage and never calls a model. */
export declare class SupervisionLedger {
    private readonly owners;
    record(input: {
        readonly ownerSessionId: string;
        readonly sessionId: string;
        readonly callId: string;
        readonly rootCallId?: string | null;
        readonly tool: string;
        readonly at?: number;
        readonly arguments: unknown;
        readonly tickets?: readonly SupervisionTicketRef[];
    }): void;
    summary(ownerSessionId: string, roots: SupervisionLedgerRoots, now?: number, windowHours?: number): SupervisionLedgerSummary;
    /** Attach an observed assignment to one session's not-yet-attributed events. */
    tagSession(ownerSessionId: string, sessionId: string, tickets: readonly SupervisionTicketRef[]): void;
    clear(): void;
    private owner;
}
export declare function supervisionLedgerHasActivity(ledger: SupervisionLedger, ownerSessionId: string): boolean;
