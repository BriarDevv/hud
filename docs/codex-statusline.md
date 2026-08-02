# Codex native statusline

Codex CLI owns its TUI footer. It does not execute `hud.mjs` as an external
statusline command, so the Codex integration configures the native
`tui.status_line` array instead of starting a second renderer.

## Quick start

From the repository root:

```bash
node codex-statusline.mjs --check
node codex-statusline.mjs --print --preset full
node codex-statusline.mjs --install --preset full
```

`--check` is read-only and validates the preset against the installed Codex
CLI. `--print` is read-only and emits a copyable TOML fragment. `--install` is
the only command that writes user configuration; it updates
`CODEX_HOME/config.toml` (or `~/.codex/config.toml`) and creates a timestamped
`.bak-*` copy before changing an existing file.

The repository also contains `.codex/config.toml`, which applies the full
preset to Codex sessions started in this repository after the project is
trusted. It contains no authentication, provider, notification, or telemetry
settings.

## Presets

### `full` (default)

The full preset shows every useful footer item exposed by the installed Codex
CLI, in this order:

| Item | What it shows |
|---|---|
| `model-with-reasoning` | Active model and reasoning effort |
| `context-used` | Context already consumed |
| `context-remaining` | Context capacity remaining |
| `five-hour-limit` | Account five-hour rate limit |
| `weekly-limit` | Account weekly rate limit |
| `used-tokens` | Tokens used by the current thread |
| `total-input-tokens` | Total input tokens |
| `total-output-tokens` | Total output tokens |
| `git-branch` | Current Git branch |
| `current-dir` | Current working directory |
| `project-name` | Codex project name/root label |
| `run-state` | Current run state |
| `task-progress` | Active task progress |
| `fast-mode` | Fast service-tier state |
| `thread-id` | Current session/thread ID |
| `thread-title` | Current thread title |
| `codex-version` | Installed Codex version |
| `actions` | Available or active TUI actions |

The full preset favors information completeness and may be dense on narrow
terminals.

### `compact`

Use this when the full footer is too wide:

```bash
node codex-statusline.mjs --install --preset compact
```

It keeps model/reasoning, remaining context, both rate limits, Git branch, and
run state. Codex's `/statusline` command can reorder or hide individual items
after installation.

## Version compatibility

Codex status item IDs are owned by the installed Codex version. Run
`node codex-statusline.mjs --check` after upgrading Codex. If a future version
changes the available IDs, update the catalog in `codex-statusline.mjs` and the
project-local `.codex/config.toml` together, then rerun `node --test`.

Claude remains independent: Claude Code still invokes `hud.mjs`, reads its JSON
stdin payload, and receives the existing one-line ANSI output. The Codex
helper never reads Claude credentials or the Anthropic usage API.
