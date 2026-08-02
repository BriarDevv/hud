# hud

My own Claude Code statusline — a single zero-dependency Node script.

```
Model: Fable 5 | 5h:[--------]2%(4h37m) | wk:[#-------]9%(6d9h) | session:0m | ctx:[##--------]24%
```

Shrinks in stages as the terminal narrows — bars go first, then `Model:`,
then reset times and `session:`, down to bare `5h:2% | wk:9% | ctx:24%`.
Always one line (see `COLUMNS`/`LINES` in [Test](#test)).

## Segments

| Segment | Source | Colors |
|---|---|---|
| `Model:` | stdin `model.display_name` | cyan |
| `5h:` / `wk:` | stdin `rate_limits`, else OAuth usage API (90s cache) | green <70, yellow ≥70, red ≥90 |
| `session:` | first transcript line timestamp | yellow >60m, red >120m |
| `ctx:` | stdin `context_window.used_percentage` (+fallback math) | yellow ≥70, `COMPRESS?` ≥80, `CRITICAL` red ≥85 |

## Install

`~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "node C:/Briar/repos/mine/hud/hud.mjs"
}
```

## Codex CLI

Codex owns its TUI footer and does not execute `hud.mjs` as an external
statusline command. The focused native preset keeps only this order:

```text
model → weekly → context used → total input → total output
```

Install it globally with a recoverable backup:

```powershell
node codex-statusline.mjs --check --preset hud
node codex-statusline.mjs --install --preset hud
```

For the exact aligned layout and living neon gradient, open a split terminal
pane and run the companion there:

```powershell
node codex-hud.mjs --once --cwd (Get-Location)
node codex-hud.mjs --watch --cwd (Get-Location)
```

It renders only `model`, `weekly`, `context used`, and `28.8K in · 230 out`; the
model is text-only and bars exist only on the first two groups. The companion
reads Codex rollout metadata, the active model, and token-count events only. It
never reads credentials or prompt/response text.
The existing `full` and `compact` native presets remain available. See
[docs/codex-statusline.md](docs/codex-statusline.md) for the native/companion
boundary, animation behavior, backup flow, and version notes.

## Test

```
node hud.mjs < test/sample-stdin.json
echo {} | node hud.mjs
COLUMNS=35 node hud.mjs < test/sample-stdin.json   # narrow terminal: shrinks
node --test                                      # Claude/Codex regression tests
```

Born as a replacement for the OMC HUD (reverse-engineered spec, reimplemented
clean: stdin-first, graceful degradation, no state, no hooks).
