# Codex Native Statusline Integration Design

**Date:** 2026-08-02  
**Status:** Approved direction; implementation plan pending

## Context

This repository is a zero-dependency Claude Code statusline renderer. Claude
Code invokes `hud.mjs` as an external `statusLine.command` and supplies a JSON
snapshot on stdin. The renderer owns formatting, ANSI colors, responsive
shrinking, transcript-based session timing, and the Anthropic OAuth usage
fallback.

Codex CLI exposes a different contract. Its TUI owns the footer and reads an
ordered `tui.status_line` array from `config.toml`; it does not invoke an
external statusline command for the footer. The installed Codex CLI exposes
native items for model/reasoning, context, rate limits, tokens, Git, project
location, run state, task progress, fast mode, session identity, version, and
actions.

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
   native footer so contributors do not expect `hud.mjs` to be executed by
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

Keep a canonical item catalog in the repository, expose a project-local
`.codex/config.toml` using the full preset, and add `codex-statusline.mjs` with
`--print`, `--check`, `--install`, and preset selection. `--install` is
explicit, creates a timestamped backup, and updates only `tui.status_line`.

This uses Codex's supported surface, gives contributors a one-command setup,
and keeps all writes explicit and recoverable while preserving the standalone
Claude renderer.

### C. Provider-neutral external renderer for both CLIs

Refactor `hud.mjs` into a renderer that accepts Claude and Codex payloads and
run it as a sidecar for Codex.

This would make formatting more uniform, but Codex does not provide the
external footer-command contract needed to display that renderer in its TUI.
It would add a second process and invent a private integration boundary, so it
is rejected.

## Proposed architecture

### Canonical Codex catalog

`codex-statusline.mjs` owns one ordered catalog of the currently supported
Codex footer item IDs. The `full` preset includes:

```text
model-with-reasoning
context-used
context-remaining
five-hour-limit
weekly-limit
used-tokens
total-input-tokens
total-output-tokens
git-branch
current-dir
project-name
run-state
task-progress
fast-mode
thread-id
thread-title
codex-version
actions
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
project-local config, and tests. The full preset deliberately prefers
information completeness; users can switch to compact or reorder fields with
Codex's `/statusline` command.

### Helper command

The helper remains zero-dependency and uses Node's standard library only.

- `node codex-statusline.mjs --print --preset full` prints a valid `[tui]`
  TOML fragment.
- `node codex-statusline.mjs --check` verifies the catalog and, when a `codex`
  executable is available, asks the installed CLI to parse the statusline
  override without starting an interactive session.
- `node codex-statusline.mjs --install --preset full` resolves
  `CODEX_HOME/config.toml` (falling back to the platform home directory), makes
  a timestamped backup when an existing file would change, and updates only
  the `status_line` key in the `[tui]` table. It creates the file and table if
  they do not exist.
- `--preset compact` is accepted by `--print` and `--install`.
- Invalid flags, missing Codex, malformed target configuration, or filesystem
  errors produce a concise stderr message and a non-zero exit code; ordinary
  renderer failure behavior in `hud.mjs` remains unchanged.

The configuration updater must preserve unrelated keys and comments. It must
handle an existing `[tui]` table, a `[tui]` table followed by another table,
an existing `status_line`, and a file with no `[tui]` table. It must not create
a backup when the requested value is already present.

### Repository configuration

`.codex/config.toml` contains the full preset so Codex sessions started in this
repository immediately demonstrate the native integration once the repository
is trusted. It contains no provider, auth, notification, or telemetry settings.

### Documentation

- `README.md` keeps Claude installation instructions and adds Codex setup and
  verification commands.
- `AGENTS.md` describes the Codex-native surface and validation commands.
- `CLAUDE.md` records that Claude remains the primary external renderer while
  Codex uses the native footer configuration.
- `docs/codex-statusline.md` explains the field catalog, presets, safe install
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
Claude JSON stdin --> hud.mjs --> one ANSI statusline on stdout
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
- `node codex-statusline.mjs --print --preset full` prints the complete native
  Codex configuration.
- `node codex-statusline.mjs --check` succeeds against the installed Codex
  CLI without opening the TUI.
- The project-local Codex config contains the full preset only.
- `--install` changes only `tui.status_line`, preserves unrelated content, and
  creates a recoverable backup before a real change.
- `node --test` passes with no external package installation.
- Documentation accurately states the native Codex limitation and setup path.
