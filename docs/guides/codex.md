# Codex statusline and optional live HUD

Codex CLI owns its TUI footer. This repository can select Codex's built-in
status items through `tui.status_line`, but it cannot inject a command,
arbitrary ANSI, custom punctuation, or a continuously animated bar into that
footer.

That boundary is intentional:

1. the native preset is the supported, global Codex integration;
2. `src/codex/hud.mjs` is an optional standalone renderer for a separate terminal
   pane when exact bars and animation are wanted.

## Focused native setup

From the repository root:

```powershell
node src/codex/statusline.mjs --check --preset hud
node src/codex/statusline.mjs --print --preset hud
node src/codex/statusline.mjs --install --preset hud
```

`--check` is read-only. It asks the installed Codex CLI to parse the selected
item IDs together with the native visual settings; it does not claim to render
the TUI. `--print` emits a copyable TOML fragment. `--install` is the only
command that writes user configuration; it updates `CODEX_HOME/config.toml`
(or `~/.codex/config.toml`) and creates a timestamped `.bak-*` copy before
changing an existing file.

The focused native preset is:

```toml
[tui]
status_line = ["model-with-reasoning", "weekly-limit", "context-used", "total-input-tokens", "total-output-tokens"]
status_line_use_colors = true
animations = true
```

The order is model, weekly, context used, input, output. Codex supplies the
values, labels, separators, and layout. `status_line_use_colors` uses the
active Codex syntax theme. `animations` enables Codex's own welcome, shimmer,
and spinner animations; neither setting turns the footer into a custom
rainbow bar. Close and reopen Codex after installing because the TUI loads the
configuration when the process starts.

## Optional standalone renderer

Run this only when a second terminal pane is acceptable:

```powershell
node src/codex/hud.mjs --watch --cwd (Get-Location)
```

For a one-shot check:

```powershell
node src/codex/hud.mjs --once --cwd (Get-Location)
```

The line is deliberately fixed and sparse:

```text
model gpt-5.6-luna  │  weekly       [███████████░] 95%  │  context used [█░░░░░░░░░░░] 11%  │  28.8K in · 230 out
```

Only `weekly` and `context used` have bars. The bars are 12 cells wide and
cycle through a restrained neon aurora every 120 ms, including while values
are idle. Set `NO_COLOR` or pipe `--once` to receive plain Unicode output.

This process is not launched by Codex, does not alter the Codex TUI, and is
not made global by the native config preset. It reads only the newest matching
rollout's working directory, model, usage limits, context capacity, and token
counts. It never reads `auth.json`, credentials, prompt text, response text,
or provider secrets. Missing or partially written data produces placeholders
and does not fail the process.

Use `--session <id>` when several Codex sessions share the same directory:

```powershell
node src/codex/hud.mjs --watch --cwd (Get-Location) --session <session-id>
```

## Other presets

The helper keeps two additional native presets:

- `full`: the built-in status item IDs cataloged for Codex 0.146;
- `compact`: model/reasoning, remaining context, both limits, Git branch, and
  run state;
- `hud`: the five-item focused footer described above.

Examples:

```powershell
node src/codex/statusline.mjs --print --preset full
node src/codex/statusline.mjs --install --preset compact
```

Codex reads its configuration only from `CODEX_HOME/config.toml` (default
`~/.codex/config.toml`). A repo-local `.codex/` is never read by Codex, so it
is gitignored and not committed. Run `--install` to configure the footer for
your machine; it writes to the real config home and backs up whatever was
there.

## Version compatibility

Codex status item IDs are owned by the installed Codex version. Run
`node src/codex/statusline.mjs --check --preset hud` after upgrading Codex. If a
future version changes the available IDs or rollout schema, update the catalog
and companion parser together, then rerun `node --test`.

Claude remains independent: Claude Code still invokes
`src/claude/statusline.mjs`, reads its JSON stdin payload, and receives the
existing one-line ANSI output.
