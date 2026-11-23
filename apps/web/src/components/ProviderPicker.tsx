// The AI picker in the chat composer: every subscription with its live state and today's usage.
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Gauge, Settings2 } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useData, type ProviderStatus, type UsageSummary } from '../api';
import { formatTime, useT, type Key } from '../i18n';
import { navigate } from '../router';
import { ProviderMark, spring } from './ui';

export const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// model + effort per AI, remembered on this device ('' = the AI's own default)
type Pref = { model: string; effort: string };
const subs = new Set<() => void>();
const read = (pid: string): Pref => {
  try {
    return { model: '', effort: '', ...JSON.parse(localStorage.getItem(`alter.pref.${pid}`) ?? '{}') };
  } catch {
    return { model: '', effort: '' };
  }
};
const cache = new Map<string, Pref>();
export function getPref(pid: string): Pref {
  if (!cache.has(pid)) cache.set(pid, read(pid));
  return cache.get(pid)!;
}
export function setPref(pid: string, patch: Partial<Pref>) {
  const next = { ...getPref(pid), ...patch };
  cache.set(pid, next);
  try { localStorage.setItem(`alter.pref.${pid}`, JSON.stringify(next)); } catch {}
  subs.forEach((f) => f());
}
export const usePref = (pid: string | undefined) =>
  useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => (pid ? getPref(pid) : EMPTY));
const EMPTY: Pref = { model: '', effort: '' };

export function ProviderPicker({ value, onChange, up = true }: { value: string; onChange: (id: string) => void; up?: boolean }) {
  const t = useT();
  const { data: providers } = useData<ProviderStatus[]>('/api/providers', 10_000);
  const { data: usage } = useData<UsageSummary>('/api/usage', 15_000);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const def = providers?.find((p) => p.isDefault);
  const current = value === 'default' ? def : providers?.find((p) => p.id === value);
  const list = (providers ?? []).filter((p) => p.id !== 'demo');
  const pref = usePref(current?.id);
  const modelLabel = current?.models.find((m) => m.id === pref.model)?.label;
  const limit = (id?: string) => usage?.limits.find((l) => l.provider === id);
  const dot = (p?: ProviderStatus) => (!p ? 'warn' : limit(p.id) ? 'danger' : p.connected ? 'ok' : p.installed ? 'warn' : '');

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className="picker" ref={ref}>
      <button type="button" className={`chip-select${open ? ' open' : ''}`} onClick={() => setOpen(!open)} title={t('agents.ai')}>
        <span className={`status-dot ${dot(current)}`} />
        {current?.name ?? 'AI'}
        {(modelLabel || pref.effort) && <span className="faint">· {[modelLabel, pref.effort && t(`effort.${pref.effort}` as Key)].filter(Boolean).join(' · ')}</span>}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring} style={{ display: 'grid' }}><ChevronDown /></motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={`picker-pop${up ? ' up' : ''}`}
            initial={{ opacity: 0, y: up ? 8 : -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: up ? 6 : -6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={spring}
          >
            <div className="picker-head">{t('picker.title')}</div>
            {[{ id: 'default', p: def }, ...list.map((p) => ({ id: p.id, p }))].map(({ id, p }, i) => {
              const l = limit(p?.id);
              const u = p ? usage?.byProvider[p.id]?.today : undefined;
              const disabled = id !== 'default' && !p?.installed;
              return (
                <motion.button
                  type="button"
                  key={id}
                  className={`picker-item${value === id ? ' active' : ''}`}
                  disabled={disabled}
                  onClick={() => pick(id)}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  {id === 'default' ? (
                    <div className="provider-mark" style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Settings2 size={16} /></div>
                  ) : (
                    <ProviderMark id={p!.id} name={p!.name} size={32} />
                  )}
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <b>{id === 'default' ? t('conn.default') : p!.name}</b>
                      {id === 'default' && def && <span className="faint small">· {def.name}</span>}
                    </div>
                    <div className="small faint truncate">
                      {l ? (
                        <span style={{ color: 'var(--danger)' }}>{t('picker.limited')}{l.until ? ` · ${t('picker.resets', { time: formatTime(l.until, false) })}` : ''}</span>
                      ) : disabled ? (
                        t('conn.notInstalled')
                      ) : p && !p.connected ? (
                        t('conn.untested')
                      ) : u?.runs ? (
                        t('picker.today', { runs: u.runs, tokens: fmtTokens(u.input + u.output) })
                      ) : (
                        p?.subscription
                      )}
                    </div>
                  </div>
                  <span className={`status-dot ${dot(p)}`} />
                  {value === id && <Check size={15} color="var(--accent-strong)" />}
                </motion.button>
              );
            })}
            {current && (current.models.length > 0 || current.efforts.length > 0) && (
              <div className="picker-tune">
                {current.models.length > 0 && (
                  <>
                    <div className="picker-head">{t('picker.model')} · {current.name}</div>
                    <div className="tune-row">
                      {[{ id: '', label: t('picker.defaultModel') }, ...current.models].map((m) => (
                        <button type="button" key={m.id} className={pref.model === m.id ? 'active' : ''} onClick={() => setPref(current.id, { model: m.id })}>{m.label}</button>
                      ))}
                    </div>
                  </>
                )}
                {current.efforts.length > 0 && (
                  <>
                    <div className="picker-head">{t('picker.effort')}</div>
                    <div className="tune-row">
                      {['', ...current.efforts].map((e) => (
                        <button type="button" key={e} className={pref.effort === e ? 'active' : ''} onClick={() => setPref(current.id, { effort: e })}>{e ? t(`effort.${e}` as Key) : t('picker.defaultModel')}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button type="button" className="picker-foot" onClick={() => { setOpen(false); navigate('/settings?tab=ai'); }}>
              <Gauge size={14} />
              {t('picker.manage')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
