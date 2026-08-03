import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Codex-native statusline configuration helper.
 *
 * Codex owns the footer renderer; this module generates and safely updates the
 * `tui.status_line` configuration that Codex reads.
 */

export const STATUS_LINE_ITEMS = Object.freeze([
  'model', 'model-with-reasoning', 'reasoning', 'current-dir',
  'project-name', 'git-branch', 'pull-request-number', 'branch-changes',
  'run-state', 'permissions', 'approval-mode', 'context-remaining',
  'context-used', 'five-hour-limit', 'weekly-limit', 'codex-version',
  'context-window-size', 'used-tokens', 'total-input-tokens',
  'total-output-tokens', 'thread-id', 'fast-mode', 'raw-output',
  'thread-title', 'workspace-headline', 'task-progress',
]);

export const PRESETS = Object.freeze({
  full: Object.freeze([...STATUS_LINE_ITEMS]),
  compact: Object.freeze([
    'model-with-reasoning', 'context-remaining', 'five-hour-limit',
    'weekly-limit', 'git-branch', 'run-state',
  ]),
  hud: Object.freeze([
    'model-with-reasoning', 'weekly-limit', 'context-used',
    'total-input-tokens', 'total-output-tokens',
  ]),
});

export function presetItems(name = 'full') {
  const items = PRESETS[name];
  if (!items) throw new Error(`Unknown preset: ${name}`);
  return [...items];
}

function renderStatusLineArray(items) {
  if (!Array.isArray(items) || items.some((item) => typeof item !== 'string')) {
    throw new TypeError('Statusline items must be an array of strings');
  }
  return `[${items.map((item) => JSON.stringify(item)).join(', ')}]`;
}

function normalizeVisualOptions(options = {}) {
  const normalized = {
    statusLineUseColors: options.statusLineUseColors ?? true,
    animations: options.animations ?? true,
  };
  if (typeof normalized.statusLineUseColors !== 'boolean') {
    throw new TypeError('statusLineUseColors must be a boolean');
  }
  if (typeof normalized.animations !== 'boolean') {
    throw new TypeError('animations must be a boolean');
  }
  return normalized;
}

export function renderToml(items, options = {}) {
  const { statusLineUseColors, animations } = normalizeVisualOptions(options);
  return [
    '[tui]',
    `status_line = ${renderStatusLineArray(items)}`,
    `status_line_use_colors = ${statusLineUseColors}`,
    `animations = ${animations}`,
    '',
  ].join('\n');
}

const TUI_HEADER = /^\s*\[tui\]\s*(?:#.*)?$/;
const ARRAY_TUI_HEADER = /^\s*\[\[tui\]\]\s*(?:#.*)?$/;
const ANY_TABLE_HEADER = /^\s*\[\[?[^\]]+\]\]?\s*(?:#.*)?$/;
const STATUS_LINE_KEY = /^(\s*)status_line\s*=/;
const STATUS_LINE_USE_COLORS_KEY = /^(\s*)status_line_use_colors\s*=/;
const ANIMATIONS_KEY = /^(\s*)animations\s*=/;

function splitLines(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const trailingEol = text.endsWith(eol);
  const lines = text.split(/\r?\n/);
  if (trailingEol) lines.pop();
  return { eol, lines, trailingEol };
}

function joinLines(lines, eol, trailingEol) {
  return lines.join(eol) + (trailingEol ? eol : '');
}

function findAssignmentEnd(lines, start, sectionEnd, isArray) {
  if (!isArray) return start;

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < sectionEnd; index += 1) {
    const line = lines[index];
    for (let offset = 0; offset < line.length; offset += 1) {
      const character = line[offset];
      if (quote) {
        if (quote === '"' && escaped) {
          escaped = false;
        } else if (quote === '"' && character === '\\') {
          escaped = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === '#') break;
      if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '[') {
        depth += 1;
      } else if (character === ']') {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
  }
  throw new Error('Unterminated status_line array in [tui]');
}

function findAssignmentRanges(lines, start, sectionEnd, key, isArray) {
  const ranges = [];
  for (let index = start; index < sectionEnd; index += 1) {
    if (!key.test(lines[index])) continue;
    const end = findAssignmentEnd(lines, index, sectionEnd, isArray);
    ranges.push({ start: index, end });
    index = end;
  }
  return ranges;
}

function sectionInsertionIndex(lines, start, sectionEnd) {
  let index = sectionEnd;
  while (index > start && lines[index - 1].trim() === '') index -= 1;
  return index;
}

export function updateConfigText(text, items, options = {}) {
  if (typeof text !== 'string') throw new TypeError('Configuration text must be a string');
  const { statusLineUseColors, animations } = normalizeVisualOptions(options);
  const assignments = [
    ['status_line', STATUS_LINE_KEY, `status_line = ${renderStatusLineArray(items)}`, true],
    ['status_line_use_colors', STATUS_LINE_USE_COLORS_KEY, `status_line_use_colors = ${statusLineUseColors}`, false],
    ['animations', ANIMATIONS_KEY, `animations = ${animations}`, false],
  ];
  const { eol, lines, trailingEol } = splitLines(text);
  const arrayTuiIndex = lines.findIndex((line) => ARRAY_TUI_HEADER.test(line));
  if (arrayTuiIndex >= 0) throw new Error('Unsupported [[tui]] array table');

  const tuiIndex = lines.findIndex((line) => TUI_HEADER.test(line));
  if (tuiIndex < 0) {
    const hasContent = lines.some((line) => line.trim() !== '');
    const nextLines = hasContent
      ? [...lines, '', '[tui]', ...assignments.map(([, , value]) => value)]
      : ['[tui]', ...assignments.map(([, , value]) => value)];
    return { text: joinLines(nextLines, eol, trailingEol || !hasContent), changed: true };
  }

  const nextHeaderOffset = lines.slice(tuiIndex + 1).findIndex((line) => ANY_TABLE_HEADER.test(line));
  let sectionEnd = nextHeaderOffset < 0 ? lines.length : tuiIndex + 1 + nextHeaderOffset;
  const nextLines = [...lines];
  for (const [name, key, value, isArray] of assignments) {
    const ranges = findAssignmentRanges(nextLines, tuiIndex + 1, sectionEnd, key, isArray);
    if (ranges.length > 1) throw new Error(`Multiple ${name} keys in [tui]`);
    if (ranges.length === 1) {
      const { start, end } = ranges[0];
      const indent = nextLines[start].match(/^\s*/)[0];
      nextLines.splice(start, end - start + 1, `${indent}${value}`);
      sectionEnd += start === end ? 0 : start - end;
    } else {
      nextLines.splice(sectionInsertionIndex(nextLines, tuiIndex + 1, sectionEnd), 0, value);
      sectionEnd += 1;
    }
  }

  const nextText = joinLines(nextLines, eol, trailingEol);
  return { text: nextText, changed: nextText !== text };
}

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

function uniqueBackupPath(configPath, now, fsModule) {
  const basePath = formatBackupPath(configPath, now);
  let backupPath = basePath;
  let suffix = 1;
  while (fsModule.existsSync(backupPath)) {
    backupPath = `${basePath}-${suffix}`;
    suffix += 1;
  }
  return backupPath;
}

export function installPreset({ configPath, items, now = new Date(), fsModule = fs }) {
  const exists = fsModule.existsSync(configPath);
  const original = exists ? fsModule.readFileSync(configPath, 'utf8') : '';
  const updated = updateConfigText(original, items);
  if (!updated.changed) return { changed: false, configPath, backupPath: null };

  fsModule.mkdirSync(dirname(configPath), { recursive: true });
  const backupPath = exists ? uniqueBackupPath(configPath, now, fsModule) : null;
  if (backupPath) fsModule.copyFileSync(configPath, backupPath);
  fsModule.writeFileSync(configPath, updated.text);
  return { changed: true, configPath, backupPath };
}

export function validateWithCodex(
  items,
  command = process.env.CODEX_BIN || 'codex',
  spawn = spawnSync,
) {
  const result = spawn(command, [
    '--strict-config',
    '-c',
    `tui.status_line=${JSON.stringify(items)}`,
    '-c',
    'tui.status_line_use_colors=true',
    '-c',
    'tui.animations=true',
    '--help',
  ], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (result.error) throw new Error(`Codex could not be executed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`Codex rejected the statusline${detail ? `: ${detail}` : ''}`);
  }
  return true;
}

function usage() {
  return [
    'Usage: node src/codex/statusline.mjs [--print|--check|--install] [--preset full|compact|hud]',
    '',
    '  --print    Print the native [tui] status_line TOML fragment (default).',
    '  --check    Validate the preset with the installed Codex CLI.',
    '  --install  Update CODEX_HOME/config.toml after creating a backup.',
    '  --preset   Select full (default), compact, or hud.',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const { action, preset } = parseArgs(argv);
  const items = presetItems(preset);
  if (action === 'help') {
    console.log(usage());
    return;
  }
  if (action === 'print') {
    process.stdout.write(renderToml(items));
    return;
  }
  if (action === 'check') {
    validateWithCodex(items);
    console.log(`Codex statusline preset '${preset}' is accepted.`);
    return;
  }
  const configPath = resolveCodexConfigPath();
  const result = installPreset({ configPath, items });
  if (!result.changed) {
    console.log(`Codex statusline preset '${preset}' is already installed at ${configPath}.`);
    return;
  }
  console.log(`Installed Codex statusline preset '${preset}' at ${configPath}.`);
  if (result.backupPath) console.log(`Backup: ${result.backupPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`hud codex: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
