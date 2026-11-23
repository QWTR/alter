// Voice: dictate into the composer, or talk with ALTTER hands-free (it listens, answers out loud,
// listens again). Phones/browsers with built-in recognition use it (live words as you speak);
// the desktop app records and transcribes locally with whisper.cpp in ALTTER's core.
import { AnimatePresence, motion } from 'motion/react';
import { AudioLines, Loader2, Mic, Square, Volume2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, token } from '../api';
import { useT } from '../i18n';
import { desktop } from './TitleBar';
import { toast } from './ui';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
/** Built-in recognition works in phone browsers and Chrome/Edge; not inside the desktop app (no Google key there). */
const useBrowserSR = () => !!SR && !desktop;
const LOCALE: Record<string, string> = { en: 'en-US', pl: 'pl-PL', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', uk: 'uk-UA' };

// ---------- recording → 16 kHz mono WAV ----------
function wav16k(buf: AudioBuffer): Blob {
  const data = buf.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, 16000, true);
  out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return new Blob([out.buffer], { type: 'audio/wav' });
}
async function toWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return wav16k(await off.startRendering());
}

/** Speech → text. onText gets live (interim) text when the engine supports it, and the final text. */
export function useVoice(lang: string) {
  const t = useT();
  const [state, setState] = useState<VoiceState>('idle');
  const [level, setLevel] = useState(0);
  const [interim, setInterim] = useState('');
  const stopRef = useRef<(() => void) | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const listen = useCallback(
    (opts: { autoStop?: boolean } = {}): Promise<string> =>
      new Promise((resolve, reject) => {
        setInterim('');
        if (useBrowserSR()) {
          const rec = new SR();
          rec.lang = LOCALE[lang] ?? navigator.language;
          rec.interimResults = true;
          rec.continuous = !opts.autoStop;
          let finalText = '';
          rec.onresult = (e: any) => {
            let live = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
              else live += e.results[i][0].transcript;
            }
            setInterim((finalText + live).trim());
            setLevel(0.4 + Math.random() * 0.6);
          };
          rec.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') reject(new Error(e.error)); };
          rec.onend = () => { setLevel(0); setState('idle'); resolve(finalText.trim()); };
          stopRef.current = () => rec.stop();
          cancelRef.current = () => { finalText = ''; rec.abort(); };
          setState('listening');
          rec.start();
          return;
        }
        // record locally, transcribe in the core
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((stream) => {
          const rec = new MediaRecorder(stream);
          const chunks: Blob[] = [];
          const ctx = new AudioContext();
          const an = ctx.createAnalyser();
          an.fftSize = 512;
          ctx.createMediaStreamSource(stream).connect(an);
          const buf = new Uint8Array(an.fftSize);
          let spoke = false;
          let quietSince = performance.now();
          let cancelled = false;
          let raf = 0;
          const started = performance.now();
          const tick = () => {
            an.getByteTimeDomainData(buf);
            let sum = 0;
            for (const v of buf) sum += ((v - 128) / 128) ** 2;
            const rms = Math.sqrt(sum / buf.length);
            setLevel(Math.min(1, rms * 6));
            const now = performance.now();
            if (rms > 0.04) { spoke = true; quietSince = now; }
            // hands-free: stop after ~1.3 s of quiet once you've said something (or 8 s of nothing)
            if (opts.autoStop && ((spoke && now - quietSince > 1300) || (!spoke && now - started > 8000))) return stop();
            if (now - started > 120_000) return stop();
            raf = requestAnimationFrame(tick);
          };
          const cleanup = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((tr) => tr.stop()); ctx.close().catch(() => {}); setLevel(0); };
          const stop = () => { if (rec.state !== 'inactive') rec.stop(); };
          rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          rec.onstop = async () => {
            cleanup();
            if (cancelled || !spoke) { setState('idle'); return resolve(''); }
            setState('thinking');
            try {
              const wav = await toWav(new Blob(chunks, { type: rec.mimeType }));
              const r = await fetch(`/api/voice/transcribe?lang=${encodeURIComponent(lang)}`, { method: 'POST', headers: { authorization: `Bearer ${token ?? ''}`, 'content-type': 'audio/wav' }, body: wav });
              const j = await r.json();
              if (!r.ok) throw new Error(j.error || 'transcription failed');
              setState('idle');
              resolve(String(j.text ?? ''));
            } catch (e) {
              setState('idle');
              reject(e);
            }
          };
          stopRef.current = stop;
          cancelRef.current = () => { cancelled = true; stop(); };
          setState('listening');
          rec.start(250);
          raf = requestAnimationFrame(tick);
        }).catch(() => reject(new Error(t('voice.noMic'))));
      }),
    [lang, t],
  );

  const stop = () => stopRef.current?.();
  const cancel = () => { cancelRef.current?.(); window.speechSynthesis?.cancel(); setState('idle'); };

  /** Reads an answer out loud (markdown, code and cards left out). */
  const speak = useCallback((text: string) => new Promise<void>((resolve) => {
    const clean = text
      .replace(/```[\s\S]*?(```|$)/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#*_>`|~]/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 900);
    if (!clean || !window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(clean);
    const want = LOCALE[lang] ?? navigator.language;
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(want.slice(0, 2).toLowerCase()));
    u.voice = voices.find((v) => /natural|online|neural/i.test(v.name)) ?? voices[0] ?? null;
    u.lang = want;
    u.rate = 1.04;
    u.onend = u.onerror = () => { setState('idle'); setLevel(0); resolve(); };
    u.onboundary = () => setLevel(0.3 + Math.random() * 0.7);
    setState('speaking');
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }), [lang]);

  return { state, level, interim, listen, stop, cancel, speak };
}

/** First use on the computer downloads the dictation engine — show it instead of failing silently. */
export async function ensureLocalVoice(t: ReturnType<typeof useT>): Promise<boolean> {
  if (useBrowserSR()) return true;
  const st = await api<{ supported: boolean; engine: boolean; model: boolean; modelMb: number }>('/api/voice');
  if (!st.supported) { toast(t('voice.unsupported'), 'error'); return false; }
  if (st.engine && st.model) return true;
  await api('/api/voice/install', { method: 'POST' });
  toast(t('voice.installing', { mb: st.modelMb + 20 }), 'info');
  return false;
}

export function VoiceBars({ level, state }: { level: number; state: VoiceState }) {
  return (
    <span className={`voice-bars ${state}`} aria-hidden>
      {[0.55, 0.85, 1, 0.7, 0.45].map((k, i) => (
        <motion.i key={i} animate={{ scaleY: state === 'thinking' ? [0.3, 0.8, 0.3] : Math.max(0.18, level * k) }} transition={state === 'thinking' ? { repeat: Infinity, duration: 0.9, delay: i * 0.1 } : { type: 'spring', stiffness: 500, damping: 22 }} />
      ))}
    </span>
  );
}

/** The strip above the composer while talking. */
export function VoiceStrip({ state, level, interim, conversation, onStop, onCancel }: { state: VoiceState; level: number; interim: string; conversation: boolean; onStop: () => void; onCancel: () => void }) {
  const t = useT();
  const show = state !== 'idle' || conversation;
  const label = state === 'listening' ? t('voice.listening') : state === 'thinking' ? t('voice.thinking') : state === 'speaking' ? t('voice.speaking') : t('voice.waiting');
  return (
    <AnimatePresence>
      {show && (
        <motion.div className={`voice-strip ${state}`} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
          <div className="voice-orb">
            <motion.span className="ring" animate={{ scale: 1 + level * 0.6, opacity: 0.25 + level * 0.5 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} />
            {state === 'thinking' ? <Loader2 className="spin" size={16} /> : state === 'speaking' ? <Volume2 size={16} /> : conversation ? <AudioLines size={16} /> : <Mic size={16} />}
          </div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="voice-label">{label}{conversation && <span className="faint"> · {t('voice.conversation')}</span>}</div>
            <div className="voice-text truncate">{interim || (state === 'listening' ? t('voice.speakNow') : '')}</div>
          </div>
          <VoiceBars level={level} state={state} />
          {state === 'listening' && !conversation && <button type="button" className="btn primary sm" onClick={onStop}><Square size={12} fill="currentColor" />{t('voice.done')}</button>}
          <button type="button" className="btn ghost icon sm" onClick={onCancel} title={t('voice.end')}><X size={15} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
