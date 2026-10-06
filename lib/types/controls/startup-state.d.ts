/** Only this feature's next-process request; never the plugin master switch. */
export interface StartupDesired {
    readonly startupCwdEnabled: boolean;
}
/** Trusted real-process identity supplied by Host, never a settings/model field. */
export interface StartupBoot {
    readonly epoch: string;
}
export interface StartupPreparation {
    readonly status: 'ready' | 'not-prepared' | 'incompatible' | 'failed' | 'uncertain';
    readonly sdkVersion: string | null;
    readonly diagnostic: string | null;
}
export interface StartupObservation {
    readonly nativeInitialCwdSupported: boolean | null;
    readonly preparation: StartupPreparation;
}
export interface StartupBootReceipt {
    readonly epoch: string;
    readonly requested: StartupDesired;
}
export interface StartupDocument {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly desired: StartupDesired;
    readonly bootReceipts: readonly StartupBootReceipt[];
}
export interface StartupStatus {
    readonly revision: number;
    readonly desired: StartupDesired;
    readonly boot: StartupBootReceipt;
    readonly enabledNow: boolean | null;
    readonly nativeInitialCwdSupported: boolean | null;
    readonly preparation: StartupPreparation;
    readonly restartNeeded: boolean;
    readonly state: 'disabled' | 'enabled' | 'pending-restart' | 'needs-preparation' | 'unsupported' | 'incompatible' | 'failed' | 'uncertain';
}
export declare function parseStartupDesired(value: unknown): StartupDesired;
export declare function parseStartupObservation(value: unknown): StartupObservation;
/** Strict transport decoder. It validates JSON facts, not a second UI projection. */
export declare function parseStartupStatus(value: unknown): StartupStatus;
export declare function emptyStartupDocument(): StartupDocument;
export declare function parseStartupDocument(value: unknown): StartupDocument;
