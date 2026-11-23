#!/usr/bin/env node
// AI images for Alter Studio (Pollinations — free, no account; a key in ALTER_POLLINATIONS_KEY lifts the limits).
//   node gen-image.mjs "<what to show>" [--style photo] [--size 1080x1350 | --format post] [--n 1] [--seed 42] [--out ./assets/name.jpg]
// Styles add tested wording so short prompts still look good. The prompt is sent to pollinations.ai.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const STYLES = {
  photo: { p: 'professional photograph, natural light, sharp focus, realistic textures, 35mm, high detail', n: 'cartoon, illustration, text, watermark, blurry, deformed' },
  cinematic: { p: 'cinematic film still, dramatic lighting, shallow depth of field, anamorphic, color graded, atmospheric', n: 'cartoon, flat, text, watermark' },
  product: { p: 'studio product shot, seamless background, softbox lighting, crisp reflections, commercial photography, centered', n: 'clutter, text, watermark, hands' },
  food: { p: 'food photography, appetizing, soft window light, shallow depth of field, styled table, top quality', n: 'text, watermark, plastic look' },
  portrait: { p: 'portrait photography, soft key light, bokeh background, natural skin, 85mm lens', n: 'deformed face, extra fingers, text, watermark' },
  '3d': { p: '3d render, octane, soft global illumination, clay and glass materials, smooth shapes, pastel studio background', n: 'photo, text, watermark, noise' },
  isometric: { p: 'isometric 3d illustration, clean geometry, soft shadows, vibrant but harmonious colors, miniature diorama', n: 'photo, text, watermark, clutter' },
  flat: { p: 'flat vector illustration, bold simple shapes, limited palette, clean lines, modern editorial style', n: 'photo, 3d, gradient noise, text, watermark' },
  anime: { p: 'anime key visual, clean line art, vibrant cel shading, detailed background, studio quality', n: 'photo, 3d, text, watermark, deformed' },
  watercolor: { p: 'watercolor painting, soft washes, paper texture, delicate edges, artistic', n: 'photo, 3d, text, watermark' },
  neon: { p: 'neon cyberpunk scene, glowing lights, wet reflections, night, high contrast magenta and cyan', n: 'daylight, text, watermark' },
  minimal: { p: 'minimalist composition, lots of negative space, soft gradient background, elegant, calm', n: 'clutter, text, watermark' },
  poster: { p: 'graphic poster art, bold composition, striking colors, print texture, high impact', n: 'text, letters, watermark' },
  background: { p: 'abstract background, smooth gradients, soft light, subtle texture, no subject, wallpaper', n: 'text, people, objects, watermark' },
  logo: { p: 'simple flat vector logo mark, single centered symbol, solid colors, white background, minimal, iconic', n: 'text, letters, photo, 3d, gradient, watermark' },
  sticker: { p: 'die-cut sticker, thick white border, bold flat colors, cute, vector, centered', n: 'photo, background clutter, text, watermark' },
};
const FORMATS = { reel: [1080, 1920], story: [1080, 1920], square: [1080, 1080], post: [1080, 1350], wide: [1920, 1080], thumb: [1280, 720], banner: [1500, 500] };

const argv = process.argv.slice(2);
const opt = {};
const words = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  else words.push(argv[i]);
}
const what = words.join(' ').trim();
if (!what || opt.help) {
  console.log(`Usage: node gen-image.mjs "<what>" [--style ${Object.keys(STYLES).join('|')}] [--format ${Object.keys(FORMATS).join('|')} | --size WxH] [--n 1-4] [--seed N] [--out file.jpg]`);
  process.exit(what ? 0 : 1);
}
const style = STYLES[opt.style] ?? null;
let [w, h] = FORMATS[opt.format] ?? [1080, 1080];
if (typeof opt.size === 'string' && /^\d+x\d+$/.test(opt.size)) [w, h] = opt.size.split('x').map(Number);
// the service works best up to ~1.5 MP: keep the aspect, scale down if needed (upscale later in the kit if necessary)
const k = Math.min(1, Math.sqrt((1536 * 1536) / (w * h)));
w = Math.round((w * k) / 8) * 8;
h = Math.round((h * k) / 8) * 8;
const n = Math.max(1, Math.min(4, Number(opt.n) || 1));
const prompt = style ? `${what}, ${style.p}` : what;
const key = process.env.ALTER_POLLINATIONS_KEY;
const out0 = resolve(typeof opt.out === 'string' ? opt.out : `assets/${what.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-|-$/g, '') || 'image'}.jpg`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function one(i) {
  const seed = opt.seed ? Number(opt.seed) + i : Math.floor(Math.random() * 1e9);
  const q = new URLSearchParams({ width: String(w), height: String(h), seed: String(seed), model: typeof opt.model === 'string' ? opt.model : 'flux', nologo: 'true', enhance: opt.enhance ? 'true' : 'false' });
  if (style?.n) q.set('negative_prompt', style.n);
  if (key) q.set('token', key);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: key ? { authorization: `Bearer ${key}` } : {} }).catch((e) => ({ ok: false, status: 0, statusText: e.message }));
    if (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer());
      const file = n === 1 ? out0 : out0.replace(/(\.\w+)?$/, `-${i + 1}$1`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, buf);
      return { file, seed };
    }
    // free tier: one request at a time, ~15 s apart
    const wait = r.status === 429 || r.status === 402 ? 16_000 : 4000 * (attempt + 1);
    console.error(`  waiting ${Math.round(wait / 1000)} s (${r.status || ''} ${r.statusText || 'busy'})…`);
    await sleep(wait);
  }
  throw new Error('The image service did not answer. Try again in a minute, or design the graphic with the kit instead.');
}

console.log(`Generating ${n} image(s) ${w}×${h}${style ? ` · ${opt.style}` : ''}…`);
for (let i = 0; i < n; i++) {
  const r = await one(i);
  console.log(`OUTPUT ${r.file}  (seed ${r.seed})`);
  if (i < n - 1 && !key) await sleep(15_500);
}
