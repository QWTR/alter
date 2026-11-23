// Dictation on the computer, fully local: whisper.cpp (downloaded once from its GitHub releases)
// + a multilingual model from Hugging Face. The app sends 16 kHz mono WAV, gets text back.
// Phones use their own built-in recognition when they have it; this is the fallback for them too.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HOME, loadConfig } from './config.ts';
import { emit } from './events.ts';

const DIR = join(HOME, 'voice');
const MODELS: Record<string, { file: string; mb: number }> = {
  fast: { file: 'ggml-base-q5_1.bin', mb: 60 },
  good: { file: 'ggml-small-q5_1.bin', mb: 190 },
  best: { file: 'ggml-large-v3-turbo-q5_0.bin', mb: 574 },
};
const modelKey = () => {
  const k = (loadConfig() as any).voice?.model;
  return MODELS[k] ? k : 'good';
};

function findExe(dir: string, name = /^whisper-cli(.exe)?$/i): string | null {
  if (!existsSync(dir)) return null;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      const inner = findExe(p, name);
      if (inner) return inner;
    } else if (name.test(n)) return p;
  }
  return null;
}

export function voiceStatus() {
  const exe = findExe(join(DIR, 'bin'));
  const m = MODELS[modelKey()];
  return { supported: process.platform === 'win32', engine: !!exe, model: existsSync(join(DIR, m.file)), modelKey: modelKey(), modelMb: m.mb, busy: !!installing };
}

async function download(url: string, to: string, label: string, approxMb: number) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'alttter' } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) — ${label}`);
  const total = Number(res.headers.get('content-length')) || approxMb * 1e6;
  let got = 0;
  let last = 0;
  const part = to + '.part';
  const body = Readable.fromWeb(res.body as any);
  body.on('data', (c: Buffer) => {
    got += c.length;
    const pct = Math.min(99, Math.round((got / total) * 100));
    if (pct !== last) { last = pct; emit('voice.progress', { label, pct }); }
  });
  await pipeline(body, createWriteStream(part));
  renameSync(part, to);
}

let installing: Promise<void> | null = null;
/** Engine + model, once (about 200 MB with the default model). */
export function ensureVoice(): Promise<void> {
  if (process.platform !== 'win32') return Promise.reject(new Error('Local dictation is available on Windows; use your phone or browser recognition here.'));
  const st = voiceStatus();
  if (st.engine && st.model) return Promise.resolve();
  installing ??= (async () => {
    mkdirSync(DIR, { recursive: true });
    if (!st.engine) {
      const rel = (await (await fetch('https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=8', { headers: { 'user-agent': 'alttter' } })).json()) as { assets: { name: string; browser_download_url: string }[] }[];
      const asset = rel.flatMap((r) => r.assets ?? []).find((a) => a.name === 'whisper-blas-bin-x64.zip') ?? rel.flatMap((r) => r.assets ?? []).find((a) => a.name === 'whisper-bin-x64.zip');
      if (!asset) throw new Error('Could not find whisper.cpp for Windows');
      const zip = join(DIR, 'whisper.zip');
      await download(asset.browser_download_url, zip, 'whisper.cpp', 20);
      rmSync(join(DIR, 'bin'), { recursive: true, force: true });
      await new Promise<void>((resolve, reject) => {
        const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${join(DIR, 'bin')}' -Force`], { windowsHide: true });
        p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('Could not unpack whisper.cpp'))));
        p.on('error', reject);
      });
      unlinkSync(zip);
      if (!findExe(join(DIR, 'bin'))) throw new Error('whisper-cli.exe not found in the download');
    }
    const m = MODELS[modelKey()];
    if (!existsSync(join(DIR, m.file))) await download(`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${m.file}`, join(DIR, m.file), 'model', m.mb);
    emit('voice.progress', { label: 'ready', pct: 100 });
  })().finally(() => { installing = null; });
  return installing;
}

const LANG: Record<string, string> = { en: 'en', pl: 'pl', de: 'de', es: 'es', fr: 'fr', uk: 'uk' };

/** WAV (16 kHz mono PCM) → text. lang 'auto' lets whisper detect it. */
export async function transcribe(wav: Buffer, lang?: string): Promise<string> {
  if (wav.length < 3200) return '';
  await ensureVoice();
  const exe = findExe(join(DIR, 'bin'))!;
  const file = join(tmpdir(), `alttter-voice-${Date.now()}.wav`);
  writeFileSync(file, wav);
  const l = lang === 'auto' ? 'auto' : LANG[lang ?? loadConfig().language] ?? 'auto';
  try {
    const out = await new Promise<string>((resolve, reject) => {
      const p = spawn(exe, ['-m', join(DIR, MODELS[modelKey()].file), '-f', file, '-l', l, '-nt', '-np', '-t', String(Math.max(2, Math.min(8, (cpus().length || 4) - 1)))], { windowsHide: true });
      let o = '';
      let e = '';
      p.stdout.on('data', (c) => (o += c));
      p.stderr.on('data', (c) => (e += c));
      p.on('error', reject);
      p.on('exit', (c) => (c === 0 ? resolve(o) : reject(new Error(e.trim().split('\n').pop() || `whisper exit ${c}`))));
    });
    return out.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  } finally {
    try { unlinkSync(file); } catch {}
  }
}



