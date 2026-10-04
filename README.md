# DSH Matt Pocock Skills

Private DSH adapter and distribution bundle for the Matt Pocock Skills channels maintained in [LMGateX/mattpocock-skills-distribution](https://github.com/LMGateX/mattpocock-skills-distribution).

**Current status:** The core adapter and Phase 4 artifact verification are complete. The Phase 5 behavioral campaign is closed but failed: two trials passed and one had a hard failure. Subsequent maintenance focuses on the thin adapter and demonstrated compatibility gaps, not expansion of the behavioral analyzer. Owner-profile activation and release remain unauthorized.

- Upgrading a repository that already used these Skills: [MIGRATION.md](MIGRATION.md)
- Authoritative architecture: [docs/DESIGN.md](docs/DESIGN.md)
- Implementation sequence and gates: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
- Checksum-bound Phase 4 artifact runbook: [docs/PHASE4_ARTIFACT_VERIFICATION.md](docs/PHASE4_ARTIFACT_VERIFICATION.md)
- Required `implement-spec` behavioral evaluation: closed and failed (two trials passed, one had a hard failure). Its campaign definition, harness and raw records are evaluation material rather than package content, and are archived outside this repository.

The package exposes unchanged upstream Skill bodies through DSH's native `ctx.skills` provider API. The channel set is data-driven: the plugin publishes exactly the channels declared by the pinned distribution, currently one `stable` channel of 27 Skills. An unknown channel name fails closed instead of loading an empty set. It is an unofficial adapter and does not imply endorsement by Matt Pocock.

**Upgrading an existing repository?** Upstream v1.3 renamed `CONTEXT.md` to `GLOSSARY.md` with no fallback, and the skills fail silently rather than reporting the old name. Read [MIGRATION.md](MIGRATION.md) first.

## Usage sequence and known limitations

1. **Installation and activation belong to DSH.** This package supplies a native Skill provider and defaults to the only declared channel, `stable`. Installation does not automatically change the owner profile or project conventions.
2. **Project setup is separate.** In a target project session with the plugin enabled, run `/setup-matt-pocock-skills` before first using the engineering workflows. It confirms the tracker, labels, and domain documentation with the user and writes project configuration; it is not the plugin installer. GitHub/GitLab workflows need the appropriate CLI, authentication, and authorization; local Markdown is also supported.
3. **Use native invocation.** Users invoke `/skill-name`; subsequent Skill calls described in a body are performed by the agent through the DSH `skill` tool, not by recursively executing slash text. User and model invocation permissions are distinct.

Compatibility notes for the currently inspected local DSH implementation (not a claim that every profile enables these capabilities):

- `/compact` accepts no arguments. Upstream examples of `/compact <instructions>` cannot be used verbatim. A same-name `/clear` entry remains unverified; do not automatically clear a session.
- DSH recognizes both `AGENTS.md` and `CLAUDE.md` by default; blanket filename substitutions are unnecessary.
- **Background dispatch does not guarantee headless lifetime.** The inspected headless driver summarizes and exits after the root becomes idle; continued normal completion and delivery of background work are not guaranteed. This does not establish equivalent Web behavior. Full unattended workflows require a separate host-lifecycle decision.
- Git/worktrees, browsers, online research, and shared notes depend on target environment capabilities and permissions. The provider does not install those tools, authorize external writes, or bypass filesystem policy.
- **Host versions.** Verified against DSH `0.1.2-rc.1`, `0.1.7-alpha.2`, `0.1.7-rc.2`, `0.2.0-rc.1`, `0.2.0-rc.2`, and `0.2.1-alpha.1`. No runtime code change was ever needed; only the declared peer range was widened, because npm semver cannot express a single range covering host prereleases. DSH `0.2.0-rc.1` added a hard install-time peer gate, which rejects any release that declares only `^0.1.7-alpha.2`; this release declares `^0.2.0-rc.1` as well, which the gate resolves as `>=0.2.0-rc.1 <0.3.0`, so it installs on every verified host and stops at `0.3.0-alpha.1`. See the [host compatibility record](docs/HOST_COMPATIBILITY.md) (Chinese).

See the [thin-adapter scope](docs/ADAPTER_SCOPE.md), [evidence-based compatibility inventory](docs/COMPATIBILITY.md), and [host compatibility record](docs/HOST_COMPATIBILITY.md) (Chinese). These notes neither rewrite upstream bodies or historical campaign results nor lift activation/release gates.

## Current development verification

```bash
pnpm install --frozen-lockfile
node scripts/verify-package.mjs --prepack
node --test
node scripts/verify-vendor.mjs
node scripts/update-source.mjs --source ../mattpocock-skills-fork --check
```

Phase 3 filesystem hardening is verified on Linux/Node 24; hosts without safe no-follow file opens fail closed, and broader platform compatibility remains a later gate.

The project is not published to npmjs. Ownership of the `@lmgatex` npm scope will be confirmed separately before any npm publication.
