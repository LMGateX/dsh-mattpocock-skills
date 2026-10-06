export type ManagedSdkStatus = 'ready' | 'not-prepared' | 'incompatible' | 'failed' | 'uncertain';
export interface ManagedSdkResult {
    readonly status: ManagedSdkStatus;
    readonly sdkVersion: string | null;
    readonly diagnostic: string | null;
    readonly managed: boolean;
    readonly recipeId: string;
    readonly canonicalRoot: string | null;
}
/** Read-only disk evidence; never asserts the running native manager has loaded these bytes. */
export declare function inspectManagedSdk(targetRoot: string, signal?: AbortSignal): Promise<ManagedSdkResult>;
/** Offline only: caller must ensure every DSH process using this installation is stopped. */
export declare function prepareManagedSdk(targetRoot: string, signal?: AbortSignal): Promise<ManagedSdkResult>;
/** Explicit uninstall only; feature-off settings must never call this function. Offline prerequisite applies. */
export declare function restoreManagedSdk(targetRoot: string, signal?: AbortSignal): Promise<ManagedSdkResult>;
