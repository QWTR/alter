// Shared agent UI: character cards, the gallery ("choose a character") and the editor drawer.
import { AnimatePresence, motion } from 'motion/react';
import { Check, Eye, MessageCircle, Pause, Pencil, Play, Plus, Square, Terminal, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { api, invalidate, setCached, useData, type Access, type Agent, type Project, type ProviderStatus, type Run, type Skill, type Template } from '../api';
import { ago, formatTime, useT, type Key } from '../i18n';
import { Markdown } from './Markdown';
import { AgentCreator } from './AgentCreator';
import { AgentChat } from './AgentChat';
import { navigate } from '../router';
import { useDescribeSchedule, ScheduleEditor } from './schedule';
import { Drawer, Field, ICON_KEYS, ICONS, Modal, ModalHead, Orb, PALETTE_KEYS, PALETTES, Segmented, Switch, Tabs, spring, stagger, toast } from './ui';

export function agentName(a: Pick<Agent, 'name' | 'templateId'>, t: ReturnType<typeof useT>) {
  // untouched template agents follow the UI language
  if (a.templateId) {
    const key = `tpl.${a.templateId}.name` as Key;
    const en = t(key);
    if (en !== key) return a.name === templateEnglish(a.templateId) ? en : a.name;
  }
  return a.name;
}
const EN_NAMES: Record<string, string> = {
  'morning-brief': 'Morning brief', 'evening-review': 'Evening review', inbox: 'Inbox assistant', content: 'Content producer',
  researcher: 'Researcher', 'server-guard': 'Server guard', 'pc-health': 'PC doctor', coach: 'Focus coach',
};
const templateEnglish = (id: string) => EN_NAMES[id];

export function AgentCard({ a, i, onOpen }: { a: Agent; i: number; onOpen: () => void }) {
  const t = useT();
  const describe = useDescribeSchedule();
  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCached<Agent[]>('/api/agents', (l) => (l ?? []).map((x) => (x.id === a.id ? { ...x, running: true } : x)));
    await api(`/api/agents/${a.id}/run`, { method: 'POST' });
    toast(t('agents.started', { name: agentName(a, t) }), 'info', <Orb avatar={a.avatar} size={24} running />);
  };
  return (
    <motion.div layout className="card hover" onClick={onOpen} {...stagger(i)} style={{ display: 'grid', gap: 14, opacity: a.enabled ? 1 : 0.6 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Orb avatar={a.avatar} size={48} running={a.running} />
        <div className="grow">
          <h3 className="truncate">{agentName(a, t)}</h3>
          <div className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {a.templateId ? t(`tpl.${a.templateId}.desc` as Key) : a.description || a.instructions}
          </div>
        </div>
      </div>
      <div className="row small" style={{ flexWrap: 'wrap', gap: 6 }}>
        {a.running ? <span className="badge warn"><span className="status-dot warn live" />{t('agents.running')}</span> : <span className="badge">{describe(a.schedule)}</span>}
        {a.access !== 'chat' && <span className="badge">{t(`access.${a.access}` as Key)}</span>}
        {!a.enabled && <span className="badge">{t('agents.pause')}</span>}
      </div>
      <div className="row small faint card-foot">
        <span className="grow" style={{ flex: '1 1 150px', minWidth: 0 }}>{a.nextRunAt && a.enabled ? `${t('agents.next')}: ${formatTime(a.nextRunAt)}` : `${t('agents.last')}: ${ago(a.lastRunAt)}`}</span>
        <motion.button className="btn sm icon" title={t('agents.talk')} onClick={(e) => { e.stopPropagation(); navigate(`/agents/${a.id}`); }} whileTap={{ scale: 0.94 }}>
          <MessageCircle />
        </motion.button>
        <motion.button className="btn sm" onClick={run} disabled={a.running} whileTap={{ scale: 0.94 }}>
          <Play />
          {t('agents.runNow')}
        </motion.button>
      </div>
    </motion.div>
  );
}

export function Gallery({ open, onClose, projectId, onCreated }: { open: boolean; onClose: () => void; projectId?: string | null; onCreated?: (a: Agent) => void }) {
  const t = useT();
  const describe = useDescribeSchedule();
  const { data: templates } = useData<Template[]>('/api/agents/templates');
  const [cat, setCat] = useState<'all' | Template['category']>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [creator, setCreator] = useState(false);
  const list = (templates ?? []).filter((x) => (cat === 'all' || x.category === cat) && !x.monitor);

  const add = async (templateId: string | null) => {
    setBusy(templateId ?? 'custom');
    try {
      const body = templateId
        ? { templateId, projectId: projectId ?? null }
        : { name: t('agents.custom'), instructions: '…', schedule: 'manual', projectId: projectId ?? null, enabled: false, avatar: { palette: PALETTE_KEYS[Math.floor(Math.random() * PALETTE_KEYS.length)], icon: 'sparkles' } };
      const a = await api<Agent>('/api/agents', { method: 'POST', body });
      invalidate('/api/agents', '/api/projects');
      onClose();
      onCreated?.(a);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
    <Modal open={open && !creator} onClose={onClose} wide>
      <ModalHead title={t('agents.gallery')} text={t('agents.galleryLead')} onClose={onClose} />
      <div style={{ marginBottom: 16 }}>
        <Segmented value={cat} onChange={setCat} options={(['all', 'daily', 'work', 'creative', 'automation'] as const).map((c) => ({ value: c, label: t(`agents.cat.${c}` as Key) }))} />
      </div>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        <motion.button className="char" onClick={() => setCreator(true)} {...stagger(0)} whileHover={{ y: -3 }} style={{ borderStyle: 'dashed' }}>
          <div className="orb" style={{ width: 52, height: 52, ['--orb' as any]: 'linear-gradient(140deg, var(--surface-3), var(--surface-2))', color: 'var(--accent-strong)' }}>
            <Wand2 size={24} />
          </div>
          <div>
            <h3>{t('agents.custom')}</h3>
            <p style={{ marginTop: 4 }}>{t('agents.customDesc')}</p>
          </div>
        </motion.button>
        {list.map((tp, i) => (
          <motion.button key={tp.templateId} className="char" onClick={() => add(tp.templateId)} {...stagger(i + 1)} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} disabled={!!busy}>
            <Orb avatar={tp.avatar} size={52} running={busy === tp.templateId} />
            <div>
              <h3>{t(`tpl.${tp.templateId}.name` as Key)}</h3>
              <p style={{ marginTop: 4 }}>{t(`tpl.${tp.templateId}.desc` as Key)}</p>
            </div>
            <div className="foot">
              <span className="badge">{describe(tp.schedule ?? 'manual')}</span>
              <span className="badge accent"><Plus />{t('common.new')}</span>
            </div>
          </motion.button>
        ))}
      </div>
    </Modal>
    <AgentCreator open={creator} onClose={() => { setCreator(false); onClose(); }} projectId={projectId} onCreated={onCreated} />
    </>
  );
}

export function AccessPicker({ value, onChange }: { value: Access; onChange: (a: Access) => void }) {
  const t = useT();
  return (
    <Segmented<Access>
      value={value}
      onChange={onChange}
      options={[
        { value: 'chat', label: t('access.chat'), icon: MessageCircle },
        { value: 'read', label: t('access.read'), icon: Eye },
        { value: 'full', label: t('access.full'), icon: Terminal },
      ]}
      size="sm"
    />
  );
}

export function AgentDrawer({ agentId, onClose }: { agentId: string | null; onClose: () => void }) {
  return (
    <Drawer open={!!agentId} onClose={onClose}>
      {agentId && <AgentDetail key={agentId} id={agentId} onClose={onClose} />}
    </Drawer>
  );
}

function AgentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const { data: agents } = useData<Agent[]>('/api/agents');
  const a = agents?.find((x) => x.id === id);
  const [tab, setTab] = useState<'history' | 'edit'>(a && a.instructions === '…' ? 'edit' : 'history');
  if (!a) return null;

  const toggle = async () => {
    await api(`/api/agents/${a.id}`, { method: 'PUT', body: { enabled: !a.enabled } });
    invalidate('/api/agents');
  };
  const run = async () => {
    setCached<Agent[]>('/api/agents', (l) => (l ?? []).map((x) => (x.id === a.id ? { ...x, running: true } : x)));
    await api(`/api/agents/${a.id}/run`, { method: 'POST' });
  };
  const stop = async () => {
    await api(`/api/agents/${a.id}/stop`, { method: 'POST' });
    toast(t('agents.stopped'), 'info');
    invalidate('/api/agents', `/api/agents/${a.id}/runs`);
  };
  const remove = async () => {
    if (!confirm(t('agents.deleteConfirm'))) return;
    await api(`/api/agents/${a.id}`, { method: 'DELETE' });
    invalidate('/api/agents', '/api/projects');
    onClose();
  };

  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <Orb avatar={a.avatar} size={64} running={a.running} />
        <div className="grow">
          <h2 style={{ margin: '4px 0 4px', fontSize: 20 }}>{agentName(a, t)}</h2>
          <div className="muted small">{a.templateId ? t(`tpl.${a.templateId}.desc` as Key) : a.description}</div>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        {a.running ? (
          <>
            <span className="badge warn" style={{ alignSelf: 'center' }}><span className="status-dot warn live" />{t('agents.running')}</span>
            <button className="btn danger-soft" onClick={stop}><Square size={13} fill="currentColor" />{t('agents.stop')}</button>
          </>
        ) : (
          <button className="btn primary" onClick={run}><Play />{t('agents.runNow')}</button>
        )}
        <button className="btn" onClick={() => navigate(`/agents/${a.id}`)}><MessageCircle />{t('agents.talk')}</button>
        <button className="btn" onClick={toggle}>{a.enabled ? <><Pause />{t('agents.pause')}</> : <><Play />{t('agents.resume')}</>}</button>
        <span className="grow" />
        <button className="btn ghost icon danger" onClick={remove} title={t('common.delete')}><Trash2 /></button>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'history', label: t('ac.history') }, { value: 'edit', label: t('common.edit'), icon: Pencil }]} />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {tab === 'history' ? <AgentChat id={a.id} onClose={onClose} embedded /> : <AgentEditor agent={a} onSaved={() => setTab('history')} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function RunHistory({ agentId }: { agentId: string }) {
  const t = useT();
  const { data: runs } = useData<Run[]>(`/api/runs?agentId=${agentId}`, 2000);
  if (!runs) return null;
  if (!runs.length) return <p className="muted">{t('agents.noRuns')}</p>;
  return (
    <div>
      {runs.map((r, i) => <RunItem key={r.id} r={r} i={i} />)}
    </div>
  );
}

export function RunItem({ r, i, showAgent }: { r: Run; i: number; showAgent?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(i < 2);
  const steps: string[] = r.detail ? JSON.parse(r.detail) : [];
  return (
    <motion.div className={`run ${r.status}`} {...stagger(i)}>
      <button className="row" style={{ border: 0, background: 'none', padding: 0, width: '100%', textAlign: 'left' }} onClick={() => setOpen(!open)}>
        {showAgent && <Orb avatar={r.agent_avatar} size={26} />}
        <div className="grow">
          {showAgent && <b>{r.agent_name} </b>}
          <span className="small muted">{formatTime(r.started_at)} · {t(`activity.trigger.${r.trigger}` as Key)}{r.provider ? ` · ${r.provider}` : ''}</span>
        </div>
        {r.status === 'running' && <span className="badge warn"><span className="status-dot warn live" />{t('agents.running')}</span>}
        {r.status === 'error' && <span className="badge danger">{t('common.error')}</span>}
        {!!steps.length && <span className="badge">{t('activity.steps', { n: steps.length })}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (r.output || r.error) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} style={{ overflow: 'hidden' }}>
            <div className="run-body">
              {!!steps.length && (
                <div className="steps">
                  {steps.slice(-8).map((s, k) => <span key={k} className="step truncate">{s}</span>)}
                </div>
              )}
              {r.output ? <Markdown text={r.output} /> : <span style={{ color: 'var(--danger)' }}>{r.error}</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function AgentEditor({ agent, onSaved }: { agent: Agent; onSaved: () => void }) {
  const t = useT();
  const { data: skills } = useData<Skill[]>('/api/skills');
  const { data: providers } = useData<ProviderStatus[]>('/api/providers');
  const { data: projects } = useData<Project[]>('/api/projects');
  const [f, setF] = useState({
    name: agentName(agent, t),
    description: agent.description,
    instructions: agent.instructions === '…' ? '' : agent.instructions,
    schedule: agent.schedule,
    provider: agent.provider,
    access: agent.access,
    skills: agent.skills,
    tools: agent.tools.join(', '),
    learns: agent.learns,
    projectId: agent.projectId ?? '',
    avatar: agent.avatar,
  });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/agents/${agent.id}`, {
        method: 'PUT',
        body: { ...f, enabled: agent.instructions === '…' ? true : agent.enabled, projectId: f.projectId || null, tools: f.tools.split(',').map((s) => s.trim()).filter(Boolean) },
      });
      invalidate('/api/agents', '/api/projects');
      toast(t('common.saved'), 'ok');
      onSaved();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <Field label={t('agents.look')}>
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <Orb avatar={f.avatar} size={56} />
          <div className="grow" style={{ display: 'grid', gap: 10 }}>
            <div className="color-pick">
              {PALETTE_KEYS.map((k) => (
                <motion.button type="button" key={k} className={f.avatar.palette === k ? 'active' : ''} style={{ background: PALETTES[k] }} onClick={() => set({ avatar: { ...f.avatar, palette: k } })} whileTap={{ scale: 0.88 }} />
              ))}
            </div>
            <div className="icon-pick">
              {ICON_KEYS.map((k) => {
                const I = ICONS[k];
                return (
                  <button type="button" key={k} className={f.avatar.icon === k ? 'active' : ''} onClick={() => set({ avatar: { ...f.avatar, icon: k } })}>
                    <I />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Field>
      <Field label={t('agents.name')}><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} required /></Field>
      <Field label={t('agents.instructions')}><textarea className="textarea" rows={5} value={f.instructions} placeholder={t('agents.instructionsPh')} onChange={(e) => set({ instructions: e.target.value })} required autoFocus={!f.instructions} /></Field>
      <Field label={t('agents.description')}><input className="input" value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <Field label={t('agents.schedule')}><ScheduleEditor value={f.schedule} onChange={(schedule) => set({ schedule })} /></Field>
      <div className="grid-2">
        <Field label={t('agents.ai')}>
          <select className="select" value={f.provider} onChange={(e) => set({ provider: e.target.value })}>
            <option value="default">{t('conn.default')}</option>
            {(providers ?? []).filter((p) => p.id !== 'demo').map((p) => <option key={p.id} value={p.id}>{p.name}{p.connected ? '' : ` (${t('conn.notConnected').toLowerCase()})`}</option>)}
          </select>
        </Field>
        <Field label={t('agents.project')}>
          <select className="select" value={f.projectId} onChange={(e) => set({ projectId: e.target.value })}>
            <option value="">{t('chat.noProject')}</option>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t('agents.access')} hint={f.access === 'full' ? t('auto.fullWarn') : undefined}>
        <AccessPicker value={f.access} onChange={(access) => set({ access })} />
      </Field>
      <Field label={t('agents.skills')}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {(skills ?? []).map((s) => {
            const on = f.skills.includes(s.id);
            return (
              <motion.button type="button" key={s.id} className={`badge${on ? ' accent' : ''}`} style={{ height: 30, cursor: 'pointer' }} title={s.description} onClick={() => set({ skills: on ? f.skills.filter((x) => x !== s.id) : [...f.skills, s.id] })} whileTap={{ scale: 0.94 }}>
                {on && <Check />}
                {s.name}
              </motion.button>
            );
          })}
        </div>
      </Field>
      <Field label={t('agents.tools')} hint={t('agents.toolsHint')}><input className="input mono" value={f.tools} onChange={(e) => set({ tools: e.target.value })} /></Field>
      <div className="row" style={{ margin: '6px 0 4px' }}>
        <Switch on={f.learns} onChange={(learns) => set({ learns })} />
        <span>{t('agents.learns')}</span>
      </div>
      <div className="modal-foot">
        <motion.button className="btn primary" disabled={busy} whileTap={{ scale: 0.97 }} transition={spring}>{busy && <span className="spinner" />}{t('common.save')}</motion.button>
      </div>
    </form>
  );
}
