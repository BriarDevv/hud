# Contributing to hud

## Workflow

- Branch from `main`: `feat/<topic>` or `fix/<topic>`.
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`.

## Before opening a PR

Run both and eyeball the output:

```
node hud.mjs < test/sample-stdin.json
echo {} | node hud.mjs
```

The script must stay zero-dependency, never throw, and print exactly one line.

## Merging

Squash or rebase; keep `main` linear.
