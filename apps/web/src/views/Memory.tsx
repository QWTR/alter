import { AnimatePresence, motion } from 'motion/react';
import { Brain, Plus, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { api, invalidate, setCached, useData, type Memory } from '../api';
import { Empty, PageHead, spring, stagger } from '../components/ui';
import { ago, useT, type Key } from '../i18n';

const KINDS = ['profile', 'preference', 'routine', 'project', 'person', 'fact'] as const;

export function MemoryView() {
  const t = useT();
  const [kind, setKind] = useState<string>('all');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [text, setText] = useState('');
  const { data: all } = useData<Memory[]>('/api/memories');

  const list = (all ?? []).filter((m) => (kind === 'all' || m.kind === kind) && (!dq.trim() || m.content.toLowerCase().includes(dq.toLowerCase())));
  const counts = Object.fromEntries(KINDS.map((k) => [k, (all ?? []).filter((m) => m.kind === k).length]));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await api('/api/memories', { method: 'POST', body: { content: text.trim(), kind: kind === 'all' ? 'fact' : kind, importance: 4 } });
    setText('');
    invalidate('/api/memories', '/api/status');
  };
  const remove = async (id: string) => {
    setCached<Memory[]>('/api/memories', (l) => (l ?? []).filter((m) => m.id !== id));
    await api(`/api/memories/${id}`, { method: 'DELETE' });
    invalidate('/api/memories', '/api/status');
  };
  const source = (s: string | null) =>
    !s ? '' : s === 'manual' ? t('memory.manual') : s === 'onboarding' ? t('memory.onboarding') : s.startsWith('agent') ? t('memory.fromAgent') : t('memory.fromChat');

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHead title={t('memory.title')} lead={t('memory.lead')} />

      <form className="hero-prompt" onSubmit={add} style={{ marginBottom: 18 }}>
        <Plus />
        <input className="input" placeholder={t('memory.addPh')} value={text} onChange={(e) => setText(e.target.value)} />
      </form>

      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="chips">
          {(['all', ...KINDS] as const).map((k) => (
            <button key={k} className={`chip${kind === k ? ' active' : ''}`} onClick={() => setKind(k)}>
              {kind === k && <motion.span layoutId="mem-chip" className="chip-pill" transition={spring} />}
              <span>{k === 'all' ? t('common.all') : t(`memory.kind.${k}` as Key)}</span>
              {k !== 'all' && !!counts[k] && <span className="faint">{counts[k]}</span>}
            </button>
          ))}
        </div>
        <span className="grow" />
        <div className="search">
          <Search />
          <input className="input" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {all && !list.length ? (
        <Empty icon={Brain} title={t('memory.empty')} />
      ) : (
        <div className="list">
          <AnimatePresence initial={false}>
            {list.map((m, i) => (
              <motion.div key={m.id} layout className="list-row mem" {...stagger(i, 0.015)}>
                <span className={`kind-dot k-${m.kind}`} title={t(`memory.kind.${m.kind}` as Key)} />
                <div className="grow">
                  <div>{m.content}</div>
                  <div className="small faint">{t(`memory.kind.${m.kind}` as Key)} · {source(m.source)} · {ago(m.updatedAt)}</div>
                </div>
                <button className="btn ghost icon sm hover-show" onClick={() => remove(m.id)} title={t('common.delete')}><Trash2 /></button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
