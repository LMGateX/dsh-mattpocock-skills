# DSH Matt Pocock Skills

Private DSH adapter and distribution bundle for the Matt Pocock Skills channels maintained in [LMGateX/mattpocock-skills-distribution](https://github.com/LMGateX/mattpocock-skills-distribution).

**Current status:** Phases 0–3 are complete. The verified Stable/Beta source union and immutable DSH Skill provider are implemented and pass the deterministic provider gates. Checksum-bound artifact verification, behavioral evaluation, and owner-profile activation remain separately gated phases.

- Authoritative architecture: [docs/DESIGN.md](docs/DESIGN.md)
- Implementation sequence and gates: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
- Checksum-bound Phase 4 artifact runbook: [docs/PHASE4_ARTIFACT_VERIFICATION.md](docs/PHASE4_ARTIFACT_VERIFICATION.md)
- Required `implement-spec` behavioral evaluation: [docs/IMPLEMENT_SPEC_EVAL.md](docs/IMPLEMENT_SPEC_EVAL.md)

The package exposes unchanged upstream Skill bodies through DSH's native `ctx.skills` provider API. `stable` is the default 25-Skill channel; `beta` adds the user-invocable, model-disabled `implement-spec` Skill. It is an unofficial adapter and does not imply endorsement by Matt Pocock.

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
