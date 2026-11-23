// Pick a prompt from the library, fill its {{variables}}, and hand the finished text back (chat composer, Media).
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, BookOpen, Search, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, useData } from '../api';
import { useT, type Key } from '../i18n';
import { Modal, ModalHead, stagger } from './ui';

export interface PromptItem {
  id: string; title: string; body: string; category: string; kind: 'text' | 'image' | 'video';
  favorite: number; uses: number; builtin: number; created_at: string; updated_at: string; last_used: string | null; vars: string[];
}
export const PROMPT_CATS = ['image', 'video', 'writing', 'code', 'business', 'life'] as const;

/** Puts the variable values into the prompt; empty ones stay as [name] so the AI sees what is missing. */
export const fillPrompt = (body: string, vals: Record<string, string>) =>
  body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, name: string) => (vals[name]?.trim() ? vals[name].trim() : `[${name}]`));

export function PromptPicker({ open, onClose, onPick, kind }: { open: boolean; onClose: () => void; onPick: (text: string) => void; kind?: 'text' | 'image' | 'video' }) {
  const t = useT();
  const { data: prompts } = useData<PromptItem[]>(open ? '/api/prompts' : null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [sel, setSel] = useState<PromptItem | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setSel(null);
    setQ('');
    setCat(kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'all');
  }, [open, kind]);

  const list = useMemo(
    () => (prompts ?? []).filter((p) => (cat === 'all' || p.category === cat) && (!q.trim() || `${p.title} ${p.body}`.toLowerCase().includes(q.toLowerCase()))),
    [prompts, cat, q],
  );
  const choose = (p: PromptItem) => {
    if (!p.vars.length) return finish(p, {});
    setVals({});
    setSel(p);
  };
  const finish = (p: PromptItem, v: Record<string, string>) => {
    void api(`/api/prompts/${p.id}/use`, { method: 'POST' }).catch(() => {});
    onPick(fillPrompt(p.body, v));
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide>
      <ModalHead icon={<BookOpen />} title={sel ? sel.title : t('prompts.pick')} text={sel ? t('prompts.fillText') : t('prompts.pickText')} onClose={onClose} />
      {sel ? (
        <form className="prompt-fill" onSubmit={(e) => { e.preventDefault(); finish(sel, vals); }}>
          {sel.vars.map((v, i) => (
            <div key={v} className="field">
              <label>{v}</label>
              <input className="input" autoFocus={i === 0} value={vals[v] ?? ''} onChange={(e) => setVals((x) => ({ ...x, [v]: e.target.value }))} />
            </div>
          ))}
          <div className="prompt-preview small muted">{fillPrompt(sel.body, vals)}</div>
          <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
            <button type="button" className="btn ghost" onClick={() => setSel(null)}><ArrowLeft />{t('common.back')}</button>
            <button className="btn primary">{t('prompts.insert')}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="prompt-tools">
            <div className="plug-search">
              <Search size={15} />
              <input className="input" placeholder={t('prompts.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="chip-row">
              {['all', ...PROMPT_CATS].map((c) => (
                <button key={c} type="button" className={`chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{t(`prompts.cat.${c}` as Key)}</button>
              ))}
            </div>
          </div>
          <div className="prompt-pick-list">
            <AnimatePresence initial={false}>
              {list.map((p, i) => (
                <motion.button key={p.id} type="button" className="prompt-pick" onClick={() => choose(p)} {...stagger(i, 0.02)}>
                  <b className="row" style={{ gap: 6 }}>{p.favorite ? <Star size={13} className="star-on" /> : null}{p.title}<span className="faint small" style={{ marginLeft: 'auto' }}>{t(`prompts.cat.${p.category}` as Key)}</span></b>
                  <span className="small muted clamp-2">{p.body}</span>
                </motion.button>
              ))}
            </AnimatePresence>
            {prompts && !list.length && <div className="muted small" style={{ padding: 12 }}>{t('prompts.none')}</div>}
          </div>
        </>
      )}
    </Modal>
  );
}
