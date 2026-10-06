import { ControlsError, freeze, id, increment, invalid, revision } from './validation.js';
function snapshot(parse, value) {
    const parsed = parse(value);
    revision(parsed.revision, 'document revision');
    // Validate before cloning; never turn malformed input into a valid document.
    // Detachment/freezing also protect callers of parsers that retain references.
    return freeze(structuredClone(parsed));
}
function candidate(parse, expectedRevision, next) {
    revision(expectedRevision, 'expected document revision');
    const parsed = snapshot(parse, next);
    if (parsed.revision !== increment(expectedRevision))
        invalid('CAS must advance document revision by exactly one');
    return parsed;
}
/** Explicitly NON-durable; never an automatic persistence fallback. */
export class MemoryVersionedStorage {
    parse;
    value;
    constructor(parse, seed) {
        this.parse = parse;
        this.value = seed === undefined ? undefined : snapshot(parse, seed);
    }
    async read() {
        return this.value === undefined ? undefined : snapshot(this.parse, this.value);
    }
    async compareAndSwap(expectedRevision, next) {
        const parsed = candidate(this.parse, expectedRevision, next);
        if ((this.value?.revision ?? 0) !== expectedRevision)
            return false;
        this.value = parsed;
        return true;
    }
}
// Identity is the actual handle, not its generic document type or record key.
// Single-file backends can leave ALL rows uncertain after one rejected write.
const tables = new WeakMap();
class CasConflict extends Error {
}
function assertReadable(context) {
    if (context.uncertain)
        throw new ControlsError('storage-uncertain', 'storage write outcome requires closing and reopening the domain');
}
/** Same handle/key/parser returns the same adapter. The table-wide chain also
 * serializes first-row put, while existing-row CAS runs INSIDE host update.
 * A fresh wrapper around an uncertain handle does not clear its failure latch.
 */
export function createDomainVersionedStorage(table, key, parse) {
    id(key, 'storage record key');
    let context = tables.get(table);
    if (!context) {
        context = { tail: Promise.resolve(), uncertain: false, adapters: new Map() };
        tables.set(table, context);
    }
    const existing = context.adapters.get(key);
    if (existing) {
        if (existing.parse !== parse)
            invalid('storage record key already uses a different document parser');
        // Parser identity establishes the cached adapter's document type.
        return existing.storage;
    }
    const shared = context;
    const storage = {
        async read() {
            assertReadable(shared);
            const raw = table.get(key);
            return raw === undefined ? undefined : snapshot(parse, raw);
        },
        compareAndSwap(expectedRevision, next) {
            assertReadable(shared);
            const parsed = candidate(parse, expectedRevision, next);
            const result = shared.tail.then(async () => {
                assertReadable(shared);
                try {
                    if (table.get(key) === undefined) {
                        if (expectedRevision !== 0)
                            return false;
                        await table.put(key, parsed);
                        return true;
                    }
                    await table.update(key, current => {
                        if (snapshot(parse, current).revision !== expectedRevision)
                            throw new CasConflict();
                        return parsed;
                    });
                    return true;
                }
                catch (error) {
                    if (error instanceof CasConflict)
                        return false;
                    // I/O rejection may occur AFTER rename. Do not blindly overwrite
                    // potentially committed rows from the backend's old memory image.
                    shared.uncertain = true;
                    throw error;
                }
            });
            shared.tail = result.then(() => undefined, () => undefined);
            return result;
        },
    };
    shared.adapters.set(key, { parse, storage });
    return storage;
}
