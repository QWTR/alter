#!/usr/bin/env node
// AI images for Alter Studio, made by an AI that really draws:
//   1. ChatGPT through the Codex app (signed in with ChatGPT; no key) — the default
//   2. Gemini (GEMINI_API_KEY / GOOGLE_API_KEY) · 3. OpenAI (OPENAI_API_KEY)
//   4. Pollinations (free, low quality) — only with --free
//   node gen-image.mjs "<what to show / change>" [--from frame.jpg] [--style 3d] [--format reel | --size 1080x1920] [--n 1-4] [--via codex|gemini|openai|free] [--out ./assets/name.png]
// Claude cannot draw: when Claude runs this, the picture is made by ChatGPT/Gemini.
// For animated 3D (story reels, characters that move) do NOT use images: build the scene with the kit's World (3D in code).
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const STYLES = {
  photo: 'professional photograph, natural light, sharp focus, realistic textures, 35mm, high detail',
  cinematic: 'cinematic film still, dramatic lighting, shallow depth of field, anamorphic, color graded, atmospheric',
  product: 'studio product shot, seamless background, softbox lighting, crisp reflections, commercial photography, centered',
  food: 'food photography, appetizing, soft window light, shallow depth of field, styled table',
  portrait: 'portrait photography, soft key light, bokeh background, natural skin, 85mm lens',
  '3d': 'stylized 3D animated film render, soft global illumination, rich colour, clean shapes, consistent characters',
  lowpoly: 'low-poly toy-like 3D render, blocky voxel characters, flat shading, bright daylight, simple geometry',
  isometric: 'isometric 3d illustration, clean geometry, soft shadows, vibrant harmonious colors, miniature diorama',
  flat: 'flat vector illustration, bold simple shapes, limited palette, clean lines, modern editorial style',
  anime: 'anime key visual, clean line art, vibrant cel shading, detailed background',
  watercolor: 'watercolor painting, soft washes, paper texture, delicate edges',
  neon: 'neon cyberpunk scene, glowing lights, wet reflections, night, magenta and cyan',
  minimal: 'minimalist composition, lots of negative space, soft gradient background, elegant, calm',
  poster: 'graphic poster art, bold composition, striking colors, print texture',
  background: 'abstract background, smooth gradients, soft light, subtle texture, no subject',
  logo: 'simple flat vector logo mark, single centered symbol, solid colors, white background, minimal',
  sticker: 'die-cut sticker, thick white border, bold flat colors, cute, vector, centered',
};
// the style engine's animation styles (styles.json): --style clay|anime|pixel|comic|bricks…
try {
  const extra = JSON.parse(readFileSync(new URL('./styles.json', import.meta.url), 'utf8')).styles;
  for (const x of extra) if (!STYLES[x.id] || ['3d', 'anime', 'flat', 'lowpoly'].includes(x.id)) STYLES[x.id] = x.image;
} catch {}
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
  console.log(`Usage: node gen-image.mjs "<what>" [--style ${Object.keys(STYLES).join('|')}] [--format ${Object.keys(FORMATS).join('|')} | --size WxH] [--n 1-4] [--via codex|gemini|openai|free] [--out file.png]`);
  process.exit(what ? 0 : 1);
}
let [w, h] = FORMATS[opt.format] ?? [1080, 1080];
if (typeof opt.size === 'string' && /^\d+x\d+$/.test(opt.size)) [w, h] = opt.size.split('x').map(Number);
const ratio = w / h;
const aspect = ratio < 0.7 ? '9:16' : ratio < 0.9 ? '4:5' : ratio > 1.6 ? '16:9' : ratio > 1.15 ? '3:2' : '1:1';
const orient = ratio < 0.9 ? `vertical ${aspect}` : ratio > 1.15 ? `horizontal ${aspect}` : 'square 1:1';
const n = Math.max(1, Math.min(4, Number(opt.n) || 1));
const style = STYLES[opt.style];
// --from <image>[,<image>]: edit / build on these pictures (a frame from the user's video, a product photo…)
const refs = typeof opt.from === 'string' ? opt.from.split(',').map((p) => resolve(p.trim())).filter((p) => existsSync(p)) : [];
if (typeof opt.from === 'string' && !refs.length) { console.error(`--from: file not found (${opt.from})`); process.exit(2); }
const keep = 'Keep the same people (faces, bodies, clothes), the same place, the same camera angle, lens and lighting, so it looks like a frame from the same video; photorealistic. Change only this: ';
// --restyle: redraw the reference picture in the style (same scene, people, poses and framing; a new look)
const restyle = refs.length && opt.restyle;
const prompt = restyle
  ? `Redraw this exact image as a new artwork: the same scene, the same people in the same poses and clothes, the same objects and the same camera framing and composition — only the visual style changes to: ${style ?? 'the requested style'}.${what ? ' ' + what : ''} Make it look like a frame from an animated film in that style. Composition: ${orient}. No text, letters or watermarks.`
  : refs.length
  ? `${keep}${what}${style ? `. Style: ${style}` : ''}. Composition: ${orient}. No added text, letters or watermarks.`
  : `${what}${style ? `. Style: ${style}` : ''}. Composition: ${orient}. No text, letters, logos or watermarks in the image unless asked.`;
const mimeOf = (p) => (/\.png$/i.test(p) ? 'image/png' : /\.webp$/i.test(p) ? 'image/webp' : 'image/jpeg');
const base = resolve(typeof opt.out === 'string' ? opt.out : `assets/${what.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-|-$/g, '') || 'image'}.png`);
const outFile = (i, ext) => (n === 1 ? base : base.replace(/(\.\w+)?$/, `-${i + 1}$1`)).replace(/\.\w+$/, '') + ext;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (i, buf, ext) => { const f = outFile(i, ext); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, buf); return f; };
const extOf = (mime) => (/png/.test(mime) ? '.png' : /webp/.test(mime) ? '.webp' : '.jpg');

// ---------- 1. ChatGPT via the Codex app ----------
function codexReady() {
  // `codex login status` prints to stderr
  const r = spawnSync('codex login status', { encoding: 'utf8', shell: true, timeout: 20_000, windowsHide: true });
  return /logged in/i.test(`${r.stdout ?? ''}${r.stderr ?? ''}`);
}
function viaCodex(i) {
  const work = mkdtempSync(join(tmpdir(), 'alter-img-'));
  const started = Date.now();
  const task = `${refs.length ? 'Edit the attached image with your image generation tool (it is the base / reference): ' : 'Use your image generation tool to create exactly one image: '}${prompt}\nThen copy the generated image file into the current directory as image.png. Reply only with the file path.`;
  return new Promise((res, rej) => {
    // the task goes in on stdin ("-"): no quoting trouble with the Windows shell
    const child = spawn(`codex exec --skip-git-repo-check --ephemeral -s workspace-write -C "${work}"${refs.map((r) => ` -i "${r}"`).join('')} -`, { shell: true, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let errText = '';
    child.stderr.on('data', (d) => { errText = (errText + d).slice(-2000); });
    const timer = setTimeout(() => child.kill(), 6 * 60_000);
    child.stdin.end(task);
    child.on('close', (code) => {
      clearTimeout(timer);
      const err = code ? { message: errText.trim().split('\n').pop() || `exit ${code}` } : null;
      let src = join(work, 'image.png');
      if (!existsSync(src)) {
        // the tool also keeps a copy here
        const gen = join(homedir(), '.codex', 'generated_images');
        let best = null;
        const walk = (d) => { try { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(png|jpe?g|webp)$/i.test(f.name)) { const m = statSync(p).mtimeMs; if (m >= started && (!best || m > best.m)) best = { p, m }; } } } catch {} };
        walk(gen);
        src = best?.p;
      }
      if (!src) { rmSync(work, { recursive: true, force: true }); return rej(new Error(`ChatGPT did not make an image${err ? `: ${String(err.message).split('\n')[0]}` : ''}`)); }
      const f = outFile(i, '.' + (src.split('.').pop() || 'png').toLowerCase());
      mkdirSync(dirname(f), { recursive: true });
      copyFileSync(src, f);
      rmSync(work, { recursive: true, force: true });
      res(f);
    });
  });
}

// ---------- 2. Gemini ----------
async function viaGemini(i) {
  const key = process.env.ALTER_GOOGLE_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const model = process.env.ALTER_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [...refs.map((r) => ({ inlineData: { mimeType: mimeOf(r), data: readFileSync(r).toString('base64') } })), { text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } }),
  });
  const j = await r.json().catch(() => ({}));
  const part = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!r.ok || !part) throw new Error(j?.error?.message ?? String(r.status));
  return save(i, Buffer.from(part.inlineData.data, 'base64'), extOf(part.inlineData.mimeType ?? ''));
}

// ---------- 3. OpenAI ----------
async function viaOpenai(i) {
  const size = ratio < 0.9 ? '1024x1536' : ratio > 1.15 ? '1536x1024' : '1024x1024';
  if (refs.length) {
    const form = new FormData();
    form.set('model', process.env.ALTER_OPENAI_IMAGE_MODEL || 'gpt-image-1');
    form.set('prompt', prompt);
    form.set('size', size);
    for (const r of refs) form.append('image[]', new Blob([readFileSync(r)], { type: mimeOf(r) }), basename(r));
    const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { authorization: `Bearer ${(process.env.ALTER_OPENAI_KEY || process.env.OPENAI_API_KEY)}` }, body: form });
    const j = await r.json().catch(() => ({}));
    const b64 = j?.data?.[0]?.b64_json;
    if (!r.ok || !b64) throw new Error(j?.error?.message ?? String(r.status));
    return save(i, Buffer.from(b64, 'base64'), '.png');
  }
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${(process.env.ALTER_OPENAI_KEY || process.env.OPENAI_API_KEY)}` },
    body: JSON.stringify({ model: process.env.ALTER_OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size, n: 1 }),
  });
  const j = await r.json().catch(() => ({}));
  const b64 = j?.data?.[0]?.b64_json;
  if (!r.ok || !b64) throw new Error(j?.error?.message ?? String(r.status));
  return save(i, Buffer.from(b64, 'base64'), '.png');
}

// ---------- 4. Pollinations (only when asked: --free) ----------
async function viaFree(i) {
  const k = Math.min(1, Math.sqrt((1536 * 1536) / (w * h)));
  const q = new URLSearchParams({ width: String(Math.round((w * k) / 8) * 8), height: String(Math.round((h * k) / 8) * 8), seed: String(Math.floor(Math.random() * 1e9)), model: 'flux', nologo: 'true' });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url).catch((e) => ({ ok: false, status: 0, statusText: e.message }));
    if (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')) return save(i, Buffer.from(await r.arrayBuffer()), '.jpg');
    await sleep(r.status === 429 || r.status === 402 ? 16_000 : 4000 * (attempt + 1));
  }
  throw new Error('The free image service did not answer.');
}

const available = [];
const via = typeof opt.via === 'string' ? opt.via : opt.free ? 'free' : null;
if (!via || via === 'codex') if (codexReady()) available.push(['ChatGPT', viaCodex, 3]);
if (!via || via === 'gemini') if (process.env.ALTER_GOOGLE_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) available.push(['Gemini', viaGemini, 4]);
if (!via || via === 'openai') if ((process.env.ALTER_OPENAI_KEY || process.env.OPENAI_API_KEY)) available.push(['OpenAI', viaOpenai, 4]);
if (via === 'free' && !refs.length) available.push(['Pollinations', viaFree, 1]);
if (!available.length) {
  console.error('NO_IMAGE_AI: no AI that can draw is connected. Ask the user to sign in to ChatGPT in ALTTER (Settings → AI → ChatGPT/Codex), or set GEMINI_API_KEY. Do NOT fall back to stock-looking pictures; for animated 3D build the scene in code with World instead.');
  process.exit(3);
}

console.log(`Generating ${n} image(s) ${aspect}${opt.style ? ` · ${opt.style}` : ''} with ${available[0][0]}…`);
let failed = 0;
async function make(i) {
  for (const [name, fn] of available) {
    try { const f = await fn(i); console.log(`OUTPUT ${f}  (${name})`); return; } catch (e) { console.error(`  ${name}: ${e.message}`); }
  }
  failed++;
}
// a few at a time (ChatGPT ~40 s per picture)
const par = available[0][2];
for (let i = 0; i < n; i += par) await Promise.all(Array.from({ length: Math.min(par, n - i) }, (_, j) => make(i + j)));
if (failed) { console.error(`${failed} image(s) failed.`); process.exit(failed === n ? 1 : 0); }
