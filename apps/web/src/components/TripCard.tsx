// A trip the AI planned (```alter-trip block): flights, stays and the day-by-day plan in one card.
import { AnimatePresence, motion } from 'motion/react';
import { BedDouble, CalendarDays, ExternalLink, Lightbulb, Plane, Star, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../i18n';
import { Segmented, spring } from './ui';

interface Flight { label?: string; airline?: string; route?: string; out?: string; back?: string; stops?: number; duration?: string; price?: number | string; bags?: string; link?: string }
interface Stay { name: string; area?: string; price?: number | string; per?: string; rating?: string | number; why?: string; link?: string }
export interface Trip {
  title: string; from?: string; to?: string; dates?: string; travelers?: number; currency?: string; budget?: number;
  flights?: Flight[]; stays?: Stay[]; days?: { day: string; title?: string; items: string[] }[]; total?: number | string; tips?: string[];
}

export const TRIP_FENCE = '```alter-trip';

type Piece = { kind: 'text'; text: string } | { kind: 'trip'; trip: Trip | null; pending?: boolean };
export function splitTrips(text: string): Piece[] {
  const out: Piece[] = [];
  let rest = text;
  while (rest) {
    const at = rest.indexOf(TRIP_FENCE);
    if (at < 0) { out.push({ kind: 'text', text: rest }); break; }
    if (at > 0) out.push({ kind: 'text', text: rest.slice(0, at) });
    const bodyStart = rest.indexOf('\n', at);
    const end = bodyStart < 0 ? -1 : rest.indexOf('```', bodyStart);
    if (end < 0) { out.push({ kind: 'trip', trip: null, pending: true }); break; }
    let trip: Trip | null = null;
    try {
      const p = JSON.parse(rest.slice(bodyStart + 1, end));
      if (p && typeof p.title === 'string') trip = p;
    } catch {}
    out.push({ kind: 'trip', trip });
    rest = rest.slice(end + 3);
  }
  return out.filter((p) => p.kind !== 'text' || p.text.trim());
}

const safeLink = (u?: string) => (u && /^https:\/\//.test(u) ? u : undefined);

export function TripCard({ trip, pending }: { trip: Trip | null; pending?: boolean }) {
  const t = useT();
  const [tab, setTab] = useState<'flights' | 'stays' | 'days'>('flights');
  const money = (v?: number | string) => (v === undefined || v === '' ? '' : typeof v === 'number' ? `${v.toLocaleString()} ${trip?.currency ?? ''}`.trim() : v);

  if (!trip)
    return (
      <div className="trip-card pending">
        <div className="trip-hero"><Plane className="trip-plane" /><b>{pending ? t('trip.searching') : t('trip.broken')}</b></div>
        {pending && <div className="plan-skel">{[0, 1, 2].map((i) => <i key={i} />)}</div>}
      </div>
    );

  const tabs = [
    ...(trip.flights?.length ? [{ value: 'flights' as const, label: t('trip.flights'), icon: Plane }] : []),
    ...(trip.stays?.length ? [{ value: 'stays' as const, label: t('trip.stays'), icon: BedDouble }] : []),
    ...(trip.days?.length ? [{ value: 'days' as const, label: t('trip.days'), icon: CalendarDays }] : []),
  ];
  const cur = tabs.some((x) => x.value === tab) ? tab : tabs[0]?.value;
  const overBudget = typeof trip.total === 'number' && typeof trip.budget === 'number' && trip.total > trip.budget;

  return (
    <motion.div className="trip-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="trip-hero">
        <div className="trip-route">
          <span>{trip.from ?? ''}</span>
          <svg viewBox="0 0 120 24" className="trip-arc"><path d="M4 20 Q60 -8 116 20" /><circle r="3"><animateMotion dur="2.6s" repeatCount="indefinite" path="M4 20 Q60 -8 116 20" /></circle></svg>
          <span>{trip.to ?? ''}</span>
        </div>
        <b className="trip-title">{trip.title}</b>
        <div className="trip-meta">
          {trip.dates && <span><CalendarDays size={13} />{trip.dates}</span>}
          {trip.travelers && <span><Users size={13} />{trip.travelers}</span>}
          {trip.total !== undefined && <span className={overBudget ? 'over' : 'ok'}><Wallet size={13} />{money(trip.total)}{trip.budget ? ` / ${money(trip.budget)}` : ''}</span>}
        </div>
      </div>
      {tabs.length > 1 && cur && <Segmented size="sm" value={cur} onChange={setTab} options={tabs} />}
      <AnimatePresence mode="wait">
        <motion.div key={cur} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="trip-body">
          {cur === 'flights' && trip.flights?.map((f, i) => (
            <div key={i} className="trip-item">
              <div className="trip-item-top">
                {f.label && <span className="trip-badge">{f.label}</span>}
                <b>{f.airline}</b>
                <span className="faint small">{f.route}</span>
                <span className="trip-price">{money(f.price)}</span>
              </div>
              <div className="small muted">{[f.out, f.back].filter(Boolean).join('  ·  ')}</div>
              <div className="small faint">{[f.duration, f.stops === 0 ? t('trip.direct') : f.stops ? t('trip.stops', { n: f.stops }) : '', f.bags].filter(Boolean).join(' · ')}</div>
              {safeLink(f.link) && <a className="trip-link" href={safeLink(f.link)} target="_blank" rel="noreferrer noopener">{t('trip.open')}<ExternalLink size={12} /></a>}
            </div>
          ))}
          {cur === 'stays' && trip.stays?.map((s, i) => (
            <div key={i} className="trip-item">
              <div className="trip-item-top">
                <b>{s.name}</b>
                {s.area && <span className="faint small">{s.area}</span>}
                {s.rating && <span className="trip-rating"><Star size={11} fill="currentColor" />{s.rating}</span>}
                <span className="trip-price">{money(s.price)}{s.per ? <small> / {s.per}</small> : null}</span>
              </div>
              {s.why && <div className="small muted">{s.why}</div>}
              {safeLink(s.link) && <a className="trip-link" href={safeLink(s.link)} target="_blank" rel="noreferrer noopener">{t('trip.open')}<ExternalLink size={12} /></a>}
            </div>
          ))}
          {cur === 'days' && (
            <ol className="trip-days">
              {trip.days?.map((d, i) => (
                <li key={i}>
                  <div className="trip-day-head"><span>{i + 1}</span><b>{d.day}</b>{d.title && <em>{d.title}</em>}</div>
                  <ul>{d.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
                </li>
              ))}
            </ol>
          )}
        </motion.div>
      </AnimatePresence>
      {!!trip.tips?.length && (
        <div className="trip-tips"><Lightbulb size={14} /><div>{trip.tips.map((x) => <div key={x}>{x}</div>)}</div></div>
      )}
    </motion.div>
  );
}
