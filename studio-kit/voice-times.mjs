#!/usr/bin/env node
// Timings of a voice-over (ElevenLabs MP3, a recording…) for cutting a video to it.
//   node voice-times.mjs <audio> [--text "the script, one sentence per line"] [--lang pl]
// Prints JSON: { duration, source: "whisper" | "estimate", words: [{text,start,end}], lines: [{text,start,end}] }.
// Uses ALTTER's local whisper (installed with dictation) for real word times; without it, spreads the given script
// over the audio's length by the number of characters (good enough to cut scenes, then fine-tune by ear).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const audio = args.find((a) => !a.startsWith('--') && !['--text', '--lang'].includes(args[args.indexOf(a) - 1]));
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
if (!audio || !existsSync(audio)) {
  console.error('usage: node voice-times.mjs <audio> [--text "script"] [--lang pl]');
  process.exit(1);
}
const here = import.meta.dirname;
const ff = (a) => spawnSync(process.execPath, [join(here, 'ff.mjs'), ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// length of the audio
let duration = 0;
try { const p = JSON.parse(ff(["probe", audio]).stdout); duration = Number(p.seconds ?? p.format?.duration ?? 0); } catch {}
if (!duration) {
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(ff(['-i', audio, '-f', 'null', '-']).stderr ?? '');
  if (m) duration = +m[1] * 3600 + +m[2] * 60 + +m[3];
}

const findExe = (dir) => {
  if (!existsSync(dir)) return null;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { const x = findExe(p); if (x) return x; } else if (/^whisper-cli(\.exe)?$/i.test(n)) return p;
  }
  return null;
};
const voiceDir = join(dirname(here), 'voice'); // ALTTER keeps dictation next to the studio
const exe = findExe(join(voiceDir, 'bin'));
const model = existsSync(voiceDir) ? readdirSync(voiceDir).filter((n) => /^ggml-.*\.bin$/.test(n)).sort((a, b) => statSync(join(voiceDir, b)).size - statSync(join(voiceDir, a)).size)[0] : null;

const lineSplit = (t) => t.split(/\n+|(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);

function estimate(text) {
  const lines = lineSplit(text);
  const total = lines.reduce((n, l) => n + l.length, 0) || 1;
  let t = 0.15;
  const span = Math.max(0.5, duration - 0.3);
  const outLines = [];
  const words = [];
  for (const l of lines) {
    const d = (l.length / total) * span;
    outLines.push({ text: l, start: +t.toFixed(2), end: +(t + d).toFixed(2) });
    const ws = l.split(/\s+/);
    const wl = ws.reduce((n, w) => n + w.length, 0) || 1;
    let wt = t;
    for (const w of ws) { const wd = (w.length / wl) * d; words.push({ text: w, start: +wt.toFixed(2), end: +(wt + wd).toFixed(2) }); wt += wd; }
    t += d;
  }
  return { words, lines: outLines };
}

let result = null;
if (exe && model) {
  const tmp = mkdtempSync(join(tmpdir(), 'vt-'));
  try {
    const wav = join(tmp, 'a.wav');
    ff(['-i', audio, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    const lang = opt('--lang') ?? 'auto';
    const r = spawnSync(exe, ['-m', join(voiceDir, model), '-f', wav, '-l', lang, '-ml', '1', '-sow', '-oj', '-of', join(tmp, 'out'), '-np'], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    const jf = join(tmp, 'out.json');
    if (r.status === 0 && existsSync(jf)) {
      const j = JSON.parse(readFileSync(jf, 'utf8'));
      const words = (j.transcription ?? []).map((s) => ({ text: String(s.text).trim(), start: +(s.offsets.from / 1000).toFixed(2), end: +(s.offsets.to / 1000).toFixed(2) })).filter((w) => w.text && !/^\[.*\]$/.test(w.text));
      // sentences: from the script when given (matched to the heard words in order), else split on punctuation
      const script = opt('--text');
      const lines = [];
      if (script) {
        let i = 0;
        for (const l of lineSplit(script)) {
          const n = l.split(/\s+/).length;
          const chunk = words.slice(i, i + n);
          if (chunk.length) lines.push({ text: l, start: chunk[0].start, end: chunk[chunk.length - 1].end });
          i += n;
        }
      } else {
        let cur = [];
        for (const w of words) {
          cur.push(w);
          if (/[.!?…]$/.test(w.text)) { lines.push({ text: cur.map((x) => x.text).join(' '), start: cur[0].start, end: w.end }); cur = []; }
        }
        if (cur.length) lines.push({ text: cur.map((x) => x.text).join(' '), start: cur[0].start, end: cur[cur.length - 1].end });
      }
      if (words.length) result = { duration: +duration.toFixed(2), source: 'whisper', words, lines };
    }
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}
if (!result) {
  const text = opt('--text');
  if (!text) {
    console.error('No local speech recognition here (turn on dictation in ALTTER Settings once). Pass the script with --text to estimate the timings.');
    console.log(JSON.stringify({ duration: +duration.toFixed(2), source: 'none', words: [], lines: [] }));
    process.exit(0);
  }
  result = { duration: +duration.toFixed(2), source: 'estimate', ...estimate(text) };
}
console.log(JSON.stringify(result));
