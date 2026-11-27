// Rich blocks in AI answers: the AI writes a ```altter fenced block with JSON, the chat draws it as a real UI —
// charts, a week plan, stat tiles, a timeline, a checklist, tables, cards, a board, progress, callouts.
// Everything degrades gracefully: unknown/invalid JSON shows as code, an unfinished block (still streaming) as a skeleton.
import { motion } from 'motion/react';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Check, CheckCircle2, Circle, CircleDot, Info, Lightbulb, Table2 } from 'lucide-react';
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { CalendarAdd, EventsView, fromSchedule } from './CalendarAdd';

/* ---------------------------------------------------------------- types */

type Num = number | null;
interface Series { name: string; data: Num[] }
interface ChartBlock { type: 'chart'; kind?: 'bar' | 'stacked' | 'line' | 'area' | 'pie' | 'donut' | 'hbar'; title?: string; subtitle?: string; unit?: string; labels?: string[]; series?: Series[]; values?: Num[]; note?: string }
interface ScheduleItem { time?: string; end?: string; title: string; note?: string; tag?: string; kind?: string }
interface ScheduleBlock { type: 'schedule' | 'week' | 'plan'; title?: string; subtitle?: string; days: { label: string; date?: string; focus?: string; items?: ScheduleItem[] }[]; notes?: string[] }
interface StatsBlock { type: 'stats'; title?: string; items: { label: string; value: string | number; sub?: string; delta?: string; trend?: 'up' | 'down' | 'flat'; good?: boolean }[] }
interface TimelineBlock { type: 'timeline' | 'steps'; title?: string; items: { title: string; date?: string; text?: string; status?: 'done' | 'now' | 'next' | 'todo' }[] }
interface ChecklistBlock { type: 'checklist'; title?: string; items: ({ text: string; done?: boolean; note?: string } | string)[] }
interface TableBlock { type: 'table'; title?: string; columns: string[]; rows: (string | number | null)[][]; align?: ('left' | 'right' | 'center')[]; note?: string }
interface CardsBlock { type: 'cards' | 'compare' | 'options'; title?: string; items: { title: string; text?: string; tag?: string; value?: string; points?: string[]; pros?: string[]; cons?: string[]; recommended?: boolean }[] }
interface ProgressBlock { type: 'progress'; title?: string; items: { label: string; value: number; max?: number; note?: string }[] }
interface BoardBlock { type: 'board' | 'kanban'; title?: string; columns: { title: string; items: ({ title: string; note?: string; tag?: string } | string)[] }[] }
interface CalloutBlock { type: 'callout' | 'note' | 'tip' | 'warning'; tone?: 'info' | 'tip' | 'warn' | 'success'; title?: string; text: string }
interface AskBlock { type: 'ask' | 'choice' | 'choices' | 'question'; title?: string; questions?: { q?: string; question?: string; options?: (string | { label: string; hint?: string })[]; multi?: boolean }[]; q?: string; options?: (string | { label: string; hint?: string })[] }
interface EventsBlock { type: 'events' | 'calendar' | 'event'; title?: string; events?: unknown[] }
type Block = ChartBlock | ScheduleBlock | StatsBlock | TimelineBlock | ChecklistBlock | TableBlock | CardsBlock | ProgressBlock | BoardBlock | CalloutBlock | EventsBlock | AskBlock;

/* ---------------------------------------------------------------- parsing */

export type Segment = { kind: 'md'; text: string } | { kind: 'block'; block: Block; raw: string } | { kind: 'bad'; raw: string } | { kind: 'pending'; raw: string };

const FENCE = /^```(altter|alter|altter-ui|ui)\s*$/i;

/** Splits an answer into Markdown and rich blocks (```altter … ```). An unclosed block at the end is "pending". */
export function splitRich(text: string): Segment[] {
  if (!/```(altter|alter|altter-ui|ui)\b/i.test(text)) return [{ kind: 'md', text }];
  const lines = text.replace(/\r/g, '').split('\n');
  const out: Segment[] = [];
  let md: string[] = [];
  let inCode = false; // other fences: left alone
  const flush = () => {
    if (md.join('').trim()) out.push({ kind: 'md', text: md.join('\n') });
    md = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!inCode && FENCE.test(l.trim())) {
      flush();
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '```') body.push(lines[j++]);
      const raw = body.join('\n');
      if (j >= lines.length) {
        out.push({ kind: 'pending', raw });
        return out;
      }
      out.push(parseBlock(raw));
      i = j;
      continue;
    }
    if (/^```/.test(l.trim())) inCode = !inCode;
    md.push(l);
  }
  flush();
  return out;
}

function parseBlock(raw: string): Segment {
  try {
    // tolerate trailing commas and comments the model sometimes leaves
    const j = JSON.parse(raw.replace(/\/\/[^\n"]*$/gm, '').replace(/,\s*([}\]])/g, '$1'));
    if (j && typeof j === 'object' && typeof j.type === 'string') return { kind: 'block', block: j as Block, raw };
  } catch {}
  return { kind: 'bad', raw };
}

/* ---------------------------------------------------------------- shared */

const fmtNum = (n: number, unit?: string, compact = false) => {
  const s = new Intl.NumberFormat(undefined, compact && Math.abs(n) >= 10000 ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: Math.abs(n) < 10 ? 2 : Math.abs(n) < 100 ? 1 : 0 }).format(n);
  if (!unit) return s;
  return /^[%°]/.test(unit) ? s + unit : /^[$€£]/.test(unit) ? unit + s : `${s} ${unit}`;
};

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Round axis top: 1, 2, 2.5, 5 × 10^n. */
function niceStep(range: number, count: number) {
  const raw = range / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return ([1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw) ?? raw) || 1;
}
function niceDomain(min: number, max: number, count = 4) {
  if (min === max) max = min + 1;
  const step = niceStep(max - Math.min(0, min), count);
  const lo = min < 0 ? Math.floor(min / step) * step : 0;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

function Card({ icon, title, subtitle, children, tools, className = '' }: { icon?: ReactNode; title?: string; subtitle?: string; children: ReactNode; tools?: ReactNode; className?: string }) {
  return (
    <motion.div className={`rb-card ${className}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
      {(title || tools) && (
        <div className="rb-head">
          {icon && <span className="rb-head-ico">{icon}</span>}
          <div className="rb-head-text">
            {title && <b>{title}</b>}
            {subtitle && <span>{subtitle}</span>}
          </div>
          {tools}
        </div>
      )}
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- charts */

function Legend({ names }: { names: string[] }) {
  if (names.length < 2) return null;
  return (
    <div className="rb-legend">
      {names.map((n, i) => <span key={n + i}><i className={`rb-sw s${i % 8}`} />{n}</span>)}
    </div>
  );
}

function DataTable({ labels, series, unit }: { labels: string[]; series: Series[]; unit?: string }) {
  return (
    <div className="rb-table-wrap">
      <table className="rb-table">
        <thead><tr><th />{series.map((s) => <th key={s.name} className="num">{s.name}</th>)}</tr></thead>
        <tbody>{labels.map((l, i) => <tr key={l + i}><td>{l}</td>{series.map((s) => <td key={s.name} className="num">{s.data[i] == null ? '—' : fmtNum(s.data[i]!, unit)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ChartView({ b }: { b: ChartBlock }) {
  const t = useT();
  const [asTable, setAsTable] = useState(false);
  const series: Series[] = useMemo(() => {
    const s = b.series?.length ? b.series : b.values ? [{ name: b.title ?? '', data: b.values }] : [];
    return s.map((x) => ({ name: String(x.name ?? ''), data: (x.data ?? []).map((v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v))) }));
  }, [b]);
  const labels = (b.labels ?? series[0]?.data.map((_, i) => String(i + 1)) ?? []).map(String);
  const kind = b.kind ?? (labels.length > 12 ? 'line' : 'bar');
  if (!series.length || !labels.length) return <Card title={b.title}><p className="small faint">{t('rich.noData')}</p></Card>;
  const tools = (
    <button type="button" className={`rb-tool${asTable ? ' on' : ''}`} onClick={() => setAsTable((v) => !v)} title={asTable ? t('rich.asChart') : t('rich.asTable')}>
      {asTable ? <BarChart3 size={14} /> : <Table2 size={14} />}
    </button>
  );
  return (
    <Card icon={<BarChart3 size={15} />} title={b.title} subtitle={b.subtitle} tools={tools} className="rb-chart">
      {asTable ? <DataTable labels={labels} series={series} unit={b.unit} /> : kind === 'pie' || kind === 'donut' ? <Donut labels={labels} values={series[0].data.map((v) => Math.max(0, v ?? 0))} unit={b.unit} /> : kind === 'hbar' ? <HBars labels={labels} series={series} unit={b.unit} /> : kind === 'line' || kind === 'area' ? <LineChart labels={labels} series={series} unit={b.unit} area={kind === 'area'} /> : <BarChart labels={labels} series={series} unit={b.unit} stacked={kind === 'stacked'} />}
      {!asTable && kind !== 'pie' && kind !== 'donut' && <Legend names={series.map((s) => s.name)} />}
      {b.note && <p className="rb-note">{b.note}</p>}
    </Card>
  );
}

function Tip({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 70), Math.max(70, w - 70));
  return <div className="rb-tip" style={{ left, top: y }}>{children}</div>;
}

function BarChart({ labels, series, unit, stacked }: { labels: string[]; series: Series[]; unit?: string; stacked: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220, PB = 26, PT = 10;
  const vals = series.flatMap((s) => s.data.filter((v): v is number => v != null));
  const totals = labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.data[i] ?? 0), 0));
  const { lo, hi, ticks } = niceDomain(Math.min(0, ...vals), stacked ? Math.max(...totals, 0) : Math.max(...vals, 0));
  const axisW = Math.max(...ticks.map((v) => fmtNum(v, unit, true).length)) * 6.6 + 10;
  const PL = axisW;
  const plotW = Math.max(0, w - PL - 4);
  const n = labels.length;
  const slot = plotW / n;
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo || 1)) * (H - PB - PT);
  const groupW = Math.min(slot * 0.72, stacked ? 44 : 22 * series.length + 2 * (series.length - 1));
  const barW = stacked ? groupW : Math.max(2, (groupW - 2 * (series.length - 1)) / series.length);
  const every = Math.ceil((n * 46) / Math.max(1, plotW));
  return (
    <div className="rb-plot" ref={ref} onPointerLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={H} role="img">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PL} x2={w - 4} y1={y(v)} y2={y(v)} className={v === 0 ? 'rb-base' : 'rb-grid'} />
              <text x={PL - 8} y={y(v) + 4} textAnchor="end" className="rb-axis">{fmtNum(v, unit, true)}</text>
            </g>
          ))}
          {labels.map((l, i) => {
            const gx = PL + i * slot + (slot - groupW) / 2;
            let acc = 0;
            const parts = series.map((s, k) => ({ k, v: s.data[i] ?? 0 })).filter((p) => p.v !== 0);
            return (
              <g key={l + i} className={hover !== null && hover !== i ? 'rb-dim' : ''}>
                {stacked
                  ? parts.map((p, idx) => {
                      const y0 = y(acc);
                      acc += Math.max(0, p.v);
                      const y1 = y(acc);
                      const last = idx === parts.length - 1;
                      const hgt = Math.max(0, y0 - y1 - (idx > 0 ? 2 : 0));
                      return last ? <path key={p.k} className={`rb-fill s${p.k % 8}`} d={roundTop(gx, y1, barW, hgt)} /> : <rect key={p.k} className={`rb-fill s${p.k % 8}`} x={gx} y={y1} width={barW} height={hgt} />;
                    })
                  : series.map((s, k) => {
                      const v = s.data[i];
                      if (v == null) return null;
                      const x = gx + k * (barW + 2);
                      const top = y(Math.max(v, 0));
                      const hgt = Math.abs(y(v) - y(0));
                      return v >= 0 ? <path key={k} className={`rb-fill s${k % 8}`} d={roundTop(x, top, barW, hgt)} /> : <path key={k} className={`rb-fill s${k % 8}`} d={roundBottom(x, y(0), barW, hgt)} />;
                    })}
                {i % every === 0 && <text x={PL + i * slot + slot / 2} y={H - 8} textAnchor="middle" className="rb-axis">{short(l, Math.max(4, Math.floor((slot * every) / 7)))}</text>}
                <rect x={PL + i * slot} y={0} width={slot} height={H - PB} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && w > 0 && (
        <Tip x={PL + hover * slot + slot / 2} y={4} w={w}>
          <b>{labels[hover]}</b>
          {series.map((s, k) => s.data[hover] != null && <span key={k}><i className={`rb-sw s${k % 8}`} />{series.length > 1 ? s.name : ''}<em>{fmtNum(s.data[hover]!, unit)}</em></span>)}
          {stacked && series.length > 1 && <span className="rb-tip-total">Σ<em>{fmtNum(totals[hover], unit)}</em></span>}
        </Tip>
      )}
    </div>
  );
}

const roundTop = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};
const roundBottom = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
};
const short = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);

function LineChart({ labels, series, unit, area }: { labels: string[]; series: Series[]; unit?: string; area: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220, PB = 26, PT = 12;
  const vals = series.flatMap((s) => s.data.filter((v): v is number => v != null));
  const { lo, hi, ticks } = niceDomain(Math.min(0, ...vals), Math.max(...vals, 0));
  const PL = Math.max(...ticks.map((v) => fmtNum(v, unit, true).length)) * 6.6 + 10;
  const plotW = Math.max(0, w - PL - 10);
  const n = labels.length;
  const x = (i: number) => PL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo || 1)) * (H - PB - PT);
  const every = Math.ceil((n * 52) / Math.max(1, plotW));
  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - PL) / Math.max(1, plotW)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const path = (s: Series) => {
    let d = '';
    let pen = false;
    s.data.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  return (
    <div className="rb-plot" ref={ref} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={H} role="img">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PL} x2={w - 4} y1={y(v)} y2={y(v)} className={v === 0 ? 'rb-base' : 'rb-grid'} />
              <text x={PL - 8} y={y(v) + 4} textAnchor="end" className="rb-axis">{fmtNum(v, unit, true)}</text>
            </g>
          ))}
          {labels.map((l, i) => i % every === 0 && <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle" className="rb-axis">{short(l, 10)}</text>)}
          {area && series.length === 1 && (
            <path className="rb-area s0" d={`${path(series[0])}L${x(n - 1)},${y(Math.max(lo, 0))}L${x(0)},${y(Math.max(lo, 0))}Z`} />
          )}
          {series.map((s, k) => <path key={k} className={`rb-line s${k % 8}`} d={path(s)} />)}
          {hover !== null && <line className="rb-cross" x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} />}
          {hover !== null && series.map((s, k) => s.data[hover] != null && <circle key={k} className={`rb-dot s${k % 8}`} cx={x(hover)} cy={y(s.data[hover]!)} r={4.5} />)}
          {n <= 14 && hover === null && series.map((s, k) => s.data.map((v, i) => v != null && <circle key={`${k}-${i}`} className={`rb-dot small s${k % 8}`} cx={x(i)} cy={y(v)} r={3} />))}
        </svg>
      )}
      {hover !== null && w > 0 && (
        <Tip x={x(hover)} y={4} w={w}>
          <b>{labels[hover]}</b>
          {series.map((s, k) => s.data[hover] != null && <span key={k}><i className={`rb-sw s${k % 8}`} />{series.length > 1 ? s.name : ''}<em>{fmtNum(s.data[hover]!, unit)}</em></span>)}
        </Tip>
      )}
    </div>
  );
}

function HBars({ labels, series, unit }: { labels: string[]; series: Series[]; unit?: string }) {
  const s = series[0];
  const max = Math.max(...s.data.map((v) => v ?? 0), 1e-9);
  return (
    <div className="rb-hbars">
      {labels.map((l, i) => (
        <div key={l + i} className="rb-hbar-row">
          <span className="rb-hbar-label" title={l}>{l}</span>
          <span className="rb-hbar-track"><motion.i className="s0" initial={{ width: 0 }} animate={{ width: `${(Math.max(0, s.data[i] ?? 0) / max) * 100}%` }} transition={{ duration: 0.55, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }} /></span>
          <span className="rb-hbar-val">{s.data[i] == null ? '—' : fmtNum(s.data[i]!, unit)}</span>
        </div>
      ))}
    </div>
  );
}

function Donut({ labels, values, unit }: { labels: string[]; values: number[]; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // more than 6 slices: the rest folds into "Other"
  const t = useT();
  const items = labels.map((l, i) => ({ l, v: values[i] ?? 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const shown = items.length > 6 ? [...items.slice(0, 5), { l: t('rich.other'), v: items.slice(5).reduce((a, x) => a + x.v, 0) }] : items;
  const total = shown.reduce((a, x) => a + x.v, 0) || 1;
  const R = 74, r = 50, C = 84;
  let a0 = -Math.PI / 2;
  const arcs = shown.map((x, i) => {
    const a1 = a0 + (x.v / total) * Math.PI * 2;
    const gap = shown.length > 1 ? 0.012 : 0;
    const s = a0 + gap, e = a1 - gap;
    const large = e - s > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${C + rad * Math.cos(ang)},${C + rad * Math.sin(ang)}`;
    const d = shown.length === 1
      ? `M${C - R},${C}A${R},${R} 0 1 1 ${C + R},${C}A${R},${R} 0 1 1 ${C - R},${C}M${C - r},${C}A${r},${r} 0 1 0 ${C + r},${C}A${r},${r} 0 1 0 ${C - r},${C}Z`
      : `M${p(R, s)}A${R},${R} 0 ${large} 1 ${p(R, e)}L${p(r, e)}A${r},${r} 0 ${large} 0 ${p(r, s)}Z`;
    a0 = a1;
    return { d, i, ...x };
  });
  const h = hover !== null ? shown[hover] : null;
  return (
    <div className="rb-donut">
      <svg viewBox={`0 0 ${C * 2} ${C * 2}`} width={C * 2} height={C * 2} role="img" onPointerLeave={() => setHover(null)}>
        {arcs.map((a) => <path key={a.i} d={a.d} className={`rb-fill s${a.i % 8}${hover !== null && hover !== a.i ? ' rb-dim' : ''}`} fillRule="evenodd" onPointerEnter={() => setHover(a.i)} onPointerDown={() => setHover(a.i)} />)}
        <text x={C} y={C + 2} textAnchor="middle" className="rb-donut-val">{h ? `${Math.round((h.v / total) * 100)}%` : fmtNum(total, undefined, true)}</text>
        <text x={C} y={C + 19} textAnchor="middle" className="rb-axis">{h ? short(h.l, 12) : `${t('rich.total')}${unit ? ` · ${unit}` : ''}`}</text>
      </svg>
      <div className="rb-donut-legend">
        {shown.map((x, i) => (
          <div key={x.l + i} className={hover !== null && hover !== i ? 'rb-dim' : ''} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <i className={`rb-sw s${i % 8}`} />
            <span className="truncate">{x.l}</span>
            <em>{fmtNum(x.v, unit)}</em>
            <small>{Math.round((x.v / total) * 100)}%</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- week plan */

const KIND_OF = (it: ScheduleItem) => {
  const k = (it.kind ?? it.tag ?? '').toLowerCase();
  if (/meet|spotk|call|rozm|termin/.test(k)) return 'meeting';
  if (/break|przerw|lunch|obiad/.test(k)) return 'break';
  if (/rest|odpocz|wolne|free|off/.test(k)) return 'rest';
  if (/dead|termin|oddan|due/.test(k)) return 'deadline';
  if (/small|drobn|minor|task|zadan/.test(k)) return 'task';
  if (/focus|main|g[łl][óo]wn|deep|priorytet/.test(k)) return 'focus';
  return k ? 'task' : 'focus';
};

function isToday(date?: string) {
  if (!date) return false;
  const d = new Date();
  const m = date.match(/(\d{1,2})[./-](\d{1,2})/);
  if (m) return Number(m[1]) === d.getDate() && Number(m[2]) === d.getMonth() + 1;
  const iso = date.match(/(\d{4})-(\d{2})-(\d{2})/);
  return !!iso && Number(iso[3]) === d.getDate() && Number(iso[2]) === d.getMonth() + 1;
}

function ScheduleView({ b }: { b: ScheduleBlock }) {
  const t = useT();
  return (
    <Card icon={<CalendarDays size={15} />} title={b.title} subtitle={b.subtitle} className="rb-schedule">
      <div className="rb-days">
        {(b.days ?? []).map((d, i) => {
          const today = isToday(d.date);
          const items = d.items ?? [];
          return (
            <motion.div key={d.label + i} className={`rb-day${today ? ' today' : ''}${!items.length ? ' empty' : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.3 }}>
              <div className="rb-day-head">
                <b>{d.label}</b>
                {d.date && <span>{d.date}</span>}
                {today && <em>{t('rich.today')}</em>}
              </div>
              {d.focus && <div className="rb-day-focus">{d.focus}</div>}
              <div className="rb-day-items">
                {items.map((it, k) => (
                  <div key={k} className={`rb-item k-${KIND_OF(it)}`}>
                    {(it.time || it.end) && <span className="rb-item-time">{it.time}{it.end ? `–${it.end}` : ''}</span>}
                    <span className="rb-item-title">{it.title}</span>
                    {it.note && <span className="rb-item-note">{it.note}</span>}
                    {it.tag && <span className="rb-item-tag">{it.tag}</span>}
                  </div>
                ))}
                {!items.length && <span className="rb-item-none">—</span>}
              </div>
            </motion.div>
          );
        })}
      </div>
      {!!b.notes?.length && (
        <ul className="rb-notes">{b.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
      <CalendarAdd events={fromSchedule(b.days)} title={b.title} />
    </Card>
  );
}

/* ---------------------------------------------------------------- the rest */

function StatsView({ b }: { b: StatsBlock }) {
  return (
    <div className="rb-stats-wrap">
      {b.title && <div className="rb-mini-title">{b.title}</div>}
      <div className="rb-stats">
        {(b.items ?? []).map((s, i) => {
          const trend = s.trend ?? (s.delta?.trim().startsWith('-') || s.delta?.trim().startsWith('−') ? 'down' : s.delta ? 'up' : undefined);
          const good = s.good ?? (trend === 'up');
          return (
            <motion.div key={i} className="rb-stat" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <span className="rb-stat-label">{s.label}</span>
              <b className="rb-stat-value">{typeof s.value === 'number' ? fmtNum(s.value) : s.value}</b>
              {(s.delta || s.sub) && (
                <span className="rb-stat-sub">
                  {s.delta && <span className={`rb-delta ${trend === 'flat' ? 'flat' : good ? 'good' : 'bad'}`}>{trend === 'up' ? <ArrowUpRight size={13} /> : trend === 'down' ? <ArrowDownRight size={13} /> : <ArrowRight size={13} />}{s.delta}</span>}
                  {s.sub && <span>{s.sub}</span>}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineView({ b }: { b: TimelineBlock }) {
  return (
    <Card title={b.title} className="rb-timeline">
      <ol>
        {(b.items ?? []).map((it, i) => {
          const st = it.status ?? 'todo';
          return (
            <li key={i} className={`st-${st}`}>
              <span className="rb-tl-dot">{st === 'done' ? <Check size={12} strokeWidth={3} /> : st === 'now' ? <CircleDot size={14} /> : <Circle size={10} />}</span>
              <div>
                <div className="rb-tl-head"><b>{it.title}</b>{it.date && <span>{it.date}</span>}</div>
                {it.text && <p>{it.text}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function ChecklistView({ b }: { b: ChecklistBlock }) {
  const items = (b.items ?? []).map((x) => (typeof x === 'string' ? { text: x } : x));
  const [done, setDone] = useState<boolean[]>(() => items.map((x) => !!x.done));
  const n = done.filter(Boolean).length;
  return (
    <Card icon={<CheckCircle2 size={15} />} title={b.title} subtitle={`${n}/${items.length}`} className="rb-checklist">
      <div className="rb-check-bar"><motion.i animate={{ width: `${(n / Math.max(1, items.length)) * 100}%` }} /></div>
      {items.map((x, i) => (
        <button type="button" key={i} className={`rb-check${done[i] ? ' done' : ''}`} onClick={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}>
          <span className="rb-box">{done[i] && <Check size={13} strokeWidth={3} />}</span>
          <span><span className="rb-check-text">{x.text}</span>{x.note && <small>{x.note}</small>}</span>
        </button>
      ))}
    </Card>
  );
}

function TableView({ b }: { b: TableBlock }) {
  const numeric = (b.columns ?? []).map((_, c) => (b.rows ?? []).every((r) => r[c] == null || r[c] === '' || typeof r[c] === 'number' || /^[-+−]?[\d\s.,]+\s?(%|zł|pln|€|\$|h|min|k|m)?$/i.test(String(r[c]))));
  return (
    <Card icon={<Table2 size={15} />} title={b.title} className="rb-tablecard">
      <div className="rb-table-wrap">
        <table className="rb-table">
          <thead><tr>{(b.columns ?? []).map((c, i) => <th key={i} className={(b.align?.[i] ?? (numeric[i] && i > 0 ? 'right' : 'left')) === 'right' ? 'num' : ''}>{c}</th>)}</tr></thead>
          <tbody>{(b.rows ?? []).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={(b.align?.[j] ?? (numeric[j] && j > 0 ? 'right' : 'left')) === 'right' ? 'num' : ''}>{c == null ? '—' : String(c)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {b.note && <p className="rb-note">{b.note}</p>}
    </Card>
  );
}

function CardsView({ b }: { b: CardsBlock }) {
  const t = useT();
  return (
    <div className="rb-cards-wrap">
      {b.title && <div className="rb-mini-title">{b.title}</div>}
      <div className="rb-cards">
        {(b.items ?? []).map((c, i) => (
          <motion.div key={i} className={`rb-opt${c.recommended ? ' rec' : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            {(c.tag || c.recommended) && <span className="rb-opt-tag">{c.recommended ? t('rich.recommended') : c.tag}</span>}
            <b>{c.title}</b>
            {c.value && <span className="rb-opt-value">{c.value}</span>}
            {c.text && <p>{c.text}</p>}
            {!!c.points?.length && <ul>{c.points.map((p, k) => <li key={k}>{p}</li>)}</ul>}
            {!!c.pros?.length && <ul className="pros">{c.pros.map((p, k) => <li key={k}>{p}</li>)}</ul>}
            {!!c.cons?.length && <ul className="cons">{c.cons.map((p, k) => <li key={k}>{p}</li>)}</ul>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ProgressView({ b }: { b: ProgressBlock }) {
  return (
    <Card title={b.title} className="rb-progress">
      {(b.items ?? []).map((p, i) => {
        const pct = Math.max(0, Math.min(100, (p.value / (p.max ?? 100)) * 100));
        return (
          <div key={i} className="rb-prog-row">
            <div className="rb-prog-head"><span>{p.label}</span><b>{p.max && p.max !== 100 ? `${fmtNum(p.value)}/${fmtNum(p.max)}` : `${Math.round(pct)}%`}</b></div>
            <div className="rb-prog-track"><motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }} /></div>
            {p.note && <small>{p.note}</small>}
          </div>
        );
      })}
    </Card>
  );
}

function BoardView({ b }: { b: BoardBlock }) {
  return (
    <Card title={b.title} className="rb-board">
      <div className="rb-cols">
        {(b.columns ?? []).map((c, i) => (
          <div key={i} className="rb-col">
            <div className="rb-col-head"><b>{c.title}</b><span>{c.items?.length ?? 0}</span></div>
            {(c.items ?? []).map((x, k) => {
              const it = typeof x === 'string' ? { title: x } : x;
              return (
                <div key={k} className="rb-ticket">
                  <span>{it.title}</span>
                  {it.note && <small>{it.note}</small>}
                  {it.tag && <em>{it.tag}</em>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

function CalloutView({ b }: { b: CalloutBlock }) {
  const tone = b.tone ?? (b.type === 'warning' ? 'warn' : b.type === 'tip' ? 'tip' : 'info');
  const Icon = tone === 'warn' ? AlertTriangle : tone === 'tip' ? Lightbulb : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`rb-callout t-${tone}`}>
      <Icon size={17} />
      <div>{b.title && <b>{b.title}</b>}<p>{b.text}</p></div>
    </div>
  );
}

/** The chat gives this: clicking an option of an "ask" block sends it as the user's next message. */
export const SendContext = createContext<((text: string) => void) | undefined>(undefined);

function AskView({ b }: { b: AskBlock }) {
  const t = useT();
  const send = useContext(SendContext);
  const qs = (b.questions?.length ? b.questions : [{ q: b.q, options: b.options }]).map((x) => ({ q: x.q ?? x.question ?? '', multi: !!x.multi, options: (x.options ?? []).map((o) => (typeof o === 'string' ? { label: o } : o)).filter((o) => o?.label) })).filter((x) => x.options.length);
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const [sent, setSent] = useState(false);
  if (!qs.length) return null;
  const one = qs.length === 1 && !qs[0].multi;
  const go = (p: Record<number, string[]>) => {
    if (!send || sent) return;
    setSent(true);
    send(one ? p[0][0] : qs.map((x, i) => (x.q ? x.q.replace(/[?:]\s*$/, '') + ': ' : '') + (p[i] ?? []).join(', ')).join('\n'));
  };
  const toggle = (i: number, label: string) => {
    if (sent) return;
    const cur = picked[i] ?? [];
    const next = { ...picked, [i]: qs[i].multi ? (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]) : [label] };
    setPicked(next);
    if (one) go(next);
  };
  const ready = qs.every((_, i) => (picked[i] ?? []).length > 0);
  return (
    <div className={`rb-card rb-ask${sent ? ' sent' : ''}`}>
      {b.title && <div className="rb-mini-title">{b.title}</div>}
      {qs.map((x, i) => (
        <div key={i} className="rb-ask-q">
          {x.q && <b>{x.q}</b>}
          <div className="rb-ask-opts">
            {x.options.map((o) => (
              <button type="button" key={o.label} className={`rb-ask-opt${(picked[i] ?? []).includes(o.label) ? ' on' : ''}`} disabled={sent || !send} onClick={() => toggle(i, o.label)}>
                <span>{o.label}</span>
                {o.hint && <small>{o.hint}</small>}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!one && send && <button type="button" className="btn primary sm rb-ask-send" disabled={!ready || sent} onClick={() => go(picked)}>{sent ? <Check size={14} /> : <ArrowRight size={14} />}{t('rich.askSend')}</button>}
    </div>
  );
}

/* ---------------------------------------------------------------- entry */

export function RichBlock({ seg }: { seg: Segment }) {
  const t = useT();
  if (seg.kind === 'pending') {
    return (
      <div className="rb-card rb-pending">
        <span className="spinner" />
        <span>{t('rich.building')}</span>
      </div>
    );
  }
  if (seg.kind === 'bad') return <pre><code>{seg.raw}</code></pre>;
  if (seg.kind !== 'block') return null;
  const b = seg.block;
  switch (b.type) {
    case 'chart': return <ChartView b={b} />;
    case 'events': case 'calendar': case 'event': return <EventsView b={b as any} />;
    case 'schedule': case 'week': case 'plan': return <ScheduleView b={b as ScheduleBlock} />;
    case 'stats': return <StatsView b={b} />;
    case 'timeline': case 'steps': return <TimelineView b={b as TimelineBlock} />;
    case 'checklist': return <ChecklistView b={b} />;
    case 'table': return <TableView b={b} />;
    case 'cards': case 'compare': case 'options': return <CardsView b={b as CardsBlock} />;
    case 'progress': return <ProgressView b={b} />;
    case 'board': case 'kanban': return <BoardView b={b as BoardBlock} />;
    case 'callout': case 'note': case 'tip': case 'warning': return <CalloutView b={b as CalloutBlock} />;
    case 'ask': case 'choice': case 'choices': case 'question': return <AskView b={b as AskBlock} />;
    default: return <pre><code>{seg.raw}</code></pre>;
  }
}
