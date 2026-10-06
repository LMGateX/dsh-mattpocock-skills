import type { InstrumentDocument } from './instrument-state.js';
import type { VersionedTable } from './versioned-storage.js';
/** Per-instance atomic/durable CAS. The caller supplies trusted instance identity;
 * document identity must match the row on reads AND writes. Absent revision is 0.
 * Domain adapters share a table-wide indeterminate-write latch across instances.
 */
export interface InstrumentStorage {
    read(instanceId: string): Promise<unknown | undefined>;
    compareAndSwap(instanceId: string, expectedRevision: number, next: InstrumentDocument): Promise<boolean>;
}
/** Explicitly NON-durable; independent revision/state per instance, no fallback. */
export declare class MemoryInstrumentStorage implements InstrumentStorage {
    private readonly instances;
    private storageFor;
    read(instanceId: string): Promise<InstrumentDocument | undefined>;
    compareAndSwap(instanceId: string, expectedRevision: number, next: InstrumentDocument): Promise<boolean>;
}
/** Stable wrapper per actual table. Each instance ID is the record key, owned
 * exclusively by its adapter. Host schema/open/close remain caller-owned.
 * No default memory fallback, business rules or runtime lease handling.
 */
export declare function createDomainInstrumentStorage(table: VersionedTable<InstrumentDocument>): InstrumentStorage;
