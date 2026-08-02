# hud

Standalone Claude Code statusline renderer plus a Codex-native statusline
configuration helper and animated companion HUD. All use zero-dependency Node
scripts.

Core commands:
- `node hud.mjs < test/sample-stdin.json`
- `node codex-statusline.mjs --check --preset hud`
- `node codex-hud.mjs --once --cwd .`
- `node codex-hud.mjs --watch --cwd .`
- `node --test`

Claude Code invokes `hud.mjs` through its external `statusLine.command`.
Codex owns its TUI footer and uses `.codex/config.toml` or the explicit
`codex-statusline.mjs --install --preset hud` command to configure
`tui.status_line`. The focused HUD starts with the active model, followed by
weekly, context used, and total input/output. The companion reads only rollout
metadata and token-count events because Codex does not provide an external
footer command hook.

The maintained Claude-specific context file is `CLAUDE.md`; this file is the
Codex entry point for repository commands and compatibility rules.
