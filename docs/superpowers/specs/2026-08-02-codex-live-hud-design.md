# Codex Live HUD Design

**Date:** 2026-08-02  
**Status:** Approved direction; implementation in progress

## Goal

Make the Codex footer calm, compact, and visually alive by keeping only the
requested information groups in this order:

```text
model gpt-5.6-luna  │  weekly      [████████░░░░] 95%  │  context used [█░░░░░░░░░░░] 11%  │  28.8K in · 230 out
```

The native Codex footer will contain the same five supported data items. A
zero-dependency companion renderer will provide the exact aligned layout and
animated color when run in a separate terminal pane or PowerShell surface.

## Context and constraints

Codex CLI 0.146.0 owns its TUI footer. Its supported `tui.status_line` setting
accepts an ordered list of built-in item IDs, but it does not execute an
external command and does not expose a custom ANSI renderer or animation hook.
The native configuration can therefore provide the exact data order but not a
custom rainbow animation or exact punctuation.

The companion reads only Codex session rollout metadata and token-count
events. It never reads `auth.json`, credentials, prompt text, response text,
or provider secrets. It follows the newest session whose recorded working
directory matches the current directory, while retaining the last known
snapshot when no new event arrives.

## Visual direction

The visual language is a restrained neon aurora rather than a full-screen
rainbow:

- **Violet** `#8b7cff` anchors the left edge.
- **Cyan** `#3bd9ff` carries the middle.
- **Mint** `#39e6b6` signals steady progress.
- **Lime** `#e8ff5a` adds a readable warm pivot.
- **Amber** `#ffb000` warns near a limit.
- **Magenta** `#ff4d8d` closes the loop.

Filled cells use a phase-shifted truecolor gradient. The phase advances every
120 ms even when values are unchanged, so a quiet session still feels alive.
Empty cells use dim neutral ink and unknown values use dim dots. The renderer
falls back to plain characters when `NO_COLOR` is set or stdout is not a TTY.

The two bars have a fixed 12-cell width and each value remains aligned. The
model and final token group are plain text with no bar, exactly as requested.
The line has no run state, fast-mode label, IDs, version, reset timers, or
extra decorative metrics.

## Data model

The latest `event_msg` with `payload.type === "token_count"` supplies:

- `payload.rate_limits.primary.used_percent` for the weekly bar when its
  window is 10,080 minutes.
- `payload.info.model_context_window` as the context capacity.
- `payload.info.total_token_usage.input_tokens` and
  `payload.info.total_token_usage.output_tokens` for the final group.

The latest `turn_context.payload.model` supplies the first text-only group.

Context used is `input_tokens / model_context_window * 100`, clamped to
0–100. Token counts use compact decimal notation (`28.8K`, `1.2M`) while
preserving small integers (`230`). Missing data renders a stable `--` rather
than inventing zeroes.

## Architecture

### Native configuration

Add a `hud` preset to `codex-statusline.mjs`:

```text
model-with-reasoning
weekly-limit
context-used
total-input-tokens
total-output-tokens
```

The project-local config and the explicit global install use this preset. The
existing `full` and `compact` presets remain available for contributors who
want them.

### Companion renderer

Create `codex-hud.mjs` as a pure renderer plus a small file watcher:

- `--once` renders one snapshot and exits, useful for tests and scripts.
- `--watch` refreshes data once per second and animates the line every 120 ms.
- `--cwd <path>` selects the Codex session working directory; it defaults to
  the current directory.
- `--session <id>` pins a session when several sessions share a directory.

The watch mode updates one terminal line using carriage return and line erase,
handles Ctrl+C cleanly, and never writes to the Codex session files.

### Global use

The global Codex config is updated to the `hud` preset with the existing safe
backup flow. The repository also exposes the companion command and documents
the PowerShell invocation for a split pane. No PowerShell profile or auth file
is modified automatically.

## Testing

Use Node's built-in test runner with fixture rollout files. Cover:

1. Weekly/context/token extraction from a token-count event.
2. Session selection by matching `cwd` and newest modification time.
3. Compact token formatting and clamped percentages.
4. Fixed-width, ordered output with bars only in the first two groups.
5. Rainbow rendering with ANSI disabled/enabled and deterministic phase.
6. CLI parsing for `--once`, `--watch`, `--cwd`, and `--session`.
7. The native `hud` preset and project-local config alignment.

## Acceptance criteria

- The active native global footer contains only model, weekly, context used,
  input, and output in that order.
- The companion output contains only the four requested groups in that order.
- Only weekly and context used have bars.
- Bars retain fixed alignment and animate continuously while idle.
- The renderer is zero-dependency, cross-platform Node.js, and safe around
  missing or partially-written rollout files.
- Existing Claude behavior and previous Codex presets continue to pass tests.
