# Implementation Plan and Gates

This plan implements the accepted contract in [DESIGN.md](DESIGN.md). It is intentionally phased so provenance and package behavior are testable before the plugin is enabled in the owner's active Web profile.

## Phase 0 — Repository Baseline

**Status:** Complete.

- Keep both GitHub repositories private.
- Confirm the source distribution default branch and immutable tag are reachable.
- Commit this design baseline before runtime implementation.

**Gate:** clean local worktrees, private repository visibility, and matching remote commit IDs.

## Phase 1 — Package Scaffold

**Status:** Complete.

- Create the TypeScript ESM package and exact development lockfile.
- Add the one-row `cordis.patch.yml` and Schemastery channel config.
- Add downstream license and third-party notice structure.
- Define a strict package file allowlist.

**Gate:** package metadata and patch parse successfully; no client entry, install lifecycle script, or runtime network dependency exists.

## Phase 2 — Verified Source Ingestion

**Status:** Complete. The pinned Beta union contains 26 Skills and 81 vendored files (212,143 bytes); offline inventory root SHA-256 is `1e6182fe1e430a5f653be3b33e9340e19ff8a812d0f7bb7bbc44da10fb9c6a50`.

- Implement explicit tag/commit source ingestion.
- Vendor the complete Beta union from the source manifests.
- Generate Stable/Beta membership, frontmatter metadata, body offsets, provenance, and per-file inventory.
- Add check mode and clean-staging replacement.

**Gate:** a second generation produces no diff; extracted vendor files verify without Git metadata; every vendored source-owned byte matches the source distribution.

## Phase 3 — Immutable Provider

- Implement the Host provider over the generated catalog.
- Implement static `list()` and exact lazy `get()`.
- Preserve DSH invocation policy and package-directory resource bases.
- Use `source: bundled` and rank 600 through the DSH constant.

**Gate:** provider contract, abort, drift, membership, resource, and precedence tests pass against the actual DSH registry package.

## Phase 4 — Build and Artifact Verification

- Build and commit `lib/` and declarations.
- Pack the package.
- Verify the complete tarball allowlist and hashes.
- Install the exact local checkout and tarball in separate isolated DSH homes.
- Inspect composed configs and registry behavior for Stable and Beta.

**Gate:** no build permission is requested during install; the bundle is automatically activated; `/implement-spec` appears only in Beta; no custom Web module is needed.

## Phase 5 — Behavioral Evaluation

Run [IMPLEMENT_SPEC_EVAL.md](IMPLEMENT_SPEC_EVAL.md) from clean fixture repositories. Capture the designated model route, DSH version, complete transcript, Git graph, test output, and cleanup state.

**Gate:** meet the evaluation pass policy without editing the vendored `implement-spec` body.

## Phase 6 — Owner Profile Enablement

- Keep existing community Matt Pocock/Superpowers adapters disabled to avoid duplicate providers.
- Install the verified checkout or tarball into the owner’s `web` profile.
- Override this bundle row with `channel: beta`.
- Restart the existing DSH Web profile and refresh `http://127.0.0.1:3080`.
- Verify slash discovery and one real `/implement-spec` invocation.

**Gate:** active profile resolves this provider, local/project overrides still win, and unrelated profile configuration remains unchanged.

## Phase 7 — Private Release

- Create a versioned private Git tag only after all previous gates pass.
- Build one tarball once and record its SHA-256 and provenance.
- Optionally attach that exact tarball to a private GitHub Release.
- Do not publish to npmjs until npm scope ownership and public-release intent are separately approved.

## Completion Definition

The first implementation is complete only when deterministic tests, isolated DSH installs, the real behavioral evaluation, active-profile verification, clean worktrees, and private remote synchronization all pass. Documentation must describe observed behavior rather than intended but untested behavior.
