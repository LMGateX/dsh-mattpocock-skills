# Migrating an existing repository across Skills v1.3

## Plugin 0.21.1 recommendation adoption recovery

- Same DSH >=0.2.2-rc.1 / Node >=24.9.0 prerequisites; only RC1 is tested. No tool request, Remote, storage version, policy default, vendor or channel migration. Existing persistent-policy/old-reader rollback limits below still apply.
- Only bounded decision consumption and fixed agent guidance change: pending-user candidates first, current authorized recovery locators, precise support or explicit budget omission. Legacy awaiting records, results and constraints remain available; installation never adopts or clears existing decisions.
- Valid recommendation adoption records a path selection, not additional filesystem/SDK/network/publication authority or proof of external inputs/completion. On conflict/expiry/revocation, read the current decision and business CAS rather than guessing from its source revision.
- Install the same verified downloaded archive through the official Profile CLI after all gates. Back up the current dependency/lock and package bytes; preserve unrelated settings and live business data. A dependency-only CLI update can remain disk-only when bundle selection is unchanged; do not disable/re-enable, touch unrelated patches or restart the active service to force activation. Report disk, running Host and browser separately. See the [repair contract](<docs/RECOMMENDATION_ADOPTION_RECOVERY.md>) and [verification](<docs/VERIFICATION.md>).

## Plugin 0.21.0 active-read performance

- Keeps DSH >=0.2.2-rc.1 and Node >=24.9.0; tests only DSH 0.2.2-rc.1.
- Only plugin-owned read freshness, trusted positive live descriptor lifetime and optional read cancellation change. Missing proof stays conservative; physical/source/permission validation remains required. Read aborts do not revoke accepted writes or their durability obligations.
- No new storage version, business migration, policy default, management enablement, channel or provider-precedence change. The 0.20.0 persistent-value/old-reader boundary below remains applicable; this optimization is not a data downgrade utility.
- Use the exact verified release artifact with the official Profile manager after isolated gates. Disk installation, running-host activation and browser loading remain separate facts; do not patch the SDK or restart the current service automatically. See the [contract](<docs/PERFORMANCE_ACTIVE_READS.md>).

## Plugin 0.20.0 persistent recommendation authorization

This section records the 2026-11-10 accepted follow-up. It is a compatibility boundary, not a claim that the host has loaded the new bytes.

- 0.20.0 keeps the same host floor as 0.19.0: DSH >=0.2.2-rc.1 and Node >=24.9.0; only DSH 0.2.2-rc.1 is tested. Installation still does not enable management or recommendation support.
- Finite presets are now 1/2/4/8/12/24 hours with a 12-hour form default. The form default is not an enable action. The new **持续生效** mode is represented by `expiresAt:null` (and enable request `durationMs:null`); it has no automatic expiry and remains active until the operator disables it or the pending-decision feature is turned off. It is not a sentinel timestamp and does not auto-renew.
- Persistent authorization is stored in the existing owner-policy `schemaVersion:1` document (the epoch value domain is widened) and in the existing V4 decision metadata; no V5 layout or new storage version is introduced. `RecommendationCandidate.expiresAt` may be null and mirrors the persistent epoch.
- **After a persistent epoch is written, rollback to 0.19.0 is not a package-only downgrade.** The 0.19.0 parser rejects a null `expiresAt` as `invalid-state`; reading the policy control fails closed rather than treating it as active or disabled. If that epoch is also embedded in a V4 decision binding/selection, the 0.19.0 instrument parser rejects that document as well. Establish a verified backup, stop the old writer and decide whether to remain on 0.20.0 or perform a controlled data migration; do not edit schema versions, substitute a fake expiry, replay stale backups or run mixed-version writers.
- A policy-only persistent write does not rewrite instrument documents. Finite 0.19.0 epochs remain readable by 0.20.0 without migration. A later ordinary human answer or a new finite epoch does not erase the retained persistent epoch/history, so the old-reader rejection can persist after the mode is changed back.
- The status row marker “推荐支持 启用” is a read-only display of an active policy; it is not a new approval, does not add counts and does not change the decision author. Purple subagent titles are display-only and do not grant navigation or session access.
- Disk installation, running-host activation and browser loading remain separate checks. A same-package CLI update may not recompose the selected bundle; use a supported PluginManager action when available, otherwise report installed-but-awaiting-reload. Do not restart the current service automatically or edit unrelated configuration to force HMR.

## Plugin 0.19.0 recommendation-support compatibility

This section fixes the accepted upgrade and rollback boundary before implementation. It is not a claim that a new version has shipped or that the running host has loaded it. See the [accepted collaboration contract](<docs/COLLABORATION_RECOMMENDATION_SUPPORT.md>) for the exact API and delivery gates.

- **Host floor:** 0.19.0 requires DSH >=0.2.2-rc.1 and Node >=24.9.0. Only DSH 0.2.2-rc.1 is tested for this batch; historical alpha.4/dual-host gates are superseded, and allowing a higher version is not proof it was tested. Version rejection is checked with the actual current-host compatibility API, not by running an obsolete host. The official RC1 manager rejects unmet compatibility and protects activation/loading; a tarball may be staged before its post-install check and rollback attempt. This declaration is not an unbypassable filesystem lock for arbitrary package managers, old SDKs or manual copies, and this batch adds no compatibility exemption or lifecycle script.
- Installation does not enable management or recommendation support. Existing global/workspace policy, pending records, results, awaiting markers, task references and context inclusion/exclusion are not migrated or cleared. New support is an explicit, finite, owner-instance operator authorization; it does not confer filesystem, spending, publication or other tool permissions.
- A recommendation candidate is not a resolved question. Only a second, explicit agent adoption on the same decision ID can resolve it under the still-valid policy. The actual author stays the agent; the durable source distinguishes a prior owner-policy selection from a fresh human answer. Ordinary manual replies keep the existing user-authenticated path.
- Only a qualified first creation during the current policy epoch can obtain a creation binding. Existing backlog, an initially unqualified question, edits and reopening do not acquire eligibility later. Closing or expiry blocks unused candidates; reopening support creates a new epoch and does not revive old candidates. Previously adopted history is retained, not undone.
- Policy data uses a separate owner-instance unit. Reading it or enabling the policy does not rewrite instrument documents. V1/V2/V3 remain readable; the first qualified bound creation upgrades that instance to **V4 in the same instrument CAS**. V4 preserves task references, event authors, command fingerprints, idempotency proofs, checkpoints and choice provenance. There is no bulk migration or downgrade utility.
- **After V4 writes, rollback is not a package-only downgrade.** Older binaries reject V4 instead of interpreting it as an empty store. If rollback is required, establish a verified backup and stop the old writer before the first V4 write. Do not edit version numbers, discard choice metadata, run mixed-version writers or restore stale business backups over concurrent work. A policy-only unit left on disk is not authority for an older binary to adopt anything.
- The new UI uses a separate optional Remote namespace. A missing namespace is unsupported, not permission to fall back to a global policy write or to portray unknown state as disabled. The original control namespace and ordinary reading remain available. Server-derived scope comparisons protect saving against owner/instance remapping; client-provided IDs never grant authority.
- A durable operation receipt and its current projection have different meanings. Replaying an old enable must not extend or reopen it; a historical adopted receipt must not override a later human correction. A transport or storage-uncertain outcome is not proof that a write did or did not commit. Preserve the original operation ID/payload when checking a retry.
- Use the official Profile package manager with the exact release artifact after isolated source, artifact and compatibility verification. Back up the Profile configuration/lock, the old verified package and any required stores without exposing credentials. Compare the installed regular files with the verified archive; do not patch installed JavaScript or the shared SDK.
- Disk installation, running-host activation and browser loading must be reported separately. A same-package CLI update can leave the selected bundle list unchanged, so it may not trigger recomposition. Use a supported authenticated PluginManager action when available; otherwise report installed-but-awaiting-reload. Do not touch unrelated configuration to manufacture HMR, bypass authentication or restart the current service automatically.

Historical version sections below retain their original delivery scopes.

## Plugin 0.17.0 advisory Skill body access

- No source upgrade, vendor rewrite, channel/precedence change or business-storage migration. Raw `CATALOG` invocation and source provenance remain authoritative and unchanged.
- Effective provider invocation now permits native model loading of source model=false/user=true bodies. The original user-only designation is shown in the catalog and returned content as a user-led workflow hint; it does not require slash syntax or a new approval. Source false/false remains disabled.
- `SkillDefinition.content` and native typed `skill` results now contain a stable adapter preface plus the exact upstream body once. Consumers must not equate the whole content hash to the raw-body hash. Source file/body-start-line and JSON-encoded resource paths are explicit; use those source positions for citations instead of adapter-preface line numbers.
- Relative resources still resolve from the existing `resourceBase`. Main content is already supplied; read ancillary files only as needed. Loading is not a command to execute every workflow step and never grants writes or bypasses workspace/tool permissions.
- There is no strict-compatibility toggle, intent classifier or per-request grant. Use a verified same-version artifact with the supported Profile package manager, preserving existing policy and overrides. Disk installation, running-host activation and browser loading are separate checks; do not infer live update from a successful CLI install or restart a current service automatically.

See [the accepted content-access contract](<docs/SKILL_CONTENT_ACCESS.md>) and [verification results and limits](<docs/VERIFICATION.md>). Historical version sections retain their own delivery scope.

## Plugin 0.16.0 task references and storage compatibility

- Keep the project’s existing tracker or task documents authoritative. Use native dispatch directly for work that needs no local T/assignment association. Do not mirror business statuses just to register a task.
- For a necessary association, declare a workflow with empty axes and use `mattpocock_record` apply `put-task-reference`. Its `localTicketId` is a stable local handle, distinct from `source` and the mutable navigation `locator`; optional `label` is an authored display name. Existing assignment `ticketIds`, decision `ticketIds` and window `localTicketId` now also accept these handles. They do not grant source access or modify tracker assignees.
- Read the returned reference capability/query shapes before using the new action. Old clients/hosts without the capability remain legacy-only; do not silently fall back to creating a fake `put-ticket`. References and legacy ticket reports have separate collections/counts. Model result envelopes remain schemaVersion 2 and retain their existing budgets.
- V1/V2 instrument storage remains readable without a read-time rewrite. The first reference write upgrades that document to **V3 in the same CAS**; reference events, checkpoints, idempotency receipts and cleanup retain their original authors and revision meanings. Runtime/Window document versions are unchanged.
- **Rollback is not a package-only downgrade after V3 writes.** An older binary rejects V3 instead of interpreting or overwriting it. Keep a verified pre-upgrade backup if rollback is required; do not edit the schemaVersion, discard references, replay stale backups over concurrent work or let mixed-version writers share the store. No automatic downgrade/migration utility is included.
- Delegated access is now bounded by the current actual parent chain. Ancestor narrowing restricts existing descendants, historical reads and locators; an operator granting through a non-root parent does not create an independent override. An expanded parent scope may make the retained raw child grant effective again. This is a current-scope intersection, not permanent grant deletion.
- New reserve/reacquire, assignment and opt-in delegate require a successfully read local handle set. A source/local record read failure must not prevent an otherwise authorized existing T release; current effective scope and generation still apply. Feature OFF does not create a new reference, enable management or erase old obligations.
- Existing business tickets, decisions, results, views, context inclusion/exclusion and source/history records are not automatically moved, cleared or hidden. If the plugin is their only valid carrier, preserve the actual task commitments before an explicitly authorized handoff.
- Context guidance is reordered inside the existing owned message, not replaced with a new history manager. Refresh TTL is monotonic elapsed time; decision/event timestamps remain program-generated wall time. No extra subagent is required by a supervision notice.

Use isolated source/artifact verification and an explicitly authorized Profile update when ready. This delivery does **not** install the existing local Profile, activate a running GUI, modify the shared SDK or restart the current service.

## Plugin 0.15.0 decision-reading migration

This release does not migrate business storage or change model-tool request schemas. Optional read-only registration and update metadata is additive; old hosts/fixtures without trustworthy metadata display creation time as unknown. A retained earliest history entry is not creation proof, and an assigned reader cannot recover an unauthorized first version through the new display.

The former primary awaiting attention is now a secondary record-check entrance, not a new task tracker. Original awaiting/pending fields and raw counts remain readable; old agent/unspecified records retain authorized explicit closeout. No upgrade-time script clears flags, creates tasks, hides records or deletes history. Real user questions still use the existing pending-user predicate; task progress remains in the existing task source.

Use the native Profile plugin update path with a verified artifact. Installation does not itself prove that a running host or browser has loaded new code. Preserve existing configuration and never rewrite business history merely to roll back the UI. Historical version sections below retain their original scope.

## Plugin 0.13.0 native-cwd migration

0.13.0 is a breaking host-compatibility release: it removes the 0.2.1-alpha.1 cwd bridge, the pinned compatibility provider, the old SDK patch tooling, the cwd CLI, the `./compatibility` and `./native-subagent` exports, the worktree-bridge locale files and the `startupCwdEnabled` next-boot request. The Skills provider, instruments, delegate binding/assignment, native lifecycle/worktree observation and historical data remain.

### Before upgrading

1. **Back up the Profile** (or at least its `package.json`, `cordis.patch.yml` and any custom overrides) and the current child/history stores if you need them for rollback.
2. **Upgrade DSH first** to a host admitted by this package: `0.2.1-alpha.2` or newer on the 0.2.1/0.2.2-alpha line. The current tested complete fixture is `0.2.2-alpha.3`. `0.2.1-alpha.1` is refused by `engines.dsh`.
3. **Inspect custom Profile edits.** If you explicitly added a `mattpocock-native-subagent` row, or a `disabled: true`/forced-enable override for it, remove that override after taking the backup. The bundle patch no longer emits that row; a stale custom row is your own Profile data, not something the plugin silently rewrites.

### If you manually applied the old SDK patches

The old `host-patches/` and `dsh-mattpocock-skills-cwd` CLI are gone. Restore the original DSH files from the backup you made when applying them (or reinstall that DSH version) before upgrading. This repository no longer ships a restore command. Do not leave a patched `@deepseek-ai/dsh-subagent` behind and assume capability truth: check the host capability at runtime.

### Upgrade and verify

1. Install/update the 0.13.0 bundle normally and let DSH load it.
2. Confirm the Skills provider still mounts and the stock native subagent is not replaced. The old compatibility row must be absent.
3. Check `capabilities.nativeInitialChildCwd`. On a host with the native `startActivation` initial-child-cwd seam it is `supported`; without that seam it is `unsupported`.
4. With the native seam, delegate an explicit cwd and verify the child's effective working directory. Without the native seam, an explicit-cwd delegation must fail closed and create no child; an omitted cwd inherits the parent directory.
5. Old startup settings and the old startup storage domain may remain on disk but are no longer read or written. Existing bindings, child sessions and history remain readable and are not automatically deleted; do not treat an old record as a current capability claim.

### Rollback boundaries

0.12.x does not require the alpha.1 host when the native `startActivation` seam is present; it declares `~0.2.1-alpha.1` and uses the native seam on newer hosts. Only restoring the retired bridge requires an alpha.1 host and its old Profile composition. Do not reapply the old patches without a separate backup, and do not assume a downgrade brings the bridge back. This repository does not publish or install either release automatically.

## Plugin 0.10.0 model-result contract

This is a deliberate change to the optional collaboration tools, not to upstream Skill bodies. The isolated implementation uses schemaVersion 2 and bounds the final UTF-8 JSON result: 64 KiB for current reads/pages/content and 8 KiB for mutation receipts/plugin diagnostics. It does not require a DSH patch, change source-history retention or reclaim existing spill files. Exact implementation and artifact status is recorded in [verification](<docs/VERIFICATION.md>).

- A model call to mattpocock_record read returns a bounded **current instrument view**, not the old full RuntimeSnapshot. Use the returned query shapes to page current records, T/S-related facts, failure outcomes, pending releases, worktree reminders and health. Read shown/total/more and coverage; an omitted row is not an absent obligation.
- A model mutation returns a small receipt rather than snapshot. Code that reads result.snapshot must migrate explicitly. appliedRevision identifies the original operation; use the separately reported businessRevision or viewerRevision for the next command's expectedRevision. Worktree sources return a current row rather than an atomic original-operation receipt: appliedRevision is null with explicit unavailable coverage, replayed may be unknown, and businessRevision/businessState describe that current row—not necessarily this request’s original write. Do not convert null to zero or infer an original commit from a current revision. Window generation/ignored and delegate creation/binding/assignment/recording/recovery facts retain their meanings.
- Long selected bodies return a locator. Read them with mattpocock_record detail using locator and offset; join data strings in order, verify totalBytes/contentHash, then parse the assembled JSON. offset/nextOffset are UTF-8 byte positions. A changed version, mount or scope requires a new locator and a fresh assembly; never join old and new fragments.
- A locator grants no access. Every piece rechecks the original domain permissions. Assigned children do not gain owner-wide history, policy configuration or worktree-registry access. Missing/purged/unavailable and byte-deferred data remain distinct.
- A controls read is marked completeIntent:false. Reconstruct all defaults and workspace overrides at the same policy revision before forming the existing full-replacement save intent. Never submit only the displayed page as the full policy.
- Internal core/Remote full snapshots and the settings editor keep their interfaces; there is no model full-snapshot fallback. Existing tool cards and old session JSON remain readable. Registration names/counts, native dispatch, provenance, author identity and business semantics do not change.

This delivery does **not** install the candidate into the local DSH/Profile or restart the running service. Installation is a separate decision even after a release is published.

## Upstream Skills v1.3 migration

This adapter delivers the upstream Matt Pocock Skills bodies unchanged. Upstream v1.3 renamed a
document convention, and **no skill will tell you when the old name is gone**. This page lists what
you have to change by hand. Nothing here runs automatically.

It covers only what you must change. For what changed in the skill set itself, read the vendored
upstream [changelog](vendor/mattpocock-skills/CHANGELOG.md), or upstream's own
[v1.3.2 release](https://github.com/mattpocock/skills/releases/tag/v1.3.2).

## Why you have to act

`CONTEXT.md` and `CONTEXT-MAP.md` became `GLOSSARY.md` and `GLOSSARY-MAP.md`. Every skill that reads
or writes them now looks only for the new names. There is no fallback to the old ones.

The failure is silent. Those reads are written as "if it exists", so a missing `GLOSSARY.md` is not an
error. `domain-modeling` will simply create a new, empty one beside your existing `CONTEXT.md`, and
the repository ends up with two glossaries that disagree. Nothing reports it.

**Do not wait for an error. Scan the repository for the old names.**

## What to change

### 1. Rename the domain documents

Rename every `CONTEXT.md` in the repository to `GLOSSARY.md` in place, and every `CONTEXT-MAP.md` to
`GLOSSARY-MAP.md`. That means the repository root, and in a multi-context repository also each
context directory.

A multi-context repository indexes its contexts in `CONTEXT-MAP.md`. Follow the links in that file to
find the context directories instead of guessing where they are.

Use `git mv` so history follows the file. Without Git, a plain rename works; say so and note that
history is lost.

Rules for this step:

- **Rename only.** Do not merge, reorder, trim, or reword the content. This is a file rename, not a
  domain-model refactor.
- **If the target name already exists in the same directory, stop and ask the user.** Two files, one
  name: only the owner of the repository can say which content wins. Never overwrite one with the
  other, and never concatenate them.
- **Never touch a `GLOSSARY.md` inside a `teach` workspace.** That file is the learner's vocabulary
  list, not the repository's domain glossary, and it carried the name `GLOSSARY.md` before this
  rename, so it is not a migration artifact.

### 2. Refresh the setup files that still name the old convention

`/setup-matt-pocock-skills` writes `docs/agents/domain.md`. If it ran before v1.3, that file still
describes `CONTEXT.md at the repo root`, and the `### Domain docs` line in `CLAUDE.md` or `AGENTS.md`
points at it. Every later session is therefore taught the old name again, even after you renamed the
files.

Fix it by re-running `/setup-matt-pocock-skills`, or by rewriting `docs/agents/domain.md` from the
current template that ships with that skill.

### 3. Refresh setup files after v1.3.2

v1.3.2 changed the seed templates behind `/setup-matt-pocock-skills`. The files that skill already
wrote are not rewritten automatically. Re-run `/setup-matt-pocock-skills` after upgrading and review
the diff, or patch the affected file by hand.

The GitHub and GitLab `docs/agents/issue-tracker.md` templates now use the newer `gh`/`glab` command
shapes: `--json` output, the REST pulls endpoint for external PRs, sub-issues and native blocking
edges, linked GitLab issues, and comment-before-close. The `docs/agents/triage-labels.md` template only
changes its column heading. Re-running setup also creates any configured triage labels that the
tracker is missing.

If this repository uses a custom "Other" tracker, do not regenerate its prose blindly. Keep the
existing file and merge only the command fixes that apply. The new upstream root files
(`SCOPE.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/`, `.out-of-scope/`) are not required in a
consumer repository: they are upstream's own maintenance files, not setup output.

## What not to do

- **Do not treat `CODING_STANDARDS.md` or `CONTRIBUTING.md` as a migration step.** Neither is
  required, and a repository that never had one still does not need one. `retro`, promoted in v1.3,
  may later suggest a rule in `CODING_STANDARDS.md` for genuine judgement calls, and `code-review`
  reads either file whenever it exists. Both are ordinary use, not migration work.
- **Do not migrate the invalid YAML front matter tracked as upstream issue #911.** That regression was
  introduced and fixed inside the 1.3 development cycle, so no release ever shipped it.
- **Do not go looking for `resolving-merge-conflicts`.** v1.3 removed that skill and nothing replaces
  it: work through a merge or rebase conflict directly. It leaves no file behind in your repository, so
  there is nothing to delete. The one thing worth checking is your own prose, since a stale
  `CLAUDE.md`, `AGENTS.md`, or team doc telling the agent to run `/resolving-merge-conflicts` now names
  a skill that does not exist.
- **Do not rename the teach workspace glossary**, per the rule above.

## Checking the result

Search the repository for the old names:

```bash
git grep -n -E 'CONTEXT(-MAP)?\.md'
```

Anything it still finds should be prose about the rename, or a `teach` workspace. Then confirm each
context directory has exactly one `GLOSSARY.md`, and that `docs/agents/domain.md` no longer mentions
`CONTEXT.md`.
