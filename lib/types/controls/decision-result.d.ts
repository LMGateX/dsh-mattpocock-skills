/** An authored answer and its scope, not an authenticated user event or policy selection. */
export interface DecisionResult {
    readonly answer: string;
    readonly selectedOptionKey?: string;
    readonly source?: {
        readonly kind: string;
        readonly sessionId?: string;
        readonly messageId?: string;
        readonly text?: string;
        readonly position?: string;
    };
    readonly included?: string | readonly string[];
    readonly excluded?: string | readonly string[];
}
export type DecisionResultValue = string | DecisionResult | null;
/** Strict browser-safe parser for the closed structured branch of DecisionValue.result. */
export declare function parseDecisionResult(value: unknown): DecisionResult;
/** Readable presentation only; the original structure remains the stored/transport value. */
export declare function decisionResultText(value: string | DecisionResult | null | undefined): string;
