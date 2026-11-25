#!/usr/bin/env node
// Sound effects for edits, synthesised here (no downloads, no licences): WAV files.
//   node sfx.mjs <kind> [--out sfx/boom.wav] [--len 1.2] [--seed 3]
//   node sfx.mjs all [--dir sfx]          → every kind into the folder
// Kinds: boom (explosion) · hit (punch / impact) · whoosh (fast swipe) · riser (tension up) · drop (bass drop)
//        glitch · scratch (record scratch) · ding · pop · rumble (earthquake) · jet (engine roar) · fire (crackle) · siren · laser
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const SR = 44100;
const argv = process.argv.slice(2);
const opt = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  else pos.push(argv[i]);
}

let seed = Number(opt.seed ?? 7) >>> 0 || 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;
const clamp = (x) => Math.max(-1, Math.min(1, x));
/** one-pole low-pass state */
const lp = () => { let y = 0; return (x, a) => (y += a * (x - y)); };

const KINDS = {
  boom(len = 2.2) {
    const out = new Float32Array(Math.round(SR * len));
    const f1 = lp(), f2 = lp();
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      const env = Math.exp(-t * 2.2);
      const freq = 30 + 70 * Math.exp(-t * 6);
      ph += (2 * Math.PI * freq) / SR;
      const body = Math.sin(ph) * Math.exp(-t * 3) * 0.9;
      const crack = f1(noise(), 0.5) * Math.exp(-t * 18) * 0.9;
      const tail = f2(noise(), 0.04 + 0.1 * Math.exp(-t * 2)) * env * 2.2;
      out[i] = clamp(Math.tanh((body + crack + tail) * 1.6));
    }
    return out;
  },
  hit(len = 0.5) {
    const out = new Float32Array(Math.round(SR * len));
    const f = lp();
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (55 + 140 * Math.exp(-t * 30))) / SR;
      out[i] = clamp(Math.tanh((Math.sin(ph) * Math.exp(-t * 9) + f(noise(), 0.35) * Math.exp(-t * 40)) * 2));
    }
    return out;
  },
  whoosh(len = 0.7) {
    const out = new Float32Array(Math.round(SR * len));
    const f = lp(), g = lp();
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      const env = Math.sin(Math.PI * Math.pow(t, 0.7)) ** 2;
      const a = 0.02 + 0.25 * Math.sin(Math.PI * t);
      const lo = f(noise(), a);
      out[i] = clamp((lo - g(lo, 0.02)) * env * 3.2);
    }
    return out;
  },
  riser(len = 2) {
    const out = new Float32Array(Math.round(SR * len));
    const f = lp();
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      ph += (2 * Math.PI * (120 + 1400 * t * t)) / SR;
      out[i] = clamp((Math.sin(ph) * 0.35 + f(noise(), 0.05 + 0.5 * t) * 0.8) * Math.pow(t, 1.5));
    }
    return out;
  },
  drop(len = 1.6) {
    const out = new Float32Array(Math.round(SR * len));
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (40 + 160 * Math.exp(-t * 3))) / SR;
      out[i] = clamp(Math.tanh(Math.sin(ph) * 2.5) * Math.exp(-t * 1.8));
    }
    return out;
  },
  glitch(len = 0.6) {
    const out = new Float32Array(Math.round(SR * len));
    let hold = 0, v = 0;
    for (let i = 0; i < out.length; i++) {
      if (hold-- <= 0) { hold = Math.floor(rnd() * 900) + 30; v = rnd() < 0.3 ? 0 : noise(); }
      const square = Math.sign(Math.sin((i / SR) * 2 * Math.PI * (200 + 1800 * rnd() * (rnd() < 0.05 ? 1 : 0)))) * 0.2;
      out[i] = clamp((Math.round(v * 6) / 6) * 0.8 + square * (v ? 1 : 0));
    }
    return out;
  },
  scratch(len = 0.8) {
    const out = new Float32Array(Math.round(SR * len));
    const f = lp();
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      const speed = Math.sin(t * 2 * Math.PI * 3.2) * Math.exp(-t * 1.5);
      ph += speed * 0.03;
      out[i] = clamp(f(noise(), 0.05 + Math.abs(speed) * 0.6) * Math.abs(speed) * 3 + Math.sin(ph * 900) * Math.abs(speed) * 0.3);
    }
    return out;
  },
  ding(len = 1.4) {
    const out = new Float32Array(Math.round(SR * len));
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      out[i] = (Math.sin(2 * Math.PI * 1318 * t) * 0.5 + Math.sin(2 * Math.PI * 2637 * t) * 0.2 + Math.sin(2 * Math.PI * 1975 * t) * 0.15) * Math.exp(-t * 3.5);
    }
    return out;
  },
  pop(len = 0.25) {
    const out = new Float32Array(Math.round(SR * len));
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (300 + 900 * Math.exp(-t * 60))) / SR;
      out[i] = Math.sin(ph) * Math.exp(-t * 28);
    }
    return out;
  },
  rumble(len = 3) {
    const out = new Float32Array(Math.round(SR * len));
    const f = lp(), g = lp();
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      const env = Math.min(1, t * 6) * Math.min(1, (1 - t) * 4);
      out[i] = clamp(Math.tanh(g(f(noise(), 0.01), 0.3) * 18) * env * (0.7 + 0.3 * Math.sin(t * 40)));
    }
    return out;
  },
  jet(len = 3) {
    const out = new Float32Array(Math.round(SR * len));
    const f = lp(), g = lp();
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      const env = Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 5);
      ph += (2 * Math.PI * (300 + 2200 * Math.min(1, t * 1.5))) / SR;
      const roar = f(noise(), 0.08) * 2.2;
      const hiss = (noise() - g(noise(), 0.3)) * 0.25;
      out[i] = clamp((roar + hiss + Math.sin(ph) * 0.12) * env);
    }
    return out;
  },
  fire(len = 3) {
    const out = new Float32Array(Math.round(SR * len));
    const f = lp();
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      const env = Math.min(1, t * 8) * Math.min(1, (1 - t) * 6);
      const crackle = rnd() < 0.0009 ? noise() * 3 : 0;
      out[i] = clamp((f(noise(), 0.03) * 2.5 + crackle) * env);
    }
    for (let i = 1; i < out.length; i++) if (Math.abs(out[i]) > 0.9) for (let k = 1; k < 300 && i + k < out.length; k++) out[i + k] += out[i] * Math.exp(-k / 40) * 0.3;
    return out.map(clamp);
  },
  siren(len = 3) {
    const out = new Float32Array(Math.round(SR * len));
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (700 + 300 * Math.sin(t * 2 * Math.PI * 0.8))) / SR;
      out[i] = Math.tanh(Math.sin(ph) * 3) * 0.45 * Math.min(1, t * 8) * Math.min(1, (len - t) * 8);
    }
    return out;
  },
  laser(len = 0.45) {
    const out = new Float32Array(Math.round(SR * len));
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (2400 * Math.exp(-t * 9) + 200)) / SR;
      out[i] = Math.sign(Math.sin(ph)) * 0.35 * Math.exp(-t * 6);
    }
    return out;
  },
};

function wav(samples) {
  // normalise to -1 dBFS, 16-bit mono
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const g = peak > 0 ? 0.89 / peak : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(clamp(samples[i] * g) * 32767), 44 + i * 2);
  return buf;
}

const kind = pos[0];
if (!kind || opt.help || (kind !== 'all' && !KINDS[kind])) {
  console.log(`Usage: node sfx.mjs <${Object.keys(KINDS).join('|')}|all> [--out file.wav] [--dir folder] [--len seconds] [--seed n]`);
  process.exit(kind ? 1 : 0);
}
const make = (k, file) => {
  const f = resolve(file);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, wav(KINDS[k](opt.len ? Number(opt.len) : undefined)));
  console.log(`OUTPUT ${f}`);
};
if (kind === 'all') for (const k of Object.keys(KINDS)) make(k, join(typeof opt.dir === 'string' ? opt.dir : 'sfx', `${k}.wav`));
else make(kind, typeof opt.out === 'string' ? opt.out : `sfx/${kind}.wav`);
