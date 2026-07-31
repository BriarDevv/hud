# SPEC: Responsive statusline + Fable limit segment

## Problem

`hud.mjs` renders one long line. On a narrow terminal, the segments get
truncated/wrapped by the terminal itself, mid-segment, instead of wrapping
cleanly at segment boundaries. Separately, there's no segment for the
`fable` rate-limit window Claude Code can send in `rate_limits`.

## Design

### 1. Responsive wrap

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

### 2. `fb:` segment (Fable limit)

- `limitsFromStdin`: adds `fable: { pct: rl.fable?.used_percentage,
  resetsAt: rl.fable?.resets_at }` to the returned object. The "no data"
  early-return now also checks `rl?.fable?.used_percentage`.
- `limitsFromApi`: sets `fable: { pct: undefined, resetsAt: undefined }`
  since the OAuth usage API doesn't expose this field — the segment
  silently doesn't render when limits come from this fallback.
- `main()`: inserts `limitSegment("fb", limits.fable.pct,
  limits.fable.resetsAt, { dimLabel: true })` between `wk` and `session`.
  Final order: `Model | 5h | wk | fb | session | ctx`.
- `dimLabel: true` — matches `wk`'s dim label styling (user's explicit
  call, not derived from any confirmed semantics of the `fable` window).

## Data flow

No new inputs beyond what's already read: `process.env.COLUMNS` (new)
and `stdin.rate_limits.fable` (new, optional).

## Error handling

Unchanged: everything still runs inside `main().catch(() =>
console.log(dim("hud: err")))`. A malformed `COLUMNS` value or missing
`fable` field degrades gracefully (fallback width / segment omitted),
never throws.

## Testing

- `node hud.mjs < test/sample-stdin.json` — default width (no COLUMNS in
  a piped test run → fallback 80, likely wraps to 2 lines given current
  segment lengths).
- `COLUMNS=200 node hud.mjs < test/sample-stdin.json` (bash) /
  `$env:COLUMNS=200; node hud.mjs < test/sample-stdin.json` (PowerShell)
  — wide terminal, single line.
- `COLUMNS=40 node hud.mjs < test/sample-stdin.json` — narrow, multiple
  lines, no mid-segment cuts.
- `test/sample-stdin.json` gets a `rate_limits.fable` entry so `fb:`
  renders in the sample run.

## Out of scope

- No config for wrap threshold or max lines.
- No change to how segments are prioritized/dropped — nothing is ever
  dropped, only wrapped.
