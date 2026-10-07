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
    #last = new Map();
    constructor(ttlMs, now = Date.now, maxEntries = 64) {
        this.ttlMs = ttlMs;
        this.now = now;
        this.maxEntries = maxEntries;
    }
    /** Called by every mutation of the state the snapshot is derived from. */
    touch() { this.#epoch += 1; }
    /** True when a rebuild may see different state, or when the window has elapsed. */
    shouldRefresh(key) {
        const last = this.#last.get(key);
        if (last === undefined)
            return true;
        if (last.epoch !== this.#epoch)
            return true;
        return this.now() - last.at >= this.ttlMs;
    }
    /** Records that the projection was rebuilt from the current state. */
    record(key) {
        this.#last.delete(key);
        this.#last.set(key, { epoch: this.#epoch, at: this.now() });
        while (this.#last.size > this.maxEntries)
            this.#last.delete(this.#last.keys().next().value);
    }
}
