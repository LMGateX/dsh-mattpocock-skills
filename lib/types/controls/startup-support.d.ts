import type { StartupBoot, StartupDesired, StartupDocument, StartupObservation, StartupStatus } from './startup-state.js';
import type { VersionedStorage } from './versioned-storage.js';
/** Trusted program seam; Host owns operator authorization and process identity.
 * Saving requests only the next process configuration: no SDK preparation here. */
export declare class StartupSupport {
    private readonly storage;
    private readonly observe;
    private readonly epoch;
    constructor(storage: VersionedStorage<StartupDocument>, boot: StartupBoot, observe: (signal?: AbortSignal) => Promise<StartupObservation>);
    private load;
    private receipt;
    private captureBoot;
    private status;
    readStatus(signal?: AbortSignal): Promise<StartupStatus>;
    save(desired: StartupDesired, expectedRevision: number, signal?: AbortSignal): Promise<StartupStatus>;
}
