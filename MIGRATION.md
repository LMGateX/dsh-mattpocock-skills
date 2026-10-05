# Migrating an existing repository across Skills v1.3

This adapter delivers the upstream Matt Pocock Skills bodies unchanged. Upstream v1.3 renamed a
document convention, and **no skill will tell you when the old name is gone**. This page lists what
you have to change by hand. Nothing here runs automatically.

It covers only what you must change. For what changed in the skill set itself, read the vendored
upstream [changelog](vendor/mattpocock-skills/CHANGELOG.md), or upstream's own
[v1.3.1 release](https://github.com/mattpocock/skills/releases/tag/v1.3.1).

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

## What not to do

- **Do not treat `CODING_STANDARDS.md` as a migration step.** The rename does not require one, and a
  repository that never had one still does not. `retro`, promoted in v1.3, may later suggest a rule
  there for genuine judgement calls, and `code-review` reads it whenever it exists. Both are ordinary
  use, not migration work.
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
