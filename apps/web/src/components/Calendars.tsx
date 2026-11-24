// Settings → Integrations → Calendars: Google / Outlook / iCloud linked by their private iCal (ICS) address.
// Read-only and local: the computer fetches the link, the AI sees the next two weeks when it plans.
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, invalidate, useData } from '../api';
import { useT } from '../i18n';
import { toast } from './ui';

interface Cal { id: string; name: string; color?: string; host: string }
interface Ev { calendar: string; title: string; start: number; end: number; allDay: boolean; location?: string }

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (t: number) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function CalendarsCard() {
  const t = useT();
  const { data } = useData<{ calendars: Cal[] }>('/api/calendars', 30_000);
  const { data: ev } = useData<{ events: Ev[]; failed: string[] }>(data?.calendars.length ? '/api/calendars/events?days=7' : null, 60_000);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const cals = data?.calendars ?? [];

  const refresh = () => { invalidate('/api/calendars'); invalidate('/api/calendars/events?days=7'); };
  const add = async () => {
    setBusy(true);
    try {
      const r = await api<{ events: number }>('/api/calendars', { method: 'POST', body: { url, name } });
      toast(t('cal.added', { n: r.events }), 'ok');
      setUrl(''); setName('');
      refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: Cal) => {
    if (!confirm(t('cal.removeConfirm', { name: c.name }))) return;
    await api(`/api/calendars/${c.id}`, { method: 'DELETE' });
    refresh();
  };

  // next 7 days, grouped by day
  const days = new Map<string, Ev[]>();
  for (const e of ev?.events ?? []) {
    const k = new Date(e.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    days.set(k, [...(days.get(k) ?? []), e]);
  }
  const colorOf = (n: string) => cals.find((c) => c.name === n)?.color ?? 'var(--accent)';

  return (
    <div className="card cal-card">
      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        <div className="plug-ic" style={{ width: 42, height: 42, color: '#3987e5', background: 'color-mix(in srgb, #3987e5 16%, transparent)' }}><CalendarDays size={20} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <h3>{t('cal.title')}</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>{t('cal.lead')}</p>
        </div>
      </div>

      {cals.length > 0 && (
        <div className="cal-list">
          {cals.map((c) => (
            <div key={c.id} className="cal-row">
              <span className="cal-dot" style={{ background: c.color }} />
              <b className="truncate">{c.name}</b>
              <span className="small faint truncate grow">{c.host}</span>
              <button className="btn ghost icon sm danger" onClick={() => remove(c)} title={t('common.delete')}><Trash2 /></button>
            </div>
          ))}
        </div>
      )}

      <div className="cal-add">
        <input className="input grow" placeholder={t('cal.url') + ' — https://calendar.google.com/calendar/ical/…/basic.ics'} value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} autoComplete="off" />
        <input className="input cal-name" placeholder={t('cal.name')} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={busy || !url.trim()} onClick={add}>{busy ? <span className="spinner" /> : <Plus size={14} />}{t('cal.add')}</button>
      </div>

      <button className="btn ghost sm cal-help-btn" onClick={() => setHelp((v) => !v)}>
        <ChevronDown size={14} style={{ transform: help ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />{t('cal.url')}?
      </button>
      <AnimatePresence initial={false}>
        {help && (
          <motion.ul className="cal-help small muted" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <li>{t('cal.howGoogle')}</li>
            <li>{t('cal.howOutlook')}</li>
            <li>{t('cal.howApple')}</li>
            <li className="faint">{t('cal.fullAccess')}</li>
          </motion.ul>
        )}
      </AnimatePresence>

      {cals.length > 0 && ev && (
        <div className="cal-next">
          <div className="section-title">{t('cal.next')}</div>
          {days.size === 0 && <p className="small faint">{t('cal.none')}</p>}
          {[...days.entries()].map(([d, list]) => (
            <div key={d} className="cal-day">
              <div className="cal-day-label">{d}</div>
              <div className="cal-day-items">
                {list.slice(0, 6).map((e, i) => (
                  <div key={i} className="cal-ev" style={{ ['--c' as string]: colorOf(e.calendar) }}>
                    <span className="cal-ev-time">{e.allDay ? t('cal.allDay') : `${hm(e.start)}–${hm(e.end)}`}</span>
                    <span className="truncate">{e.title}</span>
                  </div>
                ))}
                {list.length > 6 && <div className="small faint">+{list.length - 6}</div>}
              </div>
            </div>
          ))}
          {ev.failed.length > 0 && <p className="small" style={{ color: 'var(--danger, #e66767)' }}>⚠ {ev.failed.join(', ')}</p>}
        </div>
      )}
    </div>
  );
}
