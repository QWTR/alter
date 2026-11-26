// Workspace: one project + a standing team. Everyone invited keeps access (their key stays on their device),
// so they just open ALTTER and are in — the project's chats, its agents and who is online right now.
// The owner reaches the same view from the project page (#/workspace/<project>).
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Bot, Building2, CalendarDays, Check, ChevronDown, Copy, FileText, KanbanSquare, Link2, MessageSquare, Plus, Receipt, Trash2, UserPlus, Users, X, Zap } from 'lucide-react';
import { AutoPane, CalendarPane, CompanyView, DocsPane, SalesPane, TasksPane, type WsCtx } from './WorkspaceTools';
import { Tabs } from '../components/ui';
import { JoinModal, forgetWorkspace, joinedWorkspaces, openSession } from '../components/Join';
import { Download, ExternalLink, LogIn } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MousePointer2, PenTool, ScrollText } from 'lucide-react';
import { BoardPane } from './WorkspaceBoard';
import { LogPane } from './WorkspaceLog';
import { useCursorsHidden, useWsCursors, WsCursorLayer } from '../components/WsCursors';
import { api, enterAsGuest, enterAsMember, invalidate, useData, type Agent, type Conversation, type Status } from '../api';
import { MemberDot } from '../components/Presence';
import { Empty, ICONS, Logo, Modal, ModalHead, PALETTES, Toasts, toast } from '../components/ui';
import { ago, setLang, useT } from '../i18n';
import { isNativeApp } from '../native';
import { navigate, useRoute } from '../router';
import { ChatView } from './Chat';
import { AgentChatDrawer, type AgentChatOpen } from '../components/AgentChat';
import { Orb } from '../components/ui';
import { Crown, Loader2 } from 'lucide-react';

interface WsPerson { id: string; name: string; color: string; joined: boolean; online: boolean; lastSeen: string | null; token?: string }
interface WsMe {
  project: { id: string; name: string; color: string; icon: string; description: string };
  me: WsPerson;
  owner: { name: string; online: boolean };
  isOwner: boolean;
  members: WsPerson[];
  departments?: { id: string; name: string; color: string }[];
  workspaces?: { id: string; name: string; color: string; icon: string }[];
  rules?: { weeklyReport: boolean; dailyDigest: boolean; notifyDone: boolean };
}
type View = 'chat' | 'tasks' | 'docs' | 'board' | 'sales' | 'calendar' | 'log' | 'auto';

const KEY = 'altter.wsKey';
export const savedWorkspaceKey = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const saveKey = (k: string | null) => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch {} };

/** `#/w/<key>[/<name>]` — an invite: the key is kept, the URL cleaned. */
export function takeInviteFromUrl(): string | null {
  const m = location.hash.match(/^#\/w\/([\w-]{20,})/);
  if (!m) return null;
  saveKey(m[1]);
  history.replaceState(null, '', location.pathname + '#/');
  return m[1];
}

/** Opened by a team member (no pairing): their key gets them into exactly this workspace. */
export function WorkspaceGate({ wsKey }: { wsKey: string }) {
  const t = useT();
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    setLang((navigator.language || 'en').slice(0, 2).toLowerCase());
    enterAsMember(wsKey);
    api<WsMe>('/api/ws/me').then((d) => { setOk(true); document.title = `${d.project.name} · ALTTER`; }, () => setOk(false));
  }, [wsKey]);
  if (ok === null) return <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><Logo size={56} animated /></div>;
  if (!ok)
    return (
      <div className="guest-gate">
        <div className="backdrop-glow" />
        <div className="card guest-card">
          <Logo size={48} />
          <h2>{t('ws.gone')}</h2>
          <p className="muted">{t('ws.goneLead')}</p>
          <button className="btn" onClick={() => { saveKey(null); location.replace(isNativeApp ? 'https://localhost/' : location.pathname); }}>{t('common.close')}</button>
        </div>
      </div>
    );
  return <><OpenInApp wsKey={wsKey} /><WorkspaceView memberKey={wsKey} /><Toasts /></>;
}

/** Opened in a browser (not the ALTTER app): offer to open it in the app, or get the app. */
function OpenInApp({ wsKey }: { wsKey: string }) {
  const t = useT();
  const [hide, setHide] = useState(() => { try { return sessionStorage.getItem('altter.noAppBar') === '1'; } catch { return false; } });
  const framed = (() => { try { return window.top !== window.self; } catch { return true; } })(); // shown inside ALTTER (Visit)
  if (hide || framed || isNativeApp || /Electron/i.test(navigator.userAgent)) return null;
  const link = `${location.origin}/#/w/${wsKey}`;
  const android = /Android/i.test(navigator.userAgent);
  return (
    <div className="open-in-app">
      <Logo size={22} />
      <span className="grow small">{t('wsj.inBrowser')}</span>
      <a className="btn primary sm" href={`altter://join?u=${encodeURIComponent(link)}`}><ExternalLink size={14} />{t('wsj.openApp')}</a>
      <a className="btn sm hide-narrow" href={`https://github.com/QWTR/alter/releases/latest/download/${android ? 'ALTTER.apk' : 'ALTTER-Setup.exe'}`}><Download size={14} />{t('wsj.getApp')}</a>
      <button className="btn ghost icon sm" onClick={() => { setHide(true); try { sessionStorage.setItem('altter.noAppBar', '1'); } catch {} }}><X size={14} /></button>
    </div>
  );
}

/** The workspace itself — for a member (memberKey) or the owner (projectId from the route). */
/** Agents by team (teams first, lead on top), then the ones on their own. */
function agentGroups(list: Agent[]): [Agent['team'] | null, Agent[]][] {
  const teams = new Map<string, Agent[]>();
  const solo: Agent[] = [];
  for (const a of list) a.team ? teams.set(a.team.id, [...(teams.get(a.team.id) ?? []), a]) : solo.push(a);
  const out: [Agent['team'] | null, Agent[]][] = [...teams.values()].map((l) => [l[0].team!, [...l].sort((x, y) => Number(!!y.team?.lead) - Number(!!x.team?.lead))]);
  if (solo.length) out.push([null, solo]);
  return out;
}

export function WorkspaceView({ memberKey }: { memberKey?: string }) {
  const t = useT();
  const route = useRoute();
  const member = !!memberKey;
  const [memberWs, setMemberWs] = useState<string | null>(() => { try { return localStorage.getItem('altter.wsProject'); } catch { return null; } });
  const projectId = member ? memberWs : route.parts[1];
  const q = projectId ? `?project=${projectId}` : '';
  const [view, setViewS] = useState<View>(() => { try { return (sessionStorage.getItem('altter.wsView') as View) || 'chat'; } catch { return 'chat'; } });
  const setView = (v: View) => { setViewS(v); try { sessionStorage.setItem('altter.wsView', v); } catch {} };
  const [wsMenu, setWsMenu] = useState(false);
  const { data: me } = useData<WsMe>(`/api/ws/me${q}`, 20_000);
  const { data: chats } = useData<Conversation[]>(`/api/ws/chats${q}`, 8000);
  const { data: agents } = useData<Agent[]>(`/api/ws/agents${q}`, 6000);
  const [agentChat, setAgentChat] = useState<AgentChatOpen | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { data: status } = useData<Status>(member ? null : '/api/status');
  // members: which chat is open is local; the owner's lives in the URL (back button, links)
  const [memberChat, setMemberChat] = useState<string | null>(null);
  const openId = member ? memberChat : route.parts[2] ?? null;
  const [tab, setTab] = useState<'chats' | 'agents' | 'team'>('chats');
  const [invite, setInvite] = useState(false);
  const [newAgent, setNewAgent] = useState(false);
  const wsRoot = useRef<HTMLDivElement>(null);
  const [cursorsHidden, setCursorsHidden] = useCursorsHidden();
  const screen = view === 'chat' ? `chat:${tab}:${openId ?? ''}` : view;
  const live = useWsCursors(wsRoot, me ? `?project=${me.project.id}` : q, screen, !!me);

  // presence + new chats from the others: refresh now and then
  useEffect(() => {
    const id = setInterval(() => { invalidate(`/api/ws/me${q}`); invalidate(`/api/ws/chats${q}`); invalidate(`/api/ws/agents${q}`); }, 15_000);
    return () => clearInterval(id);
  }, [q]);

  const open = (id: string | null) => {
    if (member) setMemberChat(id);
    else navigate(id ? `/workspace/${projectId}/${id}` : `/workspace/${projectId}`);
  };
  const newChat = async (agentId?: string) => {
    if (!member) return navigate(`/workspace/${projectId}/new${agentId ? `?agent=${agentId}` : ''}`);
    try {
      const c = await api<Conversation>(`/api/ws/chats${q}`, { method: 'POST', body: { title: t('chat.new'), agentId } });
      invalidate(`/api/ws/chats${q}`);
      setTab('chats');
      open(c.id);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const removeAgents = async (team?: { id: string; name: string }) => {
    const n = team ? (agents ?? []).filter((a) => a.team?.id === team.id).length : agents?.length ?? 0;
    if (!confirm(team ? t('ac.delTeamQ', { name: team.name }) : t('ac.delAllQ', { n }))) return;
    setDeleting(true);
    try {
      const r = await api<{ deleted: number }>(`/api/ws/agents${q}${team ? `${q ? '&' : '?'}team=${team.id}` : ''}`, { method: 'DELETE' });
      toast(t('ac.deleted', { n: r.deleted }), 'ok');
      invalidate(`/api/ws/agents${q}`, '/api/agents', '/api/projects');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setDeleting(false); }
  };

  // the member's chat pane runs the shared chat view in "member" mode for the chat they picked
  const memberConv = member && openId ? chats?.find((c) => c.id === openId) : undefined;
  if (member && memberConv && me) enterAsGuest({ token: memberKey!, conversationId: memberConv.id, title: memberConv.title, host: me.owner.name, name: me.me.name, guestsCanSend: true, member: true });

  if (!me) return <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><Logo size={48} animated /></div>;
  const p = me.project;
  const glow = PALETTES[p.color] ?? PALETTES.violet;
  const Icon = ICONS[p.icon] ?? Users;
  const people: WsPerson[] = [
    { id: 'owner', name: me.owner.name, color: '#7c5cff', joined: true, online: me.owner.online, lastSeen: null },
    ...me.members,
  ];
  const online = people.filter((x) => x.online).length;
  const chatOpen = !!openId || (!member && route.parts[2] === 'new');
  const ctx: WsCtx = { q, isOwner: me.isOwner, me: me.me, owner: me.owner, members: me.members, departments: me.departments ?? [], agents: agents ?? [], projectId: p.id, projectName: p.name, memberKey };
  const switchWs = (id: string) => { setWsMenu(false); setMemberChat(null); if (member) { setMemberWs(id); try { localStorage.setItem('altter.wsProject', id); } catch {} } else navigate(`/workspace/${id}`); };
  const views: { value: View; label: string; icon: typeof Users }[] = [
    { value: 'chat', label: t('wt.v.chat'), icon: MessageSquare }, { value: 'tasks', label: t('wt.v.tasks'), icon: KanbanSquare },
    { value: 'docs', label: t('wt.v.docs'), icon: FileText }, { value: 'board', label: t('wt.v.board'), icon: PenTool }, { value: 'sales', label: t('wt.v.sales'), icon: Receipt },
    { value: 'calendar', label: t('wt.v.calendar'), icon: CalendarDays }, { value: 'log', label: t('wt.v.log'), icon: ScrollText }, ...(me.isOwner ? [{ value: 'auto' as View, label: t('wt.v.auto'), icon: Zap }] : []),
  ];

  return (
    <div ref={wsRoot} className={`ws${chatOpen ? ' ws-chat-open' : ''}${view !== 'chat' ? ' ws-tool' : ''}${cursorsHidden ? ' no-cursors' : ''}`} style={{ ['--glow' as any]: glow }}>
      <header className="ws-head">
        {(!member || isNativeApp) && (
          <button className="btn ghost icon sm" title={t('ws.leave')} onClick={() => (member ? location.replace('https://localhost/') : navigate(`/projects/${p.id}`))}><ArrowLeft /></button>
        )}
        <span className="ws-icon" style={{ background: glow }}><Icon size={18} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          {(me.workspaces?.length ?? 0) > 1 ? (
            <span className="ws-switch">
              <button className="ws-switch-btn" onClick={() => setWsMenu((v) => !v)}><b className="truncate">{p.name}</b><ChevronDown size={14} /></button>
              {wsMenu && <span className="ws-switch-menu">{me.workspaces!.map((w) => <button key={w.id} className={w.id === p.id ? 'on' : ''} onClick={() => switchWs(w.id)}><span className="wt-dot" style={{ background: PALETTES[w.color] ?? PALETTES.violet }} />{w.name}</button>)}</span>}
            </span>
          ) : <b className="truncate" style={{ display: 'block' }}>{p.name}</b>}
          <span className="small faint">{t('ws.label')} · {t('ws.online', { n: online })}</span>
        </div>
        <div className="ws-people">
          {people.slice(0, 6).map((x) => (
            <span key={x.id} className={`ws-person${x.online ? ' on' : ''}`} title={`${x.name}${x.online ? ' · online' : ''}`}><MemberDot name={x.name} color={x.color} size={28} /></span>
          ))}
        </div>
        <button className={`btn ghost icon sm${cursorsHidden ? '' : ' on'}`} title={t(cursorsHidden ? 'ws.cursorsShow' : 'ws.cursorsHide')} aria-pressed={!cursorsHidden} onClick={() => setCursorsHidden(!cursorsHidden)}><MousePointer2 size={16} style={cursorsHidden ? { opacity: .45 } : undefined} /></button>
        {me.isOwner && <button className="btn primary sm" onClick={() => setInvite(true)}><UserPlus size={15} /><span className="hide-narrow">{t('ws.invite')}</span></button>}
      </header>

      {!cursorsHidden && <WsCursorLayer root={wsRoot} screen={screen} others={live.others} cursors={live.cursors} />}
      <nav className="ws-nav"><Tabs value={view} onChange={setView} tabs={views} /></nav>
      {view === 'tasks' && <TasksPane c={ctx} />}
      {view === 'docs' && <DocsPane c={ctx} />}
      {view === 'board' && <BoardPane c={ctx} />}
      {view === 'log' && <LogPane c={ctx} />}
      {view === 'sales' && <SalesPane c={ctx} />}
      {view === 'calendar' && <CalendarPane c={ctx} />}
      {view === 'auto' && <AutoPane c={ctx} rules={me.rules} />}
      {view === 'chat' && <div className="ws-body">
        <aside className="ws-side">
          <div className="ws-tabs">
            {(['chats', 'agents', 'team'] as const).map((k) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {k === 'chats' ? <MessageSquare size={15} /> : k === 'agents' ? <Bot size={15} /> : <Users size={15} />}
                {t(`ws.tab.${k}`)}
                <span className="faint small">{k === 'chats' ? chats?.length ?? '' : k === 'agents' ? agents?.length ?? '' : people.length}</span>
              </button>
            ))}
          </div>

          {tab === 'chats' && (
            <div className="ws-list">
              <button className="btn primary" style={{ width: '100%' }} onClick={() => newChat()}><Plus size={16} />{t('chat.new')}</button>
              {chats?.length === 0 && <p className="small faint" style={{ textAlign: 'center', margin: '18px 0' }}>{t('ws.noChats')}</p>}
              {chats?.map((c) => (
                <button key={c.id} className={`ws-row${c.id === openId ? ' active' : ''}`} onClick={() => open(c.id)}>
                  <MessageSquare size={15} className="faint" />
                  <span className="grow truncate">{c.title}</span>
                  <span className="small faint">{ago(c.updated_at)}</span>
                </button>
              ))}
            </div>
          )}

          {tab === 'agents' && (
            <div className="ws-list">
              <div className="ws-agents-tools">
                <button className="btn" onClick={() => setNewAgent(true)}><Plus size={16} />{t('ws.newAgent')}</button>
                {!!agents?.length && <button className="btn ghost icon danger" title={t('ac.delAll')} disabled={deleting} onClick={() => removeAgents()}>{deleting ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}</button>}
              </div>
              {agents?.length === 0 && <p className="small faint" style={{ textAlign: 'center', margin: '18px 0' }}>{t('ws.noAgents')}</p>}
              {agentGroups(agents ?? []).map(([team, list]) => (
                <div key={team?.id ?? 'solo'}>
                  {team && (
                    <div className="ws-team-head">
                      <Users size={13} /><span className="grow truncate">@{team.name}</span>
                      <button className="btn ghost icon sm danger" title={t('ac.delTeam')} disabled={deleting} onClick={() => removeAgents(team)}><Trash2 size={13} /></button>
                    </div>
                  )}
                  {list.map((a) => (
                    <div key={a.id} className="ws-row" role="button" tabIndex={0} title={t('ac.history')}
                      onClick={() => setAgentChat({ id: a.id, name: a.name, avatar: a.avatar, ws: q })}
                      onKeyDown={(e) => { if (e.key === 'Enter') setAgentChat({ id: a.id, name: a.name, avatar: a.avatar, ws: q }); }}>
                      <Orb avatar={a.avatar} size={26} running={a.running} />
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="truncate row" style={{ gap: 4 }}>{a.team?.lead && <Crown size={11} style={{ color: 'var(--warn)', flex: 'none' }} />}{a.name}{a.running && <span className="small" style={{ color: 'var(--warn)' }}> · {t('ac.working')}</span>}</span>
                        <span className="small faint truncate" style={{ display: 'block' }}>{(a.description || a.instructions.slice(0, 80)).replace(/^[^:]{1,40}:\s*/, '')}</span>
                      </span>
                      <button className="btn ghost icon sm ws-row-act" title={t('ws.talkTo', { name: a.name })} onClick={(e) => { e.stopPropagation(); newChat(a.id); }}><MessageSquare size={14} /></button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {tab === 'team' && (
            <div className="ws-list">
              {people.map((x) => (
                <div key={x.id} className="ws-row static">
                  <span className={`ws-person${x.online ? ' on' : ''}`}><MemberDot name={x.name} color={x.color} size={26} /></span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block' }}>{x.name}{x.id === 'owner' ? ` · ${t('ws.owner')}` : x.id === me.me.id ? ` · ${t('ws.you')}` : ''}</span>
                    <span className="small faint">{x.online ? t('ws.isOnline') : x.joined ? (x.lastSeen ? t('ws.seen', { ago: ago(x.lastSeen) }) : t('ws.offline')) : t('ws.invited')}</span>
                  </span>
                </div>
              ))}
              {me.isOwner && <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={() => setInvite(true)}><UserPlus size={15} />{t('ws.invite')}</button>}
            </div>
          )}
        </aside>

        <section className="ws-main">
          {chatOpen ? (
            <>
              <button className="btn ghost sm ws-back" onClick={() => open(null)}><ArrowLeft size={15} />{t('ws.allChats')}</button>
              {member ? (memberConv ? <ChatView key={memberConv.id} /> : null) : <ChatView key={openId ?? 'new'} />}
            </>
          ) : (
            <div className="ws-welcome">
              <span className="ws-icon big" style={{ background: glow }}><Icon size={30} /></span>
              <h2>{p.name}</h2>
              <p className="muted">{p.description || t('ws.lead')}</p>
              <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn primary" onClick={() => newChat()}><Plus size={16} />{t('chat.new')}</button>
                {me.isOwner && <button className="btn" onClick={() => setInvite(true)}><UserPlus size={15} />{t('ws.invite')}</button>}
              </div>
            </div>
          )}
        </section>
      </div>}

      {me.isOwner && <InviteModal open={invite} onClose={() => setInvite(false)} projectId={p.id} projectName={p.name} lanUrls={status?.lanUrls ?? []} />}
      <NewAgentModal open={newAgent} onClose={() => setNewAgent(false)} q={q} />
      <AgentChatDrawer open={agentChat} onClose={() => setAgentChat(null)} />
    </div>
  );
}

/** The link a teammate opens once; after that ALTTER remembers them. */
const inviteLink = (base: string, key: string, name: string) => `${base}/#/w/${key}/${encodeURIComponent(name)}`;

export function InviteModal({ open, onClose, projectId, projectName, lanUrls }: { open: boolean; onClose: () => void; projectId: string; projectName: string; lanUrls: string[] }) {
  const t = useT();
  const { data: team } = useData<WsPerson[]>(open ? `/api/projects/${projectId}/members` : null);
  const [name, setName] = useState('');
  const [made, setMade] = useState<WsPerson | null>(null);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState('');
  // the computer's own address only works on the computer: prefer the internet link, then the home network
  const { data: st } = useData<Status & { publicUrl?: string | null }>(open ? '/api/status' : null);
  // the internet address (relay) works for everyone; the home network only at home
  const base = useMemo(() => {
    const own = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? null : location.origin;
    return (st?.publicUrl || '').replace(/\/+$/, '') || own || lanUrls[0] || location.origin;
  }, [lanUrls, st?.publicUrl]);
  const link = made?.token ? inviteLink(base, made.token, projectName) : '';
  useEffect(() => { if (link) QRCode.toDataURL(link, { margin: 1, width: 180, color: { dark: '#0b0a12', light: '#ffffff' } }).then(setQr, () => setQr('')); else setQr(''); }, [link]);
  useEffect(() => { if (!open) { setMade(null); setName(''); } }, [open]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const m = await api<WsPerson>(`/api/projects/${projectId}/members`, { method: 'POST', body: { name } });
      setMade(m);
      setName('');
      invalidate(`/api/projects/${projectId}/members`);
      invalidate(`/api/ws/me?project=${projectId}`);
    } catch (err) { toast((err as Error).message, 'error'); }
  };
  const copy = (text: string, id: string) => navigator.clipboard?.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(''), 1400); }, () => {});
  const remove = async (id: string) => {
    await api(`/api/projects/${projectId}/members/${id}`, { method: 'DELETE' }).catch(() => {});
    if (made?.id === id) setMade(null);
    invalidate(`/api/projects/${projectId}/members`);
    invalidate(`/api/ws/me?project=${projectId}`);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalHead icon={<UserPlus />} title={t('ws.inviteTitle', { name: projectName })} text={t('ws.inviteLead')} onClose={onClose} />
      <form className="row" style={{ gap: 8 }} onSubmit={add}>
        <input className="input grow" autoFocus placeholder={t('ws.inviteName')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={!name.trim()}><Plus size={15} />{t('ws.inviteAdd')}</button>
      </form>
      <AnimatePresence>
        {made && link && (
          <motion.div className="ws-invite" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="grow" style={{ minWidth: 0, display: 'grid', gap: 8 }}>
              <b>{t('ws.linkFor', { name: made.name })}</b>
              <div className="share-link"><Link2 size={14} /><span className="truncate mono small grow">{link}</span>
                <button type="button" className="btn ghost icon sm" onClick={() => copy(link, 'new')}>{copied === 'new' ? <Check /> : <Copy />}</button>
              </div>
              <span className="small faint">{t('ws.linkHint')}</span>
            </div>
            {qr && <img src={qr} alt="QR" className="ws-qr" />}
          </motion.div>
        )}
      </AnimatePresence>
      {!!team?.length && (
        <div className="ws-team">
          <div className="small faint" style={{ margin: '14px 0 6px' }}>{t('ws.team')}</div>
          {team.map((m) => (
            <div key={m.id} className="ws-row static">
              <span className={`ws-person${m.online ? ' on' : ''}`}><MemberDot name={m.name} color={m.color} size={24} /></span>
              <span className="grow truncate">{m.name} <span className="small faint">· {m.online ? t('ws.isOnline') : m.joined ? t('ws.offline') : t('ws.invited')}</span></span>
              {m.token && <button type="button" className="btn ghost icon sm" title={t('ws.copyLink')} onClick={() => copy(inviteLink(base, m.token!, projectName), m.id)}>{copied === m.id ? <Check /> : <Link2 />}</button>}
              <button type="button" className="btn ghost icon sm" title={t('ws.remove')} onClick={() => remove(m.id)}><Trash2 /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function NewAgentModal({ open, onClose, q }: { open: boolean; onClose: () => void; q: string }) {
  const t = useT();
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/ws/agents${q}`, { method: 'POST', body: { name, instructions } });
      invalidate(`/api/ws/agents${q}`);
      invalidate('/api/agents');
      setName(''); setInstructions('');
      onClose();
    } catch (err) { toast((err as Error).message, 'error'); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose}>
      <ModalHead icon={<Bot />} title={t('ws.newAgent')} text={t('ws.newAgentLead')} onClose={onClose} />
      <form style={{ display: 'grid', gap: 10 }} onSubmit={save}>
        <input className="input" autoFocus placeholder={t('ws.agentName')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <textarea className="input" rows={5} placeholder={t('ws.agentWhat')} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}><X size={15} />{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy || !name.trim() || !instructions.trim()}>{busy ? <span className="spinner" /> : <Plus size={15} />}{t('ws.create')}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Empty state used by the project page when nobody is invited yet. */
export function WsEmpty({ onInvite }: { onInvite: () => void }) {
  const t = useT();
  return <Empty icon={Users} title={t('ws.emptyTitle')} text={t('ws.emptyLead')} action={<button className="btn primary" onClick={onInvite}><UserPlus size={15} />{t('ws.invite')}</button>} />;
}

/** Menu → Workspace: every project is a workspace; open one or invite people to it. */
export function WorkspacesView() {
  const t = useT();
  const { data: projects } = useData<(import('../api').Project)[]>('/api/projects');
  const { data: status } = useData<Status>('/api/status');
  const [invite, setInvite] = useState<{ id: string; name: string } | null>(null);
  const [tab, setTab] = useState<'ws' | 'company'>('ws');
  const [join, setJoin] = useState(false);
  const [joined, setJoined] = useState(joinedWorkspaces);
  return (
    <div className="page">
      <div className="ws-page-head">
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>{t('ws.title')}</h1>
          <p className="muted" style={{ margin: '6px 0 0', maxWidth: 640 }}>{t('ws.pageLead')}</p>
        </div>
        <button className="btn primary" onClick={() => setJoin(true)}><LogIn size={15} />{t('wsj.join')}</button>
      </div>
      {!!joined.length && (
        <div className="ws-joined">
          <div className="small faint" style={{ marginBottom: 8 }}>{t('wsj.joined')}</div>
          <div className="ws-cards">
            {joined.map((j) => (
              <div key={j.url} className="card ws-card">
                <button className="ws-card-main" onClick={() => openSession(j.url)}>
                  <span className="ws-icon" style={{ background: PALETTES.teal ?? PALETTES.violet }}><Users size={18} /></span>
                  <span className="grow" style={{ minWidth: 0 }}><b className="truncate" style={{ display: 'block' }}>{j.name}</b><span className="small faint truncate" style={{ display: 'block' }}>{new URL(j.url).host}</span></span>
                </button>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary sm grow" onClick={() => openSession(j.url)}><ExternalLink size={14} />{t('ws.enter')}</button>
                  <button className="btn ghost sm" title={t('ws.leave')} onClick={() => { forgetWorkspace(j.url); setJoined(joinedWorkspaces()); }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <JoinModal open={join} onClose={() => { setJoin(false); setTimeout(() => setJoined(joinedWorkspaces()), 500); }} />
      <div style={{ marginBottom: 16 }}><Tabs value={tab} onChange={setTab} tabs={[{ value: 'ws', label: t('wt.workspaces'), icon: Users }, { value: 'company', label: t('wt.company'), icon: Building2 }]} /></div>
      {tab === 'company' ? <CompanyView /> : <>
      {projects && projects.length === 0 && (
        <Empty icon={Users} title={t('ws.noProjects')} action={<button className="btn primary" onClick={() => navigate('/projects?new=1')}><Plus size={15} />{t('projects.new')}</button>} />
      )}
      <div className="ws-cards">
        {(projects ?? []).map((p) => {
          const Icon = ICONS[p.icon] ?? Users;
          const glow = PALETTES[p.color] ?? PALETTES.violet;
          return (
            <div key={p.id} className="card ws-card" style={{ ['--glow' as any]: glow }}>
              <button className="ws-card-main" onClick={() => navigate(`/workspace/${p.id}`)}>
                <span className="ws-icon" style={{ background: glow }}><Icon size={18} /></span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <b className="truncate" style={{ display: 'block' }}>{p.name}</b>
                  <span className="small faint">{t('projects.stats', { chats: p.chats ?? 0, agents: p.agents ?? 0 })}</span>
                </span>
              </button>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary sm grow" onClick={() => navigate(`/workspace/${p.id}`)}><Users size={14} />{t('ws.enter')}</button>
                <button className="btn sm" onClick={() => setInvite({ id: p.id, name: p.name })}><UserPlus size={14} />{t('ws.invite')}</button>
              </div>
            </div>
          );
        })}
      </div>
      </>}
      {invite && <InviteModal open onClose={() => setInvite(null)} projectId={invite.id} projectName={invite.name} lanUrls={status?.lanUrls ?? []} />}
    </div>
  );
}
