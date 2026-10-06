import { ControlsError, freeze, id, increment, invalid, revision } from './validation.js'

type VersionedDocument = { readonly revision: number }
type ParseDocument<T extends VersionedDocument> = (value: unknown) => T

/** Atomic and durable CAS; an absent record has revision 0. Explicitly owned by
 * trusted plugin code, not exposed as a model tool. A rejected write may have
 * committed: reads/writes must stop until a fresh domain/table handle is opened.
 */
export interface VersionedStorage<T extends VersionedDocument> {
  read(): Promise<unknown | undefined>
  compareAndSwap(expectedRevision: number, next: T): Promise<boolean>
}

/** Structural slice of DSH KvTable. The host owns schema/open/close. Every key
 * used by these adapters must be exclusively owned: no external put/delete.
 * One actual table handle in a dedicated SINGLE-TABLE unit/domain in one host.
 * Uncoordinated sibling tables sharing a backend image are unsupported: callers
 * must not write around this table-wide failure latch. NOT cross-process CAS.
 */
export interface VersionedTable<T extends VersionedDocument> {
  get(key: string): unknown | undefined
  put(key: string, value: T): Promise<void>
  update(key: string, fn: (current: T) => T): Promise<T>
}

function snapshot<T extends VersionedDocument>(parse: ParseDocument<T>, value: unknown): T {
  const parsed = parse(value)
  revision(parsed.revision, 'document revision')
  // Validate before cloning; never turn malformed input into a valid document.
  // Detachment/freezing also protect callers of parsers that retain references.
  return freeze(structuredClone(parsed))
}

function candidate<T extends VersionedDocument>(parse: ParseDocument<T>, expectedRevision: number, next: T): T {
  revision(expectedRevision, 'expected document revision')
  const parsed = snapshot(parse, next)
  if (parsed.revision !== increment(expectedRevision)) invalid('CAS must advance document revision by exactly one')
  return parsed
}

/** Explicitly NON-durable; never an automatic persistence fallback. */
export class MemoryVersionedStorage<T extends VersionedDocument> implements VersionedStorage<T> {
  private value: T | undefined
  constructor(private readonly parse: ParseDocument<T>, seed?: unknown) {
    this.value = seed === undefined ? undefined : snapshot(parse, seed)
  }
  async read(): Promise<T | undefined> {
    return this.value === undefined ? undefined : snapshot(this.parse, this.value)
  }
  async compareAndSwap(expectedRevision: number, next: T): Promise<boolean> {
    const parsed = candidate(this.parse, expectedRevision, next)
    if ((this.value?.revision ?? 0) !== expectedRevision) return false
    this.value = parsed
    return true
  }
}

interface CachedAdapter {
  readonly parse: ParseDocument<VersionedDocument>
  readonly storage: VersionedStorage<VersionedDocument>
}
interface TableContext {
  tail: Promise<void>
  uncertain: boolean
  readonly adapters: Map<string, CachedAdapter>
}
// Identity is the actual handle, not its generic document type or record key.
// Single-file backends can leave ALL rows uncertain after one rejected write.
const tables = new WeakMap<object, TableContext>()
class CasConflict extends Error {}

function assertReadable(context: TableContext): void {
  if (context.uncertain) throw new ControlsError('storage-uncertain', 'storage write outcome requires closing and reopening the domain')
}

/** Same handle/key/parser returns the same adapter. The table-wide chain also
 * serializes first-row put, while existing-row CAS runs INSIDE host update.
 * A fresh wrapper around an uncertain handle does not clear its failure latch.
 */
export function createDomainVersionedStorage<T extends VersionedDocument>(
  table: VersionedTable<T>, key: string, parse: ParseDocument<T>,
): VersionedStorage<T> {
  id(key, 'storage record key')
  let context = tables.get(table)
  if (!context) {
    context = { tail: Promise.resolve(), uncertain: false, adapters: new Map() }
    tables.set(table, context)
  }
  const existing = context.adapters.get(key)
  if (existing) {
    if (existing.parse !== parse) invalid('storage record key already uses a different document parser')
    // Parser identity establishes the cached adapter's document type.
    return existing.storage as VersionedStorage<T>
  }
  const shared = context
  const storage: VersionedStorage<T> = {
    async read() {
      assertReadable(shared)
      const raw = table.get(key)
      return raw === undefined ? undefined : snapshot(parse, raw)
    },
    compareAndSwap(expectedRevision, next) {
      assertReadable(shared)
      const parsed = candidate(parse, expectedRevision, next)
      const result = shared.tail.then(async () => {
        assertReadable(shared)
        try {
          if (table.get(key) === undefined) {
            if (expectedRevision !== 0) return false
            await table.put(key, parsed)
            return true
          }
          await table.update(key, current => {
            if (snapshot(parse, current).revision !== expectedRevision) throw new CasConflict()
            return parsed
          })
          return true
        } catch (error) {
          if (error instanceof CasConflict) return false
          // I/O rejection may occur AFTER rename. Do not blindly overwrite
          // potentially committed rows from the backend's old memory image.
          shared.uncertain = true
          throw error
        }
      })
      shared.tail = result.then(() => undefined, () => undefined)
      return result
    },
  }
  shared.adapters.set(key, { parse, storage })
  return storage
}
