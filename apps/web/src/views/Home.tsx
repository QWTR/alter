import { motion } from 'motion/react';
import { ArrowRight, Bot, Brain, CircleCheck, MessageSquare, Radar, Sparkles, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useData, type Agent, type Project, type Run, type Status } from '../api';
import { Markdown } from '../components/Markdown';
import { ProviderCard, useConnection } from '../components/providers';
import { ICONS, Orb, PALETTES, ease, stagger } from '../components/ui';
import { ago, useT } from '../i18n';
import { navigate } from '../router';
import { setPendingMessage } from './Chat';

export function HomeView() {
  const t = useT();
  const { data: status } = useData<Status>('/api/status', 15_000);
  const { data: runs } = useData<Run[]>('/api/runs');
  const { data: agents } = useData<Agent[]>('/api/agents');
  const { data: projects } = useData<Project[]>('/api/projects');
  const conn = useConnection();
  const [q, setQ] = useState('');

  const h = new Date().getHours();
  const greet = h < 12 ? t('home.morning') : h < 18 ? t('home.afternoon') : t('home.evening');
  const name = status?.settings.userName;
  const monitors = (agents ?? []).filter((a) => a.monitor);
  const failing = monitors.filter((a) => a.monitorState?.status === 'fail');
  const latest = (runs ?? []).filter((r) => r.status !== 'running').slice(0, 3);

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setPendingMessage(q.trim());
    navigate('/chat/new');
  };

  return (
    <div className="page">
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }} style={{ fontSize: 34, letterSpacing: '-0.03em', margin: '10px 0 18px', fontWeight: 700 }}>
        <span className="gradient-text">{greet}{name ? `, ${name}` : ''}</span>
      </motion.h1>

      <motion.form className="hero-prompt" onSubmit={ask} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05, ease }}>
        <Sparkles />
        <input className="input" placeholder={t('home.ask')} value={q} onChange={(e) => setQ(e.target.value)} />
      </motion.form>

      {conn.providers && !conn.ok && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          {conn.providers.filter((p) => p.id !== 'demo' && (p.installed || p.id === 'claude')).slice(0, 2).map((p, i) => <ProviderCard key={p.id} p={p} index={i} />)}
        </motion.div>
      )}

      <div className="cards" style={{ marginTop: 22, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {[
          { icon: Brain, n: status?.counts.memories, label: t('home.knows'), to: '/memory' },
          { icon: Bot, n: (agents ?? []).filter((a) => a.enabled && !a.monitor).length, label: t('home.agentsActive'), to: '/agents' },
          { icon: MessageSquare, n: status?.counts.conversations, label: t('home.chats'), to: '/chat' },
        ].map((s, i) => (
          <motion.button key={s.to} className="card hover" style={{ textAlign: 'left', display: 'flex', gap: 14, alignItems: 'center' }} onClick={() => navigate(s.to)} {...stagger(i, 0.05)}>
            <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>
              <s.icon size={20} />
            </div>
            <div className="stat">
              <b>{s.n ?? '–'}</b>
              <span>{s.label}</span>
            </div>
          </motion.button>
        ))}
        {monitors.length > 0 && (
          <motion.button className="card hover" style={{ textAlign: 'left', display: 'flex', gap: 14, alignItems: 'center' }} onClick={() => navigate('/automations')} {...stagger(3, 0.05)}>
            <div className={`pulse-ring ${failing.length ? 'fail' : 'ok'}`}>{failing.length ? <TriangleAlert /> : <CircleCheck />}</div>
            <div className="stat">
              <b style={{ fontSize: 16 }}>{failing.length ? t('home.issues', { n: failing.length }) : t('home.allGood')}</b>
              <span>{t('home.automations')} · {monitors.length}</span>
            </div>
          </motion.button>
        )}
      </div>

      <h2 className="section">{t('home.today')}<span className="line" /><button className="btn ghost sm" onClick={() => navigate('/activity')}><ArrowRight /></button></h2>
      {latest.length ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {latest.map((r, i) => (
            <motion.div key={r.id} className="card" {...stagger(i)}>
              <div className="row" style={{ marginBottom: 10 }}>
                <Orb avatar={r.agent_avatar} size={32} />
                <div className="grow">
                  <b>{r.agent_name}</b>
                  <div className="small faint">{ago(r.started_at)}</div>
                </div>
                {r.status === 'error' && <span className="badge danger">{t('common.error')}</span>}
              </div>
              <div style={{ maxHeight: 220, overflow: 'hidden', maskImage: 'linear-gradient(#000 70%, transparent)' }}>
                {r.output ? <Markdown text={r.output} /> : <span className="muted">{r.error}</span>}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="card muted" style={{ textAlign: 'center', padding: 30 }}>
          <Radar size={22} style={{ opacity: 0.5, marginBottom: 6 }} />
          <div>{t('home.nothingYet')}</div>
        </div>
      )}

      {!!projects?.length && (
        <>
          <h2 className="section">{t('home.projects')}<span className="line" /></h2>
          <div className="cards">
            {projects.slice(0, 3).map((p, i) => {
              const Icon = ICONS[p.icon] ?? ICONS.folder;
              return (
                <motion.button key={p.id} className="card hover" style={{ textAlign: 'left' }} onClick={() => navigate(`/projects/${p.id}`)} {...stagger(i)}>
                  <div className="row">
                    <div className="orb" style={{ width: 36, height: 36, ['--orb' as any]: PALETTES[p.color] ?? PALETTES.violet }}><Icon size={17} /></div>
                    <div className="grow">
                      <h3 className="truncate">{p.name}</h3>
                      <div className="small faint">{ago(p.lastActivity ?? p.updatedAt)}</div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
