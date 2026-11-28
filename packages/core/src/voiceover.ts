// Voice-over for reels: VoiceStudio (free, local, ElevenLabs-compatible API on 127.0.0.1:3900) by default,
// ElevenLabs when the user connected a key and picked it. Both speak the same API, so one code path records both.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, loadConfig, saveConfig, workspaceDir } from './config.ts';
import { nativeKey } from './plugins.ts';
import { ensureVoiceStudio, vsAppStatus, vsExe } from './voicestudioApp.ts';

export type VoiceEngine = 'auto' | 'voicestudio' | 'elevenlabs';
// VoiceStudio's OpenAI-compatible API (/v1/audio/speech, /v1/audio/voices, /v1/audio/transcriptions)
export const VOICESTUDIO_URL = (process.env.ALTER_VOICESTUDIO_URL || 'http://127.0.0.1:3900').replace(/\/+$/, '').replace(/\/elevenlabs$/, '');
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
    const r = await fetch(`${VOICESTUDIO_URL}/v1/audio/voices`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    const j = await r.json();
    // OpenAI aliases (alloy, ash…) all map to the engine's default voice: list only the user's own voices
    vsCache = { at: Date.now(), up: true, voices: (j.voices ?? []).filter((v: any) => v.type !== 'openai_alias').map((v: any) => ({ id: String(v.voice_id ?? v.id), name: String(v.name ?? v.voice_id), category: v.type })) };
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
  // installed through ALTTER counts as available: it is started on demand
  return vsCache.up || vsExe() ? 'voicestudio' : key ? 'elevenlabs' : null;
}

export async function voiceoverStatus() {
  const vs = await voiceStudioStatus();
  return {
    engine: voiceEngineSetting(), active: activeEngine(), download: VOICESTUDIO_DOWNLOAD, url: VOICESTUDIO_URL.replace(/\/elevenlabs$/, ''),
    voicestudio: { up: vs.up, voices: vs.voices, app: await vsAppStatus() },
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
  if (engine === 'voicestudio' && !vsCache.up) {
    if (!vsExe()) throw Error('VoiceStudio is not installed: Studio → Voice-over → Install.');
    if (!(await ensureVoiceStudio())) throw Error('VoiceStudio did not start — finish its one-time setup (Studio → Voice-over), then try again.');
    await voiceStudioStatus(true);
  }
  const key = elevenKey();
  if (engine === 'elevenlabs' && !key) throw Error('ElevenLabs is not connected (Settings → Plugins).');
  if (engine === 'voicestudio') return speakVoiceStudio(text, o);
  const base = ELEVEN;
  const voice = o.voice?.trim() || 'nPczCjzI2devNBz1zQrb';
  const speed = Math.max(0.7, Math.min(1.2, Number(o.speed) || 1));
  const body: Record<string, unknown> = { text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true, speed } };
  if (o.lang && /^[a-z]{2}$/.test(o.lang)) body.language_code = o.lang;
  const r = await fetch(`${base}/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'xi-api-key': key },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    let msg = t;
    try { const j = JSON.parse(t); msg = j.detail?.message ?? j.detail ?? t; } catch {}
    throw Error(`ElevenLabs: HTTP ${r.status} ${String(msg).slice(0, 240)}`);
  }
  const j = await r.json();
  const file = renderFile();
  writeFileSync(file, Buffer.from(j.audio_base64, 'base64'));
  const times = timings(j.normalized_alignment ?? j.alignment);
  writeFileSync(file + '.json', JSON.stringify(times, null, 1));
  return { engine, voice, file, duration: times.duration, words: times.words.length };
}

const renderFile = () => {
  const dir = join(workspaceDir(), 'renders');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return join(dir, `voice-${stamp}.mp3`);
};

/** VoiceStudio: the voice from /v1/audio/speech, word timings from its own Whisper (/v1/audio/transcriptions). */
async function speakVoiceStudio(text: string, o: { voice?: string; speed?: number; lang?: string }) {
  const voice = o.voice?.trim() || 'default';
  const speed = Math.max(0.7, Math.min(1.2, Number(o.speed) || 1));
  const lang = o.lang && /^[a-z]{2}$/.test(o.lang) ? o.lang : undefined;
  const r = await fetch(`${VOICESTUDIO_URL}/v1/audio/speech`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'omnivoice', input: text, voice, speed, response_format: 'mp3', ...(lang ? { language: lang } : {}) }),
    signal: AbortSignal.timeout(15 * 60_000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    let msg = t;
    try { const j = JSON.parse(t); msg = j.error?.message ?? j.detail?.message ?? j.detail ?? t; } catch {}
    throw Error(`VoiceStudio: HTTP ${r.status} ${String(msg).slice(0, 240)}`);
  }
  const audio = Buffer.from(await r.arrayBuffer());
  const file = renderFile();
  writeFileSync(file, audio);
  const times = await voiceStudioTimings(file, text, lang).catch(() => estimateTimings(text, 0));
  writeFileSync(file + '.json', JSON.stringify(times, null, 1));
  return { engine: 'voicestudio' as const, voice, file, duration: times.duration, words: times.words.length };
}

/** Word timings from ALTTER's own local Whisper (CPU, via the studio kit's voice-times.mjs) — VoiceStudio's
 *  recognition would load a second model onto the GPU next to the voice model and stall small cards. */
export async function voiceStudioTimings(file: string, script: string, lang?: string) {
  const tool = join(HOME, 'studio', 'voice-times.mjs');
  if (!existsSync(tool)) return estimateTimings(script, 0);
  const out = await new Promise<string>((resolve) => {
    execFile(process.execPath, [tool, file, '--text', script, ...(lang ? ['--lang', lang] : [])], { windowsHide: true, timeout: 5 * 60_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }, (_e, stdout) => resolve(String(stdout ?? '')));
  });
  try {
    const j = JSON.parse(out.slice(out.indexOf('{')));
    if (Array.isArray(j.words) && j.words.length) return { duration: +Number(j.duration || j.words[j.words.length - 1].end + 0.25).toFixed(3), lines: j.lines ?? [], words: j.words };
  } catch { /* fall through */ }
  return estimateTimings(script, 0);
}

type Span = { text: string; start: number; end: number };
/** Groups recognised words into the script's lines by word count (recognition can split words slightly differently). */
function linesFrom(script: string, words: Span[]): Span[] {
  const lines = script.split('\n').map((l) => l.trim()).filter(Boolean);
  const total = lines.reduce((s, l) => s + l.split(/\s+/).length, 0) || 1;
  const out: Span[] = [];
  let i = 0;
  lines.forEach((l, n) => {
    const take = n === lines.length - 1 ? words.length - i : Math.max(1, Math.round((l.split(/\s+/).length / total) * words.length));
    const chunk = words.slice(i, i + take);
    i += chunk.length;
    if (chunk.length) out.push({ text: l, start: chunk[0].start, end: chunk[chunk.length - 1].end });
  });
  return out;
}

/** Without recognition: spread the script over the clip by characters (good enough to cut scenes). */
function estimateTimings(script: string, duration: number) {
  const words: Span[] = [];
  const all = script.split(/\s+/).filter(Boolean);
  const chars = all.reduce((s, w) => s + w.length + 1, 0) || 1;
  const d = duration || chars / 14;
  let t = 0;
  for (const w of all) { const len = ((w.length + 1) / chars) * d; words.push({ text: w, start: +t.toFixed(3), end: +(t + len).toFixed(3) }); t += len; }
  return { duration: +d.toFixed(3), lines: linesFrom(script, words), words };
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
