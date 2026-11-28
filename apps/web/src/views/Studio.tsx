// Studio: videos, motion graphics, 3D, edits and graphics. Pick a recipe, say what it is about —
// ALTTER writes a short, precise brief (no wasted tokens) and its built-in kit renders it.
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, Box, Captions, Camera, Mic, SearchCheck, Check, Clapperboard, Download, Film, Image as ImageIcon, Images, Layers, Megaphone, MonitorPlay, Paintbrush, Paperclip,
  KeyRound, Palette, Play, Scissors, Smartphone, Sparkles, Trash2, Type, WandSparkles, X, FolderKanban, type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, invalidate, setCached, uploadFile, useData, type Attachment, type Brand, type MediaItem, type StudioInfo, type Project } from '../api';
import { ProgressBar } from '../components/Media';
import { Field, Modal, ModalHead, PageHead, Segmented, softSpring, spring, stagger, Switch, toast } from '../components/ui';
import { useT, type Key } from '../i18n';
import { navigate, useRoute } from '../router';
import { InstagramPane, SeoPane, VoicePane } from './StudioPanes';
import { Tabs } from '../components/ui';
import { setPendingMessage } from './Chat';

// ---------- install progress (pushed by the event stream) ----------
let installState: { text: string; pct?: number; done: boolean; error?: boolean } | null = null;
const subs = new Set<() => void>();
export function setStudioProgress(p: typeof installState) {
  installState = p;
  subs.forEach((f) => f());
  if (p?.done) invalidate('/api/studio');
}
const useInstall = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => installState);

// ---------- recipes ----------
type Fmt = 'reel' | 'square' | 'post' | 'wide' | 'thumb';
interface Recipe { id: string; icon: LucideIcon; format: Fmt; seconds?: number; theme: string; still?: boolean; files?: 'need' | 'optional'; grad: string; fixedLength?: boolean }
const RECIPES: Recipe[] = [
  { id: 'reel', icon: Smartphone, format: 'reel', seconds: 15, theme: 'midnight', files: 'optional', grad: 'linear-gradient(135deg,#7c5cff,#2ee6ff)' },
  { id: 'motion', icon: Sparkles, format: 'wide', seconds: 10, theme: 'neon', grad: 'linear-gradient(135deg,#ff2bd6,#6a00ff)' },
  { id: 'three', icon: Box, format: 'square', seconds: 8, theme: 'midnight', files: 'optional', grad: 'linear-gradient(135deg,#00c6ff,#0047ff)' },
  { id: 'promo', icon: Megaphone, format: 'reel', seconds: 15, theme: 'sunset', files: 'optional', grad: 'linear-gradient(135deg,#ff6a3d,#ffc24b)' },
  { id: 'edit', icon: Scissors, format: 'reel', seconds: 30, theme: 'mono', files: 'need', fixedLength: true, grad: 'linear-gradient(135deg,#3a3a46,#9aa0b4)' },
  { id: 'captions', icon: Captions, format: 'reel', theme: 'bold', files: 'need', fixedLength: true, grad: 'linear-gradient(135deg,#ffe600,#ff3d00)' },
  { id: 'slideshow', icon: Images, format: 'square', seconds: 20, theme: 'luxury', files: 'need', grad: 'linear-gradient(135deg,#d4af6a,#5a4020)' },
  { id: 'post', icon: ImageIcon, format: 'post', theme: 'paper', still: true, files: 'optional', grad: 'linear-gradient(135deg,#f3efe6,#e4402f)' },
  { id: 'thumb', icon: MonitorPlay, format: 'thumb', theme: 'bold', still: true, files: 'optional', grad: 'linear-gradient(135deg,#111,#ff3d00)' },
  { id: 'photo', icon: WandSparkles, format: 'post', theme: 'fresh', still: true, files: 'need', fixedLength: true, grad: 'linear-gradient(135deg,#00b86b,#0a6cff)' },
  { id: 'aiimage', icon: Palette, format: 'square', theme: 'midnight', still: true, files: 'optional', fixedLength: true, grad: 'linear-gradient(135deg,#ff9a3d,#ff2bd6 50%,#6a00ff)' },
  { id: 'brandkit', icon: Layers, format: 'post', theme: 'paper', still: true, files: 'optional', fixedLength: true, grad: 'linear-gradient(135deg,#0f0f14,#7c5cff 60%,#ffe600)' },
];

const THEMES: { id: string; colors: [string, string, string] }[] = [
  { id: 'midnight', colors: ['#07080d', '#7c5cff', '#2ee6ff'] },
  { id: 'neon', colors: ['#06010f', '#ff2bd6', '#00f0ff'] },
  { id: 'sunset', colors: ['#170910', '#ff6a3d', '#ffc24b'] },
  { id: 'racing', colors: ['#08090c', '#e53935', '#ffffff'] },
  { id: 'luxury', colors: ['#0b0a08', '#d4af6a', '#8c6b3f'] },
  { id: 'mono', colors: ['#0a0a0a', '#ffffff', '#8a8a8a'] },
  { id: 'paper', colors: ['#f3efe6', '#e4402f', '#1f4fff'] },
  { id: 'fresh', colors: ['#ecfff6', '#00b86b', '#0a6cff'] },
  { id: 'bold', colors: ['#111111', '#ffe600', '#ff3d00'] },
];
// popular Google Fonts (any other family name works too — the renderer loads it by name)
const FONTS = [
  'Inter', 'Space Grotesk', 'Syne', 'Playfair Display', 'Bebas Neue', 'Montserrat', 'Poppins', 'Manrope', 'DM Sans', 'Outfit', 'Sora', 'Plus Jakarta Sans',
  'Urbanist', 'Lexend', 'Archivo Black', 'Anton', 'Oswald', 'Unbounded', 'Clash Display', 'Righteous', 'Bricolage Grotesque', 'Instrument Serif', 'DM Serif Display',
  'Fraunces', 'Cormorant Garamond', 'Libre Baskerville', 'Lora', 'Merriweather', 'Abril Fatface', 'Lobster', 'Pacifico', 'Caveat', 'Permanent Marker',
  'Rubik', 'Nunito', 'Work Sans', 'Raleway', 'Roboto', 'Open Sans', 'Lato', 'Fira Sans', 'IBM Plex Sans', 'JetBrains Mono', 'Space Mono', 'Press Start 2P', 'Orbitron',
];
const isFontFile = (v?: string) => !!v && /\.(ttf|otf|woff2?)($|\?)/i.test(v);
/** Loads a font for the preview: a Google Font by name, or an uploaded file. Returns the CSS family to use. */
function usePreviewFont(name?: string, file?: string): string | undefined {
  const [family, setFamily] = useState<string>();
  useEffect(() => {
    if (file) {
      const fam = 'BrandFile' + file.length;
      const face = new FontFace(fam, `url(${file})`);
      face.load().then((ff) => { document.fonts.add(ff); setFamily(fam); }).catch(() => setFamily(undefined));
      return;
    }
    if (!name) return setFamily(undefined);
    const id = 'gf-' + name.replace(/\s+/g, '-');
    if (!document.getElementById(id)) {
      const l = document.createElement('link');
      l.id = id;
      l.rel = 'stylesheet';
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;700;800&display=swap`;
      document.head.appendChild(l);
    }
    setFamily(`"${name}"`);
  }, [name, file]);
  return family;
}
const FORMAT_LABEL: Record<Fmt, string> = { reel: '9:16', square: '1:1', post: '4:5', wide: '16:9', thumb: '16:9 · 1280' };

type StudioTab = 'reels' | 'graphics' | 'voice' | 'instagram' | 'seo';
const STUDIO_TABS: StudioTab[] = ['reels', 'graphics', 'voice', 'instagram', 'seo'];

export function StudioView() {
  const t = useT();
  const route = useRoute();
  const q = route.query.get('tab') as StudioTab | null;
  const tab: StudioTab = q && STUDIO_TABS.includes(q) ? q : 'reels';
  const setTab = (v: StudioTab) => navigate(v === 'reels' ? '/studio' : `/studio?tab=${v}`);
  const { data } = useData<StudioInfo>('/api/studio', 4000);
  const install = useInstall();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const installing = data?.installing || (install && !install.done);

  const startInstall = async () => {
    setStudioProgress({ text: '', pct: 0.02, done: false });
    await api('/api/studio/install', { method: 'POST' }).catch((e) => toast((e as Error).message, 'error'));
  };

  return (
    <div className="page studio">
      <div className="studio-hero">
        <div className="studio-hero-art" aria-hidden>
          <span className="orb a" /><span className="orb b" /><span className="orb c" />
          <div className="strip">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ animationDelay: `${i * -0.6}s` }} />)}</div>
        </div>
        <div className="studio-hero-text">
          <span className="studio-kicker"><Clapperboard size={14} />ALTTER Studio</span>
          <h1>{t('studio.title')}</h1>
          <p>{t('studio.lead')}</p>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            {data?.ready ? (
              <span className="studio-pill ok"><Check size={14} />{t('studio.ready')}</span>
            ) : installing ? (
              <div style={{ minWidth: 280 }}><ProgressBar p={{ stage: 'install', pct: (install?.pct ?? 0.03) * 100 }} /></div>
            ) : (
              <button className="btn primary" onClick={startInstall}><Download />{t('studio.install')}</button>
            )}
            {!data?.ready && !installing && <span className="small faint">{t('studio.installHint')}</span>}
            {data?.error && !installing && <span className="small" style={{ color: 'var(--danger)' }}>{data.error}</span>}
          </div>
        </div>
      </div>

      <nav className="studio-tabs"><Tabs value={tab} onChange={setTab} tabs={[
        { value: 'reels', label: t('st.tab.reels'), icon: Film }, { value: 'graphics', label: t('st.tab.graphics'), icon: Paintbrush },
        { value: 'voice', label: t('st.tab.voice'), icon: Mic }, { value: 'instagram', label: t('st.tab.instagram'), icon: Camera }, { value: 'seo', label: t('st.tab.seo'), icon: SearchCheck },
      ]} /></nav>

      {tab === 'voice' && <VoicePane renders={data?.renders ?? []} />}
      {tab === 'instagram' && <InstagramPane />}
      {tab === 'seo' && <SeoPane />}
      {(tab === 'reels' || tab === 'graphics') && <>
      <h3 className="studio-h">{t(tab === 'reels' ? 'st.makeReels' : 'st.makeGraphics')}</h3>
      <div className="recipe-grid">
        {tab === 'graphics' && (
          <motion.button className="recipe" {...stagger(0)} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} onClick={() => navigate('/media')}>
            <div className="recipe-art" style={{ background: 'linear-gradient(135deg,#1d1f27,#7c5cff 55%,#2ee6ff)' }}><Sparkles className="recipe-icon" /><span className="recipe-fmt"><ImageIcon size={12} />AI</span></div>
            <b>{t('st.aiMedia')}</b>
            <span className="small muted">{t('st.aiMediaDesc')}</span>
          </motion.button>
        )}
        {RECIPES.filter((r) => (tab === 'graphics' ? r.still : !r.still)).map((r, i) => (
          <motion.button key={r.id} className="recipe" {...stagger(i)} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} onClick={() => setRecipe(r)}>
            <div className={`recipe-art ${r.id}`} style={{ background: r.grad }}>
              <r.icon className="recipe-icon" />
              <span className="recipe-fmt">{r.still ? <ImageIcon size={12} /> : <Film size={12} />}{FORMAT_LABEL[r.format]}</span>
            </div>
            <b>{t(`studio.r.${r.id}.name` as Key)}</b>
            <span className="small muted">{t(`studio.r.${r.id}.desc` as Key)}</span>
          </motion.button>
        ))}
      </div>

      <div className="studio-split">
        <Gallery renders={(data?.renders ?? []).filter((m) => (tab === 'graphics' ? m.kind === 'image' : m.kind !== 'image'))} />
        <BrandCard brand={data?.brand ?? {}} />
      </div>
      </>}

      <Brief recipe={recipe} brand={data?.brand ?? {}} onClose={() => setRecipe(null)} />
    </div>
  );
}

// ---------- brief → optimised prompt ----------

function Brief({ recipe, brand, onClose }: { recipe: Recipe | null; brand: Brand; onClose: () => void }) {
  const t = useT();
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<Fmt>('reel');
  const [seconds, setSeconds] = useState(15);
  const [theme, setTheme] = useState('midnight');
  const [all, setAll] = useState(false);
  const [files, setFiles] = useState<{ key: string; name: string; att?: Attachment; pct: number; error?: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const r = recipe;

  useEffect(() => {
    if (!r) return;
    setTopic('');
    setFormat(r.format);
    setSeconds(r.seconds ?? 15);
    setTheme(brand.theme || r.theme);
    setAll(false);
    setFiles([]);
  }, [r?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (list: FileList) => {
    for (const f of Array.from(list)) {
      const key = `${f.name}-${f.size}-${Math.random()}`;
      setFiles((x) => [...x, { key, name: f.name, pct: 0 }]);
      uploadFile(f, (pct) => setFiles((x) => x.map((y) => (y.key === key ? { ...y, pct } : y))))
        .then((att) => setFiles((x) => x.map((y) => (y.key === key ? { ...y, att, pct: 1 } : y))))
        .catch((e) => setFiles((x) => x.map((y) => (y.key === key ? { ...y, error: (e as Error).message } : y))));
    }
  };
  const uploading = files.some((f) => !f.att && !f.error);
  const ready = files.filter((f) => f.att).map((f) => f.att!);
  const needFiles = r?.files === 'need' && !ready.length;

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (!r || uploading || needFiles || (!topic.trim() && !ready.length)) return;
    // short and exact: the kit already knows how; the brief only says what
    const parts = [
      `${t(`studio.r.${r.id}.name` as Key)}: ${topic.trim() || t('studio.p.fromFiles')}`,
      [
        r.id !== 'photo' && t('studio.p.format', { format: all && !r.still ? '9:16 + 1:1 + 16:9' : FORMAT_LABEL[format] }),
        !r.still && !r.fixedLength && t('studio.p.seconds', { n: seconds }),
        r.id !== 'photo' && t('studio.p.style', { style: t(`studio.theme.${theme}` as Key) }),
      ].filter(Boolean).join(', ') + '.',
      t(`studio.r.${r.id}.ask` as Key),
    ];
    setPendingMessage(parts.join('\n'), { access: 'full', attachments: ready });
    onClose();
    navigate('/chat/new');
  };

  return (
    <Modal open={!!r} onClose={onClose}>
      {r && (
        <form onSubmit={go}>
          <ModalHead icon={<div className="brief-icon" style={{ background: r.grad }}><r.icon /></div>} title={t(`studio.r.${r.id}.name` as Key)} text={t(`studio.r.${r.id}.desc` as Key)} onClose={onClose} />
          <Field label={t('studio.f.topic')}>
            <textarea className="textarea" rows={3} autoFocus value={topic} placeholder={t(`studio.r.${r.id}.ph` as Key)} onChange={(e) => setTopic(e.target.value)} />
          </Field>
          {r.files && (
            <Field label={<>{t('studio.f.files')} {r.files === 'optional' && <span className="faint">({t('common.optional')})</span>}</>}>
              <input ref={fileRef} type="file" multiple hidden accept="image/*,video/*,audio/*" onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ''; }} />
              <div className="brief-files">
                {files.map((f) => (
                  <span key={f.key} className={`attach-chip${f.error ? ' err' : ''}`} title={f.error ?? f.name}>
                    <span className="truncate" style={{ maxWidth: 160 }}>{f.name}</span>
                    {!f.att && !f.error && <span className="faint small">{Math.round(f.pct * 100)}%</span>}
                    <button type="button" className="btn ghost icon sm" onClick={() => setFiles((x) => x.filter((y) => y.key !== f.key))}><X size={12} /></button>
                  </span>
                ))}
                <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}><Paperclip />{t('studio.f.addFiles')}</button>
              </div>
            </Field>
          )}
          {r.id !== 'photo' && (
            <Field label={t('studio.f.format')}>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <Segmented<Fmt> value={format} onChange={setFormat} options={(r.still ? (['post', 'square', 'reel', 'thumb'] as Fmt[]) : (['reel', 'square', 'post', 'wide'] as Fmt[])).map((f) => ({ value: f, label: FORMAT_LABEL[f] }))} />
                {!r.still && <div className="row small" style={{ gap: 8, cursor: 'pointer' }}><Switch on={all} onChange={setAll} label={t('studio.f.allFormats')} /><span onClick={() => setAll(!all)}>{t('studio.f.allFormats')}</span></div>}
              </div>
            </Field>
          )}
          {!r.still && !r.fixedLength && (
            <Field label={t('studio.f.length')}>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {[6, 10, 15, 30, 60].map((n) => (
                  <button type="button" key={n} className={`chip-btn${seconds === n ? ' active' : ''}`} onClick={() => setSeconds(n)}>{n} s</button>
                ))}
              </div>
            </Field>
          )}
          {r.id !== 'photo' && (
            <Field label={t('studio.f.style')}>
              <div className="theme-grid">
                {THEMES.map((th) => (
                  <button type="button" key={th.id} className={`theme-swatch${theme === th.id ? ' active' : ''}`} onClick={() => setTheme(th.id)}>
                    <span className="sw" style={{ background: th.colors[0] }}>
                      <i style={{ background: th.colors[1] }} />
                      <i style={{ background: th.colors[2] }} />
                    </span>
                    {t(`studio.theme.${th.id}` as Key)}
                    {theme === th.id && <motion.span layoutId="theme-ring" className="theme-ring" transition={spring} />}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <p className="small faint" style={{ margin: '4px 0 0' }}>{t('studio.fullNote')}</p>
          <div className="modal-foot">
            <button className="btn primary" disabled={uploading || needFiles || (!topic.trim() && !ready.length)}>
              {uploading ? <span className="spinner" /> : <Sparkles />}{t('studio.create')}<ArrowRight />
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------- renders ----------

function Gallery({ renders }: { renders: MediaItem[] }) {
  const t = useT();
  const [open, setOpen] = useState<MediaItem | null>(null);
  const { data: projects } = useData<Project[]>('/api/projects');
  const sourceProject = open?.folder ? projects?.find(p => p.folder === open.folder) : undefined;
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);
  const remove = async (m: MediaItem) => {
    if (!confirm(t('studio.deleteConfirm', { name: m.name }))) return;
    await api('/api/studio/renders', { method: 'DELETE', body: { url: m.url } });
    setCached<StudioInfo>('/api/studio', (s) => (s ? { ...s, renders: s.renders.filter((x) => x.url !== m.url) } : s!));
  };
  return (
    <div className="card studio-gallery">
      <div className="row" style={{ marginBottom: 12 }}>
        <Layers size={16} />
        <b className="grow">{t('studio.renders')}</b>
        <span className="small faint">{renders.length || ''}</span>
      </div>
      {renders.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>{t('studio.rendersEmpty')}</p>
      ) : (
        <div className="render-grid">
          {renders.map((m, i) => (
            <motion.div key={m.url} className="render-tile" role="button" tabIndex={0} aria-label={m.name} {...stagger(i)} onClick={() => setOpen(m)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault();setOpen(m); } }}>
              {m.kind === 'video' ? <video src={m.url} muted preload="metadata" onMouseEnter={(e) => e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => e.currentTarget.pause()} loop playsInline /> : m.kind === 'image' ? <img src={m.url} alt="" loading="lazy" /> : <div className="render-audio"><Film /></div>}
              <div className="render-meta">
                {m.kind === 'video' && <Play size={12} />}
                <span className="truncate">{m.name}</span>
              </div>
              <div className="render-actions" onClick={(e) => e.stopPropagation()}>
                <a className="btn icon sm" href={m.url} download={m.name} title={t('studio.download')}><Download size={14} /></a>
                <button className="btn icon sm danger" onClick={() => remove(m)} title={t('common.delete')}><Trash2 size={14} /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {open && (
          <motion.div className="lightbox" onClick={() => setOpen(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.94 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }} transition={softSpring} onClick={(e) => e.stopPropagation()} style={{ display: 'grid', placeItems: 'center' }}>
              {open.kind === 'video' ? <video src={open.url} controls autoPlay loop playsInline className="lightbox-media" /> : open.kind === 'audio' ? <audio src={open.url} controls autoPlay /> : <img src={open.url} alt={open.name} className="lightbox-media" />}
              <div className="row" style={{ marginTop: 12, gap: 8, maxWidth: '90vw' }}>
                <button type="button" className="btn sm" onClick={() => setOpen(null)} aria-label={t('common.close')}><X size={16} />{t('common.close')}</button>
                {sourceProject && <button type="button" className="btn sm" title={sourceProject.name} onClick={() => { setOpen(null);navigate(`/workspace/${sourceProject.id}`); }}><FolderKanban size={16} /><span className="truncate">{sourceProject.name}</span><ArrowRight size={16} /></button>}
              </div>
            </motion.div>
            <span className="lightbox-name">{open.name}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- brand kit ----------

function BrandCard({ brand }: { brand: Brand }) {
  const t = useT();
  const [b, setB] = useState<Brand>(brand);
  const [busy, setBusy] = useState(false);
  const [logoName, setLogoName] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);
  const fontRef = useRef<HTMLInputElement>(null);
  const [fontName, setFontName] = useState('');
  const [imageKey, setImageKey] = useState('');
  const previewFamily = usePreviewFont(b.display, b.fontFile);
  const bodyFamily = usePreviewFont(b.body);
  useEffect(() => setB(brand), [JSON.stringify(brand)]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    try {
      const saved = await api<Brand>('/api/studio/brand', { method: 'PUT', body: { ...b, hasImageKey: undefined, imageKey: imageKey || undefined } });
      setImageKey('');
      setCached<StudioInfo>('/api/studio', (s) => (s ? { ...s, brand: saved } : s!));
      toast(t('common.saved'), 'ok');
    } finally {
      setBusy(false);
    }
  };
  const uploadLogo = async (f: File) => {
    setLogoName(f.name);
    try {
      const att = await uploadFile(f);
      setB((x) => ({ ...x, logo: att.url }));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const uploadFont = async (f: File) => {
    if (!isFontFile(f.name)) return toast(t('studio.fontFileBad'), 'error');
    setFontName(f.name);
    try {
      const att = await uploadFile(f);
      setB((x) => ({ ...x, fontFile: att.url }));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const color = (k: 'accent' | 'accent2', fallback: string) => (
    <label className="brand-color">
      <input type="color" value={b[k] || fallback} onChange={(e) => setB({ ...b, [k]: e.target.value })} />
      <span className="mono small">{b[k] || '—'}</span>
    </label>
  );
  return (
    <div className="card studio-brand">
      <div className="row" style={{ marginBottom: 6 }}>
        <Paintbrush size={16} />
        <b className="grow">{t('studio.brand')}</b>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>{t('studio.brandLead')}</p>
      <div className="brand-preview" style={{ background: THEMES.find((x) => x.id === (b.theme || 'midnight'))?.colors[0] }}>
        {b.logo && <img src={b.logo} alt="" />}
        <div className="brand-type">
          <motion.span key={previewFamily} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ fontFamily: previewFamily || 'Inter', color: b.accent || '#7c5cff' }}>{b.name || 'ALTTER'}</motion.span>
          <small style={{ fontFamily: bodyFamily || previewFamily || 'Inter', color: THEMES.find((x) => x.id === (b.theme || 'midnight'))?.colors[0] === '#f3efe6' || b.theme === 'fresh' ? '#222' : '#ddd' }}>{t('studio.fontSample')}</small>
        </div>
        <i style={{ background: b.accent2 || b.accent || '#2ee6ff' }} />
      </div>
      <Field label={t('studio.brandName')}><input className="input" value={b.name ?? ''} onChange={(e) => setB({ ...b, name: e.target.value })} /></Field>
      <div className="grid-2">
        <Field label={t('studio.accent')}>{color('accent', '#7c5cff')}</Field>
        <Field label={t('studio.accent2')}>{color('accent2', '#2ee6ff')}</Field>
      </div>
      <datalist id="gfonts">{FONTS.map((f) => <option key={f} value={f} />)}</datalist>
      <div className="grid-2">
        <Field label={t('studio.font')}>
          <input className="input" list="gfonts" placeholder="Montserrat, Lobster…" value={b.fontFile ? '' : b.display ?? ''} disabled={!!b.fontFile} onChange={(e) => setB({ ...b, display: e.target.value })} />
        </Field>
        <Field label={t('studio.bodyFont')}>
          <input className="input" list="gfonts" placeholder="Inter" value={b.body ?? ''} onChange={(e) => setB({ ...b, body: e.target.value })} />
        </Field>
      </div>
      <Field label={t('studio.fontFile')}>
        <input ref={fontRef} type="file" accept=".ttf,.otf,.woff,.woff2" hidden onChange={(e) => e.target.files?.[0] && uploadFont(e.target.files[0])} />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn sm" onClick={() => fontRef.current?.click()}><Type />{b.fontFile ? t('studio.logoChange') : t('studio.fontUpload')}</button>
          {(fontName || b.fontFile) && <span className="small faint truncate">{fontName || b.fontFile?.split('/').pop()}</span>}
          {b.fontFile && <button type="button" className="btn ghost icon sm" onClick={() => { setB({ ...b, fontFile: '' }); setFontName(''); }}><X size={14} /></button>}
        </div>
      </Field>
      <div className="grid-2">
        <Field label={t('studio.imageKey')}>
          <div className="row" style={{ gap: 6 }}>
            <KeyRound size={15} className="faint" />
            <input className="input grow" type="password" placeholder={b.hasImageKey ? '••••••  ' + t('net.saved') : t('studio.imageKeyPh')} value={imageKey} onChange={(e) => setImageKey(e.target.value)} />
          </div>
        </Field>
        <Field label={t('studio.style')}>
          <select className="select" value={b.theme ?? ''} onChange={(e) => setB({ ...b, theme: e.target.value })}>
            <option value="">—</option>
            {THEMES.map((th) => <option key={th.id} value={th.id}>{t(`studio.theme.${th.id}` as Key)}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t('studio.logo')}>
        <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn sm" onClick={() => logoRef.current?.click()}><ImageIcon />{b.logo ? t('studio.logoChange') : t('studio.logoAdd')}</button>
          {(logoName || b.logo) && <span className="small faint truncate">{logoName || b.logo?.split('/').pop()}</span>}
          {b.logo && <button type="button" className="btn ghost icon sm" onClick={() => setB({ ...b, logo: '' })}><X size={14} /></button>}
        </div>
      </Field>
      <div className="studio-reels">
        <b className="small">{t('studio.reels')}</b>
        <p className="small muted" style={{ margin: '2px 0 8px' }}>{t('studio.reelsLead')}</p>
        <div className="grid-2">
          <Field label={t('studio.reelUse')}>
            <select className="select" value={b.reelUse ?? ''} onChange={(e) => setB({ ...b, reelUse: e.target.value })}>
              {(['', 'ad', 'fun', 'edu', 'personal'] as const).map((v) => <option key={v} value={v}>{t(`studio.reelUse.${v || 'ask'}` as Key)}</option>)}
            </select>
          </Field>
          <Field label={t('studio.swear')}>
            <select className="select" value={b.swear ?? ''} onChange={(e) => setB({ ...b, swear: e.target.value })}>
              {(['', 'none', 'mild', 'full'] as const).map((v) => <option key={v} value={v}>{t(`studio.swear.${v || 'ask'}` as Key)}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('studio.audience')}>
          <input className="input" placeholder={t('studio.audiencePh')} value={b.audience ?? ''} onChange={(e) => setB({ ...b, audience: e.target.value })} />
        </Field>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary sm" onClick={save} disabled={busy}>{busy && <span className="spinner" />}{t('common.save')}</button>
      </div>
    </div>
  );
}
