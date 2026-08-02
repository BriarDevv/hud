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
