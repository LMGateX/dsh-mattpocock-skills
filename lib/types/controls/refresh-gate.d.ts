/** Bounded freshness gate for the injected instrument snapshot.
 *
 * The snapshot is derived from versioned documents that only this process mutates.
 * Rebuilding it on every step and every tool result re-reads those documents, clones
 * the projection and writes another history observation, even when nothing changed;
 * measured on a working turn, 32 of 41 rebuilds produced no message at all. Every
 * mutation bumps the epoch, so an unchanged epoch inside the window means the next
 * projection would be identical.
 */
export declare class RefreshGate {
    #private;
    private readonly ttlMs;
    private readonly now;
    private readonly maxEntries;
    constructor(ttlMs: number, now?: () => number, maxEntries?: number);
    /** Called by every mutation of the state the snapshot is derived from. */
    touch(): void;
    /** True when a rebuild may see different state, or when the window has elapsed. */
    shouldRefresh(key: string): boolean;
    /** Records that the projection was rebuilt from the current state. */
    record(key: string): void;
}
