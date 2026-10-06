import type { StartupObservation } from '../controls/startup-state.js';
/** The carrier is the actual process, not a plugin module or Cordis mount. */
export declare function processStartupEpoch(): string;
/** Trusted launch/program options only; never accepted in settings or model input. */
export interface HostStartupOptions {
    readonly sdkRoot?: string;
    readonly bootEpoch?: string;
}
export declare class HostStartupNode {
    private readonly options;
    private readonly nativeSupported;
    private readonly lifetime?;
    readonly epoch: string;
    constructor(options: HostStartupOptions, nativeSupported: () => boolean | null, lifetime?: AbortSignal | undefined);
    private sdkRoot;
    observe(signal?: AbortSignal): Promise<StartupObservation>;
}
