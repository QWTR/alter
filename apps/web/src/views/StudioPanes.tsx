// Studio → Voice (VoiceStudio locally, or ElevenLabs) and Studio → Instagram (the agent researches,
// plans and makes reels; it never publishes without the user's "yes").
import { AudioLines, BarChart3, CalendarDays, CheckCircle2, Download, ExternalLink, Film, Flame, GalleryHorizontalEnd, Hash, Loader2, MessageCircle, Mic, RefreshCw, Repeat, Search, Sparkles, UserRoundSearch, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, invalidate, useData, type MediaItem } from '../api';
import { Segmented, toast } from '../components/ui';
import { ago, useT, type Key } from '../i18n';
import { navigate } from '../router';
import { setPendingMessage } from './Chat';

interface VoiceStatus {
  engine: 'auto' | 'voicestudio' | 'elevenlabs'; active: 'voicestudio' | 'elevenlabs' | null; download: string; url: string;
  voicestudio: { up: boolean; voices: { id: string; name: string }[] }; elevenlabs: { connected: boolean };
}
const LANGS = ['pl', 'en', 'de', 'es', 'fr', 'uk', 'it', 'pt', 'cs'];
const store = { get: (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} } };
const chat = (text: string) => { setPendingMessage(text, { access: 'full' }); navigate('/chat/new'); };

export function VoicePane({ renders }: { renders: MediaItem[] }) {
  const t = useT();
  const { data: st } = useData<VoiceStatus>('/api/voiceover', 15_000);
  const [text, setText] = useState(() => store.get('altter.voiceDraft'));
  const [voice, setVoice] = useState('');
  const [lang, setLang] = useState(() => store.get('altter.voiceLang') || 'pl');
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ media: MediaItem; duration: number; words: number; engine: string } | null>(null);
  useEffect(() => store.set('altter.voiceDraft', text), [text]);
  const engine = st?.active;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const setEngine = async (e: VoiceStatus['engine']) => {
    try { await api('/api/voiceover', { method: 'PUT', body: { engine: e } }); invalidate('/api/voiceover'); } catch (err) { toast((err as Error).message, 'error'); }
  };
  const record = async () => {
    setBusy(true); setLast(null);
    try {
      const r = await api<{ media: MediaItem; duration: number; words: number; engine: string }>('/api/voiceover/speak', { method: 'POST', body: { text, voice, lang, speed } });
      setLast(r); invalidate('/api/studio');
    } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  };
  const voices = renders.filter((m) => m.kind === 'audio');
  return (
    <div className="st-pane">
      <section className="st-card st-voice-engines">
        <div className="st-row-head">
          <div><h3>{t('sv.engine')}</h3><p className="small muted">{t('sv.engineLead')}</p></div>
          {st && <Segmented size="sm" value={st.engine} onChange={setEngine} options={[{ value: 'auto', label: t('sv.auto') }, { value: 'voicestudio', label: 'VoiceStudio' }, { value: 'elevenlabs', label: 'ElevenLabs' }]} />}
        </div>
        <div className="st-engines">
          <div className={`st-engine${engine === 'voicestudio' ? ' on' : ''}`}>
            <span className="st-engine-name"><Mic size={16} />VoiceStudio <span className="badge">{t('sv.free')}</span></span>
            <span className="small muted">{t('sv.vsLead')}</span>
            {st?.voicestudio.up
              ? <span className="st-ok small"><CheckCircle2 size={14} />{t('sv.vsUp', { n: st.voicestudio.voices.length })}</span>
              : <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <a className="btn primary sm" href={st?.download ?? 'https://github.com/debpalash/VoiceStudio/releases/latest'} target="_blank" rel="noopener noreferrer"><Download size={14} />{t('sv.get')}</a>
                  <button className="btn sm" onClick={() => invalidate('/api/voiceover')}><RefreshCw size={14} />{t('sv.check')}</button>
                  <span className="small faint">{t('sv.vsDown')}</span>
                </span>}
          </div>
          <div className={`st-engine${engine === 'elevenlabs' ? ' on' : ''}`}>
            <span className="st-engine-name"><AudioLines size={16} />ElevenLabs</span>
            <span className="small muted">{t('sv.elLead')}</span>
            {st?.elevenlabs.connected
              ? <span className="st-ok small"><CheckCircle2 size={14} />{t('sv.elOn')}</span>
              : <button className="btn sm" onClick={() => navigate('/settings?tab=plugins')}>{t('sv.elConnect')}</button>}
          </div>
        </div>
      </section>

      <section className="st-card">
        <h3>{t('sv.record')}</h3>
        <textarea className="input st-script" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('sv.scriptPh')} maxLength={4000} />
        <div className="st-voice-opts">
          <label className="small">{t('sv.voice')}
            {engine === 'voicestudio' && st?.voicestudio.voices.length
              ? <select className="input" value={voice} onChange={(e) => setVoice(e.target.value)}><option value="">{t('sv.defaultVoice')}</option>{st.voicestudio.voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
              : <input className="input" value={voice} onChange={(e) => setVoice(e.target.value)} placeholder={t('sv.defaultVoice')} />}
          </label>
          <label className="small">{t('sv.lang')}
            <select className="input" value={lang} onChange={(e) => { setLang(e.target.value); store.set('altter.voiceLang', e.target.value); }}>{LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}</select>
          </label>
          <label className="small">{t('sv.speed', { n: speed.toFixed(2) })}
            <input type="range" min={0.8} max={1.2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          </label>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn primary" disabled={busy || !text.trim() || !engine} onClick={record}>{busy ? <Loader2 size={15} className="spin" /> : <Mic size={15} />}{busy ? t('sv.recording') : t('sv.recordBtn')}</button>
          <span className="small faint">{t('sv.words', { n: words, s: Math.round(words / 2.5) })}</span>
          {!engine && <span className="small" style={{ color: 'var(--warn)' }}>{t('sv.noEngine')}</span>}
        </div>
        {last && (
          <div className="st-result">
            <audio controls src={last.media.url} />
            <span className="small muted">{t('sv.done', { s: last.duration.toFixed(1), n: last.words, engine: last.engine === 'voicestudio' ? 'VoiceStudio' : 'ElevenLabs' })}</span>
            <button className="btn sm" onClick={() => chat(t('sv.useInReel', { name: last.media.name }))}><Film size={14} />{t('sv.reel')}</button>
          </div>
        )}
      </section>

      {!!voices.length && (
        <section className="st-card">
          <h3>{t('sv.recent')}</h3>
          <div className="st-audio-list">
            {voices.slice(0, 12).map((m) => (
              <div key={m.url} className="st-audio">
                <span className="grow truncate small">{m.name}</span>
                <span className="small faint">{ago(new Date(m.mtime).toISOString())}</span>
                <audio controls preload="none" src={m.url} />
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="small faint">{t('sv.license')}</p>
    </div>
  );
}

// ---------- SEO ----------
interface SeoCheck { id: string; level: 'ok' | 'warn' | 'bad'; value?: string; weight: number }
interface SeoAudit { url: string; finalUrl: string; status: number; ms: number; score: number; title?: string; checks: SeoCheck[] }
const SEO_ACTIONS: { id: string; icon: typeof Search }[] = [
  { id: 'keywords', icon: Search }, { id: 'competitors', icon: BarChart3 }, { id: 'content', icon: CalendarDays }, { id: 'meta', icon: Hash },
];

export function SeoPane() {
  const t = useT();
  const [url, setUrl] = useState(() => store.get('altter.seoUrl'));
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SeoAudit | null>(null);
  useEffect(() => store.set('altter.seoUrl', url), [url]);
  const run = async () => {
    if (!url.trim()) return;
    setBusy(true); setRes(null);
    try { setRes(await api<SeoAudit>('/api/seo/audit', { method: 'POST', body: { url } })); } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  };
  const site = res?.finalUrl ?? (url.trim() || t('seo.mySite'));
  const fix = () => {
    if (!res) return;
    const issues = res.checks.filter((c) => c.level !== 'ok').map((c) => `- ${t(`seo.c.${c.id}` as Key)} [${c.level}]${c.value ? `: ${c.value}` : ''}`).join('\n');
    chat(t('seo.fixAsk', { url: res.finalUrl, score: res.score, issues }));
  };
  const order = { bad: 0, warn: 1, ok: 2 } as const;
  const tone = (s: number) => (s >= 85 ? 'ok' : s >= 60 ? 'warn' : 'bad');
  return (
    <div className="st-pane">
      <section className="st-card">
        <div><h3>{t('seo.title')}</h3><p className="small muted">{t('seo.lead')}</p></div>
        <form className="st-seo-form" onSubmit={(e) => { e.preventDefault(); void run(); }}>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" />
          <button className="btn primary" disabled={busy || !url.trim()}>{busy ? <Loader2 size={15} className="spin" /> : <Search size={15} />}{busy ? t('seo.running') : t('seo.run')}</button>
        </form>
      </section>
      {res && (
        <section className="st-card">
          <div className="st-row-head">
            <div className="st-seo-score">
              <span className={`st-seo-num ${tone(res.score)}`}>{res.score}</span>
              <div><b>{t('seo.score')}</b><p className="small muted truncate">{res.finalUrl} · HTTP {res.status} · {res.ms} ms</p></div>
            </div>
            <button className="btn primary sm" onClick={fix}><Sparkles size={14} />{t('seo.fix')}</button>
          </div>
          <div className="st-seo-list">
            {[...res.checks].sort((a, b) => order[a.level] - order[b.level]).map((c) => (
              <div key={c.id} className={`st-seo-row ${c.level}`}>
                <span className="st-seo-dot" aria-label={c.level} />
                <span className="grow"><b className="small">{t(`seo.c.${c.id}` as Key)}</b>{c.level !== 'ok' && <span className="small muted"> — {t(`seo.h.${c.id}` as Key)}</span>}</span>
                {c.value && <span className="small faint truncate st-seo-val">{c.value}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
      <h3 className="studio-h">{t('seo.more')}</h3>
      <div className="st-ig-grid">
        {SEO_ACTIONS.map((a) => (
          <button key={a.id} className="st-ig-card" onClick={() => chat(`SEO — ${t(`seo.a.${a.id}.name` as Key)}.\n${t(`seo.a.${a.id}.ask` as Key, { url: site })}`)}>
            <span className="st-ig-icon st-seo-icon"><a.icon size={18} /></span>
            <b>{t(`seo.a.${a.id}.name` as Key)}</b>
            <span className="small muted">{t(`seo.a.${a.id}.desc` as Key)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Instagram ----------
const IG_ACTIONS: { id: string; icon: typeof Search }[] = [
  { id: 'audit', icon: UserRoundSearch }, { id: 'hooks', icon: Zap }, { id: 'viral', icon: Flame }, { id: 'plan', icon: CalendarDays },
  { id: 'reel', icon: Film }, { id: 'caption', icon: Hash }, { id: 'carousel', icon: GalleryHorizontalEnd }, { id: 'reply', icon: MessageCircle },
  { id: 'repurpose', icon: Repeat }, { id: 'stats', icon: BarChart3 },
];
const IG_AUTOS = ['weekly', 'daily', 'working', 'comments'] as const;

export function InstagramPane() {
  const t = useT();
  const [handle, setHandle] = useState(() => store.get('altter.igHandle'));
  const [niche, setNiche] = useState(() => store.get('altter.igNiche'));
  useEffect(() => store.set('altter.igHandle', handle), [handle]);
  useEffect(() => store.set('altter.igNiche', niche), [niche]);
  const who = { handle: handle.trim() || t('ig.myAccount'), niche: niche.trim() || t('ig.myNiche') };
  const go = (id: string) => chat(`Instagram — ${t(`ig.a.${id}.name` as Key)}.\n${t(`ig.a.${id}.ask` as Key, who)}\n${t('ig.rules')}`);
  const auto = (id: string) => chat(`Instagram — ${t('ig.autoAsk', { name: t(`ig.auto.${id}.name` as Key) })}\n${t(`ig.auto.${id}.ask` as Key, who)}`);
  return (
    <div className="st-pane">
      <section className="st-card st-ig-head">
        <div>
          <h3>{t('ig.title')}</h3>
          <p className="small muted">{t('ig.lead')}</p>
        </div>
        <div className="st-ig-inputs">
          <label className="small">{t('ig.handle')}<input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@" /></label>
          <label className="small">{t('ig.niche')}<input className="input" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder={t('ig.nichePh')} /></label>
        </div>
      </section>
      <h3 className="studio-h">{t('ig.do')}</h3>
      <div className="st-ig-grid">
        {IG_ACTIONS.map((a) => (
          <button key={a.id} className="st-ig-card" onClick={() => go(a.id)}>
            <span className="st-ig-icon"><a.icon size={18} /></span>
            <b>{t(`ig.a.${a.id}.name` as Key)}</b>
            <span className="small muted">{t(`ig.a.${a.id}.desc` as Key)}</span>
          </button>
        ))}
      </div>
      <h3 className="studio-h">{t('ig.autos')}</h3>
      <div className="st-ig-autos">
        {IG_AUTOS.map((id) => (
          <div key={id} className="st-card st-ig-auto">
            <span className="row" style={{ gap: 8 }}><Sparkles size={15} className="muted" /><b>{t(`ig.auto.${id}.name` as Key)}</b></span>
            <span className="small muted">{t(`ig.auto.${id}.desc` as Key)}</span>
            <button className="btn sm" onClick={() => auto(id)}>{t('ig.set')}</button>
          </div>
        ))}
      </div>
      <p className="small faint">{t('ig.never')} <a href="#/automations" className="small">{t('ig.seeAutos')}<ExternalLink size={11} /></a></p>
    </div>
  );
}
