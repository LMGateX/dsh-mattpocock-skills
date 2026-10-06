type VersionedDocument = {
    readonly revision: number;
};
type ParseDocument<T extends VersionedDocument> = (value: unknown) => T;
/** Atomic and durable CAS; an absent record has revision 0. Explicitly owned by
 * trusted plugin code, not exposed as a model tool. A rejected write may have
 * committed: reads/writes must stop until a fresh domain/table handle is opened.
 */
export interface VersionedStorage<T extends VersionedDocument> {
    read(): Promise<unknown | undefined>;
    compareAndSwap(expectedRevision: number, next: T): Promise<boolean>;
}
/** Structural slice of DSH KvTable. The host owns schema/open/close. Every key
 * used by these adapters must be exclusively owned: no external put/delete.
 * One actual table handle in a dedicated SINGLE-TABLE unit/domain in one host.
 * Uncoordinated sibling tables sharing a backend image are unsupported: callers
 * must not write around this table-wide failure latch. NOT cross-process CAS.
 */
export interface VersionedTable<T extends VersionedDocument> {
    get(key: string): unknown | undefined;
    put(key: string, value: T): Promise<void>;
    update(key: string, fn: (current: T) => T): Promise<T>;
}
/** Explicitly NON-durable; never an automatic persistence fallback. */
export declare class MemoryVersionedStorage<T extends VersionedDocument> implements VersionedStorage<T> {
    private readonly parse;
    private value;
    constructor(parse: ParseDocument<T>, seed?: unknown);
    read(): Promise<T | undefined>;
    compareAndSwap(expectedRevision: number, next: T): Promise<boolean>;
}
/** Same handle/key/parser returns the same adapter. The table-wide chain also
 * serializes first-row put, while existing-row CAS runs INSIDE host update.
 * A fresh wrapper around an uncertain handle does not clear its failure latch.
 */
export declare function createDomainVersionedStorage<T extends VersionedDocument>(table: VersionedTable<T>, key: string, parse: ParseDocument<T>): VersionedStorage<T>;
export {};
