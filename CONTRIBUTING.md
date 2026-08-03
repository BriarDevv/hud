# Contributing to hud

## Layout

The repo is organized by host, so adding support for a new agent means adding
a folder, not rearranging the tree:

```
src/<host>/       renderers and helpers for that host
test/<host>/      tests mirroring src/<host>/
test/fixtures/    sample payloads, prefixed by host
docs/guides/      how to install and run a host integration
docs/specs/       SPEC-<feature>.md
docs/adrs/        ADR-NNN-<topic>.md
```

Nothing new belongs in the repo root. The root is reserved for project-level
files: README, license, community health, and agent context files.

Local tool configuration (`.codex/`, `.omc/`, `.worktrees/`) is never
committed — it is per-machine state, and every installer here writes to the
host's own config home instead.

## Workflow

- Branch from `main`: `feat/<topic>` or `fix/<topic>`.
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`.

## Before opening a PR

```
node --test
node src/claude/statusline.mjs < test/fixtures/claude-stdin.json
echo {} | node src/claude/statusline.mjs
```

Tests must pass from any working directory — resolve paths from
`import.meta.url`, never from `process.cwd()`.

Every script must stay zero-dependency and must never throw. The Claude
statusline must print exactly one line.

## Merging

**Rebase only.** `main` is protected: linear history is required, and squash
and merge commits are disabled on the repository. Rebase your branch onto
`main` before merging, and never force-push `main`.
