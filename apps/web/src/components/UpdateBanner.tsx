// "A new version is out": on the computer it installs itself (download → close → install → reopen),
// in the phone app it offers the new APK. Checked against the newest GitHub release; hidden per version once dismissed.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDownToLine, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { api, useData, type Status } from '../api';
import { useT } from '../i18n';
import { isNativeApp } from '../native';
import { toast } from './ui';

interface UpdateInfo { current: string; latest: string | null; available: boolean; page: string; setupUrl: string; apkUrl: string; apkVersion?: string | null; canInstall: boolean; installing?: boolean }

const newer = (a: string, b: string) => {
  const p = (v: string) => v.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};
const appVersion = () => navigator.userAgent.match(/ALTTER-App\/([\d.]+)/)?.[1] ?? null;
const KEY = 'altter.updateDismissed';
const dismissed = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };

export function UpdateBanner() {
  const t = useT();
  const { data: status } = useData<Status>('/api/status', 15_000);
  const { data: u } = useData<UpdateInfo>('/api/update', 30 * 60_000);
  const [hidden, setHidden] = useState(dismissed);
  const [busy, setBusy] = useState(false);
  if (!u?.latest) return null;

  const isComputer = status?.you.kind === 'computer';
  const apkLatest = u.apkVersion || u.latest;
  const phone = isNativeApp && appVersion() && newer(apkLatest, appVersion()!);
  const desktop = isComputer && u.available;
  const show = (phone || desktop) && hidden !== u.latest;

  const install = async () => {
    if (!u.canInstall) return void window.open(u.page, '_blank', 'noopener');
    setBusy(true);
    try {
      await api('/api/update/install', { method: 'POST' });
      toast(t('update.installing'), 'info');
    } catch (e) {
      setBusy(false);
      toast((e as Error).message, 'error');
    }
  };
  const close = () => { try { localStorage.setItem(KEY, u.latest!); } catch {} setHidden(u.latest!); };

  return (
    <AnimatePresence>
      {show && (
        <motion.div className="update-banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <Sparkles size={16} />
          <span className="grow">
            <b>{t('update.title', { v: u.latest })}</b>
            <span className="muted"> · {phone ? t('update.phone') : t('update.lead', { v: u.current })}</span>
          </span>
          {phone ? (
            <a className="btn primary sm" href={u.apkUrl}><ArrowDownToLine size={14} />{t('update.download')}</a>
          ) : (
            <button className="btn primary sm" disabled={busy} onClick={install}>{busy ? <span className="spinner" /> : <ArrowDownToLine size={14} />}{u.canInstall ? t('update.install') : t('update.download')}</button>
          )}
          <button className="btn ghost icon sm" onClick={close} aria-label={t('common.close')}><X /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
