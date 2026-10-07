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
  #epoch = 0
  readonly #last = new Map<string, { readonly epoch: number; readonly at: number }>()
  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now,
    private readonly maxEntries = 64) {}

  /** Called by every mutation of the state the snapshot is derived from. */
  touch(): void { this.#epoch += 1 }

  /** True when a rebuild may see different state, or when the window has elapsed. */
  shouldRefresh(key: string): boolean {
    const last = this.#last.get(key)
    if (last === undefined) return true
    if (last.epoch !== this.#epoch) return true
    return this.now() - last.at >= this.ttlMs
  }

  /** Records that the projection was rebuilt from the current state. */
  record(key: string): void {
    this.#last.delete(key)
    this.#last.set(key, { epoch: this.#epoch, at: this.now() })
    while (this.#last.size > this.maxEntries) this.#last.delete(this.#last.keys().next().value as string)
  }
}
