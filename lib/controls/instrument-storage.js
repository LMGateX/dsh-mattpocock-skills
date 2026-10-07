import { parseInstrumentDocument } from './instrument-state.js';
import { ControlsError, id, memoized } from './validation.js';
import { createDomainVersionedStorage, MemoryVersionedStorage } from './versioned-storage.js';
function parserFor(instanceId) {
    return value => {
        const document = memoized(value, parseInstrumentDocument);
        if (document.instrumentInstanceId !== instanceId) {
            throw new ControlsError('association-conflict', 'instrument document identity differs from its storage record key');
        }
        return document;
    };
}
/** Explicitly NON-durable; independent revision/state per instance, no fallback. */
export class MemoryInstrumentStorage {
    instances = new Map();
    storageFor(instanceId) {
        id(instanceId, 'instrumentInstanceId');
        let storage = this.instances.get(instanceId);
        if (!storage) {
            storage = new MemoryVersionedStorage(parserFor(instanceId));
            this.instances.set(instanceId, storage);
        }
        return storage;
    }
    async read(instanceId) {
        return this.storageFor(instanceId).read();
    }
    async compareAndSwap(instanceId, expectedRevision, next) {
        return this.storageFor(instanceId).compareAndSwap(expectedRevision, next);
    }
}
const adapters = new WeakMap();
/** Stable wrapper per actual table. Each instance ID is the record key, owned
 * exclusively by its adapter. Host schema/open/close remain caller-owned.
 * No default memory fallback, business rules or runtime lease handling.
 */
export function createDomainInstrumentStorage(table) {
    const existing = adapters.get(table);
    if (existing)
        return existing;
    // Cache parsers with their row adapters: parser identity is part of the shared
    // versioned layer's key contract, not a fresh closure on every call.
    const instances = new Map();
    const storageFor = (instanceId) => {
        id(instanceId, 'instrumentInstanceId');
        let storage = instances.get(instanceId);
        if (!storage) {
            storage = createDomainVersionedStorage(table, instanceId, parserFor(instanceId));
            instances.set(instanceId, storage);
        }
        return storage;
    };
    const storage = {
        async read(instanceId) {
            return storageFor(instanceId).read();
        },
        compareAndSwap(instanceId, expectedRevision, next) {
            return storageFor(instanceId).compareAndSwap(expectedRevision, next);
        },
    };
    adapters.set(table, storage);
    return storage;
}
