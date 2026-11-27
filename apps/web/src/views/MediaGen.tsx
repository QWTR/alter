// AI images and videos: write a prompt, pick a format and a model, and the results land in the gallery (live, on every device).
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Camera, Cpu, Download, Film, Image as ImageIcon, KeyRound, Megaphone, RotateCw, Sparkles, Trash2, UserRound, Wand2, X } from 'lucide-react';
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

// Cinema studio: real camera words the image/video models understand, added to the prompt
const CINE: Record<'camera' | 'lens' | 'aperture' | 'light' | 'film', string[]> = {
  camera: ['ARRI Alexa 35', 'RED V-Raptor 8K', 'Sony Venice 2', 'IMAX 70mm film camera', '16mm Bolex film camera', 'Leica M11', 'Hasselblad X2D medium format', 'iPhone 17 Pro', 'GoPro action cam', 'drone aerial'],
  lens: ['14mm ultra-wide', '24mm wide', '35mm', '50mm', '85mm portrait', '135mm telephoto', '100mm macro', 'anamorphic 40mm', 'fisheye', 'tilt-shift'],
  aperture: ['f/1.2, creamy bokeh', 'f/2.8, soft background', 'f/5.6', 'f/11, deep focus'],
  light: ['golden hour', 'blue hour', 'soft window light', 'hard noon sun', 'overcast diffused', 'neon night', 'candlelight', 'studio softbox, rim light', 'low-key chiaroscuro', 'volumetric god rays', 'moonlight'],
  film: ['Kodak Portra 400', 'Kodak Ektachrome', 'Fuji Velvia 50', 'Cinestill 800T', 'Ilford HP5 black and white', 'teal and orange grade', 'bleach bypass', 'clean digital'],
};
const NO_CINE: Record<keyof typeof CINE, string> = { camera: '', lens: '', aperture: '', light: '', film: '' };
// Marketing studio: one product, several ad angles
const AD_ANGLES = [
  'hero product shot on a clean seamless backdrop, premium studio lighting, ad campaign',
  'lifestyle scene with a person using it in a real everyday setting, natural light, authentic',
  'top-down flat lay with matching props, styled for social media',
  'bold graphic poster composition, strong single accent colour, lots of empty space for a headline',
];
type Variants = '1' | '2' | '3' | '4';
interface Character { id: string; name: string; look: string }

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
  const [panel, setPanel] = useState<'' | 'cine' | 'ads' | 'char'>('');
  const [cine, setCine] = useState(NO_CINE);
  const [variants, setVariants] = useState(1);
  const [charId, setCharId] = useState('');
  const [localOpen, setLocalOpen] = useState(false);
  const [charsOpen, setCharsOpen] = useState(false);
  const { data: chars } = useData<Character[]>('/api/media/characters');
  const character = (chars ?? []).find((c) => c.id === charId);
  const cineText = Object.values(cine).filter(Boolean).join(', ');
  /** The prompt as it goes to the model: character look + the user's words + camera + ad angle. */
  const fullPrompt = (i: number) => [
    character && `${character.name}: ${character.look}`,
    prompt.trim(),
    cineText && `Shot on ${cineText}`,
    variants > 1 && AD_ANGLES[i % AD_ANGLES.length],
  ].filter(Boolean).join('. ');

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
  const usesFree = kind === 'image' && (choice ? provider === 'pollinations' : !opts?.providers.find((p) => p.id === 'chatgpt')?.hasKey) && !opts?.providers.find((p) => p.id === 'pollinations')?.hasKey;
  const videoReady = !!opts?.providers.some((p) => p.models.some((m) => m.kind === 'video') && p.hasKey);

  const generate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || busy) return;
    if (chosen && chosen.needsKey && !chosen.hasKey) return setKeysOpen(true);
    if (kind === 'video' && !videoReady) return setKeysOpen(true);
    setBusy(true);
    try {
      for (let i = 0; i < (kind === 'image' ? variants : 1); i++) {
        const row = await api<MediaItemRow>('/api/media', { method: 'POST', body: { kind, prompt: fullPrompt(i), aspect, provider: provider || undefined, model: model || undefined } });
        setCached<MediaItemRow[]>('/api/media', (l) => [row, ...(l ?? []).filter((x) => x.id !== row.id)]);
      }
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
        actions={<><button className="btn" onClick={() => setLocalOpen(true)}><Cpu />{t('media.local')}</button><button className="btn" onClick={() => setKeysOpen(true)}><KeyRound />{t('media.keys')}</button></>}
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
        <div className="media-studios">
          <button type="button" className={`btn ghost sm${panel === 'cine' || cineText ? ' on' : ''}`} onClick={() => setPanel(panel === 'cine' ? '' : 'cine')}><Camera />{t('media.cine')}{cineText ? ' •' : ''}</button>
          {kind === 'image' && <button type="button" className={`btn ghost sm${panel === 'ads' || variants > 1 ? ' on' : ''}`} onClick={() => setPanel(panel === 'ads' ? '' : 'ads')}><Megaphone />{t('media.ads')}{variants > 1 ? ` ×${variants}` : ''}</button>}
          <button type="button" className={`btn ghost sm${panel === 'char' || character ? ' on' : ''}`} onClick={() => setPanel(panel === 'char' ? '' : 'char')}><UserRound />{character ? character.name : t('media.character')}</button>
        </div>
        {panel === 'cine' && (
          <div className="media-panel">
            {(Object.keys(CINE) as (keyof typeof CINE)[]).map((k) => (
              <label key={k} className="media-panel-field">
                <span className="small faint">{t(`media.cine.${k}` as Key)}</span>
                <select className="input" value={cine[k]} onChange={(e) => setCine((c) => ({ ...c, [k]: e.target.value }))}>
                  <option value="">—</option>
                  {CINE[k].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            ))}
            {cineText && <button type="button" className="btn ghost sm" onClick={() => setCine(NO_CINE)}><X />{t('media.clear')}</button>}
          </div>
        )}
        {panel === 'ads' && kind === 'image' && (
          <div className="media-panel">
            <span className="small faint grow">{t('media.adsHint')}</span>
            <Segmented<Variants> size="sm" value={String(variants) as Variants} onChange={(v) => setVariants(Number(v))} options={(['1', '2', '3', '4'] as Variants[]).map((n) => ({ value: n, label: n === '1' ? t('media.adsOne') : `×${n}` }))} />
          </div>
        )}
        {panel === 'char' && (
          <div className="media-panel">
            <select className="input grow" value={charId} onChange={(e) => setCharId(e.target.value)} aria-label={t('media.character')}>
              <option value="">{t('media.noCharacter')}</option>
              {(chars ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className="btn ghost sm" onClick={() => setCharsOpen(true)}>{t('media.manageCharacters')}</button>
            <span className="small faint" style={{ flexBasis: '100%' }}>{t('media.characterHint')}</span>
          </div>
        )}
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
      <LocalModal open={localOpen} onClose={() => setLocalOpen(false)} />
      <CharactersModal open={charsOpen} onClose={() => setCharsOpen(false)} list={chars ?? []} onPick={(id) => setCharId(id)} />
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
        {(opts?.providers ?? []).filter((p) => p.id !== 'local').map((p) => (
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

interface LocalStatus {
  dir: string; engine: boolean;
  job: { model: string; step: string; done: number; total: number; error: string | null; running: boolean } | null;
  models: { id: string; label: string; note: string; sizeMb: number; installed: boolean }[];
}

/** Free offline images on this computer's graphics card (stable-diffusion.cpp): download once, then no key, no limit, no internet. */
function LocalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [st, setSt] = useState<LocalStatus | null>(null);
  const load = () => api<LocalStatus>('/api/media/local').then(setSt).catch(() => {});
  useEffect(() => { if (open) void load(); }, [open]);
  const running = !!st?.job?.running;
  useEffect(() => {
    if (!open || !running) return;
    const id = setInterval(() => { void load().then(() => invalidate('/api/media/options')); }, 1500);
    return () => clearInterval(id);
  }, [open, running]);
  const install = async (model: string) => {
    try { setSt(await api<LocalStatus>('/api/media/local/install', { method: 'POST', body: { model } })); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async (model: string) => {
    try { setSt(await api<LocalStatus>(`/api/media/local/${model}`, { method: 'DELETE' })); invalidate('/api/media/options'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const pct = st?.job && st.job.total ? Math.min(100, Math.round((st.job.done / st.job.total) * 100)) : 0;
  return (
    <Modal open={open} onClose={onClose}>
      <ModalHead icon={<Cpu />} title={t('media.localTitle')} text={t('media.localText')} onClose={onClose} />
      <div style={{ display: 'grid', gap: 12 }}>
        {(st?.models ?? []).map((m) => {
          const mine = st?.job?.model === m.id;
          return (
            <div key={m.id} className="card" style={{ padding: 12, display: 'grid', gap: 6 }}>
              <div className="row" style={{ gap: 8 }}>
                <b>{m.label}</b>
                {m.installed && <span className="badge ok">{t('media.localReady')}</span>}
                <span className="grow" />
                <span className="small faint">{(m.sizeMb / 1000).toFixed(1)} GB</span>
              </div>
              <span className="small muted">{m.note}</span>
              {mine && running && (
                <div className="small faint">
                  <div className="media-progress"><i style={{ width: `${pct}%` }} /></div>
                  {st!.job!.step === 'engine' ? t('media.localEngine') : st!.job!.step} · {pct}%
                </div>
              )}
              {mine && st?.job?.error && <span className="small media-error-text">{st.job.error}</span>}
              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                {m.installed
                  ? <button className="btn ghost sm" onClick={() => remove(m.id)}><Trash2 size={14} />{t('common.remove')}</button>
                  : <button className="btn primary sm" disabled={running} onClick={() => install(m.id)}>{mine && running ? <span className="spinner" /> : <Download size={14} />}{t('media.localInstall')}</button>}
              </div>
            </div>
          );
        })}
        <p className="small faint">{t('media.localFoot')}</p>
      </div>
    </Modal>
  );
}

/** Characters: a saved look (face, hair, clothes, style) added to every prompt, so a series keeps the same person. */
function CharactersModal({ open, onClose, list, onPick }: { open: boolean; onClose: () => void; list: Character[]; onPick: (id: string) => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [look, setLook] = useState('');
  const save = async (next: Character[]) => {
    setCached<Character[]>('/api/media/characters', () => next);
    try {
      const r = await api<Character[]>('/api/media/characters', { method: 'PUT', body: { characters: next } });
      setCached<Character[]>('/api/media/characters', () => r);
      return r;
    } catch (e) {
      toast((e as Error).message, 'error');
      invalidate('/api/media/characters');
      return null;
    }
  };
  const add = async () => {
    if (!name.trim() || !look.trim()) return;
    const id = Math.random().toString(36).slice(2, 10);
    const r = await save([...list, { id, name: name.trim(), look: look.trim() }]);
    if (r) { onPick(id); setName(''); setLook(''); }
  };
  return (
    <Modal open={open} onClose={onClose}>
      <ModalHead icon={<UserRound />} title={t('media.charactersTitle')} text={t('media.charactersText')} onClose={onClose} />
      <div style={{ display: 'grid', gap: 10 }}>
        {list.map((c) => (
          <div key={c.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 0 }}><b>{c.name}</b><p className="small muted" style={{ margin: 0 }}>{c.look}</p></div>
            <button className="btn ghost sm" onClick={() => { onPick(c.id); onClose(); }}>{t('media.use')}</button>
            <button className="btn ghost icon sm" title={t('common.remove')} onClick={() => save(list.filter((x) => x.id !== c.id))}><Trash2 /></button>
          </div>
        ))}
        <input className="input" placeholder={t('media.charName')} value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="input" rows={3} placeholder={t('media.charLook')} value={look} onChange={(e) => setLook(e.target.value)} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" disabled={!name.trim() || !look.trim()} onClick={add}>{t('media.charAdd')}</button>
        </div>
      </div>
    </Modal>
  );
}
