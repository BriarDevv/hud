#!/usr/bin/env node
/**
 * hud — standalone Claude Code statusline.
 * Renders: Model: X | 5h:[####----]N%(4h38m) | wk:[#-------]N%(6d10h) | session:Nm | ctx:[##--------]N%
 * Data: Claude Code statusline stdin JSON (primary); OAuth usage API (fallback for rate limits).
 * Zero dependencies. Never throws: worst case prints a minimal line.
 */

import { readFileSync, writeFileSync, openSync, readSync, closeSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// ---------- ANSI ----------
const R = "\x1b[0m", DIM = "\x1b[2m";
const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m";
const dim = (s) => `${DIM}${s}${R}`;
const SEP = dim(" | ");

const pctColor = (p) => (p >= 90 ? RED : p >= 70 ? YELLOW : GREEN);
const clampPct = (p) => Math.min(100, Math.max(0, Math.round(p)));

function bar(pct, width, color) {
  const filled = Math.round((pct / 100) * width);
  return `[${color}${"#".repeat(filled)}${R}${DIM}${"-".repeat(width - filled)}${R}]`;
}

// "4h38m" | "6d10h" | null when past/absent
function formatReset(resetsAt) {
  if (!resetsAt) return null;
  const t = typeof resetsAt === "number"
    ? (Math.abs(resetsAt) < 1e12 ? resetsAt * 1000 : resetsAt)
    : Date.parse(resetsAt);
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  if (diff <= 0) return null;
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d > 0 ? `${d}d${h % 24}h` : `${h}h${m % 60}m`;
}

function limitSegment(label, pct, resetsAt, { dimLabel = false, width = 8 } = {}) {
  if (pct == null) return null;
  const p = clampPct(pct);
  const reset = formatReset(resetsAt);
  const lbl = dimLabel ? dim(`${label}:`) : `${label}:`;
  return `${lbl}${bar(p, width, pctColor(p))}${pctColor(p)}${p}%${R}${reset ? dim(`(${reset})`) : ""}`;
}

// ---------- stdin ----------
async function readStdin() {
  if (process.stdin.isTTY) return null;
  try {
    let data = "";
    for await (const chunk of process.stdin) data += chunk;
    return data.trim() ? JSON.parse(data) : null;
  } catch { return null; }
}

// ---------- segments ----------
function modelSegment(stdin) {
  const name = stdin?.model?.display_name?.trim() || stdin?.model?.id?.trim();
  return name ? `${CYAN}Model: ${name}${R}` : null;
}

function contextPercent(stdin) {
  const cw = stdin?.context_window;
  if (!cw) return 0;
  if (cw.used_percentage > 0) return clampPct(cw.used_percentage);
  const u = cw.current_usage;
  const total = u ? (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) : 0;
  if (total > 0 && cw.context_window_size > 0) return clampPct((total / cw.context_window_size) * 100);
  if (cw.total_input_tokens > 0 && cw.context_window_size > 0) return clampPct((cw.total_input_tokens / cw.context_window_size) * 100);
  return 0;
}

function contextSegment(stdin) {
  const p = contextPercent(stdin);
  const color = p >= 85 ? RED : p >= 70 ? YELLOW : GREEN;
  const suffix = p >= 85 ? " CRITICAL" : p >= 80 ? " COMPRESS?" : "";
  return `ctx:${bar(p, 10, color)}${color}${p}%${suffix}${R}`;
}

// Session start = first timestamped transcript entry. The transcript opens with meta
// lines (last-prompt, mode, permission-mode) that carry NO timestamp, so scan the head
// until one appears; fall back to file birthtime.
function sessionStartMs(path) {
  try {
    const fd = openSync(path, "r");
    const buf = Buffer.alloc(65536);
    const n = readSync(fd, buf, 0, 65536, 0);
    closeSync(fd);
    for (const line of buf.toString("utf8", 0, n).split("\n")) {
      if (!line.trim()) continue;
      try {
        const ts = Date.parse(JSON.parse(line)?.timestamp);
        if (Number.isFinite(ts)) return ts;
      } catch { /* meta entry or line truncated at the 64KB boundary */ }
    }
    return statSync(path).birthtimeMs || null;
  } catch { return null; }
}

function sessionSegment(stdin) {
  let minutes = 0;
  const start = stdin?.transcript_path ? sessionStartMs(stdin.transcript_path) : null;
  if (start) minutes = Math.max(0, Math.floor((Date.now() - start) / 60000));
  const color = minutes > 120 ? RED : minutes > 60 ? YELLOW : GREEN;
  return `session:${color}${minutes}m${R}`;
}

// ---------- rate limits: stdin first, OAuth usage API fallback ----------
function limitsFromStdin(stdin) {
  const rl = stdin?.rate_limits;
  if (rl?.five_hour?.used_percentage == null && rl?.seven_day?.used_percentage == null) return null;
  return {
    fiveHour: { pct: rl.five_hour?.used_percentage, resetsAt: rl.five_hour?.resets_at },
    week: { pct: rl.seven_day?.used_percentage, resetsAt: rl.seven_day?.resets_at },
  };
}

const CACHE_FILE = join(tmpdir(), "hud-usage-cache.json");
const CACHE_TTL_MS = 90_000;

async function limitsFromApi() {
  try {
    const cached = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    if (Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;
  } catch { /* no cache */ }
  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
    const raw = JSON.parse(readFileSync(join(configDir, ".credentials.json"), "utf8"));
    const creds = raw.claudeAiOauth ?? raw;
    // No refresh here: Claude Code keeps this token fresh; expired -> skip quietly.
    if (!creds.accessToken || (creds.expiresAt && creds.expiresAt <= Date.now())) return null;
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const data = {
      fiveHour: { pct: body.five_hour?.utilization, resetsAt: body.five_hour?.resets_at },
      week: { pct: body.seven_day?.utilization, resetsAt: body.seven_day?.resets_at },
    };
    try { writeFileSync(CACHE_FILE, JSON.stringify({ ts: Date.now(), data })); } catch { /* best effort */ }
    return data;
  } catch { return null; }
}

// ---------- main ----------
async function main() {
  const stdin = await readStdin();
  const limits = limitsFromStdin(stdin) ?? await limitsFromApi();

  const segments = [
    modelSegment(stdin),
    limits ? limitSegment("5h", limits.fiveHour.pct, limits.fiveHour.resetsAt) : null,
    limits ? limitSegment("wk", limits.week.pct, limits.week.resetsAt, { dimLabel: true }) : null,
    sessionSegment(stdin),
    contextSegment(stdin),
  ].filter(Boolean);

  console.log(segments.join(SEP));
}

main().catch(() => console.log(`${DIM}hud: err${R}`));
