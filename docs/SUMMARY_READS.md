# Bounded UI summaries and observation scheduling

## Accepted scope

The follow-up optimization separates mounted list decorations and display-policy gates from full instrument detail. It changes repository source and isolated mechanical tests only; it does not install a package, modify a running SDK/Profile, restart a service, rewrite vendored Skills, change channels/provider precedence, delete business history or replace model consumption.

## Public read seam

The existing authenticated Remote namespace adds readSummaries(request, signal?). A request has 1–32 unique selected session IDs and optional opaque SHA-256 versions, never principals, owner IDs, assignments or read grants. Results are individually current (small summary + version), unchanged (matching version) or unavailable (mechanical reason). One response is bounded to 256 KiB. The strict codec and cancellation channel are shared by Host and Client; signals never become JSON fields.

Each small summary contains authenticated caller/instance identity, effective display-policy/gate fields, business and viewer revisions, counting scope and pending-user-decision count, plus health only for the fields actually returned. Unknown records are null with an explicit records-unknown reason, not zero. This model does not contain native S counts, resource/worktree facts, histories, changes, decision text, status dictionaries or complete policy grants, so it does not claim to certify those domains.

Every item rechecks current access and retained session association, without ensure/register or cold Agent activation. Assigned children retain the same all-related-tickets/creator-only filtering as full records. Hidden/read/focus preferences and management OFF do not remove obligations. A version includes mount identity, actual principal/session/instance, current scope fingerprint, source/viewer revisions, effective policy and returned health. It is only a transfer hint: a known version never skips authorization, source-health checks or revocation ordering.

## Source and ordering

SessionInstruments.readSummary uses the existing validated source document and a separate immutable-document current-only decision index; it does not call full read/snapshot or construct histories then trim them. The derived index contains only fields required for counting and authorization. It has no separate persistence table, new durable format or eventual-consistency gap; CAS failures cannot publish an uncommitted index. Current rows and creator identity survive checkpoint/selected source-history cleanup.

Cold source/domain hydrate and complete source validation still have history-dependent cost under the existing storage contract. The optimization removes repeated full history projections/clones from hot summary work and full Runtime aggregation/serialization from the list path; it does not claim cold loading is O(1).

Summary items participate in the existing OrderedEffects permission barrier. Items yield between bounded batch members rather than holding the queue for the complete batch. They do not run resource/Git inspection, windows/native count work, worktree replay, history capture or notification acknowledgement, and do not register fake consumption commits. Model preStep/postExecute retain their full fixed durability frontier and original permission/CAS ordering. Any owner-scoped invalidation must retain a global policy/grant barrier; queue isolation is accepted only with measured evidence and a proof of revocation ordering, not indiscriminate Promise.all.

## Client lifecycle

One scheduler manages the mounted held session set, batches at most 32 IDs with at most two in-flight batches and one shared timer. Same-session holders share a result; each item has its own generation fence plus a hold-lifetime epoch. Continuously held refreshes may invalidate their earlier ready value on genuine error/deadline; after last release and reacquisition, old-lifetime failures and deadlines cannot publish an error or impose backoff on the new holder cohort. Releasing one item cannot cancel transport still required by another item; the last generation-matching held member becoming irrelevant (including refresh supersession), the last relevant holder, or plugin teardown cancels it. A noncooperative aborted transport still occupies its physical flight slot until settlement; its deadline marks every still-held attached entry unknown even if a refresh has advanced that entry’s generation. Unchanged is accepted only with the matching locally held value/version. Missing/duplicate/foreign rows, unavailable status, malformed data and transport errors become unknown, never zero or stale-current facts.

Hidden documents back off to at least 30 seconds; repeated errors back off exponentially with a bounded delay; becoming visible schedules a single recovery refresh. Saved-policy refresh/foreground recovery must still discover display enablement made by another client. A mounted row is not proof of viewport visibility: the public native slot only exposes its selected session ID, so no host DOM query or fabricated visibility guarantee is added.

Badge and SourceCard annotation use the small read model. Header/input use it as an outer display gate, and mount a full-observation child only while that presentation is enabled. Visible header/input retain their existing complete content and accessible text. Details and explicitly selected settings inspection continue to use full snapshots. Full-observer cache entries are protected by holders/subscriptions and reclaimed by bounded idle LRU/TTL without invalidating live references or introducing multiple active observers for one session. This TTL applies to transient UI memory only, never business records or historical retention.

## Verification seams and matrix

Tests cross SessionInstruments.readSummary, RuntimeFacade.readSummaries, actual mounted Remote codecs/transport, and the actual closed Client bundle/React mount. Storage/RPC/clock gates synchronize fault and ordering cases; private implementation calls are not replacement test surfaces.

The matrix covers 0/20/150/300 mounted sessions, stable/mutating/error/recovery, visible/hidden/foreground, one/multiple clients, large history with fixed current decisions, independent owners and assigned viewers. Record RPCs, JSON bytes, unchanged reuse, current-index rebuild/history traversal evidence, queue wait versus execution and preStep delay separately. Required invariants include strict request/response bounds, no full Runtime side effects on summary reads, current authorization even on unchanged, cancellation/late-result fencing, OFF/hidden obligation retention and no source-history deletion. Mechanical fixtures are not live Web or OOM causality certification.
