## What

<!-- One paragraph: the change. -->

## Why

<!-- The problem or requirement this addresses. Link issues/specs. -->

## How verified

- [ ] `node --test` passes
- [ ] `node src/claude/statusline.mjs < test/fixtures/claude-stdin.json` renders correctly
- [ ] `echo {} | node src/claude/statusline.mjs` degrades gracefully
- [ ] Still zero-dependency, single output line, never throws
- [ ] No new files in the repo root; branch is rebased on `main`
