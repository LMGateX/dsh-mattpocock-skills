/** Bounded freshness gate for the injected instrument snapshot.
 *
 * The snapshot is derived from versioned documents that only this process mutates.
 * Rebuilding it on every step and every tool result re-reads those documents, clones
 * the projection and writes another history observation, even when nothing changed;
 * measured on a working turn, 32 of 41 rebuilds produced no message at all. Every
 * mutation bumps the epoch, so an unchanged epoch inside the window means the next
 * projection would be identical.
 */
export class RefreshGate {
    ttlMs;
    now;
    maxEntries;
    #epoch = 0;
    #clock = 0;
    #scopes = new Map();
    #last = new Map();
    constructor(ttlMs, now = Date.now, maxEntries = 64) {
        this.ttlMs = ttlMs;
        this.now = now;
        this.maxEntries = maxEntries;
    }
    /** Called by every mutation of the state the snapshot is derived from. */
    touch(scope) {
        const epoch = ++this.#clock;
        if (scope === undefined) {
            this.#epoch = epoch;
            this.#scopes.clear();
            return;
        }
        this.#scopes.delete(scope);
        this.#scopes.set(scope, epoch);
        // Forgetting an old scope must never certify an older read. A rare bounded-cache
        // rollover conservatively invalidates all scopes instead of keeping unbounded metadata.
        while (this.#scopes.size > this.maxEntries) {
            this.#scopes.delete(this.#scopes.keys().next().value);
            this.#epoch = epoch;
        }
    }
    /** Epoch observed before a read starts. Stamp it so a mutation that lands while the read
     * is in flight keeps the gate open instead of certifying the pre-mutation projection. */
    epoch(scope) { return Math.max(this.#epoch, scope === undefined ? 0 : this.#scopes.get(scope) ?? 0); }
    /** True when a rebuild may see different state, or when the window has elapsed. */
    shouldRefresh(key, scope) {
        const last = this.#last.get(key);
        if (last === undefined)
            return true;
        if (last.epoch !== this.epoch(scope))
            return true;
        return this.now() - last.at >= this.ttlMs;
    }
    /** Records that the projection was rebuilt from the state observed at `epoch`, which is the
     * epoch captured before the read; later mutations keep the key refreshing. */
    record(key, epoch, scope) {
        this.#last.delete(key);
        this.#last.set(key, { epoch: epoch ?? this.epoch(scope), at: this.now() });
        while (this.#last.size > this.maxEntries)
            this.#last.delete(this.#last.keys().next().value);
    }
}
