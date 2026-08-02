# Codex Live HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact animated Codex HUD and make the native Codex footer show only weekly, context used, and total input/output tokens.

**Architecture:** `codex-statusline.mjs` remains the native configuration catalog and gains a `hud` preset. `codex-hud.mjs` is a zero-dependency companion that reads only sanitized token-count metadata from the newest matching Codex rollout file, renders a fixed-width ANSI/Unicode line, and optionally animates it in watch mode. Claude's `hud.mjs` stays unchanged.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, standard-library `fs`, `os`, `path`, and ANSI truecolor escape sequences with a plain-text fallback.

## Global Constraints

- Preserve Claude's existing renderer and all previous Codex presets.
- Use only Codex's supported `tui.status_line` IDs for the native footer.
- The companion must never read or print credentials, prompt text, response text, or provider secrets.
- Keep the repository zero-dependency and compatible with Node.js 18+ on Windows, macOS, and Linux.
- Write tests before new production behavior and observe the expected failures.
- Global installation remains explicit and creates a recoverable config backup.

---

### Task 1: Lock the focused native preset and fixture contracts

**Files:**
- Modify: `test/codex-statusline.test.mjs`
- Modify: `codex-statusline.mjs`
- Modify: `.codex/config.toml`

**Interfaces:**
- `PRESETS.hud` returns `['weekly-limit', 'context-used', 'total-input-tokens', 'total-output-tokens']`.
- `presetItems('hud')` returns a new array in that order.
- `renderToml(PRESETS.hud)` emits only the four native IDs.

- [ ] **Step 1: Write the failing native preset tests**

Append tests asserting the exact `hud` array, its no-duplicate property, and
that the project-local TOML matches `renderToml(PRESETS.hud)`.

- [ ] **Step 2: Run the focused test and verify it fails because `hud` is absent**

Run: `node --test test/codex-statusline.test.mjs`

Expected: the new preset assertions fail while the existing tests remain
green.

- [ ] **Step 3: Implement the `hud` preset and update project config**

Add the four-item preset without changing `full` or `compact`, then replace
the project-local `status_line` assignment with the generated `hud` array.

- [ ] **Step 4: Run the focused suite and verify it passes**

Run: `node --test test/codex-statusline.test.mjs`

Expected: all existing and new native preset tests pass.

- [ ] **Step 5: Commit the native preset**

```powershell
git add codex-statusline.mjs .codex/config.toml test/codex-statusline.test.mjs
git commit -m "feat: add focused Codex HUD preset"
```

### Task 2: Build the pure Codex snapshot and visual renderer

**Files:**
- Create: `codex-hud.mjs`
- Create: `test/codex-hud.test.mjs`

**Interfaces:**
- `parseTokenCountEvent(event)` returns `{ weeklyPercent, contextPercent, inputTokens, outputTokens }` with nullable numeric fields.
- `formatTokenCount(value)` returns compact decimal text or `--`.
- `renderBar(percent, options)` returns a fixed-width string with optional ANSI colors.
- `renderLine(snapshot, options)` returns the three ordered groups and no other data.

- [ ] **Step 1: Write failing renderer tests**

Create a fixture token-count event and tests for extraction, compact numbers,
fixed bars, ordered labels, and the absence of extra fields:

```js
test('renders only weekly, context used, and input/output in order', () => {
  const line = renderLine({ weeklyPercent: 95, contextPercent: 11, inputTokens: 28777, outputTokens: 230 }, { color: false, phase: 0 });
  assert.equal(line, 'weekly       [███████████░] 95%  │  context used [█░░░░░░░░░░░] 11%  │  28.8K in · 230 out');
  assert.ok(line.indexOf('weekly') < line.indexOf('context used'));
  assert.ok(line.indexOf('context used') < line.indexOf('28.8K in'));
  assert.doesNotMatch(line, /model|ready|fast|uuid|version|session|remaining/i);
});
```

- [ ] **Step 2: Run the renderer tests and verify the expected missing-module failure**

Run: `node --test test/codex-hud.test.mjs`

Expected: failure because `codex-hud.mjs` does not exist yet.

- [ ] **Step 3: Implement the minimum pure renderer**

Implement the parser, clamping, compact decimal formatter, fixed 12-cell bar,
HSL-to-RGB rainbow phase, ANSI truecolor output, and plain-text fallback.
Keep the line format exactly as the test specifies.

- [ ] **Step 4: Run the renderer tests and verify they pass**

Run: `node --test test/codex-hud.test.mjs`

Expected: all renderer tests pass with no warnings.

- [ ] **Step 5: Commit the pure renderer**

```powershell
git add codex-hud.mjs test/codex-hud.test.mjs
git commit -m "feat: add animated Codex HUD renderer"
```

### Task 3: Add safe rollout discovery and watch mode

**Files:**
- Modify: `codex-hud.mjs`
- Modify: `test/codex-hud.test.mjs`

**Interfaces:**
- `resolveCodexHome(env, home)` resolves `CODEX_HOME` or the platform home.
- `findLatestSession({ codexHome, cwd, sessionId, fsModule })` returns a rollout path or `null`.
- `readSessionSnapshot(path, fsModule)` returns the latest safe token-count snapshot.
- `parseArgs(argv)` supports `--once`, `--watch`, `--cwd`, and `--session`.

- [ ] **Step 1: Add failing fixture tests for selection and reading**

Create two temporary rollout files with different `session_meta.cwd` values
and token-count events. Assert that matching cwd chooses the newest file and
that the parser ignores unrelated event types and malformed trailing lines.

- [ ] **Step 2: Run the focused tests and verify selection APIs are missing**

Run: `node --test test/codex-hud.test.mjs`

Expected: the new tests fail because the discovery exports are not present.

- [ ] **Step 3: Implement read-only discovery and incremental-safe parsing**

Walk only `CODEX_HOME/sessions`, match `session_meta.payload.cwd` case
insensitively on Windows, prefer `--session` when provided, and inspect a
bounded tail so a long history cannot make each refresh expensive. Ignore
partial JSON lines caused by a concurrent Codex write.

- [ ] **Step 4: Add failing CLI parsing tests, then implement `--once` and `--watch`**

Test defaults and conflicting flags first. Implement one-shot output for
scripts and a watch loop that polls data once per second, advances the color
phase every 120 ms, erases only its own line, and exits cleanly on SIGINT.

- [ ] **Step 5: Run all HUD tests and commit**

Run: `node --test test/codex-hud.test.mjs`

```powershell
git add codex-hud.mjs test/codex-hud.test.mjs
git commit -m "feat: watch Codex rollout data for live HUD"
```

### Task 4: Align installation, docs, and global Codex configuration

**Files:**
- Modify: `codex-statusline.mjs`
- Modify: `README.md`
- Modify: `docs/codex-statusline.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-02-codex-live-hud-design.md`

**Interfaces:**
- CLI help lists `--preset hud`.
- Explicit `node codex-statusline.mjs --install --preset hud` updates only
  `[tui].status_line`, creates one timestamped backup, and leaves the
  companion available at `node codex-hud.mjs --watch`.

- [ ] **Step 1: Write failing documentation/config alignment tests**

Assert that help includes `hud`, `--print --preset hud` contains the four
focused IDs, and the docs mention the exact PowerShell command and no-secret
read behavior.

- [ ] **Step 2: Run the tests and verify the new assertions fail**

Run: `node --test`

Expected: alignment assertions fail because the new preset/help/docs are not
present.

- [ ] **Step 3: Implement CLI/docs updates**

Add the preset to argument validation and usage text, update all Codex docs to
describe native-vs-companion behavior, and keep `full` as the CLI default for
backward compatibility. Update project config to `hud`.

- [ ] **Step 4: Run syntax, tests, and native Codex validation**

Run:

```powershell
node --check codex-statusline.mjs
node --check codex-hud.mjs
node --test
node codex-statusline.mjs --check --preset hud
node codex-statusline.mjs --print --preset hud
node codex-hud.mjs --once --cwd C:\Users\nicol
```

Expected: exit code 0, all tests pass, Codex accepts the four IDs, and the
one-shot line contains the three groups in order.

- [ ] **Step 5: Install the focused preset globally after verification**

Run: `node codex-statusline.mjs --install --preset hud`

Confirm the resulting `CODEX_HOME/config.toml` has only the four focused IDs
in `[tui].status_line` and note the backup path.

- [ ] **Step 6: Commit final docs and configuration**

```powershell
git add AGENTS.md CLAUDE.md README.md docs .codex/config.toml codex-statusline.mjs
git commit -m "docs: document the live Codex HUD workflow"
```

### Task 5: Final verification, merge, and push

**Files:**
- No new files; inspect the complete branch diff.

- [ ] **Step 1: Run the complete verification suite**

Run `node --test`, `node --check hud.mjs`, `node --check codex-statusline.mjs`,
`node --check codex-hud.mjs`, `node codex-statusline.mjs --check --preset hud`,
and the one-shot companion command.

- [ ] **Step 2: Inspect status and diff for accidental files or secrets**

Run `git status --short`, `git diff main...HEAD --stat`, and search changed
files for `auth.json`, `accessToken`, `Bearer`, or credential-like content.

- [ ] **Step 3: Merge the verified branch into `main` and push `origin/main`**

From the main checkout, fast-forward merge `codex-live-hud`, verify the main
worktree is clean, then push the commit to `origin main`.
