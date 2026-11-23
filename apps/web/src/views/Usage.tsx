// Token usage across Claude Code, Codex and Gemini CLI on this computer (read from their own local logs) + ALTTER's own runs.
import { motion } from 'motion/react';
import { Activity, Coins, Cpu, MessageSquare, RefreshCw } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { invalidate, useData } from '../api';
import { Empty, PageHead, Segmented } from '../components/ui';
import { useT } from '../i18n';

type Src = 'claude' | 'codex' | 'gemini';
interface Bucket { input: number; output: number; cacheRead: number; cacheWrite: number; messages: number }
interface LocalUsage {
  days: number;
  total: Bucket & { value: number };
  daily: ({ day: string } & Record<Src, number>)[];
  models: ({ model: string; value: number; source: Src } & Bucket)[];
  projects: { project: string; tokens: number; value: number; messages: number }[];
  sources: Record<Src, boolean>;
  alter: { byProvider: Record<string, { runs: number; input: number; output: number; cost: number; today: { runs: number } }> };
}

const SRC: Src[] = ['claude', 'codex', 'gemini'];
const SRC_LABEL: Record<Src, string> = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI' };

const fmt = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} B` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)} k` : String(Math.round(n)));
const usd = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString()}` : n >= 10 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`);

export function UsageView() {
  const t = useT();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const { data, loading } = useData<LocalUsage>(`/api/usage/local?days=${days}`, 60_000);
  const top = data?.models[0];
  const tokens = data ? data.total.input + data.total.output + data.total.cacheRead + data.total.cacheWrite : 0;

  return (
    <div className="page usage-page" style={{ maxWidth: 1100 }}>
      <PageHead
        title={t('usage.pageTitle')}
        lead={t('usage.lead')}
        actions={
          <>
            <Segmented size="sm" value={days} onChange={setDays} options={[{ value: '7', label: t('usage.d7') }, { value: '30', label: t('usage.d30') }, { value: '90', label: t('usage.d90') }]} />
            <button className="btn ghost icon" onClick={() => invalidate('/api/usage/local')} title={t('usage.refresh')}><RefreshCw /></button>
          </>
        }
      />
      {!data ? (
        loading !== false ? <div className="card usage-loading"><span className="spinner" />{t('usage.reading')}</div> : <Empty icon={Activity} title={t('usage.error')} text={t('usage.errorText')} />
      ) : !tokens ? (
        <Empty icon={Activity} title={t('usage.empty')} text={t('usage.emptyText')} />
      ) : (
        <>
          <div className="usage-tiles">
            <Tile icon={Cpu} label={t('usage.tokens')} value={fmt(tokens)} sub={t('usage.tokensSub', { input: fmt(data.total.input + data.total.cacheWrite), cache: fmt(data.total.cacheRead), output: fmt(data.total.output) })} />
            <Tile icon={Coins} label={t('usage.value')} value={usd(data.total.value)} sub={t('usage.valueSub')} />
            <Tile icon={MessageSquare} label={t('usage.answers')} value={fmt(data.total.messages)} sub={t('usage.perDay', { n: fmt(data.total.messages / Number(days)) })} />
            <Tile icon={Activity} label={t('usage.topModel')} value={top ? top.model.replace(/^claude-/, '') : '—'} sub={top ? t('usage.share', { n: Math.round((top.value / Math.max(data.total.value, 1e-9)) * 100) }) : ''} />
          </div>

          <div className="card usage-chart-card">
            <div className="usage-chart-head">
              <b>{t('usage.daily')}</b>
              <div className="usage-legend">
                {SRC.filter((s) => data.models.some((m) => m.source === s)).map((s) => (
                  <span key={s}><i className={`sw sw-${s}`} />{SRC_LABEL[s]}</span>
                ))}
              </div>
            </div>
            <DailyChart rows={data.daily} />
          </div>

          <div className="usage-two">
            <div className="card usage-table-card">
              <b>{t('usage.byModel')}</b>
              <div className="usage-table-wrap">
                <table className="usage-table">
                  <thead><tr><th>{t('usage.model')}</th><th className="num">{t('usage.answers')}</th><th className="num">{t('usage.in')}</th><th className="num">{t('usage.out')}</th><th className="num">{t('usage.cache')}</th><th className="num">{t('usage.value')}</th></tr></thead>
                  <tbody>
                    {data.models.map((m) => (
                      <tr key={m.model}>
                        <td><i className={`sw sw-${m.source}`} />{m.model}</td>
                        <td className="num">{fmt(m.messages)}</td>
                        <td className="num">{fmt(m.input + m.cacheWrite)}</td>
                        <td className="num">{fmt(m.output)}</td>
                        <td className="num">{fmt(m.cacheRead)}</td>
                        <td className="num">{usd(m.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card usage-table-card">
              <b>{t('usage.byProject')}</b>
              <div className="usage-bars">
                {data.projects.map((p) => (
                  <div key={p.project} className="usage-bar-row" title={`${p.project} · ${fmt(p.tokens)} · ${usd(p.value)}`}>
                    <span className="truncate">{p.project}</span>
                    <span className="usage-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${(p.tokens / Math.max(data.projects[0]?.tokens ?? 1, 1)) * 100}%` }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} /></span>
                    <span className="num small muted">{fmt(p.tokens)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {Object.keys(data.alter.byProvider).length > 0 && (
            <div className="card usage-table-card">
              <b>{t('usage.alter')}</b>
              <p className="small faint" style={{ margin: '2px 0 8px' }}>{t('usage.alterText')}</p>
              <div className="usage-table-wrap">
                <table className="usage-table">
                  <thead><tr><th>AI</th><th className="num">{t('usage.runs')}</th><th className="num">{t('usage.today')}</th><th className="num">{t('usage.in')}</th><th className="num">{t('usage.out')}</th></tr></thead>
                  <tbody>
                    {Object.entries(data.alter.byProvider).map(([id, p]) => (
                      <tr key={id}><td>{id}</td><td className="num">{fmt(p.runs)}</td><td className="num">{fmt(p.today.runs)}</td><td className="num">{fmt(p.input)}</td><td className="num">{fmt(p.output)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="small faint">{t('usage.localNote')}</p>
        </>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Cpu; label: string; value: string; sub?: string }) {
  return (
    <div className="card usage-tile">
      <span className="usage-tile-label"><Icon size={15} />{label}</span>
      <b className="usage-tile-value">{value}</b>
      {sub && <span className="small faint">{sub}</span>}
    </div>
  );
}

/** Stacked daily bars (Claude Code / Codex / Gemini CLI), hover a day for its numbers. */
function DailyChart({ rows }: { rows: LocalUsage['daily'] }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = 240, PAD_L = 44, PAD_B = 24, PAD_T = 8;
  const max = useMemo(() => Math.max(1, ...rows.map((r) => r.claude + r.codex + r.gemini)), [rows]);
  // a round axis top: 1, 2, 5 × 10^n
  const top = useMemo(() => {
    const p = 10 ** Math.floor(Math.log10(max));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= max) ?? max;
  }, [max]);
  const n = rows.length;
  const slot = (W - PAD_L) / n;
  const bw = Math.max(2, Math.min(28, slot - (n > 60 ? 1 : 2)));
  const y = (v: number) => H - PAD_B - (v / top) * (H - PAD_B - PAD_T);
  const ticks = [0, 0.5, 1].map((f) => f * top);
  const labelEvery = Math.ceil(n / 8);
  const h = hover !== null ? rows[hover] : null;

  return (
    <div className="usage-chart" ref={box} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('usage.daily')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD_L - 8} y={y(v) + 4} className="axis" textAnchor="end">{fmt(v)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = PAD_L + i * slot + (slot - bw) / 2;
          let acc = 0;
          const parts = SRC.map((s) => ({ s, v: r[s] })).filter((p) => p.v > 0);
          return (
            <g key={r.day} className={hover !== null && hover !== i ? 'dim' : ''}>
              {parts.map((p, k) => {
                const y0 = y(acc);
                acc += p.v;
                const y1 = y(acc);
                const last = k === parts.length - 1;
                const hgt = Math.max(0, y0 - y1 - (last ? 0 : 2)); // 2px surface gap between segments
                return <rect key={p.s} className={`bar-${p.s}`} x={x} y={y1 + (last ? 0 : 0)} width={bw} height={hgt} rx={last ? Math.min(4, bw / 2) : 0} />;
              })}
              {i % labelEvery === 0 && <text x={x + bw / 2} y={H - 6} className="axis" textAnchor="middle">{r.day.slice(5).replace('-', '.')}</text>}
              <rect x={PAD_L + i * slot} y={0} width={slot} height={H - PAD_B} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="usage-tip" style={{ left: `${((PAD_L + hover * slot + slot / 2) / W) * 100}%` }}>
          <b>{new Date(h.day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
          {SRC.filter((s) => h[s] > 0).map((s) => <span key={s}><i className={`sw sw-${s}`} />{SRC_LABEL[s]}<em>{fmt(h[s])}</em></span>)}
          {!SRC.some((s) => h[s] > 0) && <span className="faint">{t('usage.none')}</span>}
        </div>
      )}
    </div>
  );
}
