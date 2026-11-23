import { motion } from 'motion/react';
import { Bot, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useData, type Agent } from '../api';
import { AgentCard, AgentDrawer, Gallery } from '../components/agentKit';
import { Empty, PageHead, stagger } from '../components/ui';
import { useT } from '../i18n';
import { navigate, useRoute } from '../router';
import { ChatView } from './Chat';

export function AgentsView() {
  // /agents/<id>[/<chat>] — talk to that agent; /agents — the whole team
  const route = useRoute();
  return route.parts[1] ? <ChatView /> : <Team />;
}

function Team() {
  const t = useT();
  const route = useRoute();
  const { data: agents } = useData<Agent[]>('/api/agents');
  const [gallery, setGallery] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const team = (agents ?? []).filter((a) => !a.monitor);
  // "+" in the sidebar opens the gallery here
  useEffect(() => {
    if (route.query.get('new')) {
      setGallery(true);
      navigate('/agents', true);
    }
  }, [route.query.get('new')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <PageHead title={t('agents.title')} lead={t('agents.lead')} actions={<button className="btn primary" onClick={() => setGallery(true)}><Plus />{t('agents.add')}</button>} />
      {agents && !team.length ? (
        <Empty icon={Bot} title={t('agents.empty.title')} text={t('agents.empty.lead')} action={<button className="btn primary" onClick={() => setGallery(true)}><Plus />{t('agents.add')}</button>} />
      ) : (
        <div className="cards">
          {team.map((a, i) => <AgentCard key={a.id} a={a} i={i} onOpen={() => setOpen(a.id)} />)}
          {!!team.length && (
            <motion.button className="card hover dashed-card" onClick={() => setGallery(true)} {...stagger(team.length)}>
              <Plus />
              {t('agents.add')}
            </motion.button>
          )}
        </div>
      )}
      <Gallery open={gallery} onClose={() => setGallery(false)} onCreated={(a) => navigate(`/agents/${a.id}`)} />
      <AgentDrawer agentId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
