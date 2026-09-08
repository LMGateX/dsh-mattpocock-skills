# DSH Matt Pocock Skills — Accepted Design

- **Status:** Accepted; Phases 0–3 implemented and verified
- **Accepted on:** 2026-09-08
- **Owner:** LMGateX
- **Local checkout:** `<checkout of this repository>`
- **Private plugin repository:** `https://github.com/LMGateX/dsh-mattpocock-skills`
- **Private source distribution:** `https://github.com/LMGateX/mattpocock-skills-distribution`

This document is the authoritative implementation contract. A later implementation choice may refine mechanics, but it must not contradict a locked decision below. Changing a locked decision requires explicit owner approval and an update to this document in the same commit.

## 1. Purpose

Build a small, reproducible DeepSeek Harness Profile Bundle that exposes the selected Matt Pocock Skills channel through DSH's native Skill Registry. The adapter owns DSH packaging, channel selection, invocation metadata mapping, provenance, verification, and evaluation. It does not own or rewrite the upstream Skill instructions.

The initial package is private and intended for the owner's DSH profiles. Public release and npm publication are deferred.

## 2. Locked Decisions

1. **Package identity:** use `@lmgatex/dsh-mattpocock-skills`. The npm scope is provisional until a matching npmjs account or organization is controlled; private GitHub and local installs do not depend on npmjs ownership.
2. **Repository visibility:** both the source distribution and plugin repositories remain private until the owner explicitly changes visibility.
3. **One package, two channels:** ship one package with `channel: stable | beta`.
4. **Default channel:** `stable`.
5. **Owner's Web profile:** configure `beta` after isolated package verification so `/implement-spec` is available.
6. **Vendored union:** vendor the complete Beta union once; Stable is a manifest-driven selection from that union.
7. **Unchanged Skill sources:** preserve selected upstream-owned files byte-for-byte. Do not apply DSH wording substitutions or delete source resources.
8. **Provider shape:** use a custom immutable provider backed by a generated static catalog, not a runtime recursive scanner and not `ctx.skills.register()`.
9. **Precedence:** every packaged candidate uses `source: 'bundled'` and DSH's `BUNDLED_SKILL_RANK` (currently 600), so project and user Skills override the package.
10. **Host only:** ship one Host Cordis plugin row. Do not ship a browser client plugin; existing DSH Web Skill UI and slash invocation consume the Host registry.
11. **Offline runtime:** no install-time fetch, postinstall updater, runtime network access, mutable source cache, or file watcher.
12. **No legacy manifest initially:** do not ship `dsh.plugin.json`. The authoritative activation mechanism is `package.json#dsh.bundle.patch` plus `cordis.patch.yml`.
13. **Real behavioral evaluation:** the first usable release must run the `implement-spec` evaluation defined in `IMPLEMENT_SPEC_EVAL.md`.
14. **Immutable release:** a release version, Git tag, npm artifact if any, and GitHub artifact must identify the same commit and the same once-built tarball bytes.

## 3. Source Baseline

The initial source baseline is:

| Item | Value |
|---|---|
| Distribution repository | `LMGateX/mattpocock-skills-distribution` |
| Distribution tag | `v0.1.0-beta.1` |
| Annotated tag object | `0108f00aa90cde51b290d6c58ac86d7f0b045ba0` |
| Distribution commit | `f0834542c543df9197364127d13383ffea6e43d3` |
| Matt Pocock upstream | `mattpocock/skills` |
| Upstream commit | `3cca18b368ae95cdbdebbff572ccafa662551015` |
| Source verifier SHA-256 | `8b1b01c562af52ae9c330e63a47aaa7ae52f03ee12d4be69ea36fbefea760155` |
| Stable selection | 25 promoted Skills |
| Beta selection | Stable plus official `skills/in-progress/implement-spec` |

The initial annotated tag is unsigned. Reproducibility therefore relies on the private repository, immutable full object IDs, source verification, and the downstream per-file inventory. Signing a later tag is desirable but not required for local private use.

## 4. Channel Semantics

The source distribution manifests are authoritative. The plugin must not hard-code directory buckets or assume that Beta always means “Stable plus one known path.”

- `stable`: load exactly the paths selected by `.distribution/channels/stable.json`.
- `beta`: load exactly the paths selected by `.distribution/channels/beta.json`.
- Unknown channel names or unknown manifest schema versions fail closed.
- Each selected Skill path means the complete Skill directory, including references, scripts, assets, and adapter metadata supplied by the source distribution.

The initial `implement-spec` Skill has `disable-model-invocation: true`. Enabling Beta therefore adds the user command `/implement-spec` without adding another model-visible catalog entry.

## 5. DSH Integration

### 5.1 Package and Bundle

The package manifest declares an installable Profile Bundle:

```json
{
  "name": "@lmgatex/dsh-mattpocock-skills",
  "private": true,
  "type": "module",
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

The bundle patch inserts exactly one globally mounted Host row. Its final identifier must be unique and stable. The row loads the package and sets `channel: stable` by default. A profile-owned later patch may replace the row config with `channel: beta`.

Installation is through DSH's profile package manager, for example a local checkout, private Git commit, or prebuilt tarball. Activation occurs on the next Profile boot.

### 5.2 Plugin Contract

The entry exports the conventional Cordis surface:

- `name`
- `inject = ['skills']`
- a Schemastery `Config` with the closed values `stable` and `beta`, defaulting to `stable`
- `apply(ctx, config)`

`apply` synchronously registers one `SkillProvider` with `ctx.skills.registerProvider`. The package does not provide a competing Skill Registry service and does not parse user messages itself.

The initial peer seams are `@deepseek-ai/cordis`, `@deepseek-ai/dsh-skill`, and `@deepseek-ai/schemastery`. Development pins the exact tested versions. The publishable peer range is finalized only after compatibility tests against the installed DSH release and the selected newer prerelease.

### 5.3 Provider Contract

The provider is immutable for one plugin mount:

- The generated JSON catalog is loaded, closed-schema validated, and deeply frozen once when the Host module loads.
- `list()` reads no Skill files and performs no directory scan. It returns the immutable configured-channel selection from that catalog.
- `get()` accepts only the exact candidate object created by this provider. It anchors the non-symlink vendored root to `realpath(packageRoot)` while permitting the package root itself to be package-manager symlinked, resolves the cataloged directory and file back to their exact real paths beneath that anchor, rejects root/intermediate/final symlink or identity drift, opens `SKILL.md` with no-follow semantics as a regular file, then repeats containment and bigint device/inode checks before reading.
- Each definition preserves the candidate's name, description, invocation policy, provider, source, metadata, path, and package-directory `resourceBase`; the body starts at the generation-validated frontmatter byte boundary.
- The provider observes `AbortSignal`, passes it into the active file-read operation, and propagates the exact lookup or lifecycle abort reason.
- Node does not expose an `openat2`-style beneath/no-symlink resolver. Concurrent hostile mutation can therefore retain a residual parent-directory race after the repeated checks; installed package artifacts are treated as immutable during a provider read, and unsupported no-follow hosts fail closed.
- Missing files, malformed content, hash drift, or candidate/catalog mismatch return no definition and emit a warning through the plugin's named Cordis logger; they never silently substitute another Skill. Abort reasons propagate instead of being diagnosed as corruption.
- No watcher or invalidation loop is required. Changing plugin config remounts the plugin through the normal Cordis lifecycle.

Candidate fields include:

```ts
{
  source: 'bundled',
  rank: BUNDLED_SKILL_RANK,
  invocation: {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  },
  resourceBase: {
    kind: 'directory',
    path: absoluteVendoredSkillDirectory,
  },
}
```

## 6. Repository Layout

The target implementation layout is:

```text
.
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── cordis.patch.yml
├── AGENTS.md
├── README.md
├── README.zh-CN.md
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── PROVENANCE.json
├── vendor-files.json
├── src/
│   ├── index.ts
│   ├── provider.ts
│   └── catalog.ts
├── generated/
│   └── catalog.json
├── vendor/
│   └── mattpocock-skills/
│       ├── .distribution/
│       ├── skills/
│       ├── DISTRIBUTION.md
│       └── LICENSE
├── scripts/
│   ├── update-source.mjs
│   ├── verify-vendor.mjs
│   └── verify-package.mjs
├── tests/
└── lib/
    ├── index.js
    ├── catalog.js
    ├── provider.js
    └── types/
```

The exact source tree may split modules differently, but ownership boundaries and generated/vendor locations remain as above.

## 7. Generated Catalog

Maintenance tooling parses source manifests and frontmatter using a real YAML implementation. Runtime code does not contain a second YAML parser.

Each catalog entry records at least:

- Skill name and description
- optional `whenToUse` and metadata
- unconsumed source frontmatter under deterministic `frontmatterExtensions` audit metadata; at runtime this is exposed as `SkillCandidate.metadata.frontmatterExtensions`, while source `metadata` keeps its original keys; notably, `argument-hint` is preserved there and is never mapped to `whenToUse`
- canonical invocation policy
- relative Skill directory and `SKILL.md` path
- channel membership
- source-file SHA-256
- validated byte offset where the body starts

Generation rejects:

- unknown distribution or channel schema versions
- non-kebab Skill names
- missing or empty descriptions
- duplicate names within a channel
- a frontmatter name that differs from the selected directory
- unsupported legacy invocation keys
- invalid UTF-8 or malformed YAML
- absolute paths, `..`, symlink escapes, or duplicate normalized paths
- generated output that differs from committed output after verification

The committed catalog is sorted deterministically by Skill name and serialized canonically.

## 8. Vendoring and Provenance

`scripts/update-source.mjs` consumes immutable identities from `source-lock.json`; `--source` changes only the Git transport. It verifies the annotated tag object, peeled commit, and pinned verifier SHA-256 before executing the verifier. It performs updates in a same-filesystem clean staging directory and moves results into place only after all checks pass.

Required update sequence:

1. Resolve and verify the exact annotated tag object and peeled commit.
2. Verify the source in a real Git checkout using the source distribution's verifier.
3. Parse the selected distribution manifests and reject unknown schemas.
4. Build the Beta union from manifests, not from directory enumeration.
5. Read each selected complete Skill directory from Git tree entries and blob bytes, preserving Git-compatible modes without relying on checkout bytes.
6. Copy exactly `.distribution/channels/stable.json`, `.distribution/channels/beta.json`, `.distribution/upstream.json`, `DISTRIBUTION.md`, and the upstream `LICENSE`; do not copy maintenance scripts or the rest of `.distribution/`.
7. Generate the catalog, `PROVENANCE.json`, and sorted `vendor-files.json`.
8. Verify every regular file, executable bit, and symlink target; reject path escapes and residue from an older source.
9. Re-run generation in check mode and require zero drift.

`PROVENANCE.json` records both repositories, tag object, distribution commit, upstream commit, manifest hashes, generator version, and inventory root hash.

`vendor-files.json` records normalized paths, file kind, Git-compatible mode, SHA-256, and symlink target where applicable. Its `rootSha256` is SHA-256 over UTF-8 byte-sorted, NUL-delimited records prefixed by the domain string `dsh-mattpocock-vendor-v1\0`. The inventory must be verifiable from an extracted npm or tar archive without Git metadata.

Updates use an exclusive `O_EXCL` lock and backup/rollback renames. The accepted four-output layout provides transactional all-or-rollback replacement, not true reader-level atomic visibility across `vendor/`, `generated/`, `PROVENANCE.json`, and `vendor-files.json`; achieving the latter would require a single generated root or indirection and is outside this design.

## 9. Source-Body Policy

Vendored upstream files are trusted executable instructions and are reviewed as code during every source update.

The adapter must not:

- change “Skill tool” to a DSH-specific spelling
- rewrite slash commands
- replace generic agent or subagent terminology
- inject DSH tool argument syntax
- delete `agents/openai.yaml` or other source-owned resources
- insert provider-specific instructions into `SKILL.md`

DSH-specific evaluation, examples, and compatibility guidance live in this repository outside `vendor/`.

If a repeatable evaluation proves a generic Skill failure, first determine whether DSH or the generic source distribution should own the fix. Any downstream overlay requires a new explicit design decision, must remain separate from vendored bytes, and must be visible in provenance.

## 10. Build and Distribution

Author in TypeScript and commit the prebuilt `lib/` output. Private GitHub installation must not require `prepare`, `postinstall`, or pnpm build approval.

The package file allowlist includes only runtime code and types, the bundle patch, generated catalog, vendored selected files and provenance, the immutable `source-lock.json`, licenses/notices, and user documentation. Source maintenance scripts may be included only if every advertised package script remains runnable from the packed artifact; otherwise they remain source-only and are not advertised as installed-package commands.

Before any release:

1. Start from a clean Git tree.
2. Verify source provenance, vendor inventory, generated catalog, tests, and a scratch build that byte-matches committed output.
3. Build one accepted tarball once into a fresh out-of-repository directory.
4. Immediately compute and record its size and SHA-256, then make the artifact read-only.
5. Verify the exact archive members, bytes, modes, extracted provenance, and runtime entry targets without rebuilding.
6. Smoke-install that exact checksum-bound tarball in an isolated DSH Profile and compare it with a separate isolated checkout installation.
7. Attach or publish the same bytes. Do not rebuild independently for GitHub and npm.
8. Create the immutable release tag for the exact source commit represented by the artifact.

Phase 4 produces a private development-verification artifact, not a release. Its scope, accepted command, isolation boundary, and recorded evidence are fixed in [PHASE4_ARTIFACT_VERIFICATION.md](PHASE4_ARTIFACT_VERIFICATION.md).

The initial private repository may use Git commits or locally packed tarballs without publishing to npmjs.

## 11. Compatibility and Precedence

The initial implementation targets the locally installed DSH `0.1.2-rc.1` on Linux with Node `24.17.0` and a filesystem exposing POSIX no-follow opens plus stable device/inode identity. The provider API was also observed unchanged on the researched `0.1.3-alpha.2` source. Unsupported no-follow hosts fail closed, and compatibility claims are limited to releases, operating systems, and filesystems actually tested.

The package must use the host's DSH and Cordis service identities through peer dependencies rather than bundling duplicate runtime copies.

An integration test must prove that a same-name project or user Skill wins over this package. Do not use rank 550 or rank 400 to override another bundled or user provider. Equal-rank ordering is not part of this package's compatibility contract.

## 12. Required Verification

Deterministic gates include:

- manifest and source provenance verification
- exact Vendor inventory verification
- generated catalog drift check
- invocation-policy mapping tests
- complete Stable/Beta membership tests
- `list()` and `get()` provider contract tests
- relative resource-base tests
- deterministic active-read lookup/lifecycle aborts and malformed/missing-file behavior
- final, vendored-root, and intermediate-ancestor symlink rejection
- project/user precedence integration
- parseable one-row Bundle patch
- packed-file allowlist and packed-script consistency
- local path and tarball `dsh plugin --profile <name> add ...` smoke tests in an isolated `DSH_HOME`
- composed config inspection with `dsh --profile <name> --dump-config`
- Web/Host behavior verification without a custom client bundle

The nondeterministic model-level gate is defined separately in `IMPLEMENT_SPEC_EVAL.md`.

## 13. Non-Goals

The initial implementation does not provide:

- public marketplace discovery
- npmjs publication
- automatic upstream updates
- per-Skill enable/disable UI
- multiple npm packages or npm dist-tags for channels
- runtime source directories supplied by users
- custom slash syntax or alternate invocation forms
- custom Web presentation
- modifications to the Matt Pocock source distribution
- compatibility claims for untested future DSH versions

## 14. Change Control

When implementation reveals a conflict with this design:

1. Stop before encoding a contradictory workaround.
2. Record the observed evidence and smallest viable alternatives.
3. Discuss the decision with the owner.
4. Update this document and relevant evaluation or implementation plan in the same approved change.

Test failures may refine mechanics. They do not silently authorize changing locked decisions.
