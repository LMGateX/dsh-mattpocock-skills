# Phase 4 Artifact Verification

This document is the authoritative Phase 4 runbook and evidence record for the private development artifact. It does not authorize Phase 5 model evaluation, owner-profile activation, release tagging, GitHub Releases, npm publication, or public visibility.

## Scope Fence

Phase 4 may verify the clean pinned source, vendor inventory, catalog, build, and tests; build one accepted development tarball in a fresh out-of-repository directory; identify it immediately by size and SHA-256; inspect and extract the same bytes without rebuilding; install the checkout and exact tarball into separate temporary DSH_HOME roots; and inspect Stable/Beta composition and the booted DSH Skill Registry without invoking a model.

Phase 4 must not use the owner DSH_HOME, profile web, dsh web, slash invocation, a model route, publication, version/tag/release commands, or a source update without --check.

## Pre-Pack Gate

Run from a clean checkout and record the unchanged HEAD:

~~~bash
export SOURCE=<checkout of this repository>
cd "$SOURCE"
test "$(pnpm --version)" = 11.8.0
pnpm install --frozen-lockfile
node scripts/update-source.mjs --source ../mattpocock-skills-fork --check
node scripts/verify-vendor.mjs
node --test
git diff --check
test -z "$(git status --porcelain)"
node scripts/verify-package.mjs --prepack
node scripts/verify-package-e2e.mjs
~~~

The prepack verifier compiles into a temporary directory and compares the exact file set, modes, and bytes with committed lib. It never overwrites lib and never packs.

## Build the Accepted Development Artifact Once

Use a new empty directory. The accepted command is invoked once:

~~~bash
umask 077
export ARTIFACT_DIR=/tmp/dsh-mattpocock-phase4-accepted
export TARBALL="$ARTIFACT_DIR/lmgatex-dsh-mattpocock-skills-0.0.0-development.tgz"
test "$(pnpm --version)" = 11.8.0
mkdir --mode=700 "$ARTIFACT_DIR"  # must fail if any file, directory, or symlink already exists
git rev-parse HEAD > "$ARTIFACT_DIR/source-commit.txt"
pnpm --version > "$ARTIFACT_DIR/pnpm-version.txt"
pnpm pack --json --skip-manifest-obfuscation --out "$TARBALL" > "$ARTIFACT_DIR/pack.json"
sha256sum "$TARBALL" > "$ARTIFACT_DIR/sha256.txt"
stat --format='%s' "$TARBALL" > "$ARTIFACT_DIR/size.txt"
chmod 0444 "$TARBALL" "$ARTIFACT_DIR/sha256.txt" "$ARTIFACT_DIR/size.txt" "$ARTIFACT_DIR/source-commit.txt" "$ARTIFACT_DIR/pnpm-version.txt" "$ARTIFACT_DIR/pack.json"
~~~

A failed or exploratory archive is not accepted and must not be reused. Once the accepted artifact is identified, every verifier consumes the same read-only file and every installer consumes a checksum-verified private snapshot of those exact bytes. The fresh mode-0700 artifact directory is the procedural trust boundary for the tarball and its size, source-commit, pnpm-version, and checksum records; `pack.json` is informational packer output.

## Exact Archive Verification

~~~bash
node scripts/verify-package.mjs \
  --tarball "$TARBALL" \
  --sha256-file "$ARTIFACT_DIR/sha256.txt" \
  --size-file "$ARTIFACT_DIR/size.txt" \
  --source-commit-file "$ARTIFACT_DIR/source-commit.txt" \
  --pnpm-version-file "$ARTIFACT_DIR/pnpm-version.txt" \
  > "$ARTIFACT_DIR/verification.json"
~~~

The verifier requires exactly 16 fixed package files plus every path authorized by vendor-files.json—97 files for the current baseline. It rejects unsafe or duplicate archive paths and unsupported member kinds; compares fixed bytes and modes with the source checkout, explicitly accounting only for pnpm 11.8.0's deterministic removal of the final LF from packed package.json; re-runs extracted provenance, catalog, and inventory verification; checks entry-point targets; and rejects source, tests, scripts, docs, dependencies, and custom client/Web payloads.

## Isolated DSH Verification

Run the source-owned isolated verifier once against the checksum-bound artifact. The evidence directory must not exist beforehand:

~~~bash
export ISOLATED_EVIDENCE="$ARTIFACT_DIR/isolated-evidence"
node scripts/verify-isolated-dsh.mjs \
  --source "$SOURCE" \
  --tarball "$TARBALL" \
  --sha256-file "$ARTIFACT_DIR/sha256.txt" \
  --size-file "$ARTIFACT_DIR/size.txt" \
  --source-commit-file "$ARTIFACT_DIR/source-commit.txt" \
  --pnpm-version-file "$ARTIFACT_DIR/pnpm-version.txt" \
  --evidence-dir "$ISOLATED_EVIDENCE" \
  > "$ARTIFACT_DIR/isolated-verification.json"
cmp "$ISOLATED_EVIDENCE/checkout-stable-registry.json" "$ISOLATED_EVIDENCE/tarball-stable-registry.json"
cmp "$ISOLATED_EVIDENCE/checkout-beta-registry.json" "$ISOLATED_EVIDENCE/tarball-beta-registry.json"
sha256sum --check "$ARTIFACT_DIR/sha256.txt"
~~~

`scripts/verify-isolated-dsh.mjs` creates a mode-0700 random work root with `mkdtemp` under the canonical system temporary directory, creates two empty child `DSH_HOME` directories, and removes the entire work root in `finally`. Every DSH command receives an explicit non-empty child home and uses only profile `headless`; the script contains no `web` command, listener, slash invocation, or model route. It rejects an existing evidence path rather than following or reusing it.

The exact four probes are checkout/Stable, checkout/Beta, tarball/Stable, and tarball/Beta. Stable inserts only the source-owned registry-verifier fixture. Beta first applies `tests/fixtures/phase4-beta.patch.yml`, then inserts the same verifier fixture. For every probe the script runs `dsh --profile headless --dump-config`, requires exactly one `dsh-mattpocock-skills` Host row with the expected channel and no package client row, then boots with `--help`. It requires DSH 0.1.2-rc.1, rejects install output that requests or reports blocked dependency builds, validates the recorded size/source commit/pnpm version, copies the accepted tarball into the mode-0700 work root, checksum-verifies and makes that private snapshot read-only, installs only the private snapshot, checks both original and snapshot hashes, and compares checkout/tarball registry reports byte-for-byte.

The registry fixture lists the actual booted registry, records every Skill's name, description hash, provider, source, rank, and invocation flags, and lazily loads one definition whose identity, invocation, resource kind, and content hash are recorded. Stable must expose 25 package Skills and no `implement-spec`; Beta must expose 26, with `implement-spec` user-invocable and model-disabled. Both channels must expose 11 model-visible Skills. Listing and lazy loading are allowed; slash invocation and model execution are not.

## Recorded Evidence

Pending completion of the accepted-artifact run. This section is updated after the checksum-bound tarball and both isolated-home checks pass.
