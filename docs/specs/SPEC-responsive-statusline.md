# SPEC: Responsive statusline wrap

## Problem

`hud.mjs` renders one long line. On a narrow terminal, the segments get
truncated/wrapped by the terminal itself, mid-segment, instead of wrapping
cleanly at segment boundaries.

## Design

- `visibleWidth(str)`: strips ANSI escape codes (`/\x1b\[[0-9;]*m/g`) and
  returns the remaining length, since rendered segments carry color codes
  that don't count toward on-screen width.
- `wrapSegments(segments, width)`: greedily packs segments (in existing
  order) onto lines. A segment joins the current line if
  `currentLineWidth + SEP_WIDTH(3) + segmentWidth <= width`; otherwise it
  starts a new line. If a line is empty, the segment is placed on it
  regardless of width (extreme-narrow case: never drop or truncate
  content, let it overflow the terminal visually).
- Width source: `parseInt(process.env.COLUMNS, 10)`. Claude Code sets
  `COLUMNS`/`LINES` to the live terminal size before invoking the script
  (v2.1.153+). Falls back to `80` when unset or not a valid number
  (older Claude Code, or running the script manually) — chosen so the
  default leans toward wrapping rather than assuming a wide terminal.
- `main()` joins wrapped lines with `\n` and prints them in a single
  `console.log` call — still "the one statusline print", just
  potentially multi-line. Claude Code renders each line as its own row.

## Data flow

No new inputs beyond what's already read, plus `process.env.COLUMNS` (new).

## Error handling

Unchanged: everything still runs inside `main().catch(() =>
console.log(dim("hud: err")))`. A malformed `COLUMNS` value degrades
gracefully (fallback width), never throws.

## Testing

- `node hud.mjs < test/sample-stdin.json` — default width (no COLUMNS in
  a piped test run → fallback 80, likely wraps to 2 lines given current
  segment lengths).
- `COLUMNS=200 node hud.mjs < test/sample-stdin.json` (bash) /
  `$env:COLUMNS=200; node hud.mjs < test/sample-stdin.json` (PowerShell)
  — wide terminal, single line.
- `COLUMNS=40 node hud.mjs < test/sample-stdin.json` — narrow, multiple
  lines, no mid-segment cuts.

## Out of scope

- No config for wrap threshold or max lines.

## Superseded

A follow-up spec revises the narrow-terminal strategy: instead of (or in
addition to) wrapping to extra lines, segments shrink to bare percentages
when the terminal narrows. See the newer spec once written.

## Reverted

An earlier iteration of this change also added an `fb:` segment sourced
from an assumed `rate_limits.fable` stdin field. That field doesn't exist
— Claude Code's real stdin only ever sends `rate_limits.five_hour` and
`rate_limits.seven_day` (confirmed by dumping live stdin). The
Fable-specific weekly limit shown in Claude Desktop comes from a
differently-shaped `limits` array in the OAuth usage API
(`/api/oauth/usage`), not from stdin at all, and reaching it would require
always hitting that API even when stdin already has rate-limit data. This
was reverted; `fb:` does not exist in the codebase.
