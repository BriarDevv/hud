# hud

My own Claude Code statusline — a single zero-dependency Node script.

```
Model: Fable 5 | 5h:[--------]2%(4h37m) | wk:[#-------]9%(6d9h) | session:0m | ctx:[##--------]24%
```

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

## Test

```
node hud.mjs < test/sample-stdin.json
echo {} | node hud.mjs
```

Born as a replacement for the OMC HUD (reverse-engineered spec, reimplemented
clean: stdin-first, graceful degradation, no state, no hooks).
