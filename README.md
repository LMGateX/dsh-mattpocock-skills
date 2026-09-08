# DSH Matt Pocock Skills

Private DSH adapter and distribution bundle for the Matt Pocock Skills channels maintained in [LMGateX/mattpocock-skills-distribution](https://github.com/LMGateX/mattpocock-skills-distribution).

The repository is in **Phase 1 package scaffolding**. The installable package surface exists, but the Skill provider is not usable until verified source ingestion and provider phases are complete.

- Authoritative architecture: [docs/DESIGN.md](docs/DESIGN.md)
- Implementation sequence and gates: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
- Required `implement-spec` behavioral evaluation: [docs/IMPLEMENT_SPEC_EVAL.md](docs/IMPLEMENT_SPEC_EVAL.md)

The package will expose unchanged upstream Skill bodies through DSH's native `ctx.skills` provider API. It is an unofficial adapter and does not imply endorsement by Matt Pocock.

## Current development verification

```bash
pnpm install --frozen-lockfile
pnpm exec tsc -p tsconfig.json
node --test tests/scaffold.test.mjs
```

The project is not published to npmjs. Ownership of the `@lmgatex` npm scope will be confirmed separately before any npm publication.
