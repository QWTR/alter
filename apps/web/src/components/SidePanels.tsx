// Context sidebars: on Chats and Agents the main menu slides away and the sidebar becomes the list itself.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, Plus, Search, Trash2, Users, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, guest, invalidate, useData, type Agent, type AgentGroup, type Conversation, type Project } from '../api';
import { statusLine, useAgentStatuses } from './agentStatus';
import { GroupEditor } from './Groups';
import { useT, type Key } from '../i18n';
import { navigate, useRoute } from '../router';
import { useRunningChats } from '../liveChats';
import { agentName } from './agentKit';
import { Robot } from './Robot';
import { PALETTES, spring } from './ui';

function Head({ title, onBack }: { title: string; onBack: () => void }) {
  const t = useT();
  return (
    <div className="side-head">
      <button className="btn ghost icon sm" onClick={onBack} title={t('side.menu')} aria-label={t('side.menu')}><ArrowLeft /></button>
      <b>{title}</b>
    </div>
  );
}

type Cat = 'all' | 'agents' | 'projects';

function dateGroup(iso: string): Key {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (today.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86400000;
  return diff <= 0 ? 'chats.today' : diff <= 1 ? 'chats.yesterday' : diff <= 7 ? 'chats.week' : 'chats.older';
}

/** A crew helper's chats, nested under the lead's chat. */
function CrewKids({ kids, activeId, hrefFor }: { kids: Conversation[]; activeId?: string; hrefFor: (c: Conversation) => string }) {
  const busy = useRunningChats();
  if (!kids.length) return null;
  return (
    <div className="side-crew">
      {kids.map((c) => {
        let who: { name?: string; color?: string } = {};
        try { who = JSON.parse(c.crew ?? '{}'); } catch {}
        return (
          <button key={c.id} className={`nav-item conv${c.id === activeId ? ' active' : ''}`} onClick={() => navigate(hrefFor(c))}>
            {c.id === activeId && <motion.span layoutId="side-pill" className="pill" transition={spring} />}
            <span className="crew-side-dot" style={{ background: who.color ?? 'var(--accent)' }} />
            <span className="truncate"><b>{who.name ?? '…'}</b></span>
            {busy.includes(c.id) && <span className="spinner" style={{ width: 11, height: 11, marginLeft: 'auto', flex: 'none' }} />}
          </button>
        );
      })}
    </div>
  );
}

/** Deletes a chat (and its crew helpers' chats); leaves the page when you were looking at it. */
async function deleteChat(id: string, active: boolean, back: string) {
  await api(`/api/conversations/${id}`, { method: 'DELETE' }).catch(() => {});
  invalidate('/api/conversations');
  if (active) navigate(back);
}

function ConvItem({ c, active, agent, project, href, back = '/chat/new' }: { c: Conversation; active: boolean; agent?: Agent; project?: Project; href: string; back?: string }) {
  const t = useT();
  const busy = useRunningChats().includes(c.id);
  // first click arms the bin (it turns red), the second one deletes; it disarms by itself after a few seconds
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const tm = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(tm);
  }, [armed]);
  return (
    <motion.div layout="position" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className={`conv-row${armed ? ' armed' : ''}`}>
      <button className={`nav-item conv${active ? ' active' : ''}`} onClick={() => navigate(href)} onContextMenu={(e) => { if (guest) return; e.preventDefault(); setArmed(true); }}>
        {active && <motion.span layoutId="side-pill" className="pill" transition={spring} />}
        {agent ? <Robot avatar={agent.avatar} size={20} still /> : project ? <span className="dot" style={{ background: PALETTES[project.color] ?? PALETTES.violet }} /> : <span className="dot" style={{ background: 'var(--surface-3)' }} />}
        <span className="truncate">{c.title}</span>
        {busy && <span className="spinner conv-spin" style={{ width: 12, height: 12, marginLeft: 'auto', flex: 'none' }} />}
      </button>
      {!guest && (
        <button
          type="button"
          className="conv-del"
          title={armed ? t('chats.deleteSure') : t('chat.delete')}
          aria-label={armed ? t('chats.deleteSure') : t('chat.delete')}
          onClick={(e) => { e.stopPropagation(); if (armed) void deleteChat(c.id, active, back); else setArmed(true); }}
        >
          {armed ? <><Check size={13} /><span>{t('chats.deleteSure')}</span></> : <Trash2 size={14} />}
        </button>
      )}
    </motion.div>
  );
}

export function ChatsPanel({ onBack }: { onBack: () => void }) {
  const t = useT();
  const route = useRoute();
  const activeId = route.parts[1];
  const { data: convs } = useData<Conversation[]>('/api/conversations');
  const { data: agents } = useData<Agent[]>('/api/agents');
  const { data: projects } = useData<Project[]>('/api/projects');
  const [cat, setCat] = useState<Cat>('all');
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const list = (convs ?? []).filter(
      (c) => !c.parent_id && (cat === 'all' || (cat === 'agents' ? !!c.agent_id : !!c.project_id)) && (!q || c.title.toLowerCase().includes(q.toLowerCase())),
    );
    const order: Key[] = ['chats.today', 'chats.yesterday', 'chats.week', 'chats.older'];
    const g = new Map<Key, Conversation[]>();
    for (const c of list) {
      const k = dateGroup(c.updated_at);
      g.set(k, [...(g.get(k) ?? []), c]);
    }
    return order.filter((k) => g.has(k)).map((k) => ({ k, items: g.get(k)! }));
  }, [convs, cat, q]);

  return (
    <>
      <Head title={t('nav.chats')} onBack={onBack} />
      <button className="btn primary" style={{ width: '100%', marginBottom: 10 }} onClick={() => navigate('/chat/new')}><Plus />{t('chat.new')}</button>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', translate: '0 -50%', color: 'var(--faint)' }} />
        <input className="input" style={{ paddingLeft: 34, height: 34 }} placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="side-cats">
        {(['all', 'agents', 'projects'] as Cat[]).map((c) => (
          <button key={c} className={cat === c ? 'active' : ''} onClick={() => setCat(c)}>
            {cat === c && <motion.span layoutId="side-cat" className="pill" transition={spring} />}
            {t(`chats.cat.${c}` as Key)}
          </button>
        ))}
      </div>
      <nav className="nav-scroll">
        {!groups.length && <div className="muted small" style={{ padding: '10px 12px' }}>{t('chat.noChats')}</div>}
        {groups.map((g) => (
          <div key={g.k}>
            <div className="nav-section">{t(g.k)}</div>
            <AnimatePresence initial={false}>
              {g.items.map((c) => (
                <div key={c.id}>
                  <ConvItem c={c} active={c.id === activeId} agent={agents?.find((a) => a.id === c.agent_id)} project={projects?.find((p) => p.id === c.project_id)} href={`/chat/${c.id}`} />
                  <CrewKids kids={(convs ?? []).filter((k) => k.parent_id === c.id)} activeId={activeId} hrefFor={(k) => `/chat/${k.id}`} />
                </div>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </nav>
    </>
  );
}

export function AgentsPanel({ onBack }: { onBack: () => void }) {
  const t = useT();
  const route = useRoute();
  const activeAgent = route.parts[1];
  const activeConv = route.parts[2];
  const { data: agents } = useData<Agent[]>('/api/agents');
  const { data: convs } = useData<Conversation[]>('/api/conversations');
  const { data: groups } = useData<AgentGroup[]>('/api/groups');
  const statuses = useAgentStatuses();
  const [groupEdit, setGroupEdit] = useState<AgentGroup | 'new' | null>(null);
  // automations live on their own page
  const list = (agents ?? []).filter((a) => !a.monitor);

  return (
    <>
      <Head title={t('nav.agents')} onBack={onBack} />
      <nav className="nav-scroll">
        <button className={`nav-item${!activeAgent ? ' active' : ''}`} onClick={() => navigate('/agents')}>
          {!activeAgent && <motion.span layoutId="side-pill" className="pill" transition={spring} />}
          <Users size={18} />
          <span>{t('side.team')}</span>
        </button>
        <div className="nav-section">
          {t('nav.agents')}
          <button className="btn ghost sm icon" style={{ width: 24, height: 24 }} onClick={() => navigate('/agents?new=1')} title={t('side.newAgent')}><Plus size={14} /></button>
        </div>
        {!list.length && <div className="muted small" style={{ padding: '6px 12px' }}>{t('side.noAgents')}</div>}
        {list.map((a) => {
          const active = a.id === activeAgent;
          const chats = active ? (convs ?? []).filter((c) => c.agent_id === a.id).slice(0, 8) : [];
          return (
            <div key={a.id}>
              <button className={`nav-item agent${active && !activeConv ? ' active' : ''}`} onClick={() => navigate(`/agents/${a.id}`)}>
                {active && !activeConv && <motion.span layoutId="side-pill" className="pill" transition={spring} />}
                <Robot avatar={a.avatar} size={26} running={a.running || statuses[a.id]?.state === 'working'} still={!active && !a.running && statuses[a.id]?.state !== 'working'} />
                <span className="agent-line">
                  <span className="truncate">{agentName(a, t)}</span>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={(statuses[a.id]?.state ?? 'idle') + statusLine(statuses[a.id])}
                      className={`agent-status ${statuses[a.id]?.state === 'working' ? 'working' : ''}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                    >
                      {statuses[a.id]?.state === 'working' ? statusLine(statuses[a.id]) || t('agentStatus.working') : t('agentStatus.idle')}
                    </motion.span>
                  </AnimatePresence>
                </span>
                {(a.running || statuses[a.id]?.state === 'working') && <span className="status-dot warn live" style={{ marginLeft: 'auto' }} />}
              </button>
              <AnimatePresence initial={false}>
                {chats.length > 0 && (
                  <motion.div className="side-sub" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    {chats.map((c) => (
                      <div key={c.id}>
                        <button className={`nav-item conv${c.id === activeConv ? ' active' : ''}`} onClick={() => navigate(`/agents/${a.id}/${c.id}`)}>
                          {c.id === activeConv && <motion.span layoutId="side-pill" className="pill" transition={spring} />}
                          <span className="truncate">{c.title}</span>
                        </button>
                        <CrewKids kids={(convs ?? []).filter((k) => k.parent_id === c.id)} activeId={activeConv} hrefFor={(k) => `/agents/${a.id}/${k.id}`} />
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        <div className="nav-section">
          {t('groups.title')}
          <button className="btn ghost sm icon" style={{ width: 24, height: 24 }} onClick={() => setGroupEdit('new')} title={t('groups.new')} disabled={list.length < 2}><Plus size={14} /></button>
        </div>
        {!(groups ?? []).length && <div className="muted small" style={{ padding: '6px 12px' }}>{list.length < 2 ? t('groups.needTwo') : t('groups.none')}</div>}
        {(groups ?? []).map((g) => {
          const members = g.members.map((id) => (agents ?? []).find((a) => a.id === id)).filter((a): a is Agent => !!a);
          const busy = members.filter((a) => statuses[a.id]?.state === 'working').length;
          return (
            <div key={g.id} className="nav-item group-item" role="button" tabIndex={0} onClick={() => navigate(`/chat/new?mention=${encodeURIComponent(g.name)}`)} onContextMenu={(e) => { e.preventDefault(); setGroupEdit(g); }}>
              <span className="group-faces">
                {members.slice(0, 3).map((a) => <Robot key={a.id} avatar={a.avatar} size={20} still />)}
              </span>
              <span className="agent-line">
                <span className="truncate">@{g.name}</span>
                <span className={`agent-status${busy ? ' working' : ''}`}>{busy ? t('groups.busy', { n: busy, total: members.length }) : t('groups.members', { n: members.length })}</span>
              </span>
              <button className="btn ghost icon sm group-edit" onClick={(e) => { e.stopPropagation(); setGroupEdit(g); }} title={t('groups.edit')}><UsersRound size={14} /></button>
            </div>
          );
        })}
      </nav>
      <AnimatePresence>{groupEdit && <GroupEditor group={groupEdit === 'new' ? null : groupEdit} agents={list} onClose={() => setGroupEdit(null)} />}</AnimatePresence>
    </>
  );
}
