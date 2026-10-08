# Known mechanical limits and deferred work

Status: **documented, deliberately not implemented in the 0.4.15–0.4.20 line.** Every item below is a
known limit with the evidence that produced the decision to defer it, and the work a later round would
have to do. Nothing in this file changes behaviour, contracts, the injection protocol or any rule text.

Revisit trigger: the first time a session is expected to author thousands of instrument revisions, or to
run with the collaboration instrument enabled across a thousand-child campaign.

## 1. `storage-uncertain` has no recovery path in this composition

Any error thrown inside the CAS update path that is not a deterministic version conflict latches the
whole table (`src/controls/versioned-storage.ts:73-75`, set at `:131-137`). After that every read and
write of that table fails with `storage-uncertain`, and the latch is keyed by the actual host handle in a
`WeakMap` (`:68-80`), so wrapping the same handle again does not clear it. The documented recovery is to
close the domain and reopen a fresh backend handle, read the real persisted result, and only then act
(`docs/CONTROLS_CORE.md`). In this composition each suffix is opened once at mount and cached for the
process lifetime (`src/host.ts:555`, `:713-724`, cleared only at `:578`), and nothing reopens a domain, so
the only real recovery is a plugin/host restart.

The latch itself is deliberate and must stay: a rejected write may already have committed after rename,
so resuming from the in-memory revision image could double-apply or lose data.

- Impact: after one non-conflict I/O failure (disk full, permission change) the affected domain is
  unusable until restart; snapshots degrade to stale/unknown but never claim success.
- Observed frequency: zero occurrences across the live session logs inspected so far.
- Fix sketch: a controlled reopen owned by the host plane — close the old domain, open a fresh handle,
  re-read the persisted truth, let stale `expectedRevision` values conflict naturally and never blind-retry
  a write. Needs fault-injection tests (throw after a possible rename; read-only storage root at boot).

## 2. A mount-time storage failure silently removes the whole instrument plane

The host plane is mounted once and requires its injected services (`src/index.ts:51`). If opening a
storage unit fails at that moment, `mountHost` throws, the plugin logs one warning and keeps serving
Skills only (`src/index.ts:53-58`). The instrument tools and every snapshot are then absent for the whole
process, with no session-visible notice and no retry.

- Reproduced in an isolated host: with a read-only storage root, every `mattpocock_*` tool resolves to
  `unknown tool` and the only trace is the mount warning.
- Fix sketch: retry the mount with backoff while nothing has been registered yet (avoiding duplicate tool
  registration), or mount a degraded storage facade that reports honest unknown and recovers on reopen,
  and make the state visible to the session or the plugin UI.

## 3. Instrument document parse cost grows with retained receipts

The instrument document is re-parsed and re-projected on every accepted command and every cache-miss read.
The v2 checkpoint keeps one dedup receipt per revision for the life of the instance (compaction is
lossless and `purge-history` keeps receipts), so per-call cost grows with the total number of revisions
and the aggregate cost of a session grows roughly quadratically.

Additionally, two validation scans are quadratic in the number of cleanup receipts C and the number of
receipts D: `cleanupCoverage` does a linear `find` per coverage row (`src/controls/instrument-state.ts:253`)
and `validateCheckpointHistory` rebuilds a "latest at this revision" view per coverage row
(`src/controls/instrument-state.ts:262-269`), both invoked from `parseInstrumentDocument` (`:373-376`).
That second effect only dominates when compaction is frequent (C on the order of D), which nothing in the
design or the tool guidance does automatically: `compact-source` / `purge-source` are explicit maintenance
operations.

Measured with the repository instrument fixture (`tests/fixtures/instrument-fixture.mjs`) against the
shipped `lib/controls/index.js`, driving the public apply/compact API and parsing a structured clone of
the stored document (faithful to a storage load). The fixture uses in-memory storage and very small ticket
payloads, so absolute values are a lower bound; the growth shape is the point:

| authored commands | compaction receipts | dedup receipts | single parse | whole construction |
| ---: | ---: | ---: | ---: | ---: |
| 400 | 40 | 441 | 22.7 ms | 26.9 s |
| 800 | 80 | 881 | 47.5 ms | 122.5 s |
| 1600 | 1 | 1602 | 69.5 ms | 265.1 s |

Reading: cost is close to linear in the number of retained receipts (about 0.05 ms per receipt in this
fixture); the quadratic cleanup term contributed only tens of milliseconds in these ranges. A heavy native
child session that authors one or a few records per child therefore pays hundreds of milliseconds to
seconds per instrument call in the tail, and minutes of aggregate CPU over the session — independently of
the cleanup scans.

- Fix sketch: memoize the parse by document revision, index dedup receipts by `operationId`, precompute
  per-receipt target keys once, and derive coverage validation incrementally from the already ordered
  receipts. That reduces the linear constant and collapses the cleanup scans to O(C + D).

## 4. Write amplification while native activity cannot be enumerated

When the host cannot enumerate all native activity, every observed native child reconciliation writes
another `knowledge` operation even though the effective knowledge does not change. Measured on live domain
documents (identifiers withheld): instance A carried 369 `knowledge` operations of which **276 were
identical in state and reason** (`unknown` / `unmanaged-native-execution-observed`); instance B showed
103 operations with 77 redundant; instance C 34 with 20.

Each redundant operation also appends one history observation and bumps the projection epoch, so a session
that spawns N unmanaged native children writes on the order of N redundant operations, N history rows and
N forced projection rebuilds.

- Fix sketch: skip the journal append when the effective knowledge (state + reason) already equals the
  observation, while still keeping the current runtime identity up to date.

## Deferred plan (recorded, not scheduled)

1. Phase 1 — scale and write amplification: knowledge reconciliation dedup; instrument parse indexing and
   memoization; structural regression tests (index/work assertions rather than wall-clock thresholds); a
   scripted heavy-session measurement before/after. Mechanical only: no protocol, rule or business change.
2. Phase 2 — recovery: controlled domain reopen for a latched table; mount retry with backoff and a
   session- or UI-visible state; fault-injection tests proving recovery without double writes.
3. Phase 3 — product decision: whether to run the instrument enabled across thousand-child campaigns, and
   to re-measure the cost curve on a real heavy session.

Both #1 and #2 are the same recovery theme and should be designed together. #3 is covered by Phase 1 alone.
