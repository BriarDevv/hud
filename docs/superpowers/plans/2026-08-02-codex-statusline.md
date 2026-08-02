# Codex Native Statusline Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a zero-dependency Codex-native statusline preset, validator, and safe installer while preserving the existing Claude HUD unchanged.

**Architecture:** `codex-statusline.mjs` is the single source of truth for Codex footer item IDs, presets, TOML generation, config editing, and CLI behavior. Codex consumes the generated `tui.status_line` through its native TUI; `hud.mjs` remains a separate Claude stdin renderer. A project-local `.codex/config.toml`, documentation, and Node built-in tests make the integration discoverable and reproducible.

**Tech Stack:** Node.js 18+ ESM, Node built-in `node:test`, Node standard-library `fs`, `os`, `path`, `child_process`, and TOML text emitted/updated without third-party dependencies.

## Global Constraints

- Claude's `hud.mjs` renderer, OAuth fallback, cache behavior, transcript parsing, and responsive output must remain behavior-compatible.
- Codex integration must use the supported native `tui.status_line` configuration surface; no private API or external Codex footer process.
- Normal commands must not modify global configuration; only explicit `--install` may write `CODEX_HOME/config.toml`.
- `--install` must preserve unrelated TOML content and create a timestamped backup before changing an existing file.
- The repository remains zero-dependency and must run on Windows, macOS, and Linux with Node.js 18+.
- Tests must run with `node --test` and must not require network access or credentials.
- All new production behavior is written after a failing test demonstrates it.

---

### Task 1: Add the tested Codex catalog, presets, and TOML/config transformation core

**Files:**
- Create: `test/codex-statusline.test.mjs`
- Create: `codex-statusline.mjs`

**Interfaces:**
- Produces `STATUS_LINE_ITEMS`, `PRESETS`, `presetItems(name)`, `renderToml(items)`, and `updateConfigText(text, items)` as named ESM exports.
- `STATUS_LINE_ITEMS` contains exactly the current Codex IDs in this order: `model-with-reasoning`, `context-used`, `context-remaining`, `five-hour-limit`, `weekly-limit`, `used-tokens`, `total-input-tokens`, `total-output-tokens`, `git-branch`, `current-dir`, `project-name`, `run-state`, `task-progress`, `fast-mode`, `thread-id`, `thread-title`, `codex-version`, `actions`.
- `PRESETS.full` equals `STATUS_LINE_ITEMS`; `PRESETS.compact` contains `model-with-reasoning`, `context-remaining`, `five-hour-limit`, `weekly-limit`, `git-branch`, and `run-state`.
- `renderToml(items)` returns `[tui]` plus one `status_line = [...]` assignment with JSON-compatible quoted strings.
- `updateConfigText(text, items)` returns `{ text: string, changed: boolean }`, preserving unrelated lines and comments while replacing or inserting only `[tui].status_line`.

- [ ] **Step 1: Write failing tests for the catalog and TOML rendering**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS,
  STATUS_LINE_ITEMS,
  presetItems,
  renderToml,
  updateConfigText,
} from '../codex-statusline.mjs';

const FULL = [
  'model-with-reasoning', 'context-used', 'context-remaining',
  'five-hour-limit', 'weekly-limit', 'used-tokens',
  'total-input-tokens', 'total-output-tokens', 'git-branch',
  'current-dir', 'project-name', 'run-state', 'task-progress',
  'fast-mode', 'thread-id', 'thread-title', 'codex-version', 'actions',
];

test('full preset contains every supported Codex footer item once', () => {
  assert.deepEqual(STATUS_LINE_ITEMS, FULL);
  assert.deepEqual(PRESETS.full, FULL);
  assert.equal(new Set(PRESETS.full).size, PRESETS.full.length);
});

test('compact preset keeps the high-signal footer items', () => {
  assert.deepEqual(presetItems('compact'), [
    'model-with-reasoning', 'context-remaining', 'five-hour-limit',
    'weekly-limit', 'git-branch', 'run-state',
  ]);
});

test('unknown preset is rejected', () => {
  assert.throws(() => presetItems('wide'), /unknown preset/i);
});

test('renderToml emits a complete native Codex fragment', () => {
  const toml = renderToml(PRESETS.compact);
  assert.match(toml, /^\[tui\]\nstatus_line = \[/);
  assert.match(toml, /"model-with-reasoning"/);
  assert.match(toml, /"run-state"/);
  assert.doesNotMatch(toml, /token|secret|password|auth/i);
});
```

- [ ] **Step 2: Run the focused test to verify it fails for the expected reason**

Run: `node --test test/codex-statusline.test.mjs`

Expected: FAIL because `codex-statusline.mjs` does not exist yet; no test should fail from a syntax error in the test itself.

- [ ] **Step 3: Implement the minimal catalog and TOML/config transformation**

Implement `codex-statusline.mjs` with these pure definitions before adding CLI side effects:

```js
export const STATUS_LINE_ITEMS = Object.freeze([
  'model-with-reasoning', 'context-used', 'context-remaining',
  'five-hour-limit', 'weekly-limit', 'used-tokens',
  'total-input-tokens', 'total-output-tokens', 'git-branch',
  'current-dir', 'project-name', 'run-state', 'task-progress',
  'fast-mode', 'thread-id', 'thread-title', 'codex-version', 'actions',
]);

export const PRESETS = Object.freeze({
  full: Object.freeze([...STATUS_LINE_ITEMS]),
  compact: Object.freeze([
    'model-with-reasoning', 'context-remaining', 'five-hour-limit',
    'weekly-limit', 'git-branch', 'run-state',
  ]),
});

export function presetItems(name = 'full') {
  const items = PRESETS[name];
  if (!items) throw new Error(`Unknown preset: ${name}`);
  return [...items];
}

export function renderToml(items) {
  return `[tui]\nstatus_line = ${JSON.stringify(items)}\n`;
}
```

Implement `updateConfigText` as a line-preserving updater. It must detect the exact `[tui]` header, replace one existing `status_line` assignment, insert the assignment before the next table when `[tui]` exists without the key, or append a new `[tui]` table when absent. Throw on duplicate `status_line` assignments inside `[tui]` or an array-table header `[[tui]]` so malformed configuration is not silently rewritten. Preserve CRLF when the input uses CRLF.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `node --test test/codex-statusline.test.mjs`

Expected: PASS for all catalog, preset, rendering, and config transformation cases.

- [ ] **Step 5: Commit the core**

```powershell
git add codex-statusline.mjs test/codex-statusline.test.mjs
git commit -m "feat: add tested Codex statusline catalog"
```

### Task 2: Add CLI parsing, Codex validation, and safe global installation

**Files:**
- Modify: `codex-statusline.mjs`
- Modify: `test/codex-statusline.test.mjs`

**Interfaces:**
- Produces `parseArgs(argv)`, `resolveCodexConfigPath(env, home)`, `formatBackupPath(configPath, now)`, and `installPreset({ configPath, items, now, fsModule })` exports.
- CLI supports `--print`, `--check`, `--install`, `--preset full`, `--preset compact`, and `--help`; default action is `--print --preset full`.
- `--print` writes only the TOML fragment to stdout and never writes files.
- `--check` validates the catalog, then invokes `codex --strict-config -c tui.status_line=<array> --help` without launching the interactive TUI; missing Codex or a non-zero exit is an actionable failure.
- `--install` resolves `${CODEX_HOME}/config.toml` or `${homedir()}/.codex/config.toml`, creates the parent directory if needed, backs up an existing file before a real change, and returns `{ changed, configPath, backupPath }`.

- [ ] **Step 1: Add failing tests for CLI output and installation safety**

Append tests like these to `test/codex-statusline.test.mjs`:

```js
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  formatBackupPath,
  installPreset,
  parseArgs,
  resolveCodexConfigPath,
} from '../codex-statusline.mjs';

test('parseArgs defaults to full preset printing', () => {
  assert.deepEqual(parseArgs([]), { action: 'print', preset: 'full' });
  assert.deepEqual(parseArgs(['--install', '--preset', 'compact']), {
    action: 'install', preset: 'compact',
  });
});

test('parseArgs rejects conflicting actions and unknown flags', () => {
  assert.throws(() => parseArgs(['--print', '--install']), /one action/i);
  assert.throws(() => parseArgs(['--wat']), /unknown option/i);
});

test('resolveCodexConfigPath honors CODEX_HOME', () => {
  assert.equal(
    resolveCodexConfigPath({ CODEX_HOME: 'C:/codex-home' }, 'C:/ignored'),
    join('C:/codex-home', 'config.toml'),
  );
});

test('installPreset preserves unrelated config and creates one backup', () => {
  const root = mkdtempSync(join(tmpdir(), 'hud-codex-'));
  const configPath = join(root, 'config.toml');
  const original = '# keep this\nmodel = "gpt-5"\n\n[tui]\nnotifications = true\n\n[features]\nfast = true\n';
  writeFileSync(configPath, original);
  const now = new Date('2026-08-02T12:34:56.789Z');
  const result = installPreset({ configPath, items: PRESETS.compact, now });
  assert.equal(result.changed, true);
  assert.equal(readFileSync(configPath, 'utf8').includes('notifications = true'), true);
  assert.equal(readFileSync(configPath, 'utf8').includes('[features]'), true);
  assert.match(result.backupPath, /config\.toml\.bak-20260802-123456789$/);
  assert.equal(readFileSync(result.backupPath, 'utf8'), original);
});

test('installPreset does not rewrite an unchanged config', () => {
  const root = mkdtempSync(join(tmpdir(), 'hud-codex-'));
  const configPath = join(root, 'config.toml');
  const expected = renderToml(PRESETS.compact);
  writeFileSync(configPath, expected);
  const result = installPreset({ configPath, items: PRESETS.compact, now: new Date() });
  assert.deepEqual(result, { changed: false, configPath, backupPath: null });
});

test('CLI --print outputs the full fragment without creating files', () => {
  const cli = join(process.cwd(), 'codex-statusline.mjs');
  const result = spawnSync(process.execPath, [cli, '--print', '--preset', 'compact'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[tui\]/);
  assert.match(result.stdout, /"context-remaining"/);
});
```

- [ ] **Step 2: Run the focused test to verify the new cases fail**

Run: `node --test test/codex-statusline.test.mjs`

Expected: FAIL because the CLI helpers and install implementation are not present yet; the existing core tests remain green.

- [ ] **Step 3: Implement CLI and installation behavior**

Add standard-library imports and implement:

```js
export function parseArgs(argv) {
  let action = null;
  let preset = 'full';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return { action: 'help', preset };
    if (arg === '--print' || arg === '--check' || arg === '--install') {
      const nextAction = arg.slice(2);
      if (action && action !== nextAction) throw new Error('Choose one action');
      action = nextAction;
      continue;
    }
    if (arg === '--preset') {
      const value = argv[index + 1];
      if (!value || !Object.hasOwn(PRESETS, value)) throw new Error(`Unknown preset: ${value ?? ''}`);
      preset = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return { action: action ?? 'print', preset };
}

export function resolveCodexConfigPath(env = process.env, home = homedir()) {
  const codexHome = env.CODEX_HOME?.trim() || join(home, '.codex');
  return join(codexHome, 'config.toml');
}

export function formatBackupPath(configPath, now = new Date()) {
  const stamp = now.toISOString().replace(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/,
    '$1$2$3-$4$5$6$7',
  );
  return `${configPath}.bak-${stamp}`;
}

export function installPreset({ configPath, items, now = new Date(), fsModule = fs }) {
  const exists = fsModule.existsSync(configPath);
  const original = exists ? fsModule.readFileSync(configPath, 'utf8') : '';
  const updated = updateConfigText(original, items);
  if (!updated.changed) return { changed: false, configPath, backupPath: null };
  fsModule.mkdirSync(dirname(configPath), { recursive: true });
  const backupPath = exists ? formatBackupPath(configPath, now) : null;
  if (backupPath) fsModule.copyFileSync(configPath, backupPath);
  fsModule.writeFileSync(configPath, updated.text);
  return { changed: true, configPath, backupPath };
}
```

Use `spawnSync` for `--check` with `windowsHide: true`, `encoding: 'utf8'`, and `--help` so the command exits immediately. Keep `--print` and `--check` read-only. For `--install`, read an existing config, call `updateConfigText`, return unchanged without a backup when text is identical, otherwise copy to the timestamped backup and write the new text. Wrap `main()` in a concise error handler that writes `hud codex: <message>` to stderr and exits with code 1.

- [ ] **Step 4: Run all tests and the real local Codex validation**

Run: `node --test`

Expected: PASS with zero failures and no network calls.

Run: `node codex-statusline.mjs --check`

Expected: exit 0 against the installed Codex CLI, without opening the TUI or changing `C:\Users\nicol\.codex\config.toml`.

- [ ] **Step 5: Commit the CLI**

```powershell
git add codex-statusline.mjs test/codex-statusline.test.mjs
git commit -m "feat: add safe Codex statusline installer"
```

### Task 3: Wire the repository preset and update contributor documentation

**Files:**
- Create: `.codex/config.toml`
- Create: `docs/codex-statusline.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `test/codex-statusline.test.mjs`

**Interfaces:**
- `.codex/config.toml` contains only `[tui]` and the full `status_line` array from `PRESETS.full`.
- Documentation exposes the exact commands `node codex-statusline.mjs --print`, `node codex-statusline.mjs --check`, and `node codex-statusline.mjs --install`.
- Tests parse the project config text and assert it equals `renderToml(PRESETS.full)`.

- [ ] **Step 1: Add a failing project-config consistency test**

```js
test('project-local Codex config stays aligned with the full preset', () => {
  const projectConfig = readFileSync(join(process.cwd(), '.codex', 'config.toml'), 'utf8');
  assert.equal(projectConfig, renderToml(PRESETS.full));
});
```

Run: `node --test test/codex-statusline.test.mjs`

Expected: FAIL because `.codex/config.toml` does not exist.

- [ ] **Step 2: Add the project-local full preset**

Create `.codex/config.toml` with exactly:

```toml
[tui]
status_line = ["model-with-reasoning", "context-used", "context-remaining", "five-hour-limit", "weekly-limit", "used-tokens", "total-input-tokens", "total-output-tokens", "git-branch", "current-dir", "project-name", "run-state", "task-progress", "fast-mode", "thread-id", "thread-title", "codex-version", "actions"]
```

- [ ] **Step 3: Run the consistency test**

Run: `node --test test/codex-statusline.test.mjs`

Expected: PASS for the project config consistency assertion and all previous tests.

- [ ] **Step 4: Write the Codex-specific documentation**

Create `docs/codex-statusline.md` covering:

- Codex owns the footer and does not execute `hud.mjs` as an external command.
- Full and compact item lists, with one-line descriptions for context, limits, tokens, Git, session, and task fields.
- Project-local behavior from `.codex/config.toml`.
- Global opt-in setup via `--check`, `--print`, and `--install`.
- `CODEX_HOME` resolution and timestamped backup behavior.
- `/statusline` as the supported way to reorder or hide fields.
- Version caveat: run `--check` after Codex upgrades because item IDs are versioned by the installed CLI.

- [ ] **Step 5: Update README, AGENTS, and CLAUDE without changing existing Claude instructions**

Add a concise Codex section to `README.md` after Claude installation. Update `AGENTS.md` so Codex contributors see the native config and test commands first. Add a short compatibility note to `CLAUDE.md` stating that Claude uses `hud.mjs` while Codex uses `.codex/config.toml` and `codex-statusline.mjs`.

- [ ] **Step 6: Run documentation/config tests and inspect the diff**

Run: `node --test`

Expected: PASS with zero failures.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 7: Commit the integration docs and config**

```powershell
git add .codex/config.toml docs/codex-statusline.md README.md AGENTS.md CLAUDE.md test/codex-statusline.test.mjs
git commit -m "docs: wire native Codex statusline setup"
```

### Task 4: Run the complete verification matrix and finalize the branch

**Files:**
- Modify: any implementation/test/documentation file only if verification finds a concrete defect.

**Interfaces:**
- No new public interface; this task verifies the interfaces delivered by Tasks 1–3.

- [ ] **Step 1: Run the full automated test suite**

Run: `node --test`

Expected: all tests pass with zero failures and no warnings.

- [ ] **Step 2: Run syntax and existing Claude smoke checks**

Run:

```powershell
node --check hud.mjs
node --check codex-statusline.mjs
$env:COLUMNS='35'
Get-Content -Raw 'test/sample-stdin.json' | node hud.mjs
Remove-Item Env:COLUMNS -ErrorAction SilentlyContinue
```

Expected: both syntax checks exit 0; Claude prints exactly one ANSI statusline line and still shrinks at `COLUMNS=35`.

- [ ] **Step 3: Run Codex checks without modifying user config**

Run:

```powershell
node codex-statusline.mjs --print --preset full
node codex-statusline.mjs --print --preset compact
node codex-statusline.mjs --check
```

Expected: both presets print valid TOML, `--check` exits 0, and `C:\Users\nicol\.codex\config.toml` has no diff or timestamp change.

- [ ] **Step 4: Review requirements against the design**

Check each acceptance criterion in `docs/superpowers/specs/2026-08-02-codex-statusline-design.md`: Claude behavior preserved, full/compact presets present, native Codex validation succeeds, install is explicit and backed up, project config is aligned, tests are dependency-free, and docs state the native limitation.

- [ ] **Step 5: Inspect final Git state and commit any verification fix**

Run: `git status --short --branch` and `git diff HEAD~1 --stat`

Expected: only intended repository files are changed; the branch has no accidental credentials, cache files, or global config edits.

- [ ] **Step 6: If verification finds a concrete defect, return to the owning task**

Repeat that task's failing-test, minimal-fix, full-test, and focused-commit cycle. If no defect is found, leave this step unchecked and keep the existing task commits.
