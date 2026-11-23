import { AnimatePresence, motion } from 'motion/react';
import { Bot, Brain, FolderKanban, FolderOpen, Link2, MessageSquare, Plus, RefreshCw, ScanSearch, Settings2, Trash2 } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Markdown } from '../components/Markdown';
import { useState } from 'react';
import { api, invalidate, useData, type Agent, type Conversation, type Memory, type Project, type Status } from '../api';
import { AgentCard, AgentDrawer, Gallery } from '../components/agentKit';
import { Empty, Field, ICON_KEYS, ICONS, Modal, ModalHead, PageHead, PALETTE_KEYS, PALETTES, Segmented, Tabs, stagger, toast } from '../components/ui';
import { ago, useT } from '../i18n';
import { navigate, useRoute } from '../router';

// live "ALTTER is looking through the project" state, pushed by the core
let scans: Record<string, { status: 'running' | 'done' | 'error'; error?: string }> = {};
const scanSubs = new Set<() => void>();
export function setScanState(id: string, s: (typeof scans)[string]) {
  scans = { ...scans, [id]: s };
  scanSubs.forEach((f) => f());
}
const useScan = (id: string) => useSyncExternalStore((cb) => (scanSubs.add(cb), () => scanSubs.delete(cb)), () => scans[id]);
const overviewOf = (p: Project) => p.instructions.match(/<!-- alter:overview -->([\s\S]*?)<!-- \/alter:overview -->/)?.[1]?.trim();

export function ProjectsView() {
  const route = useRoute();
  const id = route.parts[1];
  return id ? <ProjectPage id={id} /> : <ProjectList />;
}

function ProjectIcon({ p, size = 44 }: { p: Pick<Project, 'color' | 'icon'>; size?: number }) {
  const Icon = ICONS[p.icon] ?? ICONS.folder;
  return (
    <div className="orb" style={{ width: size, height: size, borderRadius: size * 0.3, ['--orb' as any]: PALETTES[p.color] ?? PALETTES.violet }}>
      <Icon size={size * 0.45} />
    </div>
  );
}

function ProjectList() {
  const t = useT();
  const route = useRoute();
  const { data: projects } = useData<Project[]>('/api/projects');
  const creating = route.query.get('new') === '1';
  const close = () => navigate('/projects', true);

  return (
    <div className="page">
      <PageHead
        title={t('projects.title')}
        lead={t('projects.lead')}
        actions={<button className="btn primary" onClick={() => navigate('/projects?new=1')}><Plus />{t('projects.new')}</button>}
      />
      {projects && !projects.length ? (
        <Empty icon={FolderKanban} title={t('projects.empty.title')} text={t('projects.empty.lead')} action={<button className="btn primary" onClick={() => navigate('/projects?new=1')}><Plus />{t('projects.new')}</button>} />
      ) : (
        <div className="cards">
          {(projects ?? []).map((p, i) => (
            <motion.button key={p.id} layout className="card hover" style={{ textAlign: 'left', display: 'grid', gap: 14 }} onClick={() => navigate(`/projects/${p.id}`)} {...stagger(i)} whileHover={{ y: -3 }}>
              <div className="row">
                <ProjectIcon p={p} />
                <div className="grow">
                  <h3 className="truncate">{p.name}</h3>
                  <div className="small faint">{ago(p.lastActivity ?? p.updatedAt)}</div>
                </div>
              </div>
              {p.description && <div className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</div>}
              <div className="row small faint" style={{ gap: 14 }}>
                <span className="row" style={{ gap: 5 }}><MessageSquare size={14} />{p.chats ?? 0}</span>
                <span className="row" style={{ gap: 5 }}><Bot size={14} />{p.agents ?? 0}</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}
      <ProjectModal open={creating} onClose={close} />
    </div>
  );
}

function ProjectModal({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose}>
      <ModalHead title={project ? project.name : t('projects.new')} onClose={onClose} />
      {open && (project ? <ProjectForm project={project} onDone={onClose} /> : <NewProject onDone={(p) => { onClose(); navigate(`/projects/${p.id}`); }} />)}
    </Modal>
  );
}

function NewProject({ onDone }: { onDone: (p: Project) => void }) {
  const t = useT();
  const [mode, setMode] = useState<'new' | 'folder' | 'link'>('new');
  const [source, setSource] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    const r = await api<{ path: string | null }>('/api/pick-folder', { method: 'POST' }).catch(() => ({ path: null }));
    if (r.path) {
      setSource(r.path);
      if (!name) setName(r.path.split(/[\/]/).filter(Boolean).pop() ?? '');
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api<Project>('/api/projects/import', { method: 'POST', body: { source, name: name.trim() || undefined, color: PALETTE_KEYS[Math.floor(Math.random() * PALETTE_KEYS.length)] } });
      invalidate('/api/projects', '/api/status');
      toast(t('projects.scanStarted'), 'info');
      onDone(p);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'new', label: t('projects.mode.new'), icon: Plus },
            { value: 'folder', label: t('projects.mode.folder'), icon: FolderOpen },
            { value: 'link', label: t('projects.mode.link'), icon: Link2 },
          ]}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={mode} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
          {mode === 'new' ? (
            <ProjectForm onDone={onDone} />
          ) : (
            <form onSubmit={submit}>
              <p className="muted small" style={{ marginTop: 0 }}>{t(mode === 'folder' ? 'projects.folderLead' : 'projects.linkLead')}</p>
              <Field label={t(mode === 'folder' ? 'projects.folder' : 'projects.link')}>
                <div className="row">
                  <input className="input mono grow" value={source} onChange={(e) => setSource(e.target.value)} placeholder={mode === 'folder' ? 'D:\\Projekty\\moja-strona' : 'https://github.com/user/repo'} required autoFocus />
                  {mode === 'folder' && <button type="button" className="btn" onClick={pick}><FolderOpen />{t('projects.browse')}</button>}
                </div>
              </Field>
              <Field label={<>{t('projects.name')} <span className="faint">({t('common.optional')})</span></>}>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <div className="scan-note"><ScanSearch size={16} />{t('projects.scanNote')}</div>
              <div className="modal-foot">
                <button className="btn primary" disabled={busy || !source.trim()}>{busy && <span className="spinner" />}{t('projects.import')}</button>
              </div>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ProjectForm({ project, onDone }: { project?: Project; onDone: (p: Project) => void }) {
  const t = useT();
  const { data: status } = useData<Status>('/api/status');
  const [f, setF] = useState({
    name: project?.name ?? '',
    description: project?.description ?? '',
    instructions: project?.instructions ?? '',
    color: project?.color ?? PALETTE_KEYS[Math.floor(Math.random() * PALETTE_KEYS.length)],
    icon: project?.icon ?? 'folder',
    folder: project?.folder ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api<Project>(project ? `/api/projects/${project.id}` : '/api/projects', { method: project ? 'PUT' : 'POST', body: { ...f, folder: f.folder.trim() || undefined } });
      invalidate('/api/projects', '/api/status');
      if (project) toast(t('common.saved'), 'ok');
      onDone(p);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <div className="row" style={{ gap: 16, alignItems: 'flex-start', marginBottom: 6 }}>
        <motion.div key={f.color + f.icon} initial={{ scale: 0.85, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
          <ProjectIcon p={f} size={56} />
        </motion.div>
        <div className="grow">
          <Field label={t('projects.name')}><input className="input" value={f.name} placeholder={t('projects.namePh')} onChange={(e) => set({ name: e.target.value })} required autoFocus /></Field>
        </div>
      </div>
      <Field label={t('projects.color')}>
        <div className="color-pick">
          {PALETTE_KEYS.map((k) => <motion.button type="button" key={k} className={f.color === k ? 'active' : ''} style={{ background: PALETTES[k] }} onClick={() => set({ color: k })} whileTap={{ scale: 0.88 }} />)}
        </div>
      </Field>
      <Field label={t('projects.icon')}>
        <div className="icon-pick">
          {ICON_KEYS.map((k) => {
            const I = ICONS[k];
            return <button type="button" key={k} className={f.icon === k ? 'active' : ''} onClick={() => set({ icon: k })}><I /></button>;
          })}
        </div>
      </Field>
      <Field label={t('projects.description')}><input className="input" value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <Field label={t('projects.instructions')}><textarea className="textarea" rows={4} value={f.instructions} placeholder={t('projects.instructionsPh')} onChange={(e) => set({ instructions: e.target.value })} /></Field>
      <Field label={t('projects.folder')} hint={project ? undefined : t('projects.folderHint', { path: status?.paths.projects ?? '…' })}>
        <input className="input mono" value={f.folder} onChange={(e) => set({ folder: e.target.value })} placeholder={status?.paths.projects} />
      </Field>
      <div className="modal-foot">
        <button className="btn primary" disabled={busy || !f.name.trim()}>{busy && <span className="spinner" />}{project ? t('common.save') : t('common.create')}</button>
      </div>
    </form>
  );
}

function ProjectOverview({ p }: { p: Project }) {
  const t = useT();
  const scan = useScan(p.id);
  const overview = overviewOf(p);
  const [open, setOpen] = useState(false);
  const rescan = async () => {
    setScanState(p.id, { status: 'running' });
    await api(`/api/projects/${p.id}/scan`, { method: 'POST' });
  };
  if (scan?.status === 'running')
    return (
      <motion.div className="card scan-card running" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <div className="scan-beam" />
        <ScanSearch size={18} />
        <div className="grow"><b>{t('projects.scanning')}</b><div className="small muted">{t('projects.scanningHint')}</div></div>
        <span className="spinner" />
      </motion.div>
    );
  if (!overview)
    return (
      <div className="card scan-card">
        <ScanSearch size={18} />
        <div className="grow small muted">{scan?.status === 'error' ? scan.error : t('projects.noOverview')}</div>
        <button className="btn sm" onClick={rescan}><ScanSearch />{t('projects.scan')}</button>
      </div>
    );
  return (
    <motion.div className="card scan-card done" layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <div className="row" style={{ alignItems: 'flex-start', width: '100%' }}>
        <ScanSearch size={18} style={{ marginTop: 2 }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{t('projects.overview')}</b>
          <div className={`overview${open ? ' open' : ''}`} onClick={() => setOpen(true)}><Markdown text={overview} /></div>
        </div>
        <button className="btn ghost icon sm" onClick={rescan} title={t('projects.scan')}><RefreshCw /></button>
      </div>
    </motion.div>
  );
}

type Tab = 'chats' | 'agents' | 'memory' | 'settings';

function ProjectPage({ id }: { id: string }) {
  const t = useT();
  const { data: projects } = useData<Project[]>('/api/projects');
  const { data: convs } = useData<Conversation[]>(`/api/conversations?projectId=${id}`);
  const { data: agents } = useData<Agent[]>('/api/agents');
  const { data: memories } = useData<Memory[]>(`/api/memories?projectId=${id}`);
  const [tab, setTab] = useState<Tab>('chats');
  const [gallery, setGallery] = useState(false);
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const p = projects?.find((x) => x.id === id);
  const mine = (agents ?? []).filter((a) => a.projectId === id);

  if (projects && !p) return <div className="page"><Empty icon={FolderKanban} title="404" action={<button className="btn" onClick={() => navigate('/projects')}>{t('common.back')}</button>} /></div>;
  if (!p) return null;

  const openFolder = async () => {
    try {
      await api(`/api/projects/${id}/open`, { method: 'POST' });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <div className="page">
      <motion.div className="project-hero" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ ['--glow' as any]: PALETTES[p.color] ?? PALETTES.violet }}>
        <ProjectIcon p={p} size={60} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.02em' }} className="truncate">{p.name}</h1>
          <div className="muted small truncate">{p.description || t('projects.stats', { chats: p.chats ?? 0, agents: p.agents ?? 0 })}</div>
          <div className="faint small mono truncate" style={{ marginTop: 4 }}>{p.folder}</div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={openFolder}><FolderOpen />{t('projects.openFolder')}</button>
          <button className="btn primary" onClick={() => navigate(`/chat/new?project=${id}`)}><Plus />{t('chat.new')}</button>
        </div>
      </motion.div>

      <ProjectOverview p={p} />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'chats', label: t('projects.chats'), icon: MessageSquare, count: convs?.length },
          { value: 'agents', label: t('projects.agents'), icon: Bot, count: mine.length },
          { value: 'memory', label: t('projects.memory'), icon: Brain, count: memories?.length },
          { value: 'settings', label: t('projects.settings'), icon: Settings2 },
        ]}
      />

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={{ duration: 0.2 }}>
          {tab === 'chats' &&
            (convs?.length ? (
              <div className="list">
                {convs.map((c, i) => (
                  <motion.button key={c.id} className="list-row" onClick={() => navigate(`/chat/${c.id}`)} {...stagger(i)}>
                    <MessageSquare size={16} className="faint" />
                    <span className="grow truncate">{c.title}</span>
                    <span className="small faint">{ago(c.updated_at)}</span>
                  </motion.button>
                ))}
              </div>
            ) : (
              <Empty icon={MessageSquare} title={t('projects.noChats')} action={<button className="btn primary" onClick={() => navigate(`/chat/new?project=${id}`)}><Plus />{t('projects.newChat')}</button>} />
            ))}

          {tab === 'agents' && (
            <>
              {mine.length ? (
                <div className="cards">
                  {mine.map((a, i) => <AgentCard key={a.id} a={a} i={i} onOpen={() => setOpenAgent(a.id)} />)}
                  <motion.button className="card hover dashed-card" onClick={() => setGallery(true)} {...stagger(mine.length)}>
                    <Plus />
                    {t('projects.addAgent')}
                  </motion.button>
                </div>
              ) : (
                <Empty icon={Bot} title={t('projects.noAgents')} action={<button className="btn primary" onClick={() => setGallery(true)}><Plus />{t('projects.addAgent')}</button>} />
              )}
              <Gallery open={gallery} onClose={() => setGallery(false)} projectId={id} onCreated={(a) => setOpenAgent(a.id)} />
              <AgentDrawer agentId={openAgent} onClose={() => setOpenAgent(null)} />
            </>
          )}

          {tab === 'memory' &&
            (memories?.length ? (
              <div className="list">
                {memories.map((m, i) => (
                  <motion.div key={m.id} className="list-row" {...stagger(i)}>
                    <Brain size={16} className="faint" />
                    <span className="grow">{m.content}</span>
                    <span className="small faint">{ago(m.updatedAt)}</span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <Empty icon={Brain} title={t('projects.noMemory')} />
            ))}

          {tab === 'settings' && (
            <div style={{ maxWidth: 640 }}>
              <div className="card"><ProjectForm project={p} onDone={() => {}} /></div>
              <div className="card danger-zone" style={{ marginTop: 16 }}>
                <div className="grow">
                  <b>{t('common.delete')}</b>
                  <div className="small muted">{t('projects.deleteHint')}</div>
                </div>
                <button
                  className="btn danger"
                  onClick={async () => {
                    if (!confirm(t('common.confirmDelete'))) return;
                    await api(`/api/projects/${id}`, { method: 'DELETE' });
                    invalidate('/api/projects', '/api/conversations', '/api/agents');
                    navigate('/projects');
                  }}
                >
                  <Trash2 />
                  {t('common.delete')}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
