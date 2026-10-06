import { parseInstrumentDocument } from './instrument-state.js'
import type { InstrumentDocument } from './instrument-state.js'
import { ControlsError, id } from './validation.js'
import { createDomainVersionedStorage, MemoryVersionedStorage } from './versioned-storage.js'
import type { VersionedStorage, VersionedTable } from './versioned-storage.js'

/** Per-instance atomic/durable CAS. The caller supplies trusted instance identity;
 * document identity must match the row on reads AND writes. Absent revision is 0.
 * Domain adapters share a table-wide indeterminate-write latch across instances.
 */
export interface InstrumentStorage {
  read(instanceId: string): Promise<unknown | undefined>
  compareAndSwap(instanceId: string, expectedRevision: number, next: InstrumentDocument): Promise<boolean>
}

function parserFor(instanceId: string): (value: unknown) => InstrumentDocument {
  return value => {
    const document = parseInstrumentDocument(value)
    if (document.instrumentInstanceId !== instanceId) {
      throw new ControlsError('association-conflict', 'instrument document identity differs from its storage record key')
    }
    return document
  }
}

/** Explicitly NON-durable; independent revision/state per instance, no fallback. */
export class MemoryInstrumentStorage implements InstrumentStorage {
  private readonly instances = new Map<string, MemoryVersionedStorage<InstrumentDocument>>()
  private storageFor(instanceId: string): MemoryVersionedStorage<InstrumentDocument> {
    id(instanceId, 'instrumentInstanceId')
    let storage = this.instances.get(instanceId)
    if (!storage) {
      storage = new MemoryVersionedStorage(parserFor(instanceId))
      this.instances.set(instanceId, storage)
    }
    return storage
  }
  async read(instanceId: string): Promise<InstrumentDocument | undefined> {
    return this.storageFor(instanceId).read()
  }
  async compareAndSwap(instanceId: string, expectedRevision: number, next: InstrumentDocument): Promise<boolean> {
    return this.storageFor(instanceId).compareAndSwap(expectedRevision, next)
  }
}

const adapters = new WeakMap<VersionedTable<InstrumentDocument>, InstrumentStorage>()

/** Stable wrapper per actual table. Each instance ID is the record key, owned
 * exclusively by its adapter. Host schema/open/close remain caller-owned.
 * No default memory fallback, business rules or runtime lease handling.
 */
export function createDomainInstrumentStorage(table: VersionedTable<InstrumentDocument>): InstrumentStorage {
  const existing = adapters.get(table)
  if (existing) return existing
  // Cache parsers with their row adapters: parser identity is part of the shared
  // versioned layer's key contract, not a fresh closure on every call.
  const instances = new Map<string, VersionedStorage<InstrumentDocument>>()
  const storageFor = (instanceId: string): VersionedStorage<InstrumentDocument> => {
    id(instanceId, 'instrumentInstanceId')
    let storage = instances.get(instanceId)
    if (!storage) {
      storage = createDomainVersionedStorage(table, instanceId, parserFor(instanceId))
      instances.set(instanceId, storage)
    }
    return storage
  }
  const storage: InstrumentStorage = {
    async read(instanceId) {
      return storageFor(instanceId).read()
    },
    compareAndSwap(instanceId, expectedRevision, next) {
      return storageFor(instanceId).compareAndSwap(expectedRevision, next)
    },
  }
  adapters.set(table, storage)
  return storage
}
