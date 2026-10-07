export type ControlsErrorCode = 'invalid-input' | 'invalid-state' | 'revision-conflict' | 'unknown-session' | 'unknown-workspace' | 'association-conflict' | 'concurrent-update' | 'storage-uncertain' | 'access-denied' | 'operation-conflict' | 'feature-disabled';
/** Mechanical diagnostics only; never business blockers or approval requests. */
export declare class ControlsError extends Error {
    readonly code: ControlsErrorCode;
    readonly name = "ControlsError";
    constructor(code: ControlsErrorCode, message: string);
}
export declare function invalid(message: string): never;
/** True when a tracked mutation rejected before it could start its durable write, so the
 * stored documents are unchanged. A pending-read frontier must not report unknown durability
 * for these; storage-uncertain and non-controls errors keep the persistence outcome unknown. */
export declare function isPreCommitRejection(error: unknown): boolean;
export declare function record(value: unknown, where: string, keys?: readonly string[]): Record<string, unknown>;
/** Dense JSON arrays only: map must not silently skip holes that stringify as null. */
export declare function array(value: unknown, where: string): readonly unknown[];
/** Dense array with an element budget: a single accepted command must not inflate the durable document. */
export declare function boundedArray(value: unknown, where: string, maximum: number): readonly unknown[];
export declare function id(value: unknown, where: string): string;
export declare function revision(value: unknown, where: string): number;
export declare function increment(value: number): number;
export declare function boolean(value: unknown, where: string): boolean;
export declare function capacity(value: unknown, where: string): number;
export declare function freeze<T>(value: T): T;
export declare function memoized<T>(value: unknown, parse: (input: unknown) => T): T;
