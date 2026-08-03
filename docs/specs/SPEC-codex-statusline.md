# Codex Native Statusline Integration Design

**Date:** 2026-08-02  
**Status:** Superseded by `SPEC-codex-live-hud.md`

> Historical note: this document describes the original full native preset.
> The current machine/global default is the focused `hud` preset,
> with the companion renderer documented in the superseding design.

> Correction note (2026-08-02): the old example included `actions`, which is
> not a Codex 0.146 status-line item. The maintained catalog is the source of
> truth in `src/codex/statusline.mjs`, and the current native preset also writes
> `status_line_use_colors = true` and `animations = true`.
> All catalog and project-config examples below are historical design notes;
> use `src/codex/statusline.mjs`, the real `CODEX_HOME/config.toml`, and
> `docs/guides/codex.md` for the current contract.

## Context

This repository is a zero-dependency Claude Code statusline renderer. Claude
Code invokes `src/claude/statusline.mjs` as an external `statusLine.command` and supplies a JSON
snapshot on stdin. The renderer owns formatting, ANSI colors, responsive
shrinking, transcript-based session timing, and the Anthropic OAuth usage
fallback.

Codex CLI exposes a different contract. Its TUI owns the footer and reads an
ordered `tui.status_line` array from `config.toml`; it does not invoke an
external statusline command for the footer. The installed Codex CLI exposes
native items for model/reasoning, context, rate limits, tokens, Git, project
location, run state, permissions, approval mode, task progress, fast mode,
session identity, version, and workspace metadata.

The integration must therefore be native to Codex rather than attempting to
reuse Claude's renderer inside the Codex TUI.

## Goals

1. Keep Claude Code behavior and installation unchanged.
2. Provide a Codex-native `full` statusline preset containing every useful
   status item exposed by the installed Codex CLI.
3. Provide a `compact` preset for terminals where the full footer is too dense.
4. Make the preset easy to inspect, validate, and install without dependencies.
5. Make installation opt-in, preserve unrelated user configuration, and create
   a recoverable backup before changing `CODEX_HOME/config.toml`.
6. Document the difference between Claude's external renderer and Codex's
   native footer so contributors do not expect `src/claude/statusline.mjs` to be executed by
   Codex.
7. Add deterministic tests for preset contents and configuration rewriting.

## Non-goals

- Reimplementing the Codex TUI or rendering a second footer process.
- Calling private Codex APIs or reading Codex credentials.
- Changing Claude's OAuth fallback, cache files, transcript parsing, ANSI
  palette, or responsive shrink behavior.
- Automatically modifying a contributor's global Codex configuration during
  normal repository use.
- Promising compatibility with undocumented status item IDs from future Codex
  releases without a validation path.

## Approaches considered

### A. Documentation-only Codex support

Add a TOML snippet and manual setup instructions.

This is low risk but leaves contributors to edit their own configuration by
hand and provides no way to validate or safely update an existing `[tui]`
section.

### B. Native configuration plus a zero-dependency helper (recommended)

Keep a canonical item catalog in the repository and add
`src/codex/statusline.mjs` with
`--print`, `--check`, `--install`, and preset selection. `--install` is
explicit, creates a timestamped backup, and updates only the native `[tui]`
status-line settings.

This uses Codex's supported surface, gives contributors a one-command setup,
and keeps all writes explicit and recoverable while preserving the standalone
Claude renderer.

### C. Provider-neutral external renderer for both CLIs

Refactor `src/claude/statusline.mjs` into a renderer that accepts Claude and Codex payloads and
run it as a sidecar for Codex.

This would make formatting more uniform, but Codex does not provide the
external footer-command contract needed to display that renderer in its TUI.
It would add a second process and invent a private integration boundary, so it
is rejected.

## Proposed architecture

### Canonical Codex catalog

`src/codex/statusline.mjs` owns one ordered catalog of the currently supported
Codex footer item IDs. The `full` preset includes:

```text
model
model-with-reasoning
reasoning
current-dir
project-name
git-branch
pull-request-number
branch-changes
run-state
permissions
approval-mode
context-remaining
context-used
five-hour-limit
weekly-limit
codex-version
context-window-size
used-tokens
total-input-tokens
total-output-tokens
thread-id
fast-mode
raw-output
thread-title
workspace-headline
task-progress
```

The `compact` preset keeps the highest-signal fields:

```text
model-with-reasoning
context-remaining
five-hour-limit
weekly-limit
git-branch
run-state
```

The catalog is the single source of truth used by the TOML generator, the
machine config, and tests. The full preset deliberately prefers
information completeness; users can switch to compact or reorder fields with
Codex's `/statusline` command.

### Helper command

The helper remains zero-dependency and uses Node's standard library only.

- `node src/codex/statusline.mjs --print --preset full` prints a valid `[tui]`
  TOML fragment.
- `node src/codex/statusline.mjs --check` verifies the catalog and, when a `codex`
  executable is available, asks the installed CLI to parse the statusline
  override without starting an interactive session.
- `node src/codex/statusline.mjs --install --preset full` resolves
  `CODEX_HOME/config.toml` (falling back to the platform home directory), makes
  a timestamped backup when an existing file would change, and updates the
  native status-line settings in the `[tui]` table. It creates the file and
  table if they do not exist.
- `--preset compact` is accepted by `--print` and `--install`.
- Invalid flags, missing Codex, malformed target configuration, or filesystem
  errors produce a concise stderr message and a non-zero exit code; ordinary
  renderer failure behavior in `src/claude/statusline.mjs` remains unchanged.

The configuration updater must preserve unrelated keys and comments. It must
handle an existing `[tui]` table, a `[tui]` table followed by another table,
an existing `status_line`, and a file with no `[tui]` table. It must not create
a backup when the requested value is already present.

### Repository configuration

None. Codex resolves its config only from `CODEX_HOME/config.toml` (default
`~/.codex/config.toml`), so a repo-local `.codex/config.toml` has no effect on
a Codex session started in this repository. `.codex/` is gitignored and the
footer is configured per machine via `--install`.

> An earlier revision of this spec called for committing a project-local
> `.codex/config.toml`. That was incorrect — Codex never reads it — and the
> file has been removed.

### Documentation

- `README.md` keeps Claude installation instructions and adds Codex setup and
  verification commands.
- `AGENTS.md` describes the Codex-native surface and validation commands.
- `CLAUDE.md` records that Claude remains the primary external renderer while
  Codex uses the native footer configuration.
- `docs/guides/codex.md` explains the field catalog, presets, safe install
  behavior, and version boundary.

## Data flow

```text
canonical item catalog
        |
        +--> full/compact preset --> TOML fragment --> Codex TUI footer
        |
        +--> --check --> installed Codex parser
        |
        +--> --install --> backup --> CODEX_HOME/config.toml
```

Claude's existing flow remains separate:

```text
Claude JSON stdin --> src/claude/statusline.mjs --> one ANSI statusline on stdout
```

## Error handling and safety

- No command reads or prints credentials.
- `--print` never writes files.
- `--check` never writes files.
- `--install` is the only write path and must be explicitly requested.
- Backups use a timestamped sibling path and are created before the first
  write.
- The updater refuses ambiguous/malformed table structure instead of
  rewriting an unknown TOML document.
- The helper uses non-zero exits for actionable failures so it can be used in
  scripts and CI.

## Testing strategy

Use Node's built-in `node:test` runner with no external dependencies.

Tests cover:

1. Full and compact presets contain the expected IDs in stable order with no
   duplicates.
2. TOML generation emits a valid ordered array and does not emit credentials.
3. Existing `[tui]` configuration is updated in place while unrelated keys,
   comments, and following tables are preserved.
4. A missing `[tui]` table is created correctly.
5. An unchanged configuration is reported as unchanged and does not require a
   backup.
6. The CLI print path returns the expected fragment without writing files.
7. The existing Claude renderer still passes syntax and sample smoke checks.

## Acceptance criteria

- Claude's existing README commands still work.
- `node src/codex/statusline.mjs --print --preset full` prints the complete native
  Codex configuration.
- `node src/codex/statusline.mjs --check` succeeds against the installed Codex
  CLI without opening the TUI.
- The machine-level Codex config contains the focused `hud` preset and native
  visual settings only.
- `--install` changes only the native `[tui]` status-line settings, preserves unrelated content, and
  creates a recoverable backup before a real change.
- `node --test` passes with no external package installation.
- Documentation accurately states the native Codex limitation and setup path.
