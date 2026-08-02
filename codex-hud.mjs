#!/usr/bin/env node
/**
 * codex-hud — compact animated companion HUD for Codex CLI.
 *
 * Codex owns its native footer, so this renderer is intentionally separate:
 * it reads sanitized token-count metadata from Codex rollout files and emits
 * one fixed-width line for a PowerShell/terminal pane.
 */

import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BAR_WIDTH = 12;
export const LABEL_WIDTH = 12;
export const SEPARATOR = '  │  ';

const RESET = '\x1b[0m';
const PALETTE = Object.freeze([
  [139, 124, 255], // violet
  [59, 217, 255],  // cyan
  [57, 230, 182],  // mint
  [232, 255, 90],  // lime
  [255, 176, 0],   // amber
  [255, 77, 141],  // magenta
]);

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampPercent(value) {
  const number = finiteNumber(value);
  return number == null ? null : Math.min(100, Math.max(0, Math.round(number)));
}

function weeklyLimit(rateLimits) {
  const candidates = [rateLimits?.primary, rateLimits?.secondary];
  const weekly = candidates.find((limit) => limit?.window_minutes === 10080);
  const selected = weekly ?? candidates.find(Boolean);
  return clampPercent(selected?.used_percent);
}

export function parseTurnContextEvent(event) {
  const isTurnContext = event?.type === 'turn_context';
  const isEventMessage = event?.type === 'event_msg' && event.payload?.type === 'turn_context';
  if (!isTurnContext && !isEventMessage) return null;
  const model = event.payload?.model;
  return typeof model === 'string' && model.trim() ? model.trim() : null;
}

export function parseTokenCountEvent(event) {
  if (event?.type !== 'event_msg' || event.payload?.type !== 'token_count') return null;

  const info = event.payload.info;
  const usage = info?.total_token_usage;
  const inputTokens = finiteNumber(usage?.input_tokens);
  const outputTokens = finiteNumber(usage?.output_tokens);
  const contextWindow = finiteNumber(info?.model_context_window);
  const contextPercent = inputTokens != null && contextWindow > 0
    ? clampPercent((inputTokens / contextWindow) * 100)
    : null;

  return {
    weeklyPercent: weeklyLimit(event.payload.rate_limits),
    contextPercent,
    inputTokens,
    outputTokens,
  };
}

export function formatTokenCount(value) {
  const number = finiteNumber(value);
  if (number == null || number < 0) return '--';
  if (number < 1000) return String(Math.round(number));

  const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  const [divisor, suffix] = units.find(([unit]) => number >= unit);
  const compact = number / divisor;
  const text = compact >= 100 ? compact.toFixed(0) : compact.toFixed(1);
  return `${text.replace(/\.0$/, '')}${suffix}`;
}

function cellColor(index, phase) {
  const hue = phase + index * (360 / PALETTE.length);
  const position = (((hue % 360) + 360) % 360) / 60;
  const left = Math.floor(position) % PALETTE.length;
  const right = (left + 1) % PALETTE.length;
  const blend = position - Math.floor(position);
  const [red, green, blue] = PALETTE[left].map((value, channel) => (
    Math.round(value + (PALETTE[right][channel] - value) * blend)
  ));
  return `\x1b[38;2;${red};${green};${blue}m`;
}

function colorEnabled(options) {
  if (options?.color != null) return options.color;
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

export function renderBar(percent, options = {}) {
  const width = Number.isInteger(options.width) && options.width > 0 ? options.width : BAR_WIDTH;
  const phase = finiteNumber(options.phase) ?? 0;
  const color = colorEnabled(options);
  const clamped = clampPercent(percent);
  if (clamped == null) return `[${'·'.repeat(width)}]`;

  const filled = Math.round((clamped / 100) * width);
  const cells = [];
  for (let index = 0; index < width; index += 1) {
    if (index < filled && color) cells.push(`${cellColor(index, phase)}█${RESET}`);
    else cells.push(index < filled ? '█' : '░');
  }
  return `[${cells.join('')}]`;
}

function formatPercent(value) {
  const percent = clampPercent(value);
  return percent == null ? '--' : `${percent}%`;
}

export function renderLine(snapshot = {}, options = {}) {
  const phase = finiteNumber(options.phase) ?? 0;
  const barOptions = { ...options, phase };
  const model = typeof snapshot.model === 'string' && snapshot.model.trim() ? snapshot.model.trim() : '--';
  const weekly = `weekly`.padEnd(LABEL_WIDTH) + ` ${renderBar(snapshot.weeklyPercent, barOptions)} ${formatPercent(snapshot.weeklyPercent)}`;
  const context = `context used`.padEnd(LABEL_WIDTH) + ` ${renderBar(snapshot.contextPercent, barOptions)} ${formatPercent(snapshot.contextPercent)}`;
  const totals = `${formatTokenCount(snapshot.inputTokens)} in · ${formatTokenCount(snapshot.outputTokens)} out`;
  return [`model ${model}`, weekly, context, totals].join(SEPARATOR);
}

export function resolveCodexHome(env = process.env, home = homedir()) {
  return env.CODEX_HOME?.trim() || join(home, '.codex');
}

function readPrefix(filePath, fsModule = fs, maxBytes = 64 * 1024) {
  let descriptor;
  try {
    descriptor = fsModule.openSync(filePath, 'r');
    const stats = fsModule.fstatSync(descriptor);
    const length = Math.min(stats.size, maxBytes);
    const buffer = Buffer.alloc(length);
    const bytes = fsModule.readSync(descriptor, buffer, 0, length, 0);
    return buffer.toString('utf8', 0, bytes).split(/\r?\n/, 1)[0];
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) {
      try { fsModule.closeSync(descriptor); } catch { /* best effort */ }
    }
  }
}

function readTail(filePath, fsModule = fs, maxBytes = 512 * 1024) {
  let descriptor;
  try {
    descriptor = fsModule.openSync(filePath, 'r');
    const stats = fsModule.fstatSync(descriptor);
    const start = Math.max(0, stats.size - maxBytes);
    const length = stats.size - start;
    const buffer = Buffer.alloc(length);
    const bytes = fsModule.readSync(descriptor, buffer, 0, length, start);
    return buffer.toString('utf8', 0, bytes);
  } catch {
    return '';
  } finally {
    if (descriptor !== undefined) {
      try { fsModule.closeSync(descriptor); } catch { /* best effort */ }
    }
  }
}

function parseSessionMeta(filePath, fsModule = fs) {
  const line = readPrefix(filePath, fsModule);
  if (!line) return null;
  try {
    const event = JSON.parse(line);
    if (event?.type !== 'session_meta') return null;
    return event.payload ?? null;
  } catch {
    return null;
  }
}

function collectRolloutFiles(root, fsModule = fs, files = []) {
  let entries;
  try {
    entries = fsModule.readdirSync(root, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) collectRolloutFiles(path, fsModule, files);
    else if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) files.push(path);
  }
  return files;
}

function comparablePath(path, platform = process.platform) {
  const normalized = String(path).replace(/[\\/]+/g, '/').replace(/\/$/, '');
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function findLatestSession({ codexHome, cwd = process.cwd(), sessionId = null, fsModule = fs } = {}) {
  const sessionsRoot = join(codexHome, 'sessions');
  const absoluteCwd = isAbsolute(cwd) || /^[A-Za-z]:[\\/]/.test(cwd) ? cwd : resolve(cwd);
  const expectedCwd = comparablePath(absoluteCwd);
  const matches = [];
  for (const path of collectRolloutFiles(sessionsRoot, fsModule)) {
    const meta = parseSessionMeta(path, fsModule);
    if (!meta || comparablePath(meta.cwd ?? '') !== expectedCwd) continue;
    if (sessionId && meta.session_id !== sessionId && meta.id !== sessionId && !path.includes(sessionId)) continue;
    try {
      matches.push({ path, mtimeMs: fsModule.statSync(path).mtimeMs });
    } catch { /* file may have rotated between discovery and stat */ }
  }
  matches.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return matches[0]?.path ?? null;
}

export function readSessionSnapshot(filePath, fsModule = fs) {
  const text = readTail(filePath, fsModule);
  let latest = null;
  let model = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      const nextModel = parseTurnContextEvent(event);
      if (nextModel) model = nextModel;
      const snapshot = parseTokenCountEvent(event);
      if (snapshot) latest = { ...snapshot, model };
    } catch { /* ignore a partial line written concurrently by Codex */ }
  }
  if (latest && model) latest.model = model;
  return latest;
}

export function parseArgs(argv) {
  let mode = 'once';
  let modeExplicit = false;
  let cwd = null;
  let sessionId = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--once' || arg === '--watch') {
      const nextMode = arg.slice(2);
      if (modeExplicit) throw new Error('Choose one mode');
      mode = nextMode;
      modeExplicit = true;
      continue;
    }
    if (arg === '--cwd' || arg === '--session') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--cwd') cwd = value;
      else sessionId = value;
      index += 1;
      continue;
    }
    if (arg === '--help') return { mode: 'help', cwd, sessionId };
    throw new Error(`Unknown option: ${arg}`);
  }
  return { mode, cwd, sessionId };
}

function usage() {
  return [
    'Usage: node codex-hud.mjs [--once|--watch] [--cwd <path>] [--session <id>]',
    '',
    '  --once     Render one line and exit (default).',
    '  --watch    Animate the line until Ctrl+C.',
    '  --cwd      Match the Codex session working directory.',
    '  --session  Pin a Codex session ID when several share a directory.',
  ].join('\n');
}

function readCurrentSnapshot({ cwd, sessionId }) {
  const path = findLatestSession({
    codexHome: resolveCodexHome(),
    cwd: cwd ?? process.cwd(),
    sessionId,
  });
  return path ? readSessionSnapshot(path) : null;
}

function renderOnce({ cwd, sessionId }) {
  const snapshot = readCurrentSnapshot({ cwd, sessionId });
  process.stdout.write(`${renderLine(snapshot ?? {}, { color: colorEnabled() })}\n`);
}

function watch({ cwd, sessionId }) {
  if (!process.stdout.isTTY) {
    renderOnce({ cwd, sessionId });
    return;
  }

  let snapshot = readCurrentSnapshot({ cwd, sessionId }) ?? {};
  let nextDataRefresh = 0;
  const color = colorEnabled();
  const refreshMs = 1000;
  const frameMs = 120;
  const timer = setInterval(() => {
    const now = Date.now();
    if (now >= nextDataRefresh) {
      snapshot = readCurrentSnapshot({ cwd, sessionId }) ?? snapshot;
      nextDataRefresh = now + refreshMs;
    }
    const phase = (now / frameMs * 14) % 360;
    process.stdout.write(`\x1b[2K\r${renderLine(snapshot, { color, phase })}`);
  }, frameMs);

  const stop = () => {
    clearInterval(timer);
    process.stdout.write('\x1b[2K\r\n');
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.stdout.write(`\x1b[2K\r${renderLine(snapshot, { color, phase: 0 })}`);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.mode === 'help') {
    console.log(usage());
    return;
  }
  if (args.mode === 'watch') watch(args);
  else renderOnce(args);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`codex-hud: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
