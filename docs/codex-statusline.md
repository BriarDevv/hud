# Codex statusline and live HUD

Codex CLI owns its TUI footer. It reads an ordered `tui.status_line` array
from `config.toml`, but it does not execute an external statusline command.
That gives this repository two complementary surfaces:

1. a native, compatible footer preset for Codex itself;
2. a zero-dependency companion line for exact formatting and animation.

## Focused setup

From the repository root:

```powershell
node codex-statusline.mjs --check --preset hud
node codex-statusline.mjs --print --preset hud
node codex-statusline.mjs --install --preset hud
```

`--check` is read-only and asks the installed Codex CLI to parse the item IDs.
`--print` emits a copyable TOML fragment. `--install` is the only command that
writes user configuration; it updates `CODEX_HOME/config.toml` (or
`~/.codex/config.toml`) and creates a timestamped `.bak-*` copy before changing
an existing file.

The focused native preset is exactly:

```toml
[tui]
status_line = ["model-with-reasoning", "weekly-limit", "context-used", "total-input-tokens", "total-output-tokens"]
```

Codex supplies the values and native labels. Its supported config surface does
not allow this repository to control ANSI colors, punctuation, or a continuous
animation.

## Live companion

Open a split terminal pane next to Codex and run:

```powershell
node codex-hud.mjs --watch --cwd (Get-Location)
```

For a one-shot check:

```powershell
node codex-hud.mjs --once --cwd (Get-Location)
```

The line is deliberately fixed and sparse:

```text
model gpt-5.6-luna  │  weekly       [███████████░] 95%  │  context used [█░░░░░░░░░░░] 11%  │  28.8K in · 230 out
```

The model is text-only. Only `weekly` and `context used` have bars. The bars
are 12 cells wide and filled cells cycle through a restrained neon aurora of
violet, cyan, mint, lime, amber, and magenta every 120 ms. The data snapshot
refreshes once per second, so the gradient remains alive when the values are
idle. Set `NO_COLOR` or pipe `--once` to receive plain Unicode output.

The companion reads only:

- the newest matching `session_meta` working directory;
- the latest `turn_context` model;
- the latest `event_msg` with `payload.type == "token_count"`;
- weekly usage from the 10,080-minute rate-limit window;
- model context capacity and total input/output token counts.

It never reads `auth.json`, credentials, prompt text, response text, or
provider secrets. Missing or partially written data produces `--` placeholders
and does not fail the process.

Use `--session <id>` when several Codex sessions share the same directory:

```powershell
node codex-hud.mjs --watch --cwd (Get-Location) --session <session-id>
```

## Other presets

The helper preserves the previous presets for contributors who want more
native information:

- `full`: every useful item exposed by the installed Codex CLI;
- `compact`: model/reasoning, remaining context, both limits, Git branch, and
  run state;
- `hud`: the five-item focused footer described above.

Examples:

```powershell
node codex-statusline.mjs --print --preset full
node codex-statusline.mjs --install --preset compact
```

The project-local `.codex/config.toml` intentionally uses `hud` so a trusted
repository session starts with the calm focused footer. No authentication,
provider, notification, or telemetry settings are stored there.

## Version compatibility

Codex status item IDs are owned by the installed Codex version. Run
`node codex-statusline.mjs --check --preset hud` after upgrading Codex. If a
future version changes the available IDs or rollout schema, update the catalog
and companion parser together, then rerun `node --test`.

Claude remains independent: Claude Code still invokes `hud.mjs`, reads its
JSON stdin payload, and receives the existing one-line ANSI output.
