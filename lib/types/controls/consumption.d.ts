import type { InstrumentInstance } from './state.js';
import type { EffectivePolicy } from './policy.js';
import type { InstrumentSnapshot } from './instruments.js';
import type { WindowSnapshot } from './windows.js';
import type { ResourceView } from './resources.js';
import type { WorktreeBindingCurrent } from './worktree-bindings.js';
import type { NativeStopRow } from './remote-contract.js';
/** Supplied by authenticated host associations, never parsed from a model/wire command. */
export interface ConsumptionIdentity {
    readonly principalId: string;
    readonly sessionId: string;
    readonly instrumentInstanceId: string;
    readonly ownerSessionId: string;
}
export interface ConsumptionSnapshot {
    /** Held T slots whose ticket already sits in a terminal status; the agent releases them. */
    readonly pendingRelease?: readonly {
        readonly workflowId: string;
        readonly localTicketId: string;
        readonly generation: number;
        readonly label: string | null;
    }[];
    readonly sessionId: string;
    readonly instance: InstrumentInstance;
    readonly policy: EffectivePolicy;
    readonly records: InstrumentSnapshot | null;
    readonly windows: WindowSnapshot | null;
    readonly resources: readonly ResourceView[];
    /** Re-established native count provenance; null means no window facts were read. */
    readonly nativeCount?: {
        readonly reestablished: boolean;
        readonly runtimeId: string;
        readonly previousRuntimeId: string | null;
    } | null;
    /** Open terminal-outcome items the main agent must handle; never a count source. */
    readonly nativeStops?: readonly NativeStopRow[];
    /** Authorized current rows, already filtered by runtime; never the durable registry/history. */
    readonly worktreeBindings?: readonly (WorktreeBindingCurrent & {
        readonly cleanupDue?: boolean;
    })[];
    /** Explicitly retained effective conclusions, not resolved question/option histories. */
    readonly contextConclusions?: readonly {
        readonly decisionId: string;
        readonly workflowId: string;
        readonly result: string;
        readonly sourceRevision: number;
        readonly source: unknown;
    }[];
    readonly capabilities: readonly {
        readonly key: string;
        readonly status: string;
        readonly reason: string | null;
    }[];
    readonly health: readonly {
        readonly scope: string;
        readonly status: string;
        readonly reason: string | null;
    }[];
}
/** Construction-only object capability. This is NOT a model tool or a child-result reader. */
export interface ConsumptionProgramPort {
    trackCommit(instrumentInstanceId: string, commit: Promise<unknown>): void;
}
export interface ConsumptionOptions {
    readonly readSnapshot: (identity: ConsumptionIdentity, signal: AbortSignal) => Promise<ConsumptionSnapshot>;
    readonly timeoutMs?: number;
    readonly maxPendingCommits?: number;
    readonly bindProgram?: (program: ConsumptionProgramPort) => void;
}
export interface ConsumptionResult {
    /** null means unchanged successful facts; diagnostics are always explicit text. */
    readonly text: string | null;
    readonly snapshot?: ConsumptionSnapshot;
    readonly freshness: 'current' | 'stale' | 'unavailable';
    readonly reason?: string;
}
/** A parent consumption seam; it owns neither native admission nor message delivery. */
export declare class InstrumentConsumption {
    #private;
    constructor(options: ConsumptionOptions);
    /** Last prepared projection for this identity, including degraded text whose retry is still
     * pending. Fresh is true only for a verified snapshot; degraded text never replays as current. */
    prepared(identity: ConsumptionIdentity): {
        readonly text: string;
        readonly fresh: boolean;
    } | null;
    /** The last successfully captured text marked stale for `reason`, or null when nothing was
     * captured. Used when the caller cannot even resolve its identity but is already retained. */
    degraded(identity: ConsumptionIdentity, reason: string): string | null;
    cachedText(identity: ConsumptionIdentity): string | null;
    readForConsumption(input: ConsumptionIdentity, signal?: AbortSignal): Promise<ConsumptionResult>;
}
