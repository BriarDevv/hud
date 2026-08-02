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
statusline command. This repo provides a native `tui.status_line` preset with
model/reasoning, context, rate limits, tokens, Git, project, run state, task,
session, version, and action fields.

```bash
node codex-statusline.mjs --check                 # read-only validation
node codex-statusline.mjs --print --preset full   # print TOML
node codex-statusline.mjs --install --preset full # update CODEX_HOME safely
node codex-statusline.mjs --install --preset compact
```

The project-local `.codex/config.toml` applies the full preset when Codex runs
from this trusted repository. See [docs/codex-statusline.md](docs/codex-statusline.md)
for the field list, backup behavior, and version notes.

## Test

```
node hud.mjs < test/sample-stdin.json
echo {} | node hud.mjs
COLUMNS=35 node hud.mjs < test/sample-stdin.json   # narrow terminal: shrinks
node --test                                      # Claude/Codex regression tests
```

Born as a replacement for the OMC HUD (reverse-engineered spec, reimplemented
clean: stdin-first, graceful degradation, no state, no hooks).
