import type { ControlsDocument } from './state.js';
import { MemoryVersionedStorage } from './versioned-storage.js';
import type { VersionedStorage, VersionedTable } from './versioned-storage.js';
/** Atomic/durable CAS; absent state has revision 0. A rejected write may have
 * committed, so the table stays unreadable/unwritable until a fresh reopen.
 * Exclusively owned by trusted plugin code, never exposed as a model tool.
 */
export interface ControlsStorage extends VersionedStorage<ControlsDocument> {
}
/** Explicitly NON-durable; for tests/embedders, never a persistence fallback. */
export declare class MemoryControlsStorage extends MemoryVersionedStorage<ControlsDocument> implements ControlsStorage {
    constructor(seed?: unknown);
}
/** Structural DSH KvTable seam; the host owns opening/schema/closing. Reserve
 * the 'state' row exclusively for this adapter, with one actual table handle
 * in one host. This is NOT a cross-process transaction seam.
 */
export interface ControlsStateTable extends VersionedTable<ControlsDocument> {
}
/** Stable adapter per table. Initialization/failure state is shared with ALL
 * versioned rows of that table; existing-row CAS runs inside host update.
 */
export declare function createDomainControlsStorage(table: ControlsStateTable): ControlsStorage;
