// How much of each subscription ALTTER uses, and what to do when a subscription hits its limit.
// Every provider run goes through `instrument()`: tokens are recorded per day and a "usage limit"
// error marks the provider as limited until its reset time, so ALTTER can switch to another one.
import { all, getDb, run } from './db.ts';
import { loadConfig, saveConfig } from './config.ts';
import { emit } from './events.ts';
import type { Provider, RunOptions, RunResult, Usage } from './providers/types.ts';

export interface UsageRow { day: string; provider: string; runs: number; input: number; output: number; cached: number; cost: number }
export interface Limit { provider: string; message: string; until: string | null; at: string }

const limits = new Map<string, Limit>();
let schemaReady = false;

function ensureSchema() {
  if (schemaReady) return;
  getDb().exec(`CREATE TABLE IF NOT EXISTS usage (
    day TEXT NOT NULL, provider TEXT NOT NULL, runs INTEGER NOT NULL DEFAULT 0,
    input INTEGER NOT NULL DEFAULT 0, output INTEGER NOT NULL DEFAULT 0, cached INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (day, provider))`);
  schemaReady = true;
}

const today = () => new Date().toISOString().slice(0, 10);
const estimate = (s: string) => Math.ceil(s.length / 4);

export function recordUsage(provider: string, u: Usage) {
  ensureSchema();
  run(
    `INSERT INTO usage (day, provider, runs, input, output, cached, cost) VALUES (?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(day, provider) DO UPDATE SET runs = runs + 1, input = input + excluded.input, output = output + excluded.output,
       cached = cached + excluded.cached, cost = cost + excluded.cost`,
    today(), provider, u.input, u.output, u.cached ?? 0, u.costUsd ?? 0,
  );
}

/** Totals for the last `days` days, per provider, plus today's numbers. */
export function usageSummary(days = 30) {
  ensureSchema();
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = all<UsageRow>('SELECT * FROM usage WHERE day >= ? ORDER BY day', since);
  const byProvider: Record<string, { runs: number; input: number; output: number; cached: number; cost: number; today: { runs: number; input: number; output: number } }> = {};
  for (const r of rows) {
    const p = (byProvider[r.provider] ??= { runs: 0, input: 0, output: 0, cached: 0, cost: 0, today: { runs: 0, input: 0, output: 0 } });
    p.runs += r.runs;
    p.input += r.input;
    p.output += r.output;
    p.cached += r.cached;
    p.cost += r.cost;
    if (r.day === today()) p.today = { runs: r.runs, input: r.input, output: r.output };
  }
  return { days, byProvider, daily: rows, limits: [...activeLimits().values()] };
}

// ---------- limits ----------
const LIMIT_RE = /usage limit|limit (has been )?reached|rate.?limit|quota|resource.?exhausted|too many requests|\b429\b|out of (credits|messages)|upgrade to (pro|plus|max)/i;

export const isLimitError = (msg: string) => LIMIT_RE.test(msg);

function parseReset(msg: string): string | null {
  // "resets 6pm", "resets at 18:00", "try again in 3 hours", "reset at 2026-11-22T18:00:00Z"
  const iso = msg.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?/);
  if (iso) return new Date(iso[0]).toISOString();
  const inH = msg.match(/in (\d+)\s*(hours?|h|minutes?|min|m)\b/i);
  if (inH) return new Date(Date.now() + Number(inH[1]) * (/^h/i.test(inH[2]) ? 3_600_000 : 60_000)).toISOString();
  const at = msg.match(/reset[s]?\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (at) {
    let h = Number(at[1]) % 24;
    if (at[3]?.toLowerCase() === 'pm' && h < 12) h += 12;
    if (at[3]?.toLowerCase() === 'am' && h === 12) h = 0;
    const d = new Date();
    d.setHours(h, Number(at[2] ?? 0), 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  return new Date(Date.now() + 60 * 60_000).toISOString(); // unknown → assume an hour
}

export function activeLimits(): Map<string, Limit> {
  for (const [id, l] of limits) if (l.until && new Date(l.until).getTime() < Date.now()) limits.delete(id);
  return limits;
}
export const isLimited = (id: string) => activeLimits().has(id);
export function clearLimit(id: string) {
  limits.delete(id);
}

/** Wraps a provider so every run is counted and limit errors are noticed. */
export function instrument(p: Provider): Provider {
  return {
    ...p,
    async run(opts: RunOptions): Promise<RunResult> {
      try {
        const res = await p.run(opts);
        if (p.id !== 'demo') recordUsage(p.id, res.usage ?? { input: estimate(opts.prompt), output: estimate(res.text) });
        if (limits.has(p.id)) limits.delete(p.id);
        // a real answer proves the subscription works: show it as connected without a separate test
        if (p.id !== 'demo') {
          const cfg = loadConfig();
          if (!cfg.providerHealth[p.id]?.ok) {
            cfg.providerHealth[p.id] = { ok: true, checkedAt: new Date().toISOString() };
            saveConfig();
            emit('provider.tested', { id: p.id, ok: true });
          }
        }
        return res;
      } catch (err) {
        const msg = (err as Error).message ?? '';
        if (p.id !== 'demo' && isLimitError(msg)) {
          const l: Limit = { provider: p.id, message: msg.slice(0, 300), until: parseReset(msg), at: new Date().toISOString() };
          limits.set(p.id, l);
          emit('usage.limit', l);
          throw new LimitError(p.id, l);
        }
        throw err;
      }
    },
  };
}

export class LimitError extends Error {
  provider: string;
  limit: Limit;
  constructor(provider: string, limit: Limit) {
    super(`limit:${provider}: ${limit.message}`);
    this.provider = provider;
    this.limit = limit;
  }
}
