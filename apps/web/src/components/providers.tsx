import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, Download, KeyRound, RefreshCw, Star, TriangleAlert } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { api, invalidate, setCached, useData, type ProviderStatus } from '../api';
import { useT } from '../i18n';
import { ProviderMark, Spinner, toast } from './ui';

// live connection progress pushed by the core (installing → signing-in → done)
type Progress = { stage: 'installing' | 'checking' | 'signing-in' | 'done' | 'cancelled' | 'error'; error?: string; url?: string };
let progress: Record<string, Progress> = {};
const progressSubs = new Set<() => void>();
export function setProviderProgress(id: string, p: Progress) {
  const prev = progress[id];
  progress = { ...progress, [id]: prev && prev.stage === p.stage ? { ...prev, ...p } : p };
  progressSubs.forEach((f) => f());
}
const useProgress = (id: string) =>
  useSyncExternalStore((cb) => (progressSubs.add(cb), () => progressSubs.delete(cb)), () => progress[id]);

export function useProviders() {
  return useData<ProviderStatus[]>('/api/providers', 10_000);
}

/** Overall state for the header chip: the default provider and whether it really works. */
export function useConnection() {
  const { data } = useProviders();
  const real = (data ?? []).filter((p) => p.id !== 'demo');
  const def = (data ?? []).find((p) => p.isDefault);
  const connected = real.filter((p) => p.connected);
  return { providers: data, def, connected, demo: !def || def.id === 'demo', ok: !!def && def.id !== 'demo' && def.connected };
}

export function ConnectionChip({ onClick, compact }: { onClick?: () => void; compact?: boolean }) {
  const t = useT();
  const { def, ok, demo, providers } = useConnection();
  const label = !providers ? t('conn.checking') : demo ? t('conn.demo') : ok ? def!.name : `${def!.name} · ${t('conn.untested')}`;
  return (
    <button className="nav-item" onClick={onClick} title={label} style={{ paddingBlock: 9 }}>
      <span className={`status-dot ${ok ? 'ok live' : demo ? 'warn' : 'warn'}`} />
      {!compact && (
        <span className="truncate" style={{ fontSize: 13 }}>
          {ok ? <><span style={{ color: 'var(--text)' }}>{def!.name}</span> <span className="faint">· {t('conn.connected')}</span></> : label}
        </span>
      )}
    </button>
  );
}

export function ProviderCard({ p, index = 0 }: { p: ProviderStatus; index?: number }) {
  const t = useT();
  const [testing, setTesting] = useState(false);
  const prog = useProgress(p.id);
  const busy = prog?.stage === 'installing' || prog?.stage === 'checking' || prog?.stage === 'signing-in';

  const test = async () => {
    setTesting(true);
    try {
      const h = await api(`/api/providers/${p.id}/test`, { method: 'POST' });
      setCached<ProviderStatus[]>('/api/providers', (list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, installed: h.error !== 'not-installed', connected: h.ok, health: h } : x)));
      invalidate('/api/providers', '/api/status');
      if (h.ok) toast(`${p.name} · ${t('conn.connected')}`, 'ok');
    } finally {
      setTesting(false);
    }
  };
  const connect = async () => {
    setProviderProgress(p.id, { stage: p.installed ? 'checking' : 'installing' });
    try {
      await api(`/api/providers/${p.id}/connect`, { method: 'POST' });
    } catch (err) {
      setProviderProgress(p.id, { stage: 'error', error: (err as Error).message });
    }
  };
  const makeDefault = async () => {
    await api('/api/settings', { method: 'PUT', body: { defaultProvider: p.id } });
    invalidate('/api/providers', '/api/status');
  };

  const h = p.health;
  let state: { cls: string; text: string; icon?: React.ReactNode };
  if (prog?.stage === 'installing') state = { cls: 'muted', text: t('conn.installing'), icon: <Spinner /> };
  else if (prog?.stage === 'checking') state = { cls: 'muted', text: t('conn.checking'), icon: <Spinner /> };
  else if (prog?.stage === 'signing-in') state = { cls: 'accent-strong', text: t('conn.signingIn'), icon: <Spinner /> };
  else if (prog?.stage === 'error' && !p.connected) state = { cls: 'danger', text: prog.error || t('conn.failed'), icon: <TriangleAlert size={15} /> };
  else if (testing) state = { cls: 'muted', text: t('conn.checking'), icon: <Spinner /> };
  else if (!p.installed) state = { cls: 'faint', text: t('conn.notInstalled') };
  else if (p.connected) state = { cls: 'ok', text: `${t('conn.connected')}${h?.latencyMs ? ` · ${(h.latencyMs / 1000).toFixed(1)} s` : ''}`, icon: <CircleCheck size={15} /> };
  else if (h && !h.ok) state = { cls: 'danger', text: h.error === 'not-signed-in' ? t('conn.notSignedIn') : t('conn.failed'), icon: <TriangleAlert size={15} /> };
  else state = { cls: 'warn', text: t('conn.untested') };

  return (
    <motion.div
      className="card provider"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={p.connected ? { borderColor: 'color-mix(in srgb, var(--ok) 35%, transparent)' } : undefined}
    >
      <ProviderMark id={p.id} name={p.name} />
      <div className="grow">
        <div className="row" style={{ gap: 8 }}>
          <h3>{p.name}</h3>
          <span className="faint small">{p.vendor}</span>
          {p.isDefault && p.connected && <span className="badge accent"><Star />{t('conn.default')}</span>}
        </div>
        <div className="small muted">{p.subscription}</div>
        {prog?.stage === 'signing-in' && (
          <div className="small faint" style={{ marginTop: 4 }}>
            {t('conn.signingInHint')}
            {prog.url && <> <a href={prog.url} target="_blank" rel="noreferrer">{t('conn.openLink')}</a></>}
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={state.text} className="state" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} style={{ color: state.cls === 'muted' || state.cls === 'faint' ? `var(--${state.cls === 'faint' ? 'faint' : 'muted'})` : `var(--${state.cls})` }}>
            {state.icon}
            {state.text}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {p.connected && !p.isDefault && <button className="btn sm ghost" onClick={makeDefault}>{t('conn.makeDefault')}</button>}
        {busy ? null : !p.installed ? (
          <button className="btn sm" onClick={connect}><Download />{t('conn.install')}</button>
        ) : !p.connected ? (
          <>
            <button className="btn sm primary" onClick={connect}><KeyRound />{t('conn.signIn')}</button>
            <button className="btn sm ghost" onClick={test} disabled={testing}>{t('conn.test')}</button>
          </>
        ) : (
          <button className="btn sm ghost icon" onClick={test} disabled={testing} title={t('conn.testAgain')}><RefreshCw /></button>
        )}
      </div>
    </motion.div>
  );
}
