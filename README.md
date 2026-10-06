# DSH Matt Pocock Skills

Public-source DSH adapter and reproducible distribution bundle for the Matt Pocock Skills channels maintained in [LMGateX/mattpocock-skills-distribution](https://github.com/LMGateX/mattpocock-skills-distribution).

**Current status:** The core adapter and historical Phase 4 artifact verification are complete. The Phase 5 behavioral campaign is closed but failed: two trials passed and one had a hard failure. The collaboration implementation and review fixes have passed mechanical source/build/test acceptance; results and separately recorded clean-source artifact gates are described in [the public verification summary](<docs/VERIFICATION.md>). This public repository does not authorize installation, activation, npm publication or deployment.

- Upgrading a repository that already used these Skills: [MIGRATION.md](MIGRATION.md)
- Authoritative architecture: [docs/DESIGN.md](docs/DESIGN.md)
- Implementation sequence and gates: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
- Checksum-bound Phase 4 artifact runbook: [docs/PHASE4_ARTIFACT_VERIFICATION.md](docs/PHASE4_ARTIFACT_VERIFICATION.md)
- Required `implement-spec` behavioral evaluation: closed and failed (two trials passed, one had a hard failure). Its campaign definition, harness and raw records are evaluation material rather than package content, and are archived outside this repository.

The package exposes unchanged upstream Skill bodies through DSH's native `ctx.skills` provider API. The channel set is data-driven: the plugin publishes exactly the channels declared by the pinned distribution, and an unknown channel name fails closed instead of loading an empty set.

The pinned distribution publishes **two channels, and only ever adds channels**:

- `stable` — upstream's promoted set: 27 Skills.
- `beta` — `stable` plus whatever upstream is previewing under `skills/in-progress/`. Nothing is previewed today, so `beta` resolves to the **same 27 Skills**; it exists so that a profile which selected `beta` keeps working.

This release mirrors upstream **v1.3.1** (commit `24fe0ef`). `PROVENANCE.json` records that mapping so you can tell which upstream version you are running without resolving Git objects, and upstream's own [changelog](vendor/mattpocock-skills/CHANGELOG.md) ships inside the package.

`stable` is the default. It is an unofficial adapter and does not imply endorsement by Matt Pocock.

**Upgrading an existing repository?** Upstream v1.3 renamed `CONTEXT.md` to `GLOSSARY.md` with no fallback, and the skills fail silently rather than reporting the old name. Read [MIGRATION.md](MIGRATION.md) first.

## Usage sequence and known limitations

1. **Installation and activation belong to DSH.** This package supplies a native Skill provider and declares `stable` and `beta`, with `stable` as the default. Installation does not automatically change the owner profile or project conventions.
2. **Project setup is separate.** In a target project session with the plugin enabled, run `/setup-matt-pocock-skills` before first using the engineering workflows. It confirms the tracker, labels, and domain documentation with the user and writes project configuration; it is not the plugin installer. GitHub/GitLab workflows need the appropriate CLI, authentication, and authorization; local Markdown is also supported.
3. **Use native invocation.** Users invoke `/skill-name`; subsequent Skill calls described in a body are performed by the agent through the DSH `skill` tool, not by recursively executing slash text. User and model invocation permissions are distinct.

Compatibility notes for the currently inspected local DSH implementation (not a claim that every profile enables these capabilities):

- `/compact` accepts no arguments. Upstream examples of `/compact <instructions>` cannot be used verbatim. A same-name `/clear` entry remains unverified; do not automatically clear a session.
- DSH recognizes both `AGENTS.md` and `CLAUDE.md` by default; blanket filename substitutions are unnecessary.
- **Background dispatch does not guarantee headless lifetime.** The inspected headless driver summarizes and exits after the root becomes idle; continued normal completion and delivery of background work are not guaranteed. This does not establish equivalent Web behavior. Full unattended workflows require a separate host-lifecycle decision.
- Git/worktrees, browsers, online research, and shared notes depend on target environment capabilities and permissions. The provider does not install those tools, authorize external writes, or bypass filesystem policy.
- **Host versions.** Verified against DSH `0.1.2-rc.1`, `0.1.7-alpha.2`, `0.1.7-rc.2`, `0.2.0-rc.1`, `0.2.0-rc.2`, and `0.2.1-alpha.1`. The immutable Skills provider never needed a runtime code change; only the declared peer range was widened (optional initial-cwd compatibility is a separate capability below), because npm semver cannot express a single range covering host prereleases. DSH `0.2.0-rc.1` added a hard install-time peer gate, which rejects any release that declares only `^0.1.7-alpha.2`; this release declares `^0.2.0-rc.1` as well, which the gate resolves as `>=0.2.0-rc.1 <0.3.0`, so it installs on every verified host and stops at `0.3.0-alpha.1`. See the [host compatibility record](docs/HOST_COMPATIBILITY.md) (Chinese).

See the [thin-adapter scope](docs/ADAPTER_SCOPE.md), [evidence-based compatibility inventory](docs/COMPATIBILITY.md), and [host compatibility record](docs/HOST_COMPATIBILITY.md) (Chinese). These notes neither rewrite upstream bodies or historical campaign results nor lift activation/release gates.

## Optional collaboration controls

The optional TypeScript extension includes revisioned global/workspace settings, durable owner-session instruments, task-defined tickets/decisions, advisory T/S, initial worktree binding, bounded current context, paginated history and explicit source-history cleanup, plus a native lazy client. The immutable Skill provider remains independent. The optional mount supplies nine tools and third-party settings/header/right-panel contributions when host services are present. Management starts off and reference limits are unset. Read [the controls guide](<CONTROLS.md>).

Overage or incomplete T/S observation does not veto valid native delegation or add business approval. Agents manage Git themselves: cleaned trees leave continuous injection, discarded-but-uncleaned trees remain reminders, and history has no default TTL. Initial-cwd compatibility now ships in the same plugin package as the pinned recipe and dsh-mattpocock-skills-cwd offline setup/start command. Its default-off operator setting is separate from live workspace policy: enable/disable saves the next boot request, and both require DSH restart; browser refresh and HMR are not reboot. First preparation must complete after all DSH processes using that SDK stop, before startup; standard plugin add has no proven auto-preparation hook. The UI distinguishes current/next state, needed preparation, incompatible/failed/uncertain, and pending restart. Prepared hosts can subsequently use normal DSH restarts; disabling does not reverse-patch SDK files or change existing child history/cwd. Source delivery does not prepare a running SDK or activate a Profile/GUI. On an unprepared SDK without native initial-cwd support, explicit cwd remains unsupported. See [the controls guide](<CONTROLS.md>) and [the public verification summary](<docs/VERIFICATION.md>) for current closeout status. Historical raw research, logs and development receipts remain local and are not published as public proof. The package keeps `private: true` to prevent npm publication; repository visibility is independently public.

## Current development verification

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec tsc -p tsconfig.json
chmod 755 lib/compatibility/cli.js
pnpm exec tsc -p tsconfig.client.json --noEmit
node scripts/build-client.mjs --out lib/client.js --declaration
# Optional installed-host storage/API fixtures: set DSH_CONTROLS_HOST_ROOT explicitly.
node --test tests/*.test.mjs
# Release prepack still requires a clean committed tree.
node scripts/verify-package.mjs --prepack
node scripts/verify-vendor.mjs
node scripts/update-source.mjs --source ../mattpocock-skills-fork --check
```

Phase 3 filesystem hardening is verified on Linux/Node 24; hosts without safe no-follow file opens fail closed, and broader platform compatibility remains a later gate.

The project is not published to npmjs. Ownership of the `@lmgatex` npm scope will be confirmed separately before any npm publication.
