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
pnpm install --frozen-lockfile
node scripts/update-source.mjs --source ../mattpocock-skills-fork --check
node scripts/verify-vendor.mjs
node scripts/verify-package.mjs --prepack
node --test
git diff --check
test -z "$(git status --porcelain)"
~~~

The prepack verifier compiles into a temporary directory and compares the exact file set, modes, and bytes with committed lib. It never overwrites lib and never packs.

## Build the Accepted Development Artifact Once

Use a new empty directory. The accepted command is invoked once:

~~~bash
export ARTIFACT_DIR=/tmp/dsh-mattpocock-phase4-accepted
export TARBALL="$ARTIFACT_DIR/lmgatex-dsh-mattpocock-skills-0.0.0-development.tgz"
mkdir "$ARTIFACT_DIR"
pnpm pack --json --skip-manifest-obfuscation --out "$TARBALL" > "$ARTIFACT_DIR/pack.json"
sha256sum "$TARBALL" > "$ARTIFACT_DIR/sha256.txt"
chmod a-w "$TARBALL"
~~~

A failed or exploratory archive is not accepted and must not be reused. Once the accepted artifact is identified, every verifier and installer consumes the same read-only file.

## Exact Archive Verification

~~~bash
node scripts/verify-package.mjs --tarball "$TARBALL" --sha256-file "$ARTIFACT_DIR/sha256.txt" > "$ARTIFACT_DIR/verification.json"
~~~

The verifier requires exactly 16 fixed package files plus every path authorized by vendor-files.json—97 files for the current baseline. It rejects unsafe or duplicate archive paths and unsupported member kinds; compares fixed bytes and modes with the source checkout; re-runs extracted provenance, catalog, and inventory verification; checks entry-point targets; and rejects source, tests, scripts, docs, dependencies, and custom client/Web payloads.

## Isolated DSH Verification

Use two distinct temporary homes and the headless template; never use web:

~~~bash
export LOCAL_DSH_HOME=/tmp/dsh-mattpocock-phase4-local-home
export TARBALL_DSH_HOME=/tmp/dsh-mattpocock-phase4-tar-home
DSH_HOME="$LOCAL_DSH_HOME" DSH_TELEMETRY_DISABLED=1 dsh plugin --profile headless add "$SOURCE" --save-exact
sha256sum --check "$ARTIFACT_DIR/sha256.txt"
DSH_HOME="$TARBALL_DSH_HOME" DSH_TELEMETRY_DISABLED=1 dsh plugin --profile headless add "$TARBALL" --save-exact
~~~

For each home and channel, generate a temporary overlay outside the repository. The Beta variant first targets the package row with channel: beta; both variants then insert tests/fixtures/phase4-registry-verifier.mjs with config.channel and an absolute config.output path. Run the headless profile with that overlay and --help so the complete Host tree mounts, the verifier queries ctx.skills, and the app exits without opening a listener or invoking a model:

~~~bash
DSH_HOME="$HOME_UNDER_TEST" DSH_TELEMETRY_DISABLED=1 dsh --profile headless --patch "$OVERLAY" --help
~~~

For both homes:

1. The composed config contains exactly one dsh-mattpocock-skills Host row with default channel stable and no custom client row.
2. A temporary --patch may select Beta; no profile-owned patch is edited.
3. tests/fixtures/phase4-registry-verifier.mjs is inserted only as a temporary verification overlay. It queries the actual booted ctx.skills registry and writes a report.
4. Stable exposes 25 package Skills and no implement-spec; Beta exposes 26, with implement-spec user-invocable and model-disabled. Both channels expose the same 11 model-visible Skills.
5. The checkout and tarball reports are byte-identical for each channel.

Listing and lazily loading a definition are allowed. Slash invocation and model execution are not.

## Recorded Evidence

Pending completion of the accepted-artifact run. This section is updated after the checksum-bound tarball and both isolated-home checks pass.
