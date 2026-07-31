# hud

Standalone Claude Code statusline: one zero-dependency Node script rendering
model, 5h/weekly rate-limit bars, session timer, and context bar. Replaces
the OMC HUD.

## Commands

- `node hud.mjs < test/sample-stdin.json` — render with the sample payload
  (run from the repo root: the sample's transcript_path is relative)
- `echo '{}' | node hud.mjs` — exercise the OAuth usage-API fallback path
- `COLUMNS=35 node hud.mjs < test/sample-stdin.json` — simulate a narrow
  terminal to check the shrink (PowerShell: `$env:COLUMNS=35; node hud.mjs
  < test/sample-stdin.json`)

## Gotchas

- Claude Code pipes the statusline JSON on stdin (`rate_limits`,
  `context_window`, `model`, `transcript_path`); the OAuth fallback only
  fires when stdin carries no rate limits. Fallback reads
  `~/.claude/.credentials.json` and never refreshes the token (Claude Code
  keeps it fresh) — an expired token silently drops the bars, by design.
- Usage-API responses cache 90s in `%TEMP%/hud-usage-cache.json`.
- Session start is parsed from the FIRST line of the transcript (head read);
  a missing/unreadable transcript renders `session:0m`, not an error.
- Wired in `~/.claude/settings.json` → `statusLine.command`; changes to
  hud.mjs apply on the next statusline refresh, no restart needed.
- Terminal width comes from the `COLUMNS` env var, which Claude Code sets
  to the live terminal size before each run (v2.1.153+) — `tput cols` and
  `process.stdout.columns` don't work since our stdout is captured, not
  connected to the terminal. Falls back to 80 when `COLUMNS` is absent or
  invalid. `buildLevels()` renders 4 detail levels (full → no bars → no
  Model → bare `label:%`); `renderLine()` picks the most detailed one that
  fits on one line, printing the barest level anyway (overflow) if even
  that doesn't fit. Never wraps to multiple lines, never truncates text.
- The script only re-runs (and re-reads `COLUMNS`) on Claude Code's normal
  refresh triggers — new assistant message, `/compact` finishing, a
  permission-mode change, vim-mode toggle, or a `refreshInterval` timer.
  Resizing the terminal alone does NOT trigger a refresh: the shrink/grow
  only becomes visible next time one of those events fires, not live as
  you drag the window edge.

## Hard constraints

- Never print anything to stdout other than the statusline content —
  Claude Code renders whatever this script prints. Always a single line
  (content shrinks to fit narrow terminals instead of wrapping).
- The script must never exit non-zero or throw: degrade by omitting
  segments (worst case prints a dim `hud: err`).
