# hud

Statuslines for AI coding agents: a Claude Code statusline renderer plus a
Codex-native statusline configuration helper and animated companion HUD. All
are zero-dependency Node scripts, organized one folder per host under `src/`.

Core commands:
- `node --test`
- `node src/claude/statusline.mjs < test/fixtures/claude-stdin.json`
- `node src/codex/statusline.mjs --check --preset hud`
- `node src/codex/hud.mjs --once --cwd .`
- `node src/codex/hud.mjs --watch --cwd .`

Claude Code invokes `src/claude/statusline.mjs` through its external
`statusLine.command`. Codex owns its TUI footer and reads only
`CODEX_HOME/config.toml` (default `~/.codex/config.toml`) — a repo-local
`.codex/` directory is never read by Codex and must not be committed. Use
`node src/codex/statusline.mjs --install --preset hud` to configure
`tui.status_line`. The focused HUD starts with the active model, followed by
weekly, context used, and total input/output. The helper also enables Codex's
native status-line theme colors and built-in animations. A new Codex process is
required after changing `config.toml`.

Codex does not provide an external footer command hook. `src/codex/hud.mjs` is
therefore an opt-in standalone companion for a separate terminal pane; it
reads only rollout metadata and token-count events and must not be described as
the native or global footer.

New host integrations go in `src/<host>/`, with tests in `test/<host>/` and a
guide in `docs/guides/<host>.md`. Never add files to the repo root.

The maintained Claude-specific context file is `CLAUDE.md`; this file is the
Codex entry point for repository commands and compatibility rules.
