// Problem reports ("Report a problem"): the user describes what went wrong, the app adds a little technical context
// (version, platform, the screen, recent error lines — scrubbed of tokens, paths and emails) and sends it to the
// ALTTER repair server, which triages it, fixes it with AI and ships an update. The user sees exactly what is sent.
import { randomUUID } from 'node:crypto';
import { release, platform, arch } from 'node:os';
import { loadConfig, saveConfig } from './config.ts';
import { VERSION } from './version.ts';

export const REPAIR_URL = 'https://altter.v-room.app/_repair';
export const REPORT_KINDS = ['bug', 'ui', 'idea', 'other'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export interface ReportMessage { from: 'ai' | 'team' | 'user'; text: string; at: string }
export interface SentReport { id: string; kind: ReportKind; title: string; at: string; status?: string; fixedIn?: string | null; note?: string; messages?: ReportMessage[] }

// the last error lines of this core — collected from console.error / console.warn
const recent: string[] = [];
for (const level of ['error', 'warn'] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    try {
      const line = args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack?.split('\n').slice(1, 4).join('\n') ?? ''}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      recent.push(`${new Date().toISOString().slice(11, 19)} ${level}: ${line}`.slice(0, 600));
      if (recent.length > 30) recent.shift();
    } catch {}
    orig(...args);
  };
}

/** Removes what must never leave the computer: tokens/keys, the user's folders, emails, IPs. */
export function scrub(s: string): string {
  return String(s ?? '')
    .replace(/[A-Za-z]:\\Users\\[^\\\s"']+/gi, '~')
    .replace(/\/(home|Users)\/[^/\s"']+/g, '~')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
    .replace(/(key|token|secret|password|authorization|bearer)(["'=:\s]+)[^\s"'&,}]+/gi, '$1$2[hidden]')
    .replace(/\b(ws:)?[A-Za-z0-9_-]{24,}\b/g, '[hidden]');
}

function installId(): string {
  const c = loadConfig() as any;
  if (!c.installId) {
    c.installId = randomUUID();
    saveConfig();
  }
  return c.installId;
}
const repairUrl = () => String((loadConfig() as any).repairUrl || process.env.ALTER_REPAIR_URL || REPAIR_URL).replace(/\/$/, '');

export interface ReportInput { kind?: string; text?: string; route?: string; clientErrors?: string[]; includeTech?: boolean; screen?: string; lang?: string; images?: string[] }

/** Screenshots the user attached: up to 4 PNG/JPEG/WebP data URLs, 2.5 MB each. */
export const MAX_IMAGES = 4;
function cleanImages(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x): x is string => typeof x === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(x) && x.length < 3_500_000)
    .slice(0, MAX_IMAGES);
}

/** What would be sent — the UI shows this to the user before they press Send. */
export function buildReport(input: ReportInput) {
  const kind = (REPORT_KINDS as readonly string[]).includes(String(input.kind)) ? (input.kind as ReportKind) : 'bug';
  const text = String(input.text ?? '').trim().slice(0, 4000);
  const tech = input.includeTech === false ? undefined : {
    version: VERSION,
    platform: `${platform()} ${release()} ${arch()}`,
    app: process.versions.electron ? `desktop (electron ${process.versions.electron})` : `server (node ${process.versions.node})`,
    route: scrub(String(input.route ?? '')).slice(0, 200),
    screen: String(input.screen ?? '').slice(0, 40),
    errors: [...(input.clientErrors ?? []).slice(-15).map((e) => `web: ${e}`), ...recent.slice(-15)].map((e) => scrub(e).slice(0, 600)),
  };
  return { kind, text, lang: String(input.lang ?? loadConfig().language).slice(0, 5), version: VERSION, tech, images: cleanImages(input.images) };
}

function sentList(): SentReport[] {
  const c = loadConfig() as any;
  return (c.sentReports ??= []);
}

export async function sendReport(input: ReportInput): Promise<SentReport> {
  const body = buildReport(input);
  if (body.text.length < 8) throw new Error('Describe the problem in a few words');
  const r = await fetch(`${repairUrl()}/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': `ALTTER/${VERSION}` },
    body: JSON.stringify({ ...body, installId: installId() }),
    signal: AbortSignal.timeout(body.images.length ? 90_000 : 20_000),
  }).catch(() => {
    throw new Error('The repair server cannot be reached — check the internet connection and try again');
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string; status?: string };
  if (!r.ok || !j.id) throw new Error(j.error || `The repair server answered ${r.status}`);
  const item: SentReport = { id: j.id, kind: body.kind, title: body.text.split('\n')[0].slice(0, 120), at: new Date().toISOString(), status: j.status ?? 'new' };
  const list = sentList();
  list.unshift(item);
  list.splice(30);
  saveConfig();
  return item;
}

/** My reports with their current state on the repair server (fixed in which version, rejected, waiting…). */
export async function myReports(): Promise<SentReport[]> {
  const list = sentList();
  if (!list.length) return list;
  try {
    const r = await fetch(`${repairUrl()}/status?ids=${list.map((x) => x.id).join(',')}`, { headers: { 'user-agent': `ALTTER/${VERSION}` }, signal: AbortSignal.timeout(10_000) });
    if (r.ok) {
      const j = (await r.json()) as Record<string, { status: string; fixedIn?: string | null; note?: string; messages?: ReportMessage[] }>;
      for (const x of list) if (j[x.id]) Object.assign(x, j[x.id]);
      saveConfig();
    }
  } catch {}
  return list;
}

/** Answers a question from the repair server (or the team) about one of my reports. */
export async function replyReport(id: string, text: string): Promise<SentReport> {
  const item = sentList().find((x) => x.id === id);
  if (!item) throw new Error('No such report');
  const t = String(text ?? '').trim();
  if (t.length < 2) throw new Error('Write an answer');
  const r = await fetch(`${repairUrl()}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': `ALTTER/${VERSION}` },
    body: JSON.stringify({ id, text: scrub(t).slice(0, 2000), installId: installId() }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => {
    throw new Error('The repair server cannot be reached — check the internet connection and try again');
  });
  const j = (await r.json().catch(() => ({}))) as { status?: string; messages?: ReportMessage[]; error?: string };
  if (!r.ok) throw new Error(j.error || `The repair server answered ${r.status}`);
  if (j.status) item.status = j.status;
  if (j.messages) item.messages = j.messages;
  saveConfig();
  return item;
}

// ---------------------------------------------------------------- usage statistics
// Every few minutes the computer tells the repair server "this install is on": a random install id (hashed there),
// the version, the system, the language and how many phones are paired. Nothing else — no names, chats or files.
// Off with Settings → Data and privacy, config.usageStats = false or ALTER_NO_UPDATE_CHECK / ALTER_NO_STATS.
let pingTimer: ReturnType<typeof setInterval> | undefined;
export async function pingUsage(): Promise<void> {
  const c = loadConfig() as any;
  if (c.usageStats === false || process.env.ALTER_NO_STATS || process.env.ALTER_NO_UPDATE_CHECK) return;
  await fetch(`${repairUrl()}/ping`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': `ALTTER/${VERSION}` },
    body: JSON.stringify({
      installId: installId(),
      version: VERSION,
      os: platform(),
      platform: `${platform()} ${release()} ${arch()}`,
      app: process.versions.electron ? 'desktop' : 'server',
      lang: String(c.language ?? ''),
      devices: Array.isArray(c.devices) ? c.devices.length : 0,
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {});
}
export function startUsagePings() {
  if (pingTimer) return;
  setTimeout(() => void pingUsage(), 30_000);
  pingTimer = setInterval(() => void pingUsage(), 5 * 60_000);
  pingTimer.unref?.();
}
