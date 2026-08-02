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
  if (!Array.isArray(items) || items.some((item) => typeof item !== 'string')) {
    throw new TypeError('Statusline items must be an array of strings');
  }
  return `[tui]\nstatus_line = ${JSON.stringify(items)}\n`;
}

const TUI_HEADER = /^\s*\[tui\]\s*(?:#.*)?$/;
const ARRAY_TUI_HEADER = /^\s*\[\[tui\]\]\s*(?:#.*)?$/;
const ANY_TABLE_HEADER = /^\s*\[\[?[^\]]+\]\]?\s*(?:#.*)?$/;
const STATUS_LINE_KEY = /^(\s*)status_line\s*=/;

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

export function updateConfigText(text, items) {
  if (typeof text !== 'string') throw new TypeError('Configuration text must be a string');
  const assignment = `status_line = ${JSON.stringify(items)}`;
  const { eol, lines, trailingEol } = splitLines(text);
  const arrayTuiIndex = lines.findIndex((line) => ARRAY_TUI_HEADER.test(line));
  if (arrayTuiIndex >= 0) throw new Error('Unsupported [[tui]] array table');

  const tuiIndex = lines.findIndex((line) => TUI_HEADER.test(line));
  if (tuiIndex < 0) {
    const nextLines = lines.length > 0 ? [...lines, '', '[tui]', assignment] : ['[tui]', assignment];
    return { text: joinLines(nextLines, eol, trailingEol || lines.length === 0), changed: true };
  }

  const nextHeaderOffset = lines.slice(tuiIndex + 1).findIndex((line) => ANY_TABLE_HEADER.test(line));
  const sectionEnd = nextHeaderOffset < 0 ? lines.length : tuiIndex + 1 + nextHeaderOffset;
  const statusIndices = [];
  for (let index = tuiIndex + 1; index < sectionEnd; index += 1) {
    if (STATUS_LINE_KEY.test(lines[index])) statusIndices.push(index);
  }
  if (statusIndices.length > 1) throw new Error('Multiple status_line keys in [tui]');

  const nextLines = [...lines];
  if (statusIndices.length === 1) {
    const index = statusIndices[0];
    const indent = lines[index].match(/^\s*/)[0];
    nextLines[index] = `${indent}${assignment}`;
  } else {
    nextLines.splice(sectionEnd, 0, assignment);
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

export function validateWithCodex(
  items,
  command = process.env.CODEX_BIN || 'codex',
  spawn = spawnSync,
) {
  const result = spawn(command, [
    '--strict-config',
    '-c',
    `tui.status_line=${JSON.stringify(items)}`,
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
    'Usage: node codex-statusline.mjs [--print|--check|--install] [--preset full|compact]',
    '',
    '  --print    Print the native [tui] status_line TOML fragment (default).',
    '  --check    Validate the preset with the installed Codex CLI.',
    '  --install  Update CODEX_HOME/config.toml after creating a backup.',
    '  --preset   Select full (default) or compact.',
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
