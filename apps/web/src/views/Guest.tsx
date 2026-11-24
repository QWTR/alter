// Someone opened a share link: ask their name, then show just that one chat (live, together with the host).
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { enterAsGuest, type GuestInfo } from '../api';
import { Logo, Toasts, softSpring } from '../components/ui';
import { MemberDot } from '../components/Presence';
import { setLang, useT } from '../i18n';
import { isNativeApp } from '../native';

/** In the phone app a joined chat replaces the own ALTTER: this takes the user back to it. */
function BackHome() {
  const t = useT();
  if (!isNativeApp) return null;
  return <button type="button" className="btn sm guest-back" onClick={() => location.replace('https://localhost/')}><ArrowLeft size={15} />{t('join.back')}</button>;
}
import { ChatView } from './Chat';

interface ShareInfo { conversationId: string; title: string; host: string; guestsCanSend: boolean; members: { cid: string; name: string; color: string }[] }

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

export function GuestGate({ token }: { token: string }) {
  const t = useT();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [error, setError] = useState('');
  // joined from someone's ALTTER app: their own name comes along (?as=…) and they go straight in
  const [asName] = useState(() => { const v = new URLSearchParams(location.search).get('as')?.trim().slice(0, 40) ?? ''; if (v) history.replaceState(null, '', location.pathname + location.hash); return v; });
  const [name, setName] = useState(() => asName || store.get('alter.guestName') || '');
  const [joined, setJoined] = useState<GuestInfo | null>(null);

  useEffect(() => {
    setLang((navigator.language || 'en').slice(0, 2).toLowerCase());
    fetch(`/api/share/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || r.statusText);
        setInfo(d);
        document.title = `${d.title} · ALTTER`;
      })
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => { if (asName && info && !joined) enter(asName); }, [asName, info]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    enter(name);
  };
  const enter = (raw: string) => {
    const n = raw.trim().slice(0, 40);
    if (!n || !info) return;
    store.set('alter.guestName', n);
    const g: GuestInfo = { token, conversationId: info.conversationId, title: info.title, host: info.host, name: n, guestsCanSend: info.guestsCanSend };
    enterAsGuest(g);
    setJoined(g);
  };

  if (joined)
    return (
      <div className="guest-app">
        <BackHome />
        <main className="main">
          <div className="view view-enter"><ChatView /></div>
        </main>
        <div className="backdrop-glow" />
        <Toasts />
      </div>
    );

  return (
    <div className="guest-gate">
      <BackHome />
      <div className="backdrop-glow" />
      <motion.form className="card guest-card" onSubmit={join} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={softSpring}>
        <Logo size={48} animated />
        {error ? (
          <>
            <h2>{t('session.expired')}</h2>
            <p className="muted">{t('session.expiredLead')}</p>
          </>
        ) : !info ? (
          <p className="muted">…</p>
        ) : (
          <>
            <span className="small muted row" style={{ gap: 6, justifyContent: 'center' }}><Users size={14} />{t('session.invited', { host: info.host })}</span>
            <h2 className="truncate">{info.title}</h2>
            {info.members.length > 0 && (
              <div className="row" style={{ justifyContent: 'center', gap: 4 }}>
                {info.members.slice(0, 6).map((m) => <MemberDot key={m.cid} name={m.name} color={m.color} size={28} />)}
              </div>
            )}
            <input className="input" autoFocus placeholder={t('session.yourName')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" disabled={!name.trim()}>{t('session.join')}<ArrowRight /></button>
            {!info.guestsCanSend && <p className="small faint" style={{ margin: 0 }}>{t('session.watchOnly')}</p>}
          </>
        )}
      </motion.form>
    </div>
  );
}
