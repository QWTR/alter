// Token usage of the AI apps on this computer, read from their own local logs (nothing leaves the computer):
//   Claude Code  ~/.claude/projects/**/*.jsonl   (assistant messages carry message.usage + model)
//   Codex CLI    ~/.codex/sessions/**/*.jsonl    (token_count events, model in session/turn context)
//   Gemini CLI   ~/.gemini/tmp/**/chats/*.json   (messages with a tokens block)
// Files are read incrementally (only the new bytes since last time) and kept per file, so even GBs of logs stay cheap.
// "API value" is an estimate of what these tokens would cost on the pay-as-you-go APIs — with a subscription you do not pay it.
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { usageSummary } from './usage.ts';

type Source = 'claude' | 'codex' | 'gemini';
interface Bucket { input: number; output: number; cacheRead: number; cacheWrite: number; messages: number }
/** day → model → bucket */
type DayMap = Map<string, Map<string, Bucket>>;
interface FileState { size: number; mtime: number; offset: number; rest: string; days: DayMap; project: string; seen: Set<string>; model: string }

const cache = new Map<string, FileState>();
const empty = (): Bucket => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, messages: 0 });
const localDay = (ts: string | number) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function add(days: DayMap, day: string | null, model: string, b: Partial<Bucket>) {
  if (!day) return;
  const m = days.get(day) ?? new Map<string, Bucket>();
  days.set(day, m);
  const x = m.get(model) ?? empty();
  m.set(model, x);
  x.input += b.input ?? 0;
  x.output += b.output ?? 0;
  x.cacheRead += b.cacheRead ?? 0;
  x.cacheWrite += b.cacheWrite ?? 0;
  x.messages += b.messages ?? 1;
}

function* walk(dir: string, ext: string, depth = 0): Generator<string> {
  if (depth > 6 || !existsSync(dir)) return;
  let list: import('node:fs').Dirent[] = [];
  try { list = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of list) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, ext, depth + 1);
    else if (e.name.endsWith(ext)) yield p;
  }
}

/** The core runs inside the desktop app's main process: long sync work freezes the window, so give way often. */
let sliceStart = Date.now();
async function breathe() {
  if (Date.now() - sliceStart < 12) return;
  await new Promise((r) => setImmediate(r));
  sliceStart = Date.now();
}

/** Reads the bytes added since last time and feeds whole lines to `onLine`. */
async function readNew(file: string, st: FileState, onLine: (line: string) => void) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 18);
    let pos = st.offset;
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, pos);
      if (n <= 0) break;
      pos += n;
      const text = st.rest + buf.subarray(0, n).toString('utf8');
      const lines = text.split('\n');
      st.rest = lines.pop() ?? '';
      for (const l of lines) if (l) onLine(l);
      await breathe();
    }
    st.offset = pos;
  } finally {
    closeSync(fd);
  }
}

function fresh(file: string, project: string): FileState {
  return { size: 0, mtime: 0, offset: 0, rest: '', days: new Map(), project, seen: new Set(), model: 'unknown' };
}

async function claudeFile(file: string, since: number) {
  const s = statSync(file);
  let st = cache.get(file);
  if (st && st.offset === s.size && s.mtimeMs === st.mtime) return st;
  if (!st || s.size < st.offset) { st = fresh(file, basename(join(file, '..'))); cache.set(file, st); }
  if (s.mtimeMs < since && !st.offset) return st; // too old for this range: read it only when a longer range asks // too old to matter now; read when asked for a longer range
  await readNew(file, st, (l) => {
    if (!l.includes('"usage"')) {
      if (st!.project.startsWith('C--') || st!.project.startsWith('D--')) { const m = l.match(/"cwd":"((?:[^"\\]|\\.)*)"/); if (m) st!.project = JSON.parse(`"${m[1]}"`); }
      return;
    }
    let j: any;
    try { j = JSON.parse(l); } catch { return; }
    if (j.cwd && /^[A-Z]--/.test(st!.project)) st!.project = j.cwd;
    const msg = j.message;
    const u = msg?.usage;
    if (!u || j.type !== 'assistant') return;
    const key = `${msg.id ?? ''}:${j.requestId ?? ''}`;
    if (st!.seen.has(key)) return;
    st!.seen.add(key);
    const model = String(msg.model ?? 'claude');
    if (model === '<synthetic>') return;
    add(st!.days, localDay(j.timestamp), model, { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 });
  });
  st.size = s.size;
  st.mtime = s.mtimeMs;
  return st;
}

async function codexFile(file: string, since: number) {
  const s = statSync(file);
  let st = cache.get(file);
  if (st && st.offset === s.size && s.mtimeMs === st.mtime) return st;
  if (!st || s.size < st.offset) { st = fresh(file, ''); cache.set(file, st); }
  if (s.mtimeMs < since && !st.offset) return st;
  await readNew(file, st, (l) => {
    if (!l.includes('token_count') && !l.includes('"model"') && !l.includes('"cwd"')) return;
    let j: any;
    try { j = JSON.parse(l); } catch { return; }
    const p = j.payload ?? {};
    if (p.cwd && !st!.project) st!.project = p.cwd;
    if (typeof p.model === 'string') st!.model = p.model;
    if (p.type !== 'token_count') return;
    const u = p.info?.last_token_usage;
    if (!u) return;
    const cached = u.cached_input_tokens ?? 0;
    let input = Math.max(0, (u.input_tokens ?? 0) - cached);
    const output = (u.output_tokens ?? 0) + 0;
    if (!input && !output && !cached && u.total_tokens) input = u.total_tokens; // some builds only fill the total
    if (!input && !output && !cached) return;
    add(st!.days, localDay(j.timestamp), st!.model, { input, output, cacheRead: cached, cacheWrite: u.cache_write_input_tokens ?? 0 });
  });
  st.size = s.size;
  st.mtime = s.mtimeMs;
  return st;
}

async function geminiFile(file: string) {
  const s = statSync(file);
  let st = cache.get(file);
  if (st && s.size === st.size && s.mtimeMs === st.mtime) return st;
  st = fresh(file, '');
  cache.set(file, st);
  try {
    const raw = require_json(file);
    await breathe();
    const msgs: any[] = Array.isArray(raw) ? raw : raw.messages ?? [];
    for (const m of msgs) {
      const t = m.tokens;
      if (!t) continue;
      add(st.days, localDay(m.timestamp ?? raw.startTime ?? s.mtimeMs), String(m.model ?? 'gemini'), { input: Math.max(0, (t.input ?? 0) - (t.cached ?? 0)), output: (t.output ?? 0) + (t.thoughts ?? 0), cacheRead: t.cached ?? 0 });
    }
    if (raw.projectHash) st.project = String(raw.projectHash).slice(0, 8);
  } catch {}
  st.size = s.size;
  st.mtime = s.mtimeMs;
  return st;
}
function require_json(file: string) {
  const fd = openSync(file, 'r');
  try {
    const size = statSync(file).size;
    const buf = Buffer.alloc(size);
    readSync(fd, buf, 0, size, 0);
    return JSON.parse(buf.toString('utf8'));
  } finally {
    closeSync(fd);
  }
}

// ---------- price estimate (USD per 1M tokens: input, output, cache read, cache write) ----------
const PRICES: [RegExp, [number, number, number, number]][] = [
  [/fable|mythos/i, [8, 40, 0.2, 10]],
  [/opus/i, [5, 25, 0.5, 6.25]],
  [/sonnet/i, [3, 15, 0.3, 3.75]],
  [/haiku/i, [1, 5, 0.1, 1.25]],
  [/gemini.*flash/i, [0.3, 2.5, 0.075, 0]],
  [/gemini/i, [1.25, 10, 0.31, 0]],
  [/mini|nano/i, [0.25, 2, 0.025, 0]],
  [/gpt|codex|o\d/i, [1.25, 10, 0.125, 0]],
];
const priceOf = (model: string) => PRICES.find(([re]) => re.test(model))?.[1] ?? [1, 5, 0.1, 1.25];
const valueOf = (model: string, b: Bucket) => {
  const [i, o, r, w] = priceOf(model);
  return (b.input * i + b.output * o + b.cacheRead * r + b.cacheWrite * w) / 1e6;
};
const sourceOf = (model: string): Source => (/claude|opus|sonnet|haiku|fable/i.test(model) ? 'claude' : /gemini/i.test(model) ? 'gemini' : 'codex');
const shortProject = (p: string) => (p ? p.split(/[\\/]/).filter(Boolean).slice(-2).join('/') : '');

let running: Promise<unknown> | null = null;

type LocalUsage = Awaited<ReturnType<typeof scanUsage>>;
const results = new Map<number, { at: number; data: LocalUsage }>();

/** Instant answer: the last scan (if under 10 min old it is refreshed in the background), else a scan now. */
export async function localUsage(days = 30, _phone = false) {
  days = Math.min(365, Math.max(1, Math.round(days) || 30));
  const hit = results.get(days);
  if (hit) {
    if (Date.now() - hit.at > 45_000) void scanUsage(days).catch(() => {});
    if (Date.now() - hit.at < 10 * 60_000) return { ...hit.data, alter: usageSummary(days) };
  }
  return scanUsage(days);
}

/** Warm the cache a little after start, so opening Usage the first time is instant too. */
export function warmUsage() {
  setTimeout(() => { void (async () => { for (const d of [30, 7, 90]) await scanUsage(d).catch(() => {}); })(); }, 40_000).unref?.();
}

/** Totals for the last `days` days: per day (stacked by app), per model, per project. */
async function scanUsage(days: number) {
  days = Math.min(365, Math.max(1, Math.round(days) || 30));
  // one scan at a time (a big first scan can take a few seconds)
  while (running) await running.catch(() => {});
  let done!: () => void;
  running = new Promise<void>((r) => (done = r));
  try {
    const since = Date.now() - days * 86_400_000;
    const sinceDay = localDay(since)!;
    const home = homedir();
    const files: { file: string; src: Source }[] = [];
    for (const f of walk(join(home, '.claude', 'projects'), '.jsonl')) { files.push({ file: f, src: 'claude' }); if (files.length % 200 === 0) await breathe(); }
    for (const f of walk(join(home, '.codex', 'sessions'), '.jsonl')) files.push({ file: f, src: 'codex' });
    for (const f of walk(join(home, '.gemini', 'tmp'), '.json')) if (/[\\/]chats[\\/]/.test(f)) files.push({ file: f, src: 'gemini' });

    const daily = new Map<string, Record<Source, number>>();
    const models = new Map<string, Bucket & { value: number; source: Source }>();
    const projects = new Map<string, { tokens: number; value: number; messages: number }>();
    const tot = { ...empty(), value: 0 };
    let i = 0;
    for (const { file, src } of files) {
      if (++i % 20 === 0) await breathe();
      let st: FileState;
      try { st = src === 'claude' ? await claudeFile(file, since) : src === 'codex' ? await codexFile(file, since) : await geminiFile(file); } catch { continue; }
      for (const [day, byModel] of st.days) {
        if (day < sinceDay) continue;
        for (const [model, b] of byModel) {
          const value = valueOf(model, b);
          const tokens = b.input + b.output + b.cacheRead + b.cacheWrite;
          const s = sourceOf(model);
          const d = daily.get(day) ?? { claude: 0, codex: 0, gemini: 0 };
          d[s] += tokens;
          daily.set(day, d);
          const m = models.get(model) ?? { ...empty(), value: 0, source: s };
          m.input += b.input; m.output += b.output; m.cacheRead += b.cacheRead; m.cacheWrite += b.cacheWrite; m.messages += b.messages; m.value += value;
          models.set(model, m);
          const pk = shortProject(st.project) || '—';
          const p = projects.get(pk) ?? { tokens: 0, value: 0, messages: 0 };
          p.tokens += tokens; p.value += value; p.messages += b.messages;
          projects.set(pk, p);
          tot.input += b.input; tot.output += b.output; tot.cacheRead += b.cacheRead; tot.cacheWrite += b.cacheWrite; tot.messages += b.messages; tot.value += value;
        }
      }
    }
    // every day in the range, also the empty ones (so the chart has no gaps)
    const series: { day: string; claude: number; codex: number; gemini: number }[] = [];
    for (let t = since + 86_400_000; t <= Date.now() + 1000; t += 86_400_000) {
      const day = localDay(t)!;
      series.push({ day, ...(daily.get(day) ?? { claude: 0, codex: 0, gemini: 0 }) });
    }
    const data = {
      days,
      total: tot,
      daily: series,
      models: [...models.entries()].map(([model, m]) => ({ model, ...m })).sort((a, b) => b.value - a.value),
      projects: [...projects.entries()].map(([project, p]) => ({ project, ...p })).sort((a, b) => b.tokens - a.tokens).slice(0, 12),
      sources: { claude: existsSync(join(home, '.claude', 'projects')), codex: existsSync(join(home, '.codex', 'sessions')), gemini: existsSync(join(home, '.gemini')) },
      alter: usageSummary(days),
    };
    results.set(days, { at: Date.now(), data });
    return data;
  } finally {
    running = null;
    done();
  }
}
