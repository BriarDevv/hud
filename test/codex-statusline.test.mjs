import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS,
  STATUS_LINE_ITEMS,
  formatBackupPath,
  installPreset,
  parseArgs,
  presetItems,
  renderToml,
  resolveCodexConfigPath,
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

test('updateConfigText replaces status_line without disturbing other tui settings', () => {
  const original = '# keep\n[tui]\nnotifications = true\nstatus_line = ["old"]\n\n[features]\nfast = true\n';
  const result = updateConfigText(original, PRESETS.compact);
  assert.equal(result.changed, true);
  assert.match(result.text, /notifications = true/);
  assert.match(result.text, /\[features\]\nfast = true/);
  assert.match(result.text, /status_line = \["model-with-reasoning"/);
  assert.doesNotMatch(result.text, /status_line = \["old"\]/);
});

test('updateConfigText creates tui when it is missing', () => {
  const result = updateConfigText('model = "gpt-5"\n', PRESETS.compact);
  assert.equal(result.text, `model = "gpt-5"\n\n${renderToml(PRESETS.compact)}`);
});

test('updateConfigText preserves CRLF line endings', () => {
  const result = updateConfigText('[tui]\r\nnotifications = true\r\n', PRESETS.compact);
  assert.match(result.text, /\r\nstatus_line =/);
  assert.doesNotMatch(result.text, /(?<!\r)\n/);
});

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

test('CLI --print outputs the requested fragment without creating files', () => {
  const cli = join(process.cwd(), 'codex-statusline.mjs');
  const result = spawnSync(process.execPath, [cli, '--print', '--preset', 'compact'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[tui\]/);
  assert.match(result.stdout, /"context-remaining"/);
});
