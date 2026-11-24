// Built-in calendars: any calendar that can share an iCal (ICS) link — Google Calendar ("Secret address in iCal
// format"), Outlook / Microsoft 365 ("Publish calendar → ICS"), iCloud ("Public calendar"), Proton, Fastmail…
// Read-only, no sign-in, no cloud app: the link is fetched by this computer and the upcoming events go into the
// AI's prompt when the message is about plans, meetings or the calendar.
import { randomBytes } from 'node:crypto';
import { loadConfig, saveConfig } from './config.ts';

export interface CalendarLink { id: string; name: string; url: string; color?: string; addedAt: string }
export interface CalEvent { calendar: string; title: string; start: number; end: number; allDay: boolean; location?: string }

const COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; events: Raw[] }>();

export function calendars(): CalendarLink[] {
  const cfg = loadConfig() as unknown as { calendars?: CalendarLink[] };
  return cfg.calendars ?? [];
}
function save(list: CalendarLink[]) {
  (loadConfig() as unknown as { calendars?: CalendarLink[] }).calendars = list;
  saveConfig();
}
/** The link is a secret (anyone with it can read the calendar): the UI only ever sees its host. */
export const publicCalendars = () => calendars().map((c) => ({ id: c.id, name: c.name, color: c.color, host: hostOf(c.url), addedAt: c.addedAt }));
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return ''; } };

export async function addCalendar(name: string, rawUrl: string): Promise<{ id: string; events: number }> {
  let url = rawUrl.trim().replace(/^webcals?:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(url)) throw new Error('Paste the calendar\'s iCal / ICS link (it starts with https:// or webcal://)');
  const raw = await fetchIcs(url, true);
  const list = calendars();
  if (list.some((c) => c.url === url)) throw new Error('This calendar is already added');
  const guess = name.trim() || calName(raw.text) || (hostOf(url).includes('google') ? 'Google Calendar' : /outlook|office|live\.com/.test(hostOf(url)) ? 'Outlook' : /icloud/.test(hostOf(url)) ? 'iCloud' : 'Calendar');
  const id = randomBytes(5).toString('hex');
  list.push({ id, name: guess.slice(0, 60), url, color: COLORS[list.length % COLORS.length], addedAt: new Date().toISOString() });
  save(list);
  return { id, events: raw.events.length };
}
export function removeCalendar(id: string) {
  const list = calendars();
  const c = list.find((x) => x.id === id);
  if (c) cache.delete(c.url);
  save(list.filter((x) => x.id !== id));
}

async function fetchIcs(url: string, fresh = false): Promise<{ text: string; events: Raw[] }> {
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return { text: '', events: hit.events };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'ALTTER calendar', accept: 'text/calendar, */*' } });
    if (!r.ok) throw new Error(`The calendar link answered ${r.status}${r.status === 404 || r.status === 403 ? ' — check that the link is the secret / published iCal address' : ''}`);
    const text = await r.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That link is not an iCal calendar (no BEGIN:VCALENDAR). Use the "iCal / ICS" address, not the normal web page.');
    const events = parseIcs(text);
    cache.set(url, { at: Date.now(), events });
    return { text, events };
  } catch (e) {
    if (hit) return { text: '', events: hit.events }; // offline: last good copy
    throw new Error((e as Error).name === 'AbortError' ? 'The calendar link did not answer in 15 s' : (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- ICS parsing ----------
interface Wall { y: number; m: number; d: number; h: number; mi: number; s: number }
interface Stamp { wall: Wall; tz: string | null; utc: boolean; date: boolean }
interface Raw {
  uid: string; title: string; location?: string; start: Stamp; end?: Stamp; durationMs?: number;
  rrule?: Record<string, string>; exdates: number[]; recurrenceId?: number; cancelled: boolean;
}

const unfold = (t: string) => t.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
const unescape = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
const calName = (t: string) => { const m = /^X-WR-CALNAME:(.+)$/m.exec(unfold(t)); return m ? unescape(m[1]) : ''; };

function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  // NAME;PARAM=x;PARAM="y:z":value — the value starts at the first ':' outside quotes
  let q = false, i = 0;
  for (; i < line.length; i++) { const ch = line[i]; if (ch === '"') q = !q; else if (ch === ':' && !q) break; }
  if (i >= line.length) return null;
  const [name, ...ps] = line.slice(0, i).split(';');
  const params: Record<string, string> = {};
  for (const p of ps) { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ''); }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

function parseStamp(value: string, params: Record<string, string>): Stamp | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(value.trim());
  if (!m) return null;
  const date = params.VALUE === 'DATE' || !m[4];
  return { wall: { y: +m[1], m: +m[2], d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0), s: +(m[6] ?? 0) }, tz: params.TZID ?? null, utc: !!m[7], date };
}

function parseDuration(v: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return 0;
  const ms = ((+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 86400 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

export function parseIcs(text: string): Raw[] {
  const out: Raw[] = [];
  let cur: Raw | null = null;
  let depth = 0; // skip VALARM etc. nested inside VEVENT
  for (const line of unfold(text).split('\n')) {
    if (!line) continue;
    if (/^BEGIN:VEVENT/i.test(line)) { cur = { uid: '', title: '', start: null as unknown as Stamp, exdates: [], cancelled: false }; depth = 0; continue; }
    if (!cur) continue;
    if (/^BEGIN:/i.test(line)) { depth++; continue; }
    if (/^END:VEVENT/i.test(line)) { if (cur.start) out.push(cur); cur = null; continue; }
    if (/^END:/i.test(line)) { depth--; continue; }
    if (depth > 0) continue;
    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value.trim(); break;
      case 'SUMMARY': cur.title = unescape(p.value); break;
      case 'LOCATION': cur.location = unescape(p.value) || undefined; break;
      case 'STATUS': cur.cancelled = /CANCELLED/i.test(p.value); break;
      case 'DTSTART': cur.start = parseStamp(p.value, p.params)!; break;
      case 'DTEND': cur.end = parseStamp(p.value, p.params) ?? undefined; break;
      case 'DURATION': cur.durationMs = parseDuration(p.value); break;
      case 'RRULE': cur.rrule = Object.fromEntries(p.value.split(';').map((kv) => { const [k, v] = kv.split('='); return [k.toUpperCase(), v ?? '']; })); break;
      case 'EXDATE': for (const v of p.value.split(',')) { const s = parseStamp(v, p.params); if (s) cur.exdates.push(toMs(s)); } break;
      case 'RECURRENCE-ID': { const s = parseStamp(p.value, p.params); if (s) cur.recurrenceId = toMs(s); break; }
    }
  }
  return out;
}

// ---------- time zones ----------
// Outlook writes Windows zone names; map the common ones to IANA so Intl understands them.
const WINDOWS_TZ: Record<string, string> = {
  'Central European Standard Time': 'Europe/Warsaw', 'Central Europe Standard Time': 'Europe/Budapest', 'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris', 'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Kyiv', 'GTB Standard Time': 'Europe/Bucharest',
  'Russian Standard Time': 'Europe/Moscow', 'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles', 'UTC': 'UTC', 'Coordinated Universal Time': 'UTC',
  'Tokyo Standard Time': 'Asia/Tokyo', 'China Standard Time': 'Asia/Shanghai', 'India Standard Time': 'Asia/Kolkata', 'AUS Eastern Standard Time': 'Australia/Sydney',
};
const fmtCache = new Map<string, Intl.DateTimeFormat | null>();
function zone(tz: string): Intl.DateTimeFormat | null {
  if (fmtCache.has(tz)) return fmtCache.get(tz)!;
  let f: Intl.DateTimeFormat | null = null;
  const name = WINDOWS_TZ[tz] ?? tz.replace(/^\/[^/]*\/[^/]*\//, ''); // "/mozilla.org/20050126_1/Europe/Warsaw"
  try { f = new Intl.DateTimeFormat('en-US', { timeZone: name, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); } catch { f = null; }
  fmtCache.set(tz, f);
  return f;
}
/** Offset (ms) of a zone at a UTC instant. */
function offsetAt(f: Intl.DateTimeFormat, utc: number): number {
  const p = Object.fromEntries(f.formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(utc / 1000) * 1000;
}
function toMs(s: Stamp, w: Wall = s.wall): number {
  const naive = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  if (s.utc) return naive;
  const f = s.tz && !s.date ? zone(s.tz) : null;
  if (!f) return new Date(w.y, w.m - 1, w.d, w.h, w.mi, w.s).getTime(); // floating / all-day / unknown zone: this computer's time
  let t = naive - offsetAt(f, naive);
  t = naive - offsetAt(f, t); // second pass settles DST edges
  return t;
}

// ---------- recurrence ----------
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const addDays = (w: Wall, n: number): Wall => { const d = new Date(Date.UTC(w.y, w.m - 1, w.d + n)); return { ...w, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
const dow = (w: Wall) => new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay();
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Start walls of each occurrence, in order, until `until` (UTC ms) — capped so a bad rule can't loop forever. */
function occurrences(ev: Raw, until: number, from = 0): number[] {
  const r = ev.rrule;
  const first = toMs(ev.start);
  if (!r) return [first];
  const freq = r.FREQ;
  const interval = Math.max(1, +(r.INTERVAL || 1));
  const count = r.COUNT ? +r.COUNT : Infinity;
  const end = r.UNTIL ? toMs(parseStamp(r.UNTIL, {})!) : Infinity;
  const byday = r.BYDAY ? r.BYDAY.split(',').map((x) => /([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)/.exec(x)).filter(Boolean) as RegExpExecArray[] : [];
  const bymonthday = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : [];
  const out: number[] = [];
  let n = 0;
  const push = (w: Wall) => {
    const t = toMs(ev.start, w);
    if (t < first) return true;
    if (t > end || t > until || n >= count) return false;
    n++; out.push(t);
    return true;
  };
  const s = ev.start.wall;
  // old open-ended series: jump close to `from` instead of walking years of past occurrences
  const period = ({ DAILY: 1, WEEKLY: 7, MONTHLY: 31, YEARLY: 366 } as Record<string, number>)[freq] * 86400_000 * interval;
  const skipTo = count === Infinity && period && from > first ? Math.max(0, Math.floor((from - first) / period) - 1) : 0;
  for (let step = skipTo; step < skipTo + 3000; step++) {
    let batch: Wall[] = [];
    if (freq === 'DAILY') batch = [addDays(s, step * interval)];
    else if (freq === 'WEEKLY') {
      const weekStart = addDays(s, step * 7 * interval - ((dow(s) + 6) % 7)); // Monday of that week
      const want = byday.length ? byday.map((b) => DAYS.indexOf(b[2])) : [dow(s)];
      batch = want.map((d) => addDays(weekStart, (d + 6) % 7)).sort((a, b) => Date.UTC(a.y, a.m, a.d) - Date.UTC(b.y, b.m, b.d));
    } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
      const months = freq === 'MONTHLY' ? step * interval : step * interval * 12;
      const y = s.y + Math.floor((s.m - 1 + months) / 12), m = ((s.m - 1 + months) % 12) + 1;
      if (byday.length && freq === 'MONTHLY') {
        for (const b of byday) {
          const target = DAYS.indexOf(b[2]);
          const nth = b[1] ? +b[1] : 0;
          const all: number[] = [];
          for (let d = 1; d <= daysIn(y, m); d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === target) all.push(d);
          const days = nth > 0 ? [all[nth - 1]] : nth < 0 ? [all[all.length + nth]] : all;
          for (const d of days) if (d) batch.push({ ...s, y, m, d });
        }
      } else {
        const ds = bymonthday.length ? bymonthday.map((d) => (d < 0 ? daysIn(y, m) + d + 1 : d)) : [s.d];
        for (const d of ds) if (d >= 1 && d <= daysIn(y, m)) batch.push({ ...s, y, m, d });
      }
      batch.sort((a, b) => a.d - b.d);
    } else return [first];
    for (const w of batch) if (!push(w)) return out;
  }
  return out;
}

/** Events overlapping [from, to), all calendars, sorted. Failing calendars are skipped (and reported). */
export async function upcoming(from = Date.now(), to = from + 14 * 86400_000): Promise<{ events: CalEvent[]; failed: string[] }> {
  const failed: string[] = [];
  const events: CalEvent[] = [];
  await Promise.all(calendars().map(async (c) => {
    let raws: Raw[];
    try { raws = (await fetchIcs(c.url)).events; } catch { failed.push(c.name); return; }
    // moved / edited single occurrences replace their slot in the series
    const moved = new Map<string, Set<number>>();
    for (const e of raws) if (e.recurrenceId != null) { const s = moved.get(e.uid) ?? new Set(); s.add(e.recurrenceId); moved.set(e.uid, s); }
    for (const e of raws) {
      if (e.cancelled) continue;
      const startMs = toMs(e.start);
      const len = e.end ? toMs(e.end) - startMs : e.durationMs ?? (e.start.date ? 86400_000 : 0);
      const skip = new Set([...e.exdates, ...(e.recurrenceId == null ? moved.get(e.uid) ?? [] : [])]);
      for (const t of occurrences(e, to, from)) {
        if (skip.has(t) || t + Math.max(len, 1) <= from || t >= to) continue;
        events.push({ calendar: c.name, title: e.title || '(no title)', start: t, end: t + Math.max(len, 0), allDay: e.start.date, location: e.location });
      }
    }
  }));
  events.sort((a, b) => a.start - b.start || +b.allDay - +a.allDay);
  return { events: events.slice(0, 200), failed };
}

// ---------- the AI's view ----------
const CAL_WORDS = /\b(plan|zaplanuj|planuj|tydzie|tygodni|kalendarz|spotkani|spotkań|termin|jutro|dziś|dzisiaj|pojutrze|grafik|harmonogram|agenda|wolne|wolny|czas na|kiedy|poniedzia|wtor|środ|czwart|piąt|sobot|niedziel|week|calendar|meeting|schedule|today|tomorrow|agenda|free|busy|appointment|monday|tuesday|wednesday|thursday|friday|saturday|sunday|woche|kalender|termin|semana|calendario|reunión|semaine|calendrier|réunion|тиж|календар|зустріч)/i;
export const wantsCalendar = (msg: string) => calendars().length > 0 && CAL_WORDS.test(msg);

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "## Your calendar" block with the next 14 days, in this computer's local time. */
const LINK_WORDS = /(integr|po[dł]ącz|podepn|connect|link|sync|synchron|google|gmail|outlook|microsoft|office|teams|icloud|kalendarz|calendar|slack|jira|notion|hubspot|zapier)/i;
const INTEGRATIONS_HINT = `## Integrations in ALTTER (tell the user when they ask to connect something)
The user connects tools in Settings → Integrations (Ustawienia → Integracje): Calendars (paste a Google / Outlook / iCloud private iCal-ICS link — read-only, then plans include their meetings), Microsoft 365 / Outlook / Teams (sign in with a code), Google Workspace — Gmail, Calendar, Drive, Docs, Sheets (via Rube, one sign-in), Slack, Zoom, Jira & Confluence, Notion, Asana, Trello, monday, ClickUp, Todoist, HubSpot, Pipedrive, Stripe, Canva, Miro, Zapier, Make and more. Don't claim you can see a tool that isn't connected; point to that screen in one line.`;

export async function calendarContext(message: string): Promise<string> {
  const asksToLink = LINK_WORDS.test(message) && /(integr|po[dł]ącz|podepn|connect|zsynchron|sync)/i.test(message);
  if (!calendars().length) return asksToLink || (CAL_WORDS.test(message) && LINK_WORDS.test(message)) ? INTEGRATIONS_HINT : '';
  if (!wantsCalendar(message)) return asksToLink ? INTEGRATIONS_HINT : '';
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const { events, failed } = await upcoming(from, from + 14 * 86400_000);
  const byDay = new Map<string, string[]>();
  const names = calendars().length > 1;
  for (const e of events) {
    const d = new Date(e.start);
    const key = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    const when = e.allDay ? 'all day' : `${hm(d)}–${hm(new Date(e.end))}`;
    const line = `- ${when} ${e.title}${e.location ? ` (${e.location.split('\n')[0].slice(0, 60)})` : ''}${names ? ` [${e.calendar}]` : ''}`;
    byDay.set(key, [...(byDay.get(key) ?? []), line]);
  }
  const days = [...byDay.entries()].map(([d, ls]) => `${d}\n${ls.join('\n')}`).join('\n');
  return [
    `## The user's calendar (read from their linked calendars; now: ${now.toLocaleString('en-GB', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}, this computer's time)`,
    days || 'No events in the next 14 days.',
    failed.length ? `(Could not read: ${failed.join(', ')} — say so if it matters.)` : '',
    'Plan around these fixed events — never put work on top of a meeting. This calendar is read-only: to add an event, tell the user what to add (or give an .ics file) instead of claiming it was added.',
  ].filter(Boolean).join('\n');
}
