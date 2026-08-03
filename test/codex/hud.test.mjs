import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  formatTokenCount,
  findLatestSession,
  parseArgs,
  parseTurnContextEvent,
  parseTokenCountEvent,
  readSessionSnapshot,
  renderBar,
  renderLine,
  resolveCodexHome,
} from '../../src/codex/hud.mjs';

const TOKEN_COUNT_EVENT = {
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      model_context_window: 258400,
      total_token_usage: {
        input_tokens: 28777,
        output_tokens: 230,
      },
    },
    rate_limits: {
      primary: {
        used_percent: 95,
        window_minutes: 10080,
      },
    },
  },
};

test('extracts weekly, context, and total token values from a token event', () => {
  assert.deepEqual(parseTokenCountEvent(TOKEN_COUNT_EVENT), {
    weeklyPercent: 95,
    contextPercent: 11,
    inputTokens: 28777,
    outputTokens: 230,
  });
});

test('extracts the model only from a turn context event', () => {
  assert.equal(parseTurnContextEvent({
    type: 'turn_context',
    payload: { model: 'gpt-5.6-luna' },
  }), 'gpt-5.6-luna');
  assert.equal(parseTurnContextEvent({
    type: 'event_msg',
    payload: { type: 'turn_context', model: 'gpt-5.6-luna' },
  }), 'gpt-5.6-luna');
  assert.equal(parseTurnContextEvent({
    type: 'event_msg',
    payload: { type: 'agent_message', model: 'should-not-be-used' },
  }), null);
});

test('formats token counts compactly without losing small integers', () => {
  assert.equal(formatTokenCount(28777), '28.8K');
  assert.equal(formatTokenCount(230), '230');
  assert.equal(formatTokenCount(1200000), '1.2M');
  assert.equal(formatTokenCount(null), '--');
});

test('renders a fixed-width bar with only the filled cells colored', () => {
  assert.equal(renderBar(95, { color: false, phase: 0 }), '[███████████░]');
  assert.equal(renderBar(null, { color: false, phase: 0 }), '[············]');
  assert.match(renderBar(50, { color: true, phase: 0 }), /\x1b\[38;2;/);
  assert.notEqual(renderBar(50, { color: true, phase: 0 }), renderBar(50, { color: true, phase: 120 }));
});

test('renders only weekly, context used, and input/output in order', () => {
  const line = renderLine({
    model: 'gpt-5.6-luna',
    weeklyPercent: 95,
    contextPercent: 11,
    inputTokens: 28777,
    outputTokens: 230,
  }, { color: false, phase: 0 });
  assert.equal(line, 'model gpt-5.6-luna  │  weekly       [███████████░] 95%  │  context used [█░░░░░░░░░░░] 11%  │  28.8K in · 230 out');
  assert.ok(line.indexOf('model gpt-5.6-luna') < line.indexOf('weekly'));
  assert.ok(line.indexOf('weekly') < line.indexOf('context used'));
  assert.ok(line.indexOf('context used') < line.indexOf('28.8K in'));
  assert.doesNotMatch(line, /ready|fast|uuid|version|session|remaining/i);
});

test('renders a stable model placeholder when model data is missing', () => {
  assert.match(renderLine({ weeklyPercent: 0, contextPercent: 0, inputTokens: 0, outputTokens: 0 }, { color: false }), /^model --  │  weekly/);
});

function sessionFixture({ cwd, inputTokens, outputTokens, weeklyPercent = 42 }) {
  return [
    JSON.stringify({ type: 'session_meta', payload: { cwd } }),
    JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.6-luna' } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'ignored' } }),
    JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          model_context_window: 258400,
          total_token_usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        },
        rate_limits: { primary: { used_percent: weeklyPercent, window_minutes: 10080 } },
      },
    }),
    '{"partial":',
  ].join('\n');
}

test('resolves CODEX_HOME and selects the newest matching rollout session', () => {
  assert.equal(resolveCodexHome({ CODEX_HOME: 'C:/codex-home' }, 'C:/ignored'), 'C:/codex-home');

  const root = mkdtempSync(join(tmpdir(), 'hud-codex-sessions-'));
  const day = join(root, 'sessions', '2026', '08', '02');
  mkdirSync(day, { recursive: true });
  const oldPath = join(day, 'rollout-old.jsonl');
  const newPath = join(day, 'rollout-new.jsonl');
  writeFileSync(oldPath, sessionFixture({ cwd: 'C:/other', inputTokens: 100, outputTokens: 1 }));
  writeFileSync(newPath, sessionFixture({ cwd: 'C:/project', inputTokens: 28777, outputTokens: 230 }));
  const oldTime = new Date('2026-08-02T12:00:00Z');
  const newTime = new Date('2026-08-02T12:01:00Z');
  utimesSync(oldPath, oldTime, oldTime);
  utimesSync(newPath, newTime, newTime);

  assert.equal(findLatestSession({ codexHome: root, cwd: 'C:/project' }), newPath);
  assert.equal(findLatestSession({ codexHome: root, cwd: 'C:/missing' }), null);
});

test('reads the latest complete token event and ignores a partial trailing line', () => {
  const root = mkdtempSync(join(tmpdir(), 'hud-codex-read-'));
  const path = join(root, 'rollout.jsonl');
  writeFileSync(path, sessionFixture({ cwd: 'C:/project', inputTokens: 28777, outputTokens: 230, weeklyPercent: 95 }));
  assert.deepEqual(readSessionSnapshot(path), {
    model: 'gpt-5.6-luna',
    weeklyPercent: 95,
    contextPercent: 11,
    inputTokens: 28777,
    outputTokens: 230,
  });
});

test('keeps the model when a new session has not emitted token counts yet', () => {
  const root = mkdtempSync(join(tmpdir(), 'hud-codex-model-only-'));
  const path = join(root, 'rollout.jsonl');
  writeFileSync(path, [
    JSON.stringify({ type: 'session_meta', payload: { cwd: 'C:/project' } }),
    JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.6-luna' } }),
  ].join('\n'));
  assert.deepEqual(readSessionSnapshot(path), {
    model: 'gpt-5.6-luna',
    weeklyPercent: null,
    contextPercent: null,
    inputTokens: null,
    outputTokens: null,
  });
});

test('parses one-shot and watch CLI modes without mixing them', () => {
  assert.deepEqual(parseArgs([]), { mode: 'once', cwd: null, sessionId: null });
  assert.deepEqual(parseArgs(['--watch', '--cwd', 'C:/project', '--session', 'abc']), {
    mode: 'watch', cwd: 'C:/project', sessionId: 'abc',
  });
  assert.throws(() => parseArgs(['--once', '--watch']), /one mode/i);
  assert.throws(() => parseArgs(['--cwd']), /requires a value/i);
});
