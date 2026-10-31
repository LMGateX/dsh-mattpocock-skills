# Migrating an existing repository across Skills v1.3

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
