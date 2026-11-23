import { useT } from '../i18n';
import { Segmented } from './ui';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Kind = 'manual' | 'every' | 'daily' | 'weekdays' | 'weekly';

interface Parsed {
  kind: Kind;
  n: number;
  unit: 'm' | 'h';
  time: string;
  day: (typeof DAYS)[number];
}

export function parseSchedule(s: string): Parsed {
  const base: Parsed = { kind: 'manual', n: 30, unit: 'm', time: '08:00', day: 'mon' };
  const v = (s || 'manual').trim().toLowerCase();
  const every = v.match(/^every\s+(\d+)\s*(m|min|minutes?|h|hours?|d|days?)$/);
  if (every) return { ...base, kind: 'every', n: Number(every[1]), unit: every[2][0] === 'h' ? 'h' : 'm' };
  const at = v.match(/^(daily|weekdays|weekly\s+(\w{3}))\s+(\d{1,2}):(\d{2})$/);
  if (at) {
    const time = `${at[3].padStart(2, '0')}:${at[4]}`;
    if (at[1] === 'daily') return { ...base, kind: 'daily', time };
    if (at[1] === 'weekdays') return { ...base, kind: 'weekdays', time };
    return { ...base, kind: 'weekly', time, day: (at[2] as Parsed['day']) ?? 'mon' };
  }
  return base;
}

export function buildSchedule(p: Parsed): string {
  switch (p.kind) {
    case 'manual': return 'manual';
    case 'every': return `every ${Math.max(1, p.n)}${p.unit}`;
    case 'daily': return `daily ${p.time}`;
    case 'weekdays': return `weekdays ${p.time}`;
    case 'weekly': return `weekly ${p.day} ${p.time}`;
  }
}

export function useDescribeSchedule() {
  const t = useT();
  return (s: string) => {
    const p = parseSchedule(s);
    switch (p.kind) {
      case 'manual': return t('sched.manual');
      case 'every': return p.unit === 'h' ? t('sched.everyHour', { n: p.n }) : t('sched.everyMin', { n: p.n });
      case 'daily': return t('sched.daily', { time: p.time });
      case 'weekdays': return t('sched.weekdays', { time: p.time });
      case 'weekly': return t('sched.weekly', { day: t(`day.${p.day}`), time: p.time });
    }
  };
}

export function ScheduleEditor({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const t = useT();
  const p = parseSchedule(value);
  const set = (patch: Partial<Parsed>) => onChange(buildSchedule({ ...p, ...patch }));
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Segmented<Kind>
        value={p.kind}
        onChange={(kind) => set({ kind })}
        options={(['manual', 'every', 'daily', 'weekdays', 'weekly'] as Kind[]).map((k) => ({ value: k, label: t(`sched.kind.${k}`) }))}
        size="sm"
      />
      {p.kind === 'every' && (
        <div className="row">
          <input className="input" type="number" min={1} value={p.n} onChange={(e) => set({ n: Number(e.target.value) || 1 })} style={{ width: 100 }} />
          <select className="select" value={p.unit} onChange={(e) => set({ unit: e.target.value as 'm' | 'h' })} style={{ width: 140 }}>
            <option value="m">min</option>
            <option value="h">h</option>
          </select>
        </div>
      )}
      {(p.kind === 'daily' || p.kind === 'weekdays' || p.kind === 'weekly') && (
        <div className="row">
          {p.kind === 'weekly' && (
            <select className="select" value={p.day} onChange={(e) => set({ day: e.target.value as Parsed['day'] })} style={{ width: 170 }}>
              {DAYS.map((d) => <option key={d} value={d}>{t(`day.${d}`)}</option>)}
            </select>
          )}
          <input className="input" type="time" value={p.time} onChange={(e) => set({ time: e.target.value || '08:00' })} style={{ width: 130 }} />
        </div>
      )}
    </div>
  );
}
