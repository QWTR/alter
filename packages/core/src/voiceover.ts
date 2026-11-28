// Voice-over for reels: VoiceStudio (free, local, ElevenLabs-compatible API on 127.0.0.1:3900) by default,
// ElevenLabs when the user connected a key and picked it. Both speak the same API, so one code path records both.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, saveConfig, workspaceDir } from './config.ts';
import { nativeKey } from './plugins.ts';

export type VoiceEngine = 'auto' | 'voicestudio' | 'elevenlabs';
export const VOICESTUDIO_URL = (process.env.ALTER_VOICESTUDIO_URL || 'http://127.0.0.1:3900/elevenlabs').replace(/\/+$/, '');
export const VOICESTUDIO_DOWNLOAD = 'https://github.com/debpalash/VoiceStudio/releases/latest';
const ELEVEN = 'https://api.elevenlabs.io';

const elevenKey = () => process.env.ALTER_ELEVENLABS_KEY || nativeKey('elevenlabs', 'ELEVENLABS_API_KEY') || '';
export const voiceEngineSetting = (): VoiceEngine => {
  const v = (loadConfig() as any).voiceEngine;
  return v === 'voicestudio' || v === 'elevenlabs' ? v : 'auto';
};
/** Child processes (the studio kit's voice.mjs) read this to pick the same engine. */
export function exportVoiceEngine() { process.env.ALTER_VOICE_ENGINE = voiceEngineSetting(); process.env.ALTER_VOICESTUDIO_URL = VOICESTUDIO_URL; }
export function setVoiceEngine(engine: string): VoiceEngine {
  const v: VoiceEngine = engine === 'voicestudio' || engine === 'elevenlabs' ? engine : 'auto';
  const c = loadConfig() as any;
  c.voiceEngine = v;
  saveConfig();
  exportVoiceEngine();
  return v;
}

interface VoiceInfo { id: string; name: string; category?: string }
let vsCache: { at: number; up: boolean; voices: VoiceInfo[]; error?: string } = { at: 0, up: false, voices: [] };
/** Is the VoiceStudio app running on this computer, and which voices does it have? (cached 15 s) */
export async function voiceStudioStatus(force = false) {
  if (!force && Date.now() - vsCache.at < 15_000) return vsCache;
  try {
    const r = await fetch(`${VOICESTUDIO_URL}/v1/voices`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    const j = await r.json();
    vsCache = { at: Date.now(), up: true, voices: (j.voices ?? []).map((v: any) => ({ id: String(v.voice_id), name: String(v.name ?? v.voice_id), category: v.category })) };
  } catch (e) {
    vsCache = { at: Date.now(), up: false, voices: [], error: (e as Error).message };
  }
  return vsCache;
}
/** Last known state without waiting (for prompts built synchronously). */
export const voiceStudioUp = () => vsCache.up;

/** Which engine records right now: the user's choice, else ElevenLabs if connected, else VoiceStudio. */
export function activeEngine(): 'voicestudio' | 'elevenlabs' | null {
  const pref = voiceEngineSetting();
  const key = !!elevenKey();
  if (pref === 'elevenlabs') return key ? 'elevenlabs' : vsCache.up ? 'voicestudio' : null;
  if (pref === 'voicestudio') return 'voicestudio';
  return vsCache.up ? 'voicestudio' : key ? 'elevenlabs' : null;
}

export async function voiceoverStatus() {
  const vs = await voiceStudioStatus();
  return {
    engine: voiceEngineSetting(), active: activeEngine(), download: VOICESTUDIO_DOWNLOAD, url: VOICESTUDIO_URL.replace(/\/elevenlabs$/, ''),
    voicestudio: { up: vs.up, voices: vs.voices },
    elevenlabs: { connected: !!elevenKey() },
  };
}

/** Records `text` and saves voice-<time>.mp3 (+ .json word timings) in the Studio renders folder. */
export async function speak(o: { text: string; engine?: string; voice?: string; speed?: number; lang?: string }) {
  const text = String(o.text ?? '').replace(/\r/g, '').trim();
  if (!text) throw Error('Write the text to read.');
  if (text.length > 4000) throw Error('Up to 4000 characters at once.');
  await voiceStudioStatus(true);
  const engine = o.engine === 'elevenlabs' || o.engine === 'voicestudio' ? o.engine : activeEngine();
  if (!engine) throw Error('NO_VOICE: start VoiceStudio (free, local) or connect ElevenLabs.');
  if (engine === 'voicestudio' && !vsCache.up) throw Error('VoiceStudio is not running. Open the VoiceStudio app, then try again.');
  const key = elevenKey();
  if (engine === 'elevenlabs' && !key) throw Error('ElevenLabs is not connected (Settings → Plugins).');
  const base = engine === 'voicestudio' ? VOICESTUDIO_URL : ELEVEN;
  const voice = o.voice?.trim() || (engine === 'voicestudio' ? 'default' : 'nPczCjzI2devNBz1zQrb');
  const speed = Math.max(0.7, Math.min(1.2, Number(o.speed) || 1));
  const body: Record<string, unknown> = { text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true, speed } };
  if (o.lang && /^[a-z]{2}$/.test(o.lang)) body.language_code = o.lang;
  const r = await fetch(`${base}/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(engine === 'elevenlabs' ? { 'xi-api-key': key } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    let msg = t;
    try { const j = JSON.parse(t); msg = j.detail?.message ?? j.detail ?? t; } catch {}
    throw Error(`${engine === 'voicestudio' ? 'VoiceStudio' : 'ElevenLabs'}: HTTP ${r.status} ${String(msg).slice(0, 240)}`);
  }
  const j = await r.json();
  const dir = join(workspaceDir(), 'renders');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = join(dir, `voice-${stamp}.mp3`);
  writeFileSync(file, Buffer.from(j.audio_base64, 'base64'));
  const times = timings(j.normalized_alignment ?? j.alignment);
  writeFileSync(file + '.json', JSON.stringify(times, null, 1));
  return { engine, voice, file, duration: times.duration, words: times.words.length };
}

/** Character timings → words and lines (same shape as the studio kit's voice-times.mjs). */
export function timings(al: any) {
  const words: { text: string; start: number; end: number }[] = [];
  const lines: { text: string; start: number; end: number }[] = [];
  if (al?.characters?.length) {
    const chars: string[] = al.characters, st: number[] = al.character_start_times_seconds, en: number[] = al.character_end_times_seconds;
    type Span = { text: string; start: number; end: number };
    let w = null as Span | null, line = null as Span | null;
    const endWord = () => { if (w && w.text.trim()) words.push({ text: w.text.trim(), start: +w.start.toFixed(3), end: +w.end.toFixed(3) }); w = null; };
    const endLine = () => { if (line && line.text.trim()) lines.push({ text: line.text.trim(), start: +line.start.toFixed(3), end: +line.end.toFixed(3) }); line = null; };
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === '\n') { endWord(); endLine(); continue; }
      if (/\s/.test(c)) { endWord(); if (line) line.text += ' '; continue; }
      if (!w) w = { text: '', start: st[i], end: en[i] };
      if (!line) line = { text: '', start: st[i], end: en[i] };
      w.text += c; w.end = en[i];
      line.text += c; line.end = en[i];
    }
    endWord(); endLine();
  }
  const duration = words.length ? +(words[words.length - 1].end + 0.25).toFixed(3) : 0;
  return { duration, lines, words };
}
