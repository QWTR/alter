// "A new version is out": on the computer it installs itself, quietly, with a progress panel
// (download → unpack/install → restart); in the phone app it offers the new APK.
// Checked against the newest GitHub release; hidden per version once dismissed.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDownToLine, Check, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, useData, type Status } from '../api';
import { useT } from '../i18n';
import { isNativeApp } from '../native';
import { toast } from './ui';

interface UpdateProgress { stage: 'download' | 'unpack' | 'restart' | 'error'; mode: 'quick' | 'full'; done: number; total: number; error?: string }
interface UpdateInfo { current: string; latest: string | null; available: boolean; page: string; setupUrl: string; apkUrl: string; apkVersion?: string | null; canInstall: boolean; installing?: boolean; quick?: boolean; size?: number; progress?: UpdateProgress }

const newer = (a: string, b: string) => {
  const p = (v: string) => v.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};
const appVersion = () => navigator.userAgent.match(/ALTTER-App\/([\d.]+)/)?.[1] ?? null;
const KEY = 'altter.updateDismissed';
const DONE = 'altter.updatedTo';
const dismissed = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
const mb = (n: number) => (n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0);

export function UpdateBanner() {
  const t = useT();
  const { data: status } = useData<Status>('/api/status', 15_000);
  const { data: u } = useData<UpdateInfo>('/api/update', 30 * 60_000);
  const [hidden, setHidden] = useState(dismissed);
  const [run, setRun] = useState<{ to: string; p?: UpdateProgress; lost?: boolean } | null>(null);

  // after the restart: say it worked, once
  useEffect(() => {
    if (!u?.current) return;
    let to = '';
    try { to = localStorage.getItem(DONE) ?? ''; } catch {}
    if (to && !newer(to, u.current)) {
      try { localStorage.removeItem(DONE); } catch {}
      toast(t('update.done', { v: u.current }), 'ok');
    }
  }, [u?.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // while installing: follow the steps closely
  useEffect(() => {
    if (!run || run.p?.stage === 'error') return;
    const id = setInterval(async () => {
      try {
        const x = await api<UpdateInfo>('/api/update');
        if (x.current && run.to && !newer(run.to, x.current)) return void window.location.reload();
        setRun((r) => (r ? { ...r, p: x.progress ?? r.p, lost: false } : r));
      } catch {
        // ALTTER is closed for the swap — it comes back by itself
        setRun((r) => (r ? { ...r, lost: true } : r));
      }
    }, 600);
    return () => clearInterval(id);
  }, [run?.to, run?.p?.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!u?.latest) return null;

  const isComputer = status?.you.kind === 'computer';
  const apkLatest = u.apkVersion || u.latest;
  const phone = isNativeApp && appVersion() && newer(apkLatest, appVersion()!);
  const desktop = isComputer && u.available;
  const show = !!run || ((phone || desktop) && hidden !== u.latest);

  const install = async () => {
    if (!u.canInstall) return void window.open(u.page, '_blank', 'noopener');
    setRun({ to: u.latest! });
    try { localStorage.setItem(DONE, u.latest!); } catch {}
    try {
      await api('/api/update/install', { method: 'POST' });
    } catch (e) {
      try { localStorage.removeItem(DONE); } catch {}
      setRun((r) => ({ to: u.latest!, p: { stage: 'error', mode: r?.p?.mode ?? 'full', done: 0, total: 0, error: (e as Error).message } }));
    }
  };
  const close = () => { try { localStorage.setItem(KEY, u.latest!); } catch {} setHidden(u.latest!); };

  return (
    <AnimatePresence>
      {show && (run ? <UpdatePanel key="panel" to={run.to} from={u.current} p={run.p} lost={!!run.lost} quick={!!u.quick} onClose={() => setRun(null)} onRetry={install} />
        : (
        <motion.div key="banner" className="update-banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <Sparkles size={16} />
          <span className="grow">
            <b>{t('update.title', { v: u.latest })}</b>
            <span className="muted"> · {phone ? t('update.phone') : t('update.lead', { v: u.current })}</span>
          </span>
          {phone ? (
            <a className="btn primary sm" href={u.apkUrl}><ArrowDownToLine size={14} />{t('update.download')}</a>
          ) : (
            <button className="btn primary sm" onClick={install}><ArrowDownToLine size={14} />{u.canInstall ? t('update.install') : t('update.download')}{u.canInstall && u.size ? <span className="update-size">{mb(u.size)} MB</span> : null}</button>
          )}
          <button className="btn ghost icon sm" onClick={close} aria-label={t('common.close')}><X /></button>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

function UpdatePanel({ to, from, p, lost, quick, onClose, onRetry }: { to: string; from: string; p?: UpdateProgress; lost: boolean; quick: boolean; onClose: () => void; onRetry: () => void }) {
  const t = useT();
  const mode = p?.mode ?? (quick ? 'quick' : 'full');
  const stage = lost ? 'restart' : p?.stage ?? 'download';
  const failed = stage === 'error';
  const steps = [
    { id: 'download', label: t('update.step.download') },
    { id: 'unpack', label: mode === 'quick' ? t('update.step.unpack') : t('update.step.install') },
    { id: 'restart', label: t('update.step.restart') },
  ] as const;
  const at = failed ? -1 : steps.findIndex((s) => s.id === stage);
  const pct = stage === 'download' && p?.total ? Math.min(100, (p.done / p.total) * 100) : stage === 'download' ? 0 : 100;
  return (
    <motion.div className="update-panel" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} role="status" aria-live="polite">
      <div className="row" style={{ gap: 8 }}>
        <Sparkles size={16} />
        <b className="grow">{failed ? t('update.failed') : t('update.panelTitle', { v: to })}</b>
        <span className="small faint">{from} → {to}</span>
        {failed && <button className="btn ghost icon sm" onClick={onClose} aria-label={t('common.close')}><X /></button>}
      </div>
      <p className="small muted" style={{ margin: '4px 0 10px' }}>{failed ? p?.error : mode === 'quick' ? t('update.quickLead') : t('update.fullLead')}</p>
      <ol className="update-steps">
        {steps.map((s, i) => {
          const done = !failed && i < at;
          const now = !failed && i === at;
          return (
            <li key={s.id} className={done ? 'done' : now ? 'now' : ''}>
              <span className="dot">{done ? <Check size={12} /> : now ? <span className="spinner" /> : null}</span>
              <span className="grow">{s.label}</span>
              {s.id === 'download' && now && p?.total ? <span className="small faint mono">{mb(p.done)} / {mb(p.total)} MB</span> : null}
            </li>
          );
        })}
      </ol>
      {!failed && <div className="update-bar"><i style={{ width: `${stage === 'download' ? pct / 3 : stage === 'unpack' ? 50 : 90}%` }} /></div>}
      {stage === 'restart' && !failed && <p className="small faint" style={{ margin: '8px 0 0' }}>{t('update.restartNote')}</p>}
      {failed && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn primary sm" onClick={onRetry}>{t('update.retry')}</button></div>}
    </motion.div>
  );
}
