// "Put it in my calendar": every plan or list of events the AI shows gets one-click "Add to Google Calendar"
// buttons (no account linking needed) and an .ics for Outlook / Apple / importing everything at once.
import { CalendarPlus, Download, Link2, X } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../i18n';
import { navigate } from '../router';
import { guest } from '../api';

export interface CalEvent { title: string; start: Date; end: Date; allDay: boolean; location?: string; note?: string }

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS: [RegExp, number][] = [[/^(nd|niedz|sun|so\b)/i, 0], [/^(pn|pon|mon)/i, 1], [/^(wt|tue)/i, 2], [/^(śr|sr|wed)/i, 3], [/^(cz|thu)/i, 4], [/^(pt|pi|fri)/i, 5], [/^(sb|sob|sat)/i, 6]];

/** "24.11", "24.11.2026", "2026-11-24" or a weekday label ("Wt", "Monday") → that day. */
export function dayOf(date?: string, label?: string): Date | null {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const s = (date ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.getFullYear();
    const d = new Date(y, +m[2] - 1, +m[1]);
    // "03.01" written in late December means next year
    if (!m[3] && d.getTime() < today.getTime() - 60 * 86400_000) d.setFullYear(y + 1);
    return d;
  }
  const l = (label ?? s).trim();
  if (/^(dziś|dzis|today)/i.test(l)) return today;
  if (/^(jutro|tomorrow)/i.test(l)) return new Date(today.getTime() + 86400_000);
  const wd = WEEKDAYS.find(([re]) => re.test(l))?.[1];
  if (wd == null) return null;
  const d = new Date(today);
  d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
  return d;
}
const at = (day: Date, hhmm?: string) => {
  const m = (hhmm ?? '').match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const d = new Date(day);
  d.setHours(+m[1], +m[2], 0, 0);
  return d;
};

/** Events from the AI's "events" block. */
export function fromEventsBlock(list: { title?: string; start?: string; end?: string; date?: string; time?: string; allDay?: boolean; location?: string; note?: string }[]): CalEvent[] {
  const out: CalEvent[] = [];
  for (const e of list ?? []) {
    if (!e?.title) continue;
    let start = e.start ? new Date(e.start) : null;
    if (start && Number.isNaN(start.getTime())) start = null;
    if (!start) { const day = dayOf(e.date); if (day) start = at(day, e.time) ?? day; }
    if (!start) continue;
    const allDay = e.allDay ?? (!e.time && !/T\d/.test(e.start ?? ''));
    let end = e.end ? new Date(e.end) : null;
    if (!end || Number.isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + (allDay ? 86400_000 : 3600_000));
    out.push({ title: e.title, start, end, allDay, location: e.location, note: e.note });
  }
  return out;
}
/** Events from a day/week plan: every item with a time becomes an event on its day. */
export function fromSchedule(days: { label: string; date?: string; items?: { time?: string; end?: string; title: string; note?: string; kind?: string }[] }[]): CalEvent[] {
  const out: CalEvent[] = [];
  for (const d of days ?? []) {
    const day = dayOf(d.date, d.label);
    if (!day) continue;
    for (const it of d.items ?? []) {
      if (/break|rest|przerw/i.test(it.kind ?? '')) continue;
      const start = at(day, it.time);
      if (!start) continue;
      let end = at(day, it.end);
      if (!end || end <= start) end = new Date(start.getTime() + 3600_000);
      out.push({ title: it.title, start, end, allDay: false, note: it.note });
    }
  }
  return out;
}

const gstamp = (d: Date, allDay: boolean) => allDay ? `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` : `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
export function googleLink(e: CalEvent): string {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${gstamp(e.start, e.allDay)}/${gstamp(e.end, e.allDay)}`, ctz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (e.note) p.set('details', e.note);
  if (e.location) p.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${p}`;
}
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
export function toIcs(list: CalEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ALTTER//Plan//EN', 'CALSCALE:GREGORIAN'];
  list.forEach((e, i) => {
    lines.push('BEGIN:VEVENT', `UID:${utc(e.start)}-${i}-${Math.random().toString(36).slice(2, 8)}@altter`, `DTSTAMP:${utc(new Date())}`,
      e.allDay ? `DTSTART;VALUE=DATE:${gstamp(e.start, true)}` : `DTSTART:${utc(e.start)}`,
      e.allDay ? `DTEND;VALUE=DATE:${gstamp(e.end, true)}` : `DTEND:${utc(e.end)}`,
      `SUMMARY:${esc(e.title)}`, ...(e.note ? [`DESCRIPTION:${esc(e.note)}`] : []), ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
const fmt = (e: CalEvent) => `${e.start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${e.allDay ? '' : ` · ${pad(e.start.getHours())}:${pad(e.start.getMinutes())}–${pad(e.end.getHours())}:${pad(e.end.getMinutes())}`}`;

/** The button (and its panel) under a plan / events block. */
export function CalendarAdd({ events, title }: { events: CalEvent[]; title?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!events.length) return null;
  const one = events.length === 1;
  return (
    <div className="cal-add">
      <div className="cal-add-row">
        {one ? (
          <a className="btn sm primary" href={googleLink(events[0])} target="_blank" rel="noopener noreferrer"><CalendarPlus size={14} />{t('calAdd.google')}</a>
        ) : (
          <button type="button" className="btn sm primary" onClick={() => setOpen((v) => !v)}><CalendarPlus size={14} />{t('calAdd.googleN', { n: events.length })}</button>
        )}
        <button type="button" className="btn sm" onClick={() => download(`${(title || 'plan').replace(/[^\w\-ąćęłńóśźż ]+/gi, '').trim().slice(0, 40) || 'plan'}.ics`, toIcs(events))} title={t('calAdd.icsHint')}><Download size={14} />{t('calAdd.ics')}</button>
        {!guest && <button type="button" className="btn sm ghost" onClick={() => navigate('/settings?tab=plugins')} title={t('calAdd.connectHint')}><Link2 size={14} />{t('calAdd.connect')}</button>}
      </div>
      {open && !one && (
        <div className="cal-add-list">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small muted">{t('calAdd.pick')}</span>
            <button type="button" className="btn ghost icon sm" onClick={() => setOpen(false)}><X size={14} /></button>
          </div>
          {events.map((e, i) => (
            <a key={i} className="cal-add-item" href={googleLink(e)} target="_blank" rel="noopener noreferrer">
              <span className="grow" style={{ minWidth: 0 }}><b className="truncate" style={{ display: 'block' }}>{e.title}</b><span className="small faint">{fmt(e)}</span></span>
              <CalendarPlus size={15} />
            </a>
          ))}
          <span className="small faint">{t('calAdd.allHint')}</span>
        </div>
      )}
    </div>
  );
}

/** {"type":"events"} — a list of things to put in the calendar. */
export function EventsView({ b }: { b: { title?: string; events?: any[] } }) {
  const t = useT();
  const events = fromEventsBlock(b.events ?? []);
  return (
    <div className="rb-card rb-events">
      <div className="rb-head"><span className="rb-head-ico"><CalendarPlus size={15} /></span><div className="rb-head-text"><b>{b.title || t('calAdd.title')}</b><span>{t('calAdd.count', { n: events.length })}</span></div></div>
      <div className="rb-events-list">
        {events.map((e, i) => (
          <div key={i} className="rb-event">
            <span className="rb-event-date"><b>{e.start.getDate()}</b><span>{e.start.toLocaleDateString(undefined, { month: 'short' })}</span></span>
            <span className="grow" style={{ minWidth: 0 }}>
              <b className="truncate" style={{ display: 'block' }}>{e.title}</b>
              <span className="small faint">{fmt(e)}{e.location ? ` · ${e.location}` : ''}</span>
              {e.note && <span className="small muted" style={{ display: 'block' }}>{e.note}</span>}
            </span>
            <a className="btn ghost icon sm" href={googleLink(e)} target="_blank" rel="noopener noreferrer" title={t('calAdd.google')}><CalendarPlus size={15} /></a>
          </div>
        ))}
      </div>
      <CalendarAdd events={events} title={b.title} />
    </div>
  );
}
