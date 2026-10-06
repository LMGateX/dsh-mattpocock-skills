import type { StartupObservation, StartupPreparation } from '../controls/startup-state.js';
/** The carrier is the actual process, not a plugin module or Cordis mount. */
export declare function processStartupEpoch(): string;
/** Trusted launch/program options only; never accepted in settings or model input. */
export interface HostStartupOptions {
    readonly sdkRoot?: string;
    readonly bootEpoch?: string;
    /** Trusted program observation only. Not serialized settings or model authority. */
    readonly observeCompatibilityPreparation?: (signal?: AbortSignal) => Promise<StartupPreparation | null>;
    /** Diagnostic origin of the actually loaded public capability; never a fake getter. */
    readonly nativeSource?: () => string | null;
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
