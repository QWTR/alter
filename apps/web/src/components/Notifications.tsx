// Phone notifications: turn them on for this device, send a test. Needs HTTPS (the internet address
// or the VPS domain) and, on iPhone, the app added to the home screen.
import { isNativeApp } from '../native';
import { motion } from 'motion/react';
import { Bell, BellOff, BellRing, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, useData } from '../api';
import { useT } from '../i18n';
import { Switch, toast } from './ui';

const b64ToBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

type State = 'unsupported' | 'insecure' | 'ios-home' | 'denied' | 'off' | 'on' | 'app';

async function currentSub(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker?.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function detect(): State {
  if (!isSecureContext || location.hostname === 'localhost') return 'insecure';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
  if (ios && !standalone) return 'ios-home';
  if (isNativeApp) return 'app';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'off';
}

export function NotificationsCard() {
  const t = useT();
  const { data } = useData<{ publicKey: string; phones: number }>('/api/push', 30_000);
  const [state, setState] = useState<State>(detect);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state !== 'off') return;
    currentSub().then((s) => s && setState('on')).catch(() => {});
  }, [state]);

  const enable = async (on: boolean) => {
    setBusy(true);
    try {
      if (!on) {
        const s = await currentSub();
        if (s) {
          await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: s.endpoint } }).catch(() => {});
          await s.unsubscribe();
        }
        setState('off');
        return;
      }
      if (!data?.publicKey) throw new Error('…');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) }));
      await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
      setState('on');
      await api('/api/push/test', { method: 'POST', body: { text: t('notif.welcome') } });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    const r = await api<{ sent: number; failed: number }>('/api/push/test', { method: 'POST', body: { text: t('notif.testBody') } });
    toast(r.sent ? t('notif.sent', { n: r.sent }) : t('notif.none'), r.sent ? 'ok' : 'error');
  };

  const Icon = state === 'on' ? BellRing : state === 'off' ? Bell : BellOff;
  const hint = state === 'insecure' ? t('notif.insecure') : state === 'ios-home' ? t('notif.ios') : state === 'app' ? t('notif.app') : state === 'unsupported' ? t('notif.unsupported') : state === 'denied' ? t('notif.denied') : t('notif.hint');

  return (
    <motion.div className="card notif-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <motion.div className={`menu-ic${state === 'on' ? ' on' : ''}`} animate={state === 'on' ? { rotate: [0, -14, 12, -8, 0] } : {}} transition={{ duration: 0.6 }} style={{ width: 38, height: 38 }}>
          <Icon size={18} />
        </motion.div>
        <div className="grow">
          <b>{t('notif.title')}</b>
          <p className="small muted" style={{ margin: '4px 0 0' }}>{hint}</p>
          {!!data?.phones && <p className="small faint" style={{ margin: '6px 0 0' }}>{t('notif.count', { n: data.phones })}</p>}
        </div>
        {(state === 'on' || state === 'off') && <Switch on={state === 'on'} onChange={(v) => !busy && enable(v)} label={t('notif.title')} />}
      </div>
      {!!data?.phones && (
        <div className="row" style={{ marginTop: 12 }}>
          <span className="grow" />
          <button className="btn sm" onClick={test}><Send size={13} />{t('notif.test')}</button>
        </div>
      )}
    </motion.div>
  );
}
