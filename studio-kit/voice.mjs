#!/usr/bin/env node
// Voice-overs: VoiceStudio (free, local, on this computer) or the user's ElevenLabs key (Settings → Plugins → ElevenLabs).
//   Engine: --engine voicestudio|elevenlabs, else ALTER_VOICE_ENGINE (Studio → Voice), else ElevenLabs when a key is set, else VoiceStudio.
//   node voice.mjs --text-file script.txt --out assets/<reel>/voice.mp3 [--voice "Brian" | <voice_id>] [--model eleven_multilingual_v2]
//                  [--stability 0.4] [--style 0.35] [--similarity 0.75] [--speed 1] [--lang pl] [--engine voicestudio]
//   node voice.mjs --list            (the voices this account can use)
// Writes the MP3 and, next to it, <out>.json = {duration, lines[{text,start,end}], words[{text,start,end}]} — exact
// timings from ElevenLabs (same shape as voice-times.mjs), so captions and scenes follow the voice.
// Neither VoiceStudio running nor a key: prints NO_VOICE_KEY and exits 3.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = {};
const rest = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  else rest.push(argv[i]);
}
const key = process.env.ALTER_ELEVENLABS_KEY || process.env.ELEVENLABS_API_KEY;
const VS = (process.env.ALTER_VOICESTUDIO_URL || 'http://127.0.0.1:3900/elevenlabs').replace(/\/+$/, '');
const vsPing = async () => { try { return (await fetch(`${VS}/health`, { signal: AbortSignal.timeout(2500) })).ok; } catch { return false; } };
// installed through ALTTER but asleep: wake it in the background (no window) and wait up to 90 s
const vsUp = async () => {
  if (await vsPing()) return true;
  const exe = process.env.ALTER_VOICESTUDIO_EXE;
  if (!exe || !existsSync(exe)) return false;
  console.log('Starting VoiceStudio in the background…');
  spawn(exe, ['--voicestudio-background'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  for (let i = 0; i < 45; i++) { await new Promise((r) => setTimeout(r, 2000)); if (await vsPing()) return true; }
  return false;
};
const want = typeof opt.engine === 'string' ? opt.engine : process.env.ALTER_VOICE_ENGINE || 'auto';
let engine = want === 'voicestudio' ? 'voicestudio' : want === 'elevenlabs' && key ? 'elevenlabs' : (await vsUp()) ? 'voicestudio' : key ? 'elevenlabs' : null;
if (engine === 'voicestudio' && want === 'voicestudio' && !(await vsPing()) && !(await vsUp())) engine = key ? 'elevenlabs' : null;
if (!engine) {
  console.error('NO_VOICE_KEY: no voice engine. Free and local: ask the user to open the VoiceStudio app (Studio → Voice in ALTTER shows how to get it), then run this again. Or connect ElevenLabs: put [[altter:connect:elevenlabs]] on its own line in your answer, then wait.');
  process.exit(3);
}
const NAME = engine === 'voicestudio' ? 'VoiceStudio' : 'ElevenLabs';
const API = engine === 'voicestudio' ? VS : 'https://api.elevenlabs.io';
const H = engine === 'voicestudio' ? {} : { 'xi-api-key': key };

async function voices() {
  if (engine === 'voicestudio') {
    const r = await fetch(`${VS}/v1/audio/voices`);
    if (!r.ok) throw new Error(`VoiceStudio voices: HTTP ${r.status}`);
    return ((await r.json()).voices ?? []).filter((v) => v.type !== 'openai_alias').map((v) => ({ id: v.voice_id ?? v.id, name: v.name, category: v.type, labels: {}, description: v.description ?? '' }));
  }
  const r = await fetch(`${API}/v1/voices`, { headers: H });
  if (r.status === 401) throw new Error(`${NAME} refused the key (${(await r.text()).slice(0, 160)}) — the key may lack the "Voices" permission or be wrong`);
  if (!r.ok) throw new Error(`${NAME} voices: HTTP ${r.status}`);
  return ((await r.json()).voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category, labels: v.labels ?? {}, description: v.description ?? '' }));
}

// no process.exit after network calls: on Windows it can abort while sockets close (exit 127)
async function main() {
  if (opt.list) {
    for (const v of await voices()) console.log(`${v.id}  ${v.name}  [${v.category}] ${Object.values(v.labels).join(', ')}`);
    return;
  }
  const text = (typeof opt['text-file'] === 'string' ? readFileSync(resolve(opt['text-file']), 'utf8') : typeof opt.text === 'string' ? opt.text : rest.join(' '))
    .replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  if (!text) {
    console.log('Usage: node voice.mjs --text-file script.txt --out voice.mp3 [--voice name|id] [--speed 1] | --list');
    process.exitCode = 1;
    return;
  }
  const out = resolve(typeof opt.out === 'string' ? opt.out : `assets/voice-${Date.now()}.mp3`);
  const num = (k, d) => (opt[k] !== undefined && !Number.isNaN(Number(opt[k])) ? Number(opt[k]) : d);

  // the voice: an id, a name from the account, or a calm narrator by default
  let voiceId = typeof opt.voice === 'string' && /^[A-Za-z0-9]{18,}$/.test(opt.voice) ? opt.voice : engine === 'voicestudio' && !opt.voice ? 'default' : null;
  if (!voiceId) {
    const list = await voices().catch(() => []);
    const want = typeof opt.voice === 'string' ? opt.voice.toLowerCase() : '';
    const pick = (want && list.find((v) => v.name.toLowerCase() === want || v.name.toLowerCase().startsWith(want)))
      || (!want && list.find((v) => /narrat|documentar|storytell/i.test(`${v.description} ${Object.values(v.labels).join(' ')}`)))
      || (!want && list.find((v) => /^(brian|george|daniel|adam)\b/i.test(v.name)))
      || (!want && list[0]);
    if (!pick && want) throw new Error(`No voice called "${opt.voice}" in ${NAME} — run with --list`);
    voiceId = pick?.id ?? (engine === 'voicestudio' ? 'default' : 'nPczCjzI2devNBz1zQrb'); // Brian: a deep, calm narrator (default ElevenLabs voice)
    console.log(`Voice: ${pick?.name ?? (engine === 'voicestudio' ? 'default' : 'Brian')} (${voiceId})`);
  }

  if (engine === 'voicestudio') return speakVoiceStudio(text, out, num);
  const body = {
    text,
    model_id: typeof opt.model === 'string' ? opt.model : 'eleven_multilingual_v2',
    voice_settings: { stability: num('stability', 0.4), similarity_boost: num('similarity', 0.75), style: num('style', 0.35), use_speaker_boost: true, speed: Math.max(0.7, Math.min(1.2, num('speed', 1))) },
  };
  if (typeof opt.lang === 'string' && /^[a-z]{2}$/.test(opt.lang)) body.language_code = opt.lang;
  console.log(`Reading ${text.split(/\s+/).length} words with ${NAME}…`);
  const r = await fetch(`${API}/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    if (/quota|credits|limit/i.test(t)) console.error(`NO_VOICE_CREDITS: ${t.slice(0, 240)} — the ElevenLabs plan has no characters left this month`);
    else if (r.status === 401) console.error(`NO_VOICE_KEY: ElevenLabs refused the key (${t.slice(0, 200)}). Ask the user to connect it again: [[altter:connect:elevenlabs]]`);
    else console.error(`${NAME}: HTTP ${r.status} ${t.slice(0, 300)}`);
    process.exitCode = /quota|credits|limit/i.test(t) ? 4 : r.status === 401 ? 3 : 1;
  } else {
  const j = await r.json();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(j.audio_base64, 'base64'));

  // character timings → words and lines (same shape as voice-times.mjs)
  const al = j.normalized_alignment ?? j.alignment;
  const words = [];
  const lines = [];
  if (al?.characters?.length) {
    const chars = al.characters, st = al.character_start_times_seconds, en = al.character_end_times_seconds;
    let w = null, line = null;
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
  const duration = words.length ? words[words.length - 1].end + 0.25 : 0;
  writeFileSync(out + '.json', JSON.stringify({ duration: +duration.toFixed(3), lines, words }, null, 1));
  console.log(`OUTPUT ${out}`);
  console.log(`TIMES ${out}.json  (${duration.toFixed(1)} s, ${words.length} words, ${lines.length} lines)`);
  }
}
// VoiceStudio: OpenAI-compatible /v1/audio/speech; word timings from ALTTER's local Whisper (voice-times.mjs, CPU)
async function speakVoiceStudio(text, out, num) {
  const voice = typeof opt.voice === 'string' ? opt.voice : 'default';
  const lang = typeof opt.lang === 'string' && /^[a-z]{2}$/.test(opt.lang) ? opt.lang : undefined;
  console.log(`Reading ${text.split(/s+/).length} words with VoiceStudio…`);
  const r = await fetch(`${VS}/v1/audio/speech`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'omnivoice', input: text, voice, speed: Math.max(0.7, Math.min(1.2, num('speed', 1))), response_format: 'mp3', ...(lang ? { language: lang } : {}) }) });
  if (!r.ok) { console.error(`VoiceStudio: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`); process.exitCode = 1; return; }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  const t = spawnSync(process.execPath, [join(import.meta.dirname, 'voice-times.mjs'), out, '--text', text, ...(lang ? ['--lang', lang] : [])], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  let times = { duration: 0, lines: [], words: [] };
  try { times = JSON.parse(t.stdout.slice(t.stdout.indexOf('{'))); } catch {}
  writeFileSync(out + '.json', JSON.stringify({ duration: times.duration, lines: times.lines, words: times.words }, null, 1));
  console.log(`OUTPUT ${out}`);
  console.log(`TIMES ${out}.json  (${Number(times.duration).toFixed(1)} s, ${times.words.length} words, ${times.lines.length} lines)`);
}

await main().catch((e) => { console.error(/refused the key/.test(e.message) ? `NO_VOICE_KEY: ${e.message}. Ask the user to connect it again: [[altter:connect:elevenlabs]]` : e.message); process.exitCode = 1; });
