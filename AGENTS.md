# hud

Standalone Claude Code statusline renderer plus a Codex-native statusline
configuration helper. Both use zero-dependency Node scripts.

Core commands:
- `node hud.mjs < test/sample-stdin.json`
- `node codex-statusline.mjs --check`
- `node codex-statusline.mjs --print --preset full`
- `node --test`

Claude Code invokes `hud.mjs` through its external `statusLine.command`.
Codex owns its TUI footer and uses `.codex/config.toml` or the explicit
`codex-statusline.mjs --install` command to configure `tui.status_line`.

The maintained Claude-specific context file is `CLAUDE.md`; this file is the
Codex entry point for repository commands and compatibility rules.
