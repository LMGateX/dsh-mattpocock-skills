# Migrating an existing repository across Skills v1.3

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

Downgrading to 0.12.x requires the alpha.1 host and its old Profile composition. Do not downgrade in place on a newer host and do not reapply the old patches without a separate backup. This repository does not publish or install either release automatically.

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
