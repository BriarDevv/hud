# Codex Model Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the active Codex model as the first text-only block in the native footer and animated companion HUD.

**Architecture:** Extend the companion snapshot with a model field extracted from `turn_context.payload.model`; `renderLine` prepends a fixed `model <name>` group while preserving all existing bar behavior. Extend the native `hud` preset with the supported `model-with-reasoning` item and update docs/global config.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, standard-library filesystem parsing, existing ANSI renderer.

## Global Constraints

- Preserve Claude's existing renderer and the `full` and `compact` Codex presets.
- Keep model text-only; only weekly and context used may contain bars.
- Read only Codex rollout metadata and token-count fields; never read credentials or conversation text.
- Keep zero dependencies and Node.js 18+ compatibility.
- Write and observe failing tests before production changes.
- Global installation remains explicit and creates a recoverable backup.

---

### Task 1: Add model extraction, layout, and native preset coverage

**Files:**
- Modify: `test/codex-hud.test.mjs`
- Modify: `codex-hud.mjs`
- Modify: `test/codex-statusline.test.mjs`
- Modify: `codex-statusline.mjs`
- Modify: `.codex/config.toml`

**Interfaces:**
- `parseTurnContextEvent(event)` returns a model string or `null`.
- `readSessionSnapshot(path)` returns the latest `{ model, weeklyPercent, contextPercent, inputTokens, outputTokens }`.
- `renderLine(snapshot, options)` starts with `model <name>` and uses `model --` when absent.
- `PRESETS.hud` is `["model-with-reasoning", "weekly-limit", "context-used", "total-input-tokens", "total-output-tokens"]`.

- [ ] **Step 1: Write failing tests**

Add a `turn_context` fixture and assert model extraction, model-first output,
`model --` fallback, session snapshot model retention, and the exact native
five-item preset.

- [ ] **Step 2: Run the focused tests and observe expected failures**

Run: `node --test test/codex-hud.test.mjs test/codex-statusline.test.mjs`

Expected: failures because the model field and new native preset are absent.

- [ ] **Step 3: Implement the minimum model support**

Parse only `turn_context.payload.model`, carry the latest model while scanning
the bounded session tail, prepend `model <name>` in `renderLine`, and add the
native item before weekly. Update the project-local TOML to match.

- [ ] **Step 4: Run the focused tests and syntax checks**

Run:

```powershell
node --test test/codex-hud.test.mjs test/codex-statusline.test.mjs
node --check codex-hud.mjs
node --check codex-statusline.mjs
```

Expected: all focused tests pass with exit code 0.

- [ ] **Step 5: Commit the feature**

```powershell
git add codex-hud.mjs codex-statusline.mjs .codex/config.toml test docs
git commit -m "feat: add Codex model to focused HUD"
```

### Task 2: Update documentation, install globally, and publish

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/codex-statusline.md`
- Modify: `docs/superpowers/specs/2026-08-02-codex-live-hud-design.md`

- [ ] **Step 1: Update examples and native/companion contracts**

Document the model-first line and five-item native preset while retaining the
split-pane animation instructions.

- [ ] **Step 2: Run the full verification suite**

Run `node --test`, all three `node --check` commands,
`node codex-statusline.mjs --check --preset hud`, and
`node codex-hud.mjs --once --cwd C:\Users\nicol`.

- [ ] **Step 3: Install the approved native preset globally**

Run `node codex-statusline.mjs --install --preset hud` and verify the global
`status_line` array and timestamped backup.

- [ ] **Step 4: Merge, push, verify remote, and clean the worktree**

Fast-forward `main`, rerun the suite on merged `main`, push `origin/main`,
confirm local and remote SHAs match, and remove the merged feature worktree.
