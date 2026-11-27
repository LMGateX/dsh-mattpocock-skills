import type { Message } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';
/** True only for a standalone generated collaboration message, never an ordinary chat mention. */
export declare function isOwnedCollaborationReplayMessage(message: Message): boolean;
interface Position {
    readonly turn: number;
    readonly step: number;
}
export type CollaborationReplayGap = 'standalone-format' | 'runtime-context-format' | 'ptc-sdk-format';
export interface CollaborationReplayResult {
    readonly startsRequestSeries: boolean;
    readonly unsupported: readonly CollaborationReplayGap[];
}
/**
 * Reconcile the current model surface only. The original events and every prior
 * request boundary remain intact. An empty native system node shadows exactly
 * one historical node and contributes no model message, text, or tool change.
 */
export declare function stripOwnedCollaborationReplay(session: Session, position?: Position): CollaborationReplayResult;
export {};
