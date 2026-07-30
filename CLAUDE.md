# hud

Standalone Claude Code statusline: one zero-dependency Node script rendering
model, 5h/weekly rate-limit bars, session timer, and context bar. Replaces
the OMC HUD.

## Commands

- `node hud.mjs < test/sample-stdin.json` — render with the sample payload
  (run from the repo root: the sample's transcript_path is relative)
- `echo '{}' | node hud.mjs` — exercise the OAuth usage-API fallback path

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

## Hard constraints

- Never log to stdout except the single statusline line — Claude Code
  renders whatever this script prints.
- The script must never exit non-zero or throw: degrade by omitting
  segments (worst case prints a dim `hud: err`).
