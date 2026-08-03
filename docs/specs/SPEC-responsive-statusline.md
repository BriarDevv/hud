# SPEC: Responsive statusline shrink

## Problem

`src/claude/statusline.mjs` renders one long line. On a narrow terminal, the segments get
truncated/wrapped by the terminal itself, mid-segment, instead of
degrading cleanly.

## Design

Content shrinks in stages instead of wrapping to extra lines. Four detail
levels, most to least detailed, drop order: bars, then `Model:`, then
reset times + `session:` together (down to bare `label:%`):

- L0 (full): `Model: X | 5h:[bar]N%(reset) | wk:[bar]N%(reset) | session:Nm | ctx:[bar]N%`
- L1 (no bars): `Model: X | 5h:N%(reset) | wk:N%(reset) | session:Nm | ctx:N%`
- L2 (no Model): `5h:N%(reset) | wk:N%(reset) | session:Nm | ctx:N%`
- L3 (bare): `5h:N% | wk:N% | ctx:N%`

`renderLine(levels, width)` tries each level in order and returns the
first whose visible width (ANSI-stripped) fits `width` on one line. If
even L3 doesn't fit, it's printed anyway — overflow, never truncated or
wrapped.

- `limitSegment`/`contextSegment` gain `showBar`/`showReset` options
  (default `true`) so each level reuses the same segment builders instead
  of duplicating formatting logic.
- `buildLevels(stdin, limits)` builds all 4 candidate segment lists.
- `visibleWidth(str)`: strips ANSI escape codes (`/\x1b\[[0-9;]*m/g`) to
  measure on-screen width, since rendered segments carry color codes that
  don't count toward it.
- Width source: `parseInt(process.env.COLUMNS, 10)`. Claude Code sets
  `COLUMNS`/`LINES` to the live terminal size before invoking the script
  (v2.1.153+). Falls back to `80` when unset or not a valid number.
- No fixed column thresholds — each level's fit is measured against the
  actual rendered width, so it adapts to whatever data is present (e.g.
  shorter reset strings, missing rate-limit data) rather than assuming a
  content length.

## Data flow

No new inputs beyond what's already read, plus `process.env.COLUMNS`.

## Error handling

Unchanged: everything still runs inside `main().catch(() =>
console.log(dim("hud: err")))`. A malformed `COLUMNS` value degrades
gracefully (fallback width), never throws.

## Testing

- `node src/claude/statusline.mjs < test/fixtures/claude-stdin.json` — default width (fallback 80).
- `COLUMNS=200/90/60/35/15 node src/claude/statusline.mjs < test/fixtures/claude-stdin.json` — walks
  through all 4 levels down to overflow.
- `echo {} | node src/claude/statusline.mjs` at various `COLUMNS` — same levels via the
  OAuth usage-API fallback path.

## Out of scope

- No config for level thresholds.
- No multi-line wrap — always a single line.

## Reverted

An earlier iteration of this change added multi-line wrapping instead of
shrinking, and separately an `fb:` segment for a `rate_limits.fable`
stdin field that turned out not to exist (see git history / prior commits
on this branch for the discarded designs). Neither survived: wrapping was
replaced by this staged shrink, and the Fable-specific weekly limit
Claude Desktop shows comes from a differently-shaped `limits` array in
the OAuth usage API, not stdin — out of scope here.
