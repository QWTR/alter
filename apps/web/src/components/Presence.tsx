// Online sessions in the chat: who is here, their cursors, what they are typing, and the share panel.
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Globe, Link2, Radio, Users, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { api, clientId, connectRoom, invalidate, sendPresence, useData, type Conversation, type Presence, type RemoteRun, type RoomMember, type Status } from '../api';
import { useT } from '../i18n';
import { spring, Switch, toast } from './ui';

export type RunHandler = (d: { ev: string; cid: string; data: any }) => void;

/** Joins the chat's room: members, their presence, and a throttled way to share mine. */
export function useRoom(conversationId: string | null, name: string, onRun: RunHandler) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [states, setStates] = useState<Record<string, Presence>>({});
  const runRef = useRef(onRun);
  runRef.current = onRun;
  const pending = useRef<Presence>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    const close = connectRoom(conversationId, name, {
      hello: (d) => {
        setMembers(d.members);
        setStates(d.state ?? {});
        if (d.run) runRef.current({ ev: 'snapshot', cid: d.run.cid, data: d.run as RemoteRun });
      },
      members: setMembers,
      state: ({ cid, gone, ...p }) =>
        setStates((all) => {
          if (gone) {
            const { [cid]: _, ...rest } = all;
            return rest;
          }
          return { ...all, [cid]: { ...all[cid], ...p } };
        }),
      run: (d) => runRef.current(d),
    });
    return () => {
      close();
      setMembers([]);
      setStates({});
    };
  }, [conversationId, name]);

  const send = useMemo(
    () => (patch: Presence) => {
      if (!conversationId) return;
      pending.current = { ...pending.current, ...patch };
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        const p = pending.current;
        pending.current = {};
        sendPresence(conversationId, p);
      }, 60);
    },
    [conversationId],
  );

  const others = members.filter((m) => m.cid !== clientId);
  return { members, others, states, send };
}

/** Tracks my pointer over the chat (anchored to the element under it, so it lands right on every screen size). */
export function usePointerShare(root: RefObject<HTMLElement | null>, send: (p: Presence) => void, on: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el || !on) return;
    let last = 0;
    const move = (e: PointerEvent) => {
      const now = Date.now();
      if (now - last < 40) return;
      last = now;
      const a = (e.target as HTMLElement).closest?.('[data-anchor]') as HTMLElement | null;
      if (!a || !el.contains(a)) return;
      const r = a.getBoundingClientRect();
      send({ cursor: { a: a.dataset.anchor!, fx: r.width ? (e.clientX - r.left) / r.width : 0, fy: r.height ? (e.clientY - r.top) / r.height : 0 } });
    };
    const leave = () => send({ cursor: null });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [root, send, on]);
}

export function Cursor({ color, name, x, y }: { color: string; name: string; x: number; y: number }) {
  return (
    <div className="r-cursor" style={{ transform: `translate(${x}px, ${y}px)` }}>
      <svg width="18" height="20" viewBox="0 0 18 20"><path d="M1 1l15 8.2-6.7 1.6L6 18z" fill={color} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" /></svg>
      <span style={{ background: color }}>{name}</span>
    </div>
  );
}

/** Other people's cursors over the chat column. */
export function CursorLayer({ root, others, states }: { root: RefObject<HTMLElement | null>; others: RoomMember[]; states: Record<string, Presence> }) {
  const [, redraw] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; redraw((n) => n + 1); });
    };
    el.addEventListener('scroll', kick, true);
    addEventListener('resize', kick);
    return () => {
      el.removeEventListener('scroll', kick, true);
      removeEventListener('resize', kick);
      cancelAnimationFrame(raf);
    };
  }, [root]);
  const el = root.current;
  if (!el) return null;
  const box = el.getBoundingClientRect();
  return (
    <div className="cursor-layer" aria-hidden>
      {others.map((m) => {
        const c = states[m.cid]?.cursor;
        if (!c || c.a === 'preview') return null;
        const a = el.querySelector(`[data-anchor="${CSS.escape(c.a)}"]`);
        if (!a) return null;
        const r = a.getBoundingClientRect();
        const x = r.left - box.left + r.width * c.fx;
        const y = r.top - box.top + r.height * c.fy;
        if (y < -10 || y > box.height + 10) return null;
        return <Cursor key={m.cid} color={m.color} name={m.name} x={x} y={y} />;
      })}
    </div>
  );
}

const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

export function MemberDot({ name, color, size = 26, ring }: { name: string; color: string; size?: number; ring?: boolean }) {
  return (
    <span className={`member-dot${ring ? ' ring' : ''}`} style={{ background: color, width: size, height: size, fontSize: size * 0.4 }} title={name}>
      {initials(name)}
    </span>
  );
}

/** Avatar stack in the chat header. */
export function Members({ members }: { members: RoomMember[] }) {
  const t = useT();
  if (members.length < 2) return null;
  return (
    <div className="members" title={members.map((m) => m.name + (m.cid === clientId ? ` (${t('session.you')})` : '')).join(', ')}>
      <AnimatePresence initial={false}>
        {members.slice(0, 5).map((m) => (
          <motion.span key={m.cid} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}>
            <MemberDot name={m.name} color={m.color} ring={m.cid === clientId} />
          </motion.span>
        ))}
      </AnimatePresence>
      {members.length > 5 && <span className="member-dot more">+{members.length - 5}</span>}
    </div>
  );
}

/** "Ania is typing…" with the live text, under the messages. */
export function TypingGhosts({ others, states }: { others: RoomMember[]; states: Record<string, Presence> }) {
  const t = useT();
  const typing = others.filter((m) => (states[m.cid]?.typing ?? '').trim() || states[m.cid]?.picks?.length);
  return (
    <AnimatePresence initial={false}>
      {typing.map((m) => {
        const s = states[m.cid]!;
        return (
          <motion.div key={m.cid} className="msg user ghost" data-anchor={`typing-${m.cid}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.2 }}>
            <MemberDot name={m.name} color={m.color} size={30} />
            <div className="bubble" style={{ borderColor: m.color }}>
              <div className="ghost-meta" style={{ color: m.color }}>{t('session.typing', { name: m.name })}<span className="typing-dots"><i /><i /><i /></span></div>
              {s.typing}
              <span className="caret" style={{ background: m.color }} />
              {!!s.picks?.length && (
                <div className="pick-chips in-bubble">
                  {s.picks.map((p, i) => (
                    <span key={i} className="pick-chip" style={{ borderColor: m.color }} title={p.selector}><code className="truncate">{p.label}</code></span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}

/** Header button: start / stop an online session and copy the links. */
export function ShareButton({ conv, members }: { conv: Conversation; members: RoomMember[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const { data: status } = useData<Status>('/api/status', 15_000);
  const { data: tunnel } = useData<{ running: boolean; url: string | null; error?: string }>(open ? '/api/tunnel' : null, 5000);
  const [tunnelErr, setTunnelErr] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const share = conv.share;

  // the panel lives in <body> (the chat header is narrow and clips), placed under the button
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.right - 360, innerWidth - 368)) });
    };
    place();
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node) && setOpen(false);
    addEventListener('mousedown', close);
    addEventListener('resize', place);
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('resize', place);
    };
  }, [open]);

  const refresh = () => invalidate(`/api/conversations/${conv.id}`);
  const start = async (guestsCanSend = share?.guestsCanSend ?? true) => {
    setBusy(true);
    try {
      await api(`/api/conversations/${conv.id}/share`, { method: 'POST', body: { guestsCanSend } });
      refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    await api(`/api/conversations/${conv.id}/share`, { method: 'DELETE' }).catch(() => {});
    refresh();
  };
  const goOnline = async () => {
    setBusy(true);
    setTunnelErr('');
    try {
      const r = await api<{ url: string | null; error?: string }>('/api/tunnel', { method: 'POST' });
      if (!r.url) setTunnelErr(r.error ?? 'error');
      invalidate('/api/tunnel');
    } finally {
      setBusy(false);
    }
  };
  const copy = (u: string) => navigator.clipboard?.writeText(u).then(() => { setCopied(u); setTimeout(() => setCopied(''), 1500); });

  const hash = share ? `/#/s/${share.token}` : '';
  const bases = [...new Set([...(location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? [] : [location.origin]), ...(status?.lanUrls ?? [])])];
  const links = share ? [...(tunnel?.url ? [{ url: tunnel.url + hash, net: true }] : []), ...bases.map((b) => ({ url: b + hash, net: false }))] : [];
  const live = members.length > 1;

  return (
    <div className="share-wrap" ref={ref}>
      <button className={`btn sm${share ? (live ? ' primary' : ' on') : ' ghost'}`} onClick={() => setOpen((v) => !v)} title={t('session.share')}>
        {share ? <Radio className={live ? 'pulse' : ''} /> : <Users />}
        <span className="share-label">{share ? (live ? t('session.live', { n: members.length }) : t('session.on')) : t('session.share')}</span>{live && <span className="share-count">{members.length}</span>}
      </button>
      {createPortal(<AnimatePresence>
        {open && (
          <motion.div ref={pop} className="share-pop" style={pos} initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.16 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{t('session.title')}</b>
              <button className="btn ghost icon sm" onClick={() => setOpen(false)} aria-label={t('common.close')}><X /></button>
            </div>
            <p className="muted small" style={{ margin: '4px 0 12px' }}>{t('session.lead')}</p>
            {!share ? (
              <button className="btn primary" style={{ width: '100%' }} disabled={busy} onClick={() => start(true)}><Link2 />{t('session.start')}</button>
            ) : (
              <>
                <div className="share-links">
                  {links.map((l) => (
                    <div key={l.url} className="share-link">
                      {l.net ? <Globe size={14} /> : <Link2 size={14} />}
                      <code className="truncate grow">{l.url}</code>
                      <button className="btn ghost icon sm" onClick={() => copy(l.url)} title={t('common.copy')}>{copied === l.url ? <Check /> : <Copy />}</button>
                    </div>
                  ))}
                  {!links.length && <div className="muted small">{t('session.noLan')}</div>}
                </div>
                {!tunnel?.url && (
                  <button className="btn sm" style={{ marginTop: 8 }} disabled={busy} onClick={goOnline}><Globe />{t('session.internet')}</button>
                )}
                {tunnelErr && (
                  <div className="small muted" style={{ marginTop: 8 }}>
                    {t('session.tunnelFail')}{' '}
                    <a href="#/settings?tab=internet" onClick={() => setOpen(false)}>{t('net.openSettings')}</a>
                  </div>
                )}
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
                  <span className="small">{t('session.guestsSend')}</span>
                  <Switch on={share.guestsCanSend} onChange={(v) => start(v)} />
                </div>
                {share.guestsCanSend && conv.access === 'full' && <div className="small warn-text" style={{ marginTop: 6 }}>{t('session.fullWarn')}</div>}
                {members.length > 0 && (
                  <div className="share-members">
                    {members.map((m) => (
                      <span key={m.cid} className="row small" style={{ gap: 6 }}><MemberDot name={m.name} color={m.color} size={20} />{m.name}{m.cid === clientId ? ` (${t('session.you')})` : m.guest ? ` · ${t('session.guest')}` : ''}</span>
                    ))}
                  </div>
                )}
                <button className="btn ghost sm danger" style={{ marginTop: 12 }} onClick={stop}>{t('session.stop')}</button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </div>
  );
}
