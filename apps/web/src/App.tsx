import { AnimatePresence, motion } from 'motion/react';
import { Activity, BarChart3, Bot, BookOpen, Brain, Clapperboard, Ellipsis, FolderKanban, House, ImagePlus, MessageSquare, Plus, Radar, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
import { GuestGate } from './views/Guest';
import { boot, connectEvents, fetchKey, invalidate, prefetch, setCached, setUnauthorizedHandler, useData, type Agent, type Project, type Settings, type Status } from './api';
import { ConnectionChip, setProviderProgress } from './components/providers';
import { AgentsPanel, ChatsPanel } from './components/SidePanels';
import { Logo, Orb, PALETTES, toast, Toasts, spring } from './components/ui';
import { TitleBar } from './components/TitleBar';
import { pushAgentStatus } from './components/agentStatus';
import { setLang, t as tr, useT } from './i18n';
import { navigate, useRoute } from './router';
import { ActivityView } from './views/Activity';
import { AgentsView } from './views/Agents';
import { AutomationsView } from './views/Automations';
import { ChatView } from './views/Chat';
import { HomeView } from './views/Home';
import { MemoryView } from './views/Memory';
import { Onboarding } from './views/Onboarding';
import { PairView } from './views/Pair';
import { ProjectsView, setScanState } from './views/Projects';
import { SettingsView } from './views/Settings';
import { setStudioProgress, StudioView } from './views/Studio';
import { MediaView } from './views/MediaGen';
import { PromptsView } from './views/Prompts';
import { UsageView } from './views/Usage';
import { UpdateBanner } from './components/UpdateBanner';
import { ReportHost } from './components/Report';
import { savedWorkspaceKey, takeInviteFromUrl, WorkspaceGate, WorkspaceView, WorkspacesView } from './views/Workspace';
import { joinedWorkspaces, openSession } from './components/Join';
import { Users } from 'lucide-react';

const VIEWS: Record<string, ComponentType> = {
  home: HomeView,
  chat: ChatView,
  projects: ProjectsView,
  agents: AgentsView,
  automations: AutomationsView,
  studio: StudioView,
  activity: ActivityView,
  memory: MemoryView,
  settings: SettingsView,
  media: MediaView,
  prompts: PromptsView,
  workspace: WorkspacesView,
  usage: UsageView,
};

const NAV = [
  { id: 'home', icon: House, key: 'nav.home' },
  { id: 'chat', icon: MessageSquare, key: 'nav.chats' },
  { id: 'projects', icon: FolderKanban, key: 'nav.projects' },
  { id: 'workspace', icon: Users, key: 'nav.workspace' },
  { id: 'studio', icon: Clapperboard, key: 'nav.studio' },
  { id: 'agents', icon: Bot, key: 'nav.agents' },
  { id: 'media', icon: ImagePlus, key: 'nav.media' },
  { id: 'prompts', icon: BookOpen, key: 'nav.prompts' },
  { id: 'automations', icon: Radar, key: 'nav.automations' },
  { id: 'activity', icon: Activity, key: 'nav.activity' },
  { id: 'memory', icon: Brain, key: 'nav.memory' },
  { id: 'usage', icon: BarChart3, key: 'nav.usage' },
] as const;
/** Phone tab bar: the main five + "More" (everything else, as a sheet). */
const MOBILE_MAIN = ['home', 'chat', 'studio', 'agents'] as const;

/** A share link (#/s/<token>) opens the guest view: one chat, no pairing. */
const guestToken = location.hash.match(/^#\/s\/([\w-]{10,})/)?.[1] ?? null;

/** A workspace invite (#/w/<key>) — the key is remembered, so next time ALTTER opens straight into it. */
const inviteKey = takeInviteFromUrl();
// an invite or share link opened in a tab that already runs ALTTER (only the # changes): start over in that mode
addEventListener('hashchange', () => { if (/^#\/[sw]\/[\w-]{10,}/.test(location.hash)) location.reload(); });

export function App() {
  if (guestToken) return <GuestGate token={guestToken} />;
  if (inviteKey) return <WorkspaceGate wsKey={inviteKey} />;
  return <HostApp />;
}

function HostApp() {
  const [state, setState] = useState<'loading' | 'pair' | 'ready'>('loading');

  useEffect(() => {
    setUnauthorizedHandler(() => setState('pair'));
    boot().then(async (ok) => {
      if (!ok) return setState('pair');
      // know whether setup is needed before drawing anything (no flash of the app behind the wizard)
      const st = await fetchKey<Status>('/api/status').catch(() => null);
      if (st?.settings.language) setLang(st.settings.language);
      prefetch('/api/status', '/api/providers', '/api/projects', '/api/agents', '/api/conversations', '/api/runs', '/api/agents/templates', '/api/memories', '/api/skills');
      setState('ready');
    });
  }, []);

  if (state === 'loading') return <Splash />;
  // not this computer's owner, but a team member of one of its workspaces: straight in
  if (state === 'pair' && savedWorkspaceKey()) return <WorkspaceGate wsKey={savedWorkspaceKey()!} />;
  if (state === 'pair') return <PairView onPaired={() => location.reload()} />;
  return <Shell />;
}

function Splash() {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
        <Logo size={64} animated />
      </motion.div>
    </div>
  );
}

function Shell() {
  const t = useT();
  const route = useRoute();
  const { data: status } = useData<Status>('/api/status', 15_000);
  const { data: projects } = useData<Project[]>('/api/projects');
  const { data: agents } = useData<Agent[]>('/api/agents');
  // Chats / Agents turn the sidebar into their own list; the arrow brings the main menu back
  const panel = route.section === 'chat' ? 'chats' : route.section === 'agents' ? 'agents' : null;
  const [mainMenu, setMainMenu] = useState(false);
  useEffect(() => setMainMenu(false), [route.section]);
  const [forceOnboarding, setForceOnboarding] = useState(() => !!status && status.you.kind === 'computer' && !status.settings.onboarded);

  // language follows the account setting (shared by all devices)
  useEffect(() => {
    if (status?.settings.language) setLang(status.settings.language);
  }, [status?.settings.language]);

  // back from the background (phone screen off, app switched): the event stream may have missed things — refresh all
  useEffect(() => {
    let hiddenAt = 0;
    const on = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 3000) invalidate('/api/');
    };
    document.addEventListener('visibilitychange', on);
    window.addEventListener('online', on);
    return () => {
      document.removeEventListener('visibilitychange', on);
      window.removeEventListener('online', on);
    };
  }, []);

  // live sync: one event stream keeps every screen and every device fresh
  useEffect(
    () =>
      connectEvents((type, data) => {
        switch (type) {
          case 'run.started':
            invalidate('/api/runs', '/api/agents');
            break;
          case 'run.finished':
            invalidate('/api/runs', '/api/agents');
            toast(
              tr(data.status === 'done' ? 'agents.finished' : 'agents.failed', { name: data.agent_name ?? 'Agent' }),
              data.status === 'done' ? 'ok' : 'error',
              <Orb avatar={data.agent_avatar} size={26} />,
            );
            break;
          case 'agent.changed':
            if (data.deleted) invalidate('/api/agents');
            else setCached<Agent[]>('/api/agents', (list) => (list ? (list.some((a) => a.id === data.id) ? list.map((a) => (a.id === data.id ? data : a)) : [...list, data]) : list!));
            invalidate('/api/agents?');
            break;
          case 'monitor.changed':
            invalidate('/api/agents');
            break;
          case 'memory.added':
            invalidate('/api/memories', '/api/status');
            toast(tr('memory.learned', { text: data.content }), 'info', <Brain color="var(--accent-strong)" />, 5000);
            break;
          case 'project.changed':
            invalidate('/api/projects');
            break;
          case 'squad.update':
            invalidate(`/api/conversations/${data.conversationId}`);
            break;
          case 'hands.board':
            invalidate(`/api/hands/board/${data.crew}`);
            break;
          case 'crew.preview':
            window.dispatchEvent(new CustomEvent('alter:crew-preview', { detail: data }));
            break;
          case 'conversation.updated':
            invalidate('/api/conversations');
            if (data.deleted && location.hash.includes(data.id)) navigate('/chat/new', true);
            break;
          case 'project.scan':
            setScanState(data.id, data);
            if (data.status !== 'running') invalidate('/api/projects', '/api/memories');
            break;
          case 'provider.progress':
            setProviderProgress(data.id, data);
            if (data.stage === 'done') invalidate('/api/providers', '/api/status');
            break;
          case 'provider.tested':
            invalidate('/api/providers', '/api/status');
            break;
          case 'settings.changed':
            setCached<Status>('/api/status', (s) => (s ? { ...s, settings: data as Settings } : s!));
            break;
          case 'studio.progress':
            setStudioProgress(data);
            break;
          case 'hands.session':
          case 'hands.stopped':
            invalidate('/api/hands');
            break;
          case 'agent.status':
            pushAgentStatus(data);
            break;
          case 'alert':
            invalidate('/api/conversations', '/api/agents');
            break;
          case 'push.changed':
            invalidate('/api/push');
            break;
          case 'media.updated':
            invalidate('/api/media');
            break;
          case 'prompts.changed':
            invalidate('/api/prompts');
            break;
          case 'device.paired':
            toast(`📱 ${data.name}`, 'ok');
            invalidate('/api/devices');
            break;
        }
      }),
    [],
  );

  // latch: once setup starts it stays open until the user leaves the final screen
  useEffect(() => {
    if (status && status.you.kind === 'computer' && !status.settings.onboarded) setForceOnboarding(true);
  }, [status?.settings.onboarded, status?.you.kind]);
  const showOnboarding = forceOnboarding;
  const [more, setMore] = useState(false);
  // the phone's Back closes the "More" sheet
  useEffect(() => {
    if (!more) return;
    history.pushState({ ...(history.state ?? {}), alterSheet: true }, '', location.href);
    const onPop = () => setMore(false);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (history.state?.alterSheet) history.back();
    };
  }, [more]);
  const View = VIEWS[route.section] ?? HomeView;
  const joined = joinedWorkspaces();
  const failing = (agents ?? []).filter((a) => a.monitorState?.status === 'fail').length;
  const running = (agents ?? []).filter((a) => a.running).length;

  if (route.section === 'workspace' && route.parts[1]) return (
    <>
      <TitleBar />
      <WorkspaceView />
      <Toasts />
    </>
  );

  return (
    <>
      <TitleBar />
      <div className="shell" style={showOnboarding ? { visibility: "hidden" } : undefined}>
        <aside className="sidebar">
          <div className="brand">
            <Logo />
            ALTTER
          </div>
          {/* enter-only transitions: nothing waits for an exit animation, so a view can never get stuck */}
          {panel && !mainMenu ? (
            <div key={panel} className="side-panel enter-right">
              {panel === 'chats' ? <ChatsPanel onBack={() => setMainMenu(true)} /> : <AgentsPanel onBack={() => setMainMenu(true)} />}
            </div>
          ) : (
          <div key="main" className="side-panel enter-left">
          <nav className="nav-scroll">
            {NAV.map((n) => (
              <NavItem key={n.id} id={n.id} icon={n.icon} label={t(n.key)} onPick={() => setMainMenu(false)} active={route.section === n.id} badge={n.id === 'automations' && failing ? <span className="status-dot danger live" style={{ marginLeft: 'auto' }} /> : n.id === 'agents' && running ? <span className="status-dot warn live" style={{ marginLeft: 'auto' }} /> : undefined} />
            ))}
            <div className="nav-section">
              {t('nav.projects')}
              <button className="btn ghost sm icon" style={{ width: 24, height: 24 }} onClick={() => navigate('/projects?new=1')} title={t('projects.new')}>
                <Plus size={14} />
              </button>
            </div>
            {(projects ?? []).slice(0, 8).map((p) => (
              <button key={p.id} className={`nav-item${route.section === 'projects' && route.parts[1] === p.id ? ' active' : ''}`} onClick={() => navigate(`/projects/${p.id}`)}>
                {route.section === 'projects' && route.parts[1] === p.id && <motion.span layoutId="nav-pill" className="pill" transition={spring} />}
                <span className="dot" style={{ background: PALETTES[p.color] ?? PALETTES.violet }} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
            {joined.length > 0 && <div className="nav-section">{t('ws.joined')}</div>}
            {joined.map((j) => (
              <button key={j.url} className="nav-item" onClick={() => openSession(j.url, status?.settings.userName)} title={j.url}>
                <Users size={15} className="faint" />
                <span className="truncate">{j.name}</span>
              </button>
            ))}
          </nav>
          </div>
          )}
          <div className="sidebar-foot">
            <ConnectionChip onClick={() => navigate('/settings?tab=ai')} />
            <NavItem id="settings" icon={SettingsIcon} label={t('nav.settings')} active={route.section === 'settings'} />
          </div>
        </aside>

        <main className="main">
            <UpdateBanner />
            <ReportHost />
            <div
              key={route.section + (route.section === 'projects' || route.section === 'agents' ? route.parts[1] ?? '' : '')}
              className="view view-enter"
            >
              <View />
            </div>
        </main>

        <nav className="mobile-bar">
          {NAV.filter((n) => (MOBILE_MAIN as readonly string[]).includes(n.id)).map((n) => (
            <button key={n.id} className={route.section === n.id ? 'active' : ''} onClick={() => { setMore(false); navigate(`/${n.id === 'home' ? '' : n.id}`); }}>
              {route.section === n.id && !more && <motion.span layoutId="mob-pill" className="pill" style={{ position: 'absolute', inset: 0, background: 'var(--surface-2)', borderRadius: 12, zIndex: -1 }} transition={spring} />}
              <n.icon />
              {t(n.key)}
            </button>
          ))}
          {(() => {
            const inMore = more || !(MOBILE_MAIN as readonly string[]).includes(route.section);
            return (
              <button className={inMore ? 'active' : ''} onClick={() => setMore((v) => !v)} aria-expanded={more}>
                {inMore && <motion.span layoutId="mob-pill" className="pill" style={{ position: 'absolute', inset: 0, background: 'var(--surface-2)', borderRadius: 12, zIndex: -1 }} transition={spring} />}
                <Ellipsis />
                {t('nav.more')}
              </button>
            );
          })()}
        </nav>
        <AnimatePresence>
          {more && (
            <>
              <motion.div key="mo" className="more-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMore(false)} />
              <motion.div key="ms" className="more-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
                <div className="more-grab" />
                <div className="more-grid">
                  {[...NAV.filter((n) => !(MOBILE_MAIN as readonly string[]).includes(n.id)), { id: 'settings', icon: SettingsIcon, key: 'nav.settings' } as const].map((n) => (
                    <button key={n.id} className={route.section === n.id ? 'active' : ''} onClick={() => { setMore(false); navigate(`/${n.id}`); }}>
                      <span className="more-ico"><n.icon /></span>
                      {t(n.key)}
                    </button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
      <div className="backdrop-glow" />
      <Toasts />
      <AnimatePresence>
        {showOnboarding && status && (
          <Onboarding
            key="onb"
            status={status}
            onDone={() => {
              setForceOnboarding(false);
              invalidate('/api/status', '/api/agents', '/api/memories', '/api/providers');
            }}
          />
        )}
      </AnimatePresence>
      <RerunHook onRun={() => setForceOnboarding(true)} />
    </>
  );
}

function RerunHook({ onRun }: { onRun: () => void }) {
  useEffect(() => {
    const h = () => onRun();
    window.addEventListener('alter:onboarding', h);
    return () => window.removeEventListener('alter:onboarding', h);
  }, [onRun]);
  return null;
}

function NavItem({ id, icon: Icon, label, active, badge, onPick }: { id: string; icon: ComponentType<{ size?: number }>; label: string; active: boolean; badge?: React.ReactNode; onPick?: () => void }) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={() => { onPick?.(); navigate(id === 'home' ? '/' : `/${id}`); }}>
      {active && <motion.span layoutId="nav-pill" className="pill" transition={spring} />}
      <Icon size={18} />
      <span>{label}</span>
      {badge}
    </button>
  );
}
