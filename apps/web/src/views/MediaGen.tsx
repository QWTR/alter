// AI images and videos: write a prompt, pick a format and a model, and the results land in the gallery (live, on every device).
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Download, Film, Image as ImageIcon, KeyRound, RotateCw, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, invalidate, setCached, useData } from '../api';
import { PromptPicker } from '../components/PromptPicker';
import { Empty, Modal, ModalHead, PageHead, Segmented, toast, stagger } from '../components/ui';
import { ago, useT, type Key } from '../i18n';
import { useRoute } from '../router';

export interface MediaItemRow {
  id: string; kind: 'image' | 'video'; prompt: string; provider: string; model: string; aspect: string;
  status: 'running' | 'done' | 'error'; error: string | null; url: string | null; size: number | null; created_at: string; done_at: string | null; source: string;
}
interface ModelInfo { id: string; label: string; kind: 'image' | 'video'; note?: string }
interface ProviderInfo { id: string; label: string; free: boolean; needsKey: boolean; hasKey: boolean; keyUrl?: string; models: ModelInfo[] }
interface Options { providers: ProviderInfo[]; aspects: string[] }

const ASPECT_RATIO: Record<string, string> = { '1:1': '1 / 1', '16:9': '16 / 9', '9:16': '9 / 16', '4:3': '4 / 3', '3:4': '3 / 4' };

/** Raw provider errors are English API noise — say what happened and what to do. */
const mediaErr = (e?: string | null): Key => {
  const x = (e ?? '').toLowerCase();
  if (/api key|unauthori|401|403|invalid key|forbidden|no key/.test(x)) return 'media.err.key';
  if (/credit|quota|billing|balance|402|insufficient|payment/.test(x)) return 'media.err.credit';
  if (/safety|moderat|policy|nsfw|blocked|content/.test(x)) return 'media.err.safety';
  if (/timeout|timed out|429|rate|busy|overload|503|502|unavailable/.test(x)) return 'media.err.busy';
  return 'media.err.other';
};

export function MediaView() {
  const t = useT();
  const route = useRoute();
  const { data: items } = useData<MediaItemRow[]>('/api/media');
  const { data: opts } = useData<Options>('/api/media/options');
  const [kind, setKind] = useState<'image' | 'video'>('image');
  const [prompt, setPrompt] = useState(() => {
    try { const v = sessionStorage.getItem('altter.mediaPrompt'); if (v) { sessionStorage.removeItem('altter.mediaPrompt'); return v; } } catch {}
    return '';
  });
  const [aspect, setAspect] = useState('1:1');
  const [choice, setChoice] = useState(''); // "provider|model" ('' = automatic)
  const [busy, setBusy] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [library, setLibrary] = useState(false);
  const [big, setBig] = useState<MediaItemRow | null>(null);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');

  useEffect(() => {
    const k = route.query.get('kind');
    if (k === 'video' || k === 'image') setKind(k);
  }, [route.query]);
  useEffect(() => {
    setAspect(kind === 'video' ? '16:9' : '1:1');
    setChoice('');
  }, [kind]);

  // every model that can do this kind, available ones first
  const models = useMemo(() => {
    const out: { value: string; label: string; ok: boolean; free: boolean }[] = [];
    for (const p of opts?.providers ?? []) for (const m of p.models) if (m.kind === kind) out.push({ value: `${p.id}|${m.id}`, label: `${p.label} · ${m.label}`, ok: p.free || p.hasKey, free: p.free });
    return out.sort((a, b) => Number(b.ok) - Number(a.ok));
  }, [opts, kind]);
  const [provider, model] = choice ? choice.split('|') : ['', ''];
  const chosen = opts?.providers.find((p) => p.id === provider);
  const usesFree = kind === 'image' && (!choice || provider === 'pollinations') && !opts?.providers.find((p) => p.id === 'pollinations')?.hasKey;
  const videoReady = !!opts?.providers.some((p) => p.models.some((m) => m.kind === 'video') && p.hasKey);

  const generate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || busy) return;
    if (chosen && chosen.needsKey && !chosen.hasKey) return setKeysOpen(true);
    if (kind === 'video' && !videoReady) return setKeysOpen(true);
    setBusy(true);
    try {
      const row = await api<MediaItemRow>('/api/media', { method: 'POST', body: { kind, prompt: prompt.trim(), aspect, provider: provider || undefined, model: model || undefined } });
      setCached<MediaItemRow[]>('/api/media', (l) => [row, ...(l ?? []).filter((x) => x.id !== row.id)]);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const enhance = async () => {
    if (prompt.trim().length < 4 || enhancing) return;
    setEnhancing(true);
    try {
      const r = await api<{ text: string }>('/api/prompt/enhance', { method: 'POST', body: { text: prompt, kind } });
      setPrompt(r.text);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setEnhancing(false);
    }
  };

  const remove = async (id: string) => {
    setCached<MediaItemRow[]>('/api/media', (l) => (l ?? []).filter((x) => x.id !== id));
    if (big?.id === id) setBig(null);
    await api(`/api/media/${id}`, { method: 'DELETE' }).catch(() => {});
    invalidate('/api/media');
  };
  const again = (m: MediaItemRow) => {
    setKind(m.kind);
    setPrompt(m.prompt);
    setTimeout(() => { setAspect(m.aspect); setChoice(`${m.provider}|${m.model}`); }, 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelector('.page')?.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const list = (items ?? []).filter((m) => filter === 'all' || m.kind === filter);

  return (
    <div className="page media-page">
      <PageHead
        title={t('media.title')}
        lead={t('media.lead')}
        actions={<button className="btn" onClick={() => setKeysOpen(true)}><KeyRound />{t('media.keys')}</button>}
      />

      <form className="card media-maker" onSubmit={generate}>
        <div className="media-maker-top">
          <Segmented value={kind} onChange={setKind} options={[{ value: 'image', label: t('media.image'), icon: ImageIcon }, { value: 'video', label: t('media.video'), icon: Film }]} />
          <button type="button" className="btn ghost sm" onClick={() => setLibrary(true)}><BookOpen />{t('media.fromLibrary')}</button>
        </div>
        <textarea
          className="input media-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={kind === 'video' ? t('media.promptVideo') : t('media.promptImage')}
          rows={3}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void generate(); }}
        />
        <div className="media-maker-row">
          <div className="media-aspects" role="radiogroup" aria-label={t('media.format')}>
            {(kind === 'video' ? ['16:9', '9:16', '1:1'] : opts?.aspects ?? ['1:1', '16:9', '9:16', '4:3', '3:4']).map((a) => (
              <button type="button" key={a} role="radio" aria-checked={aspect === a} className={aspect === a ? 'on' : ''} onClick={() => setAspect(a)} title={a}>
                <i style={{ aspectRatio: ASPECT_RATIO[a] }} />
                <span>{a}</span>
              </button>
            ))}
          </div>
          <select className="input media-model" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label={t('media.model')}>
            <option value="">{kind === 'video' ? t('media.autoVideo') : t('media.autoImage')}</option>
            {models.map((m) => <option key={m.value} value={m.value}>{m.label}{m.free ? ` · ${t('media.free')}` : !m.ok ? ` · ${t('media.needsKey')}` : ''}</option>)}
          </select>
        </div>
        <div className="media-maker-foot">
          <span className="small faint grow">
            {kind === 'video' && !videoReady ? t('media.videoNeedsKey') : usesFree ? t('media.freeHint') : chosen && !chosen.hasKey && chosen.needsKey ? t('media.keyMissing', { name: chosen.label }) : t('media.savedHint')}
          </span>
          <button type="button" className="btn ghost" onClick={enhance} disabled={enhancing || prompt.trim().length < 4} title={t('enhance.hint')}>
            {enhancing ? <span className="spinner" /> : <Wand2 />}{t('enhance.label')}
          </button>
          <button className="btn primary" disabled={!prompt.trim() || busy}>
            {busy ? <span className="spinner" /> : <Sparkles />}{kind === 'video' ? t('media.makeVideo') : t('media.makeImage')}
          </button>
        </div>
      </form>

      <div className="media-gallery-head">
        <h2>{t('media.gallery')}</h2>
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: t('media.all') }, { value: 'image', label: t('media.images') }, { value: 'video', label: t('media.videos') }]} />
      </div>
      {items && !list.length ? (
        <Empty icon={ImageIcon} title={t('media.emptyTitle')} text={t('media.emptyText')} />
      ) : (
        <div className="media-grid">
          <AnimatePresence initial={false}>
            {list.map((m, i) => (
              <motion.figure key={m.id} layout className={`media-tile st-${m.status}`} {...stagger(i)} exit={{ opacity: 0, scale: 0.96 }}>
                <div className="media-frame" style={{ aspectRatio: ASPECT_RATIO[m.aspect] ?? '1 / 1' }}>
                  {m.status === 'done' && m.url ? (
                    m.kind === 'video' ? <video src={m.url} controls playsInline preload="metadata" loop /> : <img src={m.url} alt={m.prompt} loading="lazy" onClick={() => setBig(m)} />
                  ) : m.status === 'running' ? (
                    <div className="media-wait"><span className="spinner" /><Elapsed since={m.created_at} /></div>
                  ) : (
                    <div className="media-err"><b>{t('media.failed')}</b><span title={m.error ?? ''}>{t(mediaErr(m.error))}</span><button className="btn sm" onClick={() => again(m)}><RotateCw size={14} />{t('common.retry')}</button></div>
                  )}
                </div>
                <figcaption>
                  <p className="media-cap" title={m.prompt}>{m.prompt}</p>
                  <div className="media-meta">
                    <span className="faint small truncate">{m.model.split('/').slice(-2).join('/')} · {ago(m.created_at)}{m.source === 'agent' ? ` · ${t('media.byAi')}` : ''}</span>
                    <span className="media-actions">
                      {m.url && <a className="btn ghost icon sm" href={m.url} download title={t('media.download')}><Download /></a>}
                      <button className="btn ghost icon sm" onClick={() => again(m)} title={t('media.again')}><RotateCw /></button>
                      <button className="btn ghost icon sm" onClick={() => remove(m.id)} title={t('common.remove')}><Trash2 /></button>
                    </span>
                  </div>
                </figcaption>
              </motion.figure>
            ))}
          </AnimatePresence>
        </div>
      )}

      <KeysModal open={keysOpen} onClose={() => setKeysOpen(false)} opts={opts} />
      <PromptPicker open={library} onClose={() => setLibrary(false)} kind={kind} onPick={(text) => setPrompt(text)} />
      <Modal open={!!big} onClose={() => setBig(null)} wide>
        {big && (
          <div className="media-big">
            <button className="btn ghost icon media-big-x" onClick={() => setBig(null)} aria-label={t('common.close')}><X /></button>
            <img src={big.url ?? ''} alt={big.prompt} />
            <p className="small muted">{big.prompt}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const [n, setN] = useState(() => Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 1000)));
  useEffect(() => {
    const id = setInterval(() => setN(Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 1000))), 1000);
    return () => clearInterval(id);
  }, [since]);
  return <span className="small muted">{n < 60 ? `${n} s` : `${Math.floor(n / 60)} min ${n % 60} s`}</span>;
}

function KeysModal({ open, onClose, opts }: { open: boolean; onClose: () => void; opts?: Options }) {
  const t = useT();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setVals({}); }, [open]);
  const save = async () => {
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== undefined));
      const r = await api<Options>('/api/media/keys', { method: 'PUT', body });
      setCached('/api/media/options', () => r);
      toast(t('media.keysSaved'), 'ok');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose}>
      <ModalHead icon={<KeyRound />} title={t('media.keysTitle')} text={t('media.keysText')} onClose={onClose} />
      <div style={{ display: 'grid', gap: 14 }}>
        {(opts?.providers ?? []).map((p) => (
          <div key={p.id} className="field">
            <label className="row" style={{ gap: 8 }}>
              <b>{p.label}</b>
              {p.free && <span className="badge">{t('media.freeNoKey')}</span>}
              {p.hasKey && <span className="badge ok">{t('media.keySet')}</span>}
              <span className="grow" />
              {p.keyUrl && <a className="small" href={p.keyUrl} target="_blank" rel="noreferrer">{t('media.getKey')}</a>}
            </label>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input grow"
                type="password"
                autoComplete="off"
                placeholder={p.hasKey ? '••••••••••••' : p.free ? t('media.optionalKey') : t('media.pasteKey')}
                value={vals[p.id] ?? ''}
                onChange={(e) => setVals((v) => ({ ...v, [p.id]: e.target.value }))}
              />
              {p.hasKey && <button type="button" className="btn ghost sm" onClick={() => setVals((v) => ({ ...v, [p.id]: '' }))}>{t('common.remove')}</button>}
            </div>
            <div className="hint">{t(`media.keyHint.${p.id}` as any)}</div>
          </div>
        ))}
        <p className="small faint">{t('media.keysLocal')}</p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" onClick={save} disabled={saving || !Object.keys(vals).length}>{saving && <span className="spinner" />}{t('common.save')}</button>
        </div>
      </div>
    </Modal>
  );
}
