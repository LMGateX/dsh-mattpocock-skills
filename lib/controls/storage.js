import { parseControlsDocument } from './state.js';
import { createDomainVersionedStorage, MemoryVersionedStorage } from './versioned-storage.js';
/** Explicitly NON-durable; for tests/embedders, never a persistence fallback. */
export class MemoryControlsStorage extends MemoryVersionedStorage {
    constructor(seed) { super(parseControlsDocument, seed); }
}
/** Stable adapter per table. Initialization/failure state is shared with ALL
 * versioned rows of that table; existing-row CAS runs inside host update.
 */
export function createDomainControlsStorage(table) {
    return createDomainVersionedStorage(table, 'state', parseControlsDocument);
}
