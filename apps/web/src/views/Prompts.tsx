// Prompt library: starters + your own, with categories, favourites and {{variables}}; one tap sends it to a chat or to Media.
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Copy, Pencil, Plus, Search, Send, Sparkles, Star, Trash2 } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { api, invalidate, setCached, useData } from '../api';
import { fillPrompt, PROMPT_CATS, type PromptItem } from '../components/PromptPicker';
import { Empty, Modal, ModalHead, PageHead, stagger, toast } from '../components/ui';
import { useT, type Key } from '../i18n';
import { navigate } from '../router';

/** Hands text to the next new chat (the composer picks it up once). */
export function composeInChat(text: string) {
  try { sessionStorage.setItem('altter.compose', text); } catch {}
  navigate('/chat/new');
}
export function composeInMedia(text: string, kind: 'image' | 'video') {
  try { sessionStorage.setItem('altter.mediaPrompt', text); } catch {}
  navigate(`/media?kind=${kind}`);
}

export function PromptsView() {
  const t = useT();
  const { data: prompts } = useData<PromptItem[]>('/api/prompts');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [edit, setEdit] = useState<Partial<PromptItem> | null>(null);
  const [use, setUse] = useState<PromptItem | null>(null);

  const list = (prompts ?? []).filter((p) => (cat === 'all' || (cat === 'fav' ? !!p.favorite : p.category === cat)) && (!dq.trim() || `${p.title} ${p.body}`.toLowerCase().includes(dq.toLowerCase())));

  const toggleFav = async (p: PromptItem) => {
    setCached<PromptItem[]>('/api/prompts', (l) => (l ?? []).map((x) => (x.id === p.id ? { ...x, favorite: p.favorite ? 0 : 1 } : x)));
    await api(`/api/prompts/${p.id}`, { method: 'PUT', body: { favorite: !p.favorite } }).catch(() => {});
  };
  const remove = async (p: PromptItem) => {
    setCached<PromptItem[]>('/api/prompts', (l) => (l ?? []).filter((x) => x.id !== p.id));
    await api(`/api/prompts/${p.id}`, { method: 'DELETE' }).catch(() => {});
  };
  const run = (p: PromptItem, text: string) => {
    void api(`/api/prompts/${p.id}/use`, { method: 'POST' }).catch(() => {});
    if (p.kind === 'image' || p.kind === 'video') composeInMedia(text, p.kind);
    else composeInChat(text);
  };
  const start = (p: PromptItem) => (p.vars.length ? setUse(p) : run(p, p.body));

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <PageHead title={t('prompts.title')} lead={t('prompts.lead')} actions={<button className="btn primary" onClick={() => setEdit({ category: cat !== 'all' && cat !== 'fav' ? cat : 'writing', title: '', body: '' })}><Plus />{t('prompts.new')}</button>} />
      <div className="prompt-tools">
        <div className="plug-search">
          <Search size={15} />
          <input className="input" placeholder={t('prompts.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chip-row">
          {['all', 'fav', ...PROMPT_CATS].map((c) => (
            <button key={c} type="button" className={`chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>
              {c === 'fav' && <Star size={13} />}{t(`prompts.cat.${c}` as Key)}
            </button>
          ))}
        </div>
      </div>
      {prompts && !list.length ? (
        <Empty icon={BookOpen} title={t('prompts.none')} text={t('prompts.noneText')} />
      ) : (
        <div className="prompt-grid">
          <AnimatePresence initial={false}>
            {list.map((p, i) => (
              <motion.div key={p.id} layout className="card prompt-card" {...stagger(i, 0.02)} exit={{ opacity: 0, scale: 0.97 }}>
                <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <span className={`prompt-kind k-${p.kind}`}>{p.kind === 'image' ? '🖼' : p.kind === 'video' ? '🎬' : '✍'}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b className="truncate" style={{ display: 'block' }}>{p.title}</b>
                    <span className="faint small">{t(`prompts.cat.${p.category}` as Key)}{p.uses ? ` · ${t('prompts.used', { n: p.uses })}` : ''}</span>
                  </div>
                  <button className={`btn ghost icon sm${p.favorite ? ' star-on' : ''}`} onClick={() => toggleFav(p)} title={t('prompts.fav')}><Star /></button>
                </div>
                <p className="small muted prompt-body">{p.body}</p>
                {p.vars.length > 0 && <div className="prompt-vars">{p.vars.map((v) => <span key={v}>{v}</span>)}</div>}
                <div className="prompt-actions">
                  <button className="btn primary sm" onClick={() => start(p)}>{p.kind === 'text' ? <Send /> : <Sparkles />}{p.kind === 'text' ? t('prompts.useChat') : t('prompts.useMedia')}</button>
                  <button className="btn ghost icon sm" onClick={() => { void navigator.clipboard?.writeText(p.body); toast(t('prompts.copied'), 'ok'); }} title={t('prompts.copy')}><Copy /></button>
                  <button className="btn ghost icon sm" onClick={() => setEdit(p)} title={t('prompts.edit')}><Pencil /></button>
                  <button className="btn ghost icon sm" onClick={() => remove(p)} title={t('common.remove')}><Trash2 /></button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      <EditPrompt value={edit} onClose={() => setEdit(null)} />
      <UsePrompt p={use} onClose={() => setUse(null)} onRun={(p, text) => { setUse(null); run(p, text); }} />
    </div>
  );
}

function EditPrompt({ value, onClose }: { value: Partial<PromptItem> | null; onClose: () => void }) {
  const t = useT();
  const [v, setV] = useState<Partial<PromptItem>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (value) setV(value); }, [value]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.body?.trim()) return;
    setSaving(true);
    try {
      await api(v.id ? `/api/prompts/${v.id}` : '/api/prompts', { method: v.id ? 'PUT' : 'POST', body: { title: v.title, body: v.body, category: v.category } });
      invalidate('/api/prompts');
      onClose();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={!!value} onClose={onClose}>
      <ModalHead icon={<Pencil />} title={v.id ? t('prompts.edit') : t('prompts.new')} text={t('prompts.varsHint')} onClose={onClose} />
      <form style={{ display: 'grid', gap: 12 }} onSubmit={save}>
        <div className="field"><label>{t('prompts.name')}</label><input className="input" value={v.title ?? ''} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
        <div className="field">
          <label>{t('prompts.category')}</label>
          <div className="chip-row">
            {PROMPT_CATS.map((c) => <button type="button" key={c} className={`chip${v.category === c ? ' on' : ''}`} onClick={() => setV({ ...v, category: c })}>{t(`prompts.cat.${c}` as Key)}</button>)}
          </div>
        </div>
        <div className="field"><label>{t('prompts.text')}</label><textarea className="input" rows={7} value={v.body ?? ''} onChange={(e) => setV({ ...v, body: e.target.value })} placeholder={t('prompts.textPh')} /></div>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={saving || !v.body?.trim()}>{saving && <span className="spinner" />}{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function UsePrompt({ p, onClose, onRun }: { p: PromptItem | null; onClose: () => void; onRun: (p: PromptItem, text: string) => void }) {
  const t = useT();
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => { if (p) setVals({}); }, [p?.id]);
  return (
    <Modal open={!!p} onClose={onClose}>
      {p && (
        <>
          <ModalHead icon={<Sparkles />} title={p.title} text={t('prompts.fillText')} onClose={onClose} />
          <form style={{ display: 'grid', gap: 12 }} onSubmit={(e) => { e.preventDefault(); onRun(p, fillPrompt(p.body, vals)); }}>
            {p.vars.map((v, i) => (
              <div key={v} className="field"><label>{v}</label><input className="input" autoFocus={i === 0} value={vals[v] ?? ''} onChange={(e) => setVals((x) => ({ ...x, [v]: e.target.value }))} /></div>
            ))}
            <div className="prompt-preview small muted">{fillPrompt(p.body, vals)}</div>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
              <button className="btn primary">{p.kind === 'text' ? <Send /> : <Sparkles />}{p.kind === 'text' ? t('prompts.useChat') : t('prompts.useMedia')}</button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}
