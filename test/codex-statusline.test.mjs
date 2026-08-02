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
