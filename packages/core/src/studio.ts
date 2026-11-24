// ALTTER Studio: motion graphics, 3D, video edits and graphics made from code.
// A ready kit (Remotion + three.js + ffmpeg) is installed once into ~/.alter/studio; the AI only writes a short
// scene file with ready components and runs one render command — far fewer tokens than building a video from scratch.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { HOME, loadConfig, saveConfig, workspaceDir, generatedDir } from './config.ts';
import { emit } from './events.ts';
import { getUpload, sendFileRange } from './uploads.ts';

export const studioDir = () => join(HOME, 'studio');
const kitDir = () => process.env.ALTER_STUDIO_KIT_DIR ?? resolve(import.meta.dirname, '../../../studio-kit');

export interface Brand { accent?: string; accent2?: string; display?: string; body?: string; logo?: string; theme?: string; name?: string; fontFile?: string; imageKey?: string }

export const getBrand = (): Brand => ((loadConfig() as any).brand ?? {}) as Brand;
/** What the UI sees: the image key only as set / not set. */
export const publicBrand = () => {
  const { imageKey, ...b } = getBrand();
  return { ...b, hasImageKey: !!imageKey };
};
/** The AI CLIs inherit this process's environment: gen-image.mjs picks the key up from there. */
export function shareImageKey() {
  const k = getBrand().imageKey;
  if (k) process.env.ALTER_POLLINATIONS_KEY = k;
  else delete process.env.ALTER_POLLINATIONS_KEY;
}
export function setBrand(b: Brand): Brand {
  const clean: Brand = {};
  for (const k of ['accent', 'accent2', 'display', 'body', 'logo', 'theme', 'name', 'fontFile', 'imageKey'] as const) if (typeof b[k] === 'string' && b[k]!.trim()) clean[k] = b[k]!.trim().slice(0, 300);
  if (b.imageKey === '') delete clean.imageKey;
  else if (!clean.imageKey && getBrand().imageKey) clean.imageKey = getBrand().imageKey; // the UI never gets the key back
  (loadConfig() as any).brand = clean;
  saveConfig();
  shareImageKey();
  return clean;
}

// ---------- install ----------

const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const kitStamp = () => {
  try {
    return hash(readFileSync(join(kitDir(), 'package.json'), 'utf8') + readFileSync(join(kitDir(), 'kit.json'), 'utf8'));
  } catch {
    return null;
  }
};
const pkgStamp = (dir: string) => {
  try { return hash(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { return null; }
};

let installing: Promise<void> | null = null;
let lastError: string | null = null;

export function studioStatus() {
  const dir = studioDir();
  const ready = existsSync(join(dir, 'node_modules', '@remotion', 'renderer')) && readStamp(dir, '.installed') === pkgStamp(dir);
  return { dir, ready, installing: !!installing, upToDate: readStamp(dir, '.kit') === kitStamp(), error: lastError, kitFound: kitStamp() !== null };
}
function readStamp(dir: string, name: string) {
  try { return readFileSync(join(dir, name), 'utf8').trim(); } catch { return null; }
}

/** Copies the kit (when it changed) and installs its packages (first time / when they changed). */
export function ensureStudio(onStep?: (text: string, pct?: number) => void): Promise<void> {
  if (installing) return installing;
  const st = studioStatus();
  if (st.ready && st.upToDate) {
    fetchFullFfmpeg();
    return Promise.resolve();
  }
  const step = (text: string, pct?: number) => {
    onStep?.(text, pct);
    emit('studio.progress', { text, pct, done: false });
  };
  installing = (async () => {
    const dir = studioDir();
    const kit = kitDir();
    if (!existsSync(join(kit, 'package.json'))) throw new Error(`Studio kit missing (${kit})`);
    mkdirSync(dir, { recursive: true });
    if (readStamp(dir, '.kit') !== kitStamp()) {
      step('Studio: copying the motion kit', 0.05);
      cpSync(kit, dir, { recursive: true, force: true, filter: (src) => !/[\\/]node_modules([\\/]|$)/.test(src) });
      writeFileSync(join(dir, '.kit'), kitStamp()!);
    }
    if (!(existsSync(join(dir, 'node_modules', '@remotion', 'renderer')) && readStamp(dir, '.installed') === pkgStamp(dir))) {
      step('Studio: installing Remotion, three.js and ffmpeg (one time, about a minute)', 0.1);
      await npmInstall(dir, (pct) => step('Studio: installing Remotion, three.js and ffmpeg (one time, about a minute)', 0.1 + pct * 0.85));
      writeFileSync(join(dir, '.installed'), pkgStamp(dir)!);
    }
    lastError = null;
    emit('studio.progress', { text: 'ready', pct: 1, done: true });
    fetchFullFfmpeg();
  })()
    .catch((e) => {
      lastError = (e as Error).message;
      emit('studio.progress', { text: lastError, done: true, error: true });
      throw e;
    })
    .finally(() => {
      installing = null;
    });
  return installing;
}

/**
 * Remotion's own ffmpeg can cut, join, scale and crop but has no colour/speed/text filters. A full ffmpeg is fetched
 * quietly in the background (once); ff.mjs uses it when it is there. Failing is fine — the kit covers colour and speed.
 */
let fullFetch: Promise<void> | null = null;
let fullTried = false;
function fetchFullFfmpeg() {
  const dir = studioDir();
  if (fullTried || fullFetch || existsSync(join(dir, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'))) return;
  fullTried = true;
  fullFetch = new Promise<void>((done) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', 'ffmpeg-static@5.2.0', '--no-save', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, shell: process.platform === 'win32', windowsHide: true, stdio: 'ignore' });
    child.on('error', () => done());
    child.on('exit', () => done());
  }).finally(() => {
    fullFetch = null;
  });
}

async function npmInstall(cwd: string, onPct: (p: number) => void): Promise<void> {
  if (fullFetch) await fullFetch; // never two npm runs in one folder
  return npmRun(cwd, onPct);
}

function npmRun(cwd: string, onPct: (p: number) => void): Promise<void> {
  return new Promise((ok, fail) => {
    const started = Date.now();
    // npm prints little while it works: show time-based progress that slows down near the end
    const tick = setInterval(() => onPct(1 - Math.exp(-(Date.now() - started) / 45_000)), 1000);
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd, shell: process.platform === 'win32', windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    child.on('error', (e) => {
      clearInterval(tick);
      fail(new Error(`npm is needed for ALTTER Studio (${e.message})`));
    });
    child.on('exit', (code) => {
      clearInterval(tick);
      if (code === 0) ok();
      else fail(new Error(`Installing Studio failed: ${err.trim().split('\n').slice(-3).join(' ') || `npm exit ${code}`}`));
    });
  });
}

// ---------- the creative engine (prompt pack) ----------

const CREATIVE = /\b(wideo|video|filmi?k|film\b|filmy|rolk[aię]|rolek|reels?\b|tiktok|shorts?\b|motion|animac|animuj|intro\b|outro\b|monta[zż]|zmontuj|przytnij|napis(y|ami)\b|subtitles?|captions?\b|wyrenderuj|renderuj|grafik[aęię]|plakat|poster|baner|banner|miniatur|thumbnail|okładk|post na (insta|fb|face|linked|tik)|instagram|logo 3d|w 3d|3d anim|trailer|zwiastun|reklam[aęyo]|teaser|gif\b|slideshow|pokaz zdjęć|kolaż|collage|retusz|popraw (to )?zdjęci|color grad|explainer|obraz(ek|ki|y)?|ilustracj|wygeneruj (mi )?(obraz|zdj|grafik|logo|ilustr|t[łl]o)|zdj[eę]ci[ea] (produktu|do|na)|logo|identyfikacj|brand ?kit|generate (an? )?(image|picture|photo|illustration)|ai (image|art|photo)|illustration)/i;

/** Creative work (video, motion, 3D, edits, graphics)? Then the Studio engine is worth its tokens. */
export function wantsCreative(message: string, history: { content: string }[] = []): boolean {
  if (CREATIVE.test(message)) return true;
  // follow-ups ("make the title bigger") in a chat that is already making a video
  return history.slice(-4).some((m) => /alter-kit|render\.mjs|\brenders[\\/]/.test(m.content));
}

export function creativeEngine(): string {
  const dir = studioDir().replace(/\\/g, '/');
  const b = { ...getBrand() };
  // a logo uploaded in Studio is kept as its /files/ URL: give the AI the file on disk
  const up = b.logo?.match(/^\/files\/([0-9a-f]{24})\//);
  if (up) b.logo = getUpload(up[1])?.file ?? undefined;
  const upFont = b.fontFile?.match(/^\/files\/([0-9a-f]{24})\//);
  if (upFont) b.fontFile = getUpload(upFont[1])?.file?.replace(/\\/g, '/') ?? undefined;
  if (b.fontFile) b.display = b.fontFile;
  delete b.fontFile;
  delete b.imageKey;
  const brand = Object.keys(b).length
    ? `\nBrand (use unless the user says otherwise): ${[b.name && `name ${b.name}`, b.theme && `theme "${b.theme}"`, b.accent && `accent ${b.accent}`, b.accent2 && `accent2 ${b.accent2}`, b.display && `display font ${b.display}`, b.body && `body font ${b.body}`, b.logo && `logo file ${b.logo}`].filter(Boolean).join(', ')} → meta.brand = { accent, accent2, display, body }.`
    : '';
  return `## ALTTER Studio (videos, motion graphics, 3D, edits, graphics)
A ready kit is installed: Remotion + three.js + ffmpeg. Never create a new Remotion project, never npm install, never write long custom animation code — compose the kit's components. Keep files short.
1. Write \`videos/<name>.tsx\` in the working folder:
\`\`\`tsx
import { Timeline, Scene, Bg, Title, Text } from 'alter-kit';
export const meta = { format: 'reel', seconds: 12, theme: 'midnight' };
export default () => (<Timeline><Scene dur={3}><Bg variant="aurora" /><Title kicker="…" title="…" hl={['word']} /></Scene>…</Timeline>);
\`\`\`
2. Render: \`node "${dir}/render.mjs" videos/<name>.tsx --draft\` (half size, fast) to check, then without --draft for the final. Flags: --sizes reel,square,wide (all formats at once) · --format mp4|webm|gif|png|jpg · --at <sec> (one frame as an image) · --out <path>. It prints "OUTPUT <path>" (default ./renders/).
"WebGL context lost" lines at the end of a render are harmless. 3. Optionally look at a frame: \`--at 2 --format jpg --draft\` and open the image. End the answer with the output path(s) — ALTTER shows them as a player.
meta: format reel|story (1080×1920) square post(1080×1350) wide(1920×1080) thumb(1280×720) banner · seconds · fps (30) · theme midnight|neon|sunset|racing|luxury|mono|paper|fresh|bold · brand {accent, accent2, display, body} · still: true (one image: posters, posts, thumbnails — no Scene needed) · grain: false.
Times are seconds, relative to the Scene. Sizes are px on a 1080-wide frame (scaled to any format). place: center|top|bottom|left|right|top-left|bottom-left. Tall formats keep text out of the social UI zones automatically.
Components:
- Timeline {overlap=0.3} > Scene {dur, enter, exit: fade|up|down|left|right|zoom|blur|wipe|iris|none, tr} · Between {from, to} (show children for a while; time restarts at from)
- Bg {variant: glow|aurora|grid|dots|gradient|spotlight|solid, color, color2, intensity} · Particles {kind: specks|bokeh|confetti|snow, count} · Grain (auto)
- Text {text, at, out, size=96, anim: rise|pop|blur|fade|type|slide, hl: words in accent, marker (highlighter), stagger, place, face: display|body|mono, width, color}
- Title {kicker, title, sub, hl, at, out, place, size=120} · List {items, numbered, at} · Counter {to, from, prefix, suffix, decimals, label, at, dur} · Chip {label, value, icon (emoji), x, y | place, accent, at, out} · LowerThird {name, role, at, out} · Captions {text + dur | words [{text,start,end}], at, per=3, size, box}
- Photo {src, move: in|out|left|right|none, dur, fit, focus ("50% 30%"), zoom, look, dim, x,y,w,h,radius} · Clip {src, from (sec in source), rate (0.5 slow-mo, 2 fast), muted=true, volume, fit, focus, look, dim, x,y,w,h,radius} · look = warm|cool|film|bw|noir|vivid|fade|teal-orange or {brightness, contrast, saturate, warmth -1..1, hue, blur, vignette} · Device {type: phone|browser|laptop, url, at, scale, tilt} wrapping a Photo/Clip · Logo {src | text, sub, at, size}
- Scene3D {preset: orbs|card|cube|rings|blob|tunnel, image (card/cube), color, speed, scale, at}
- Bars {data [{label,value}], suffix, at} · Ring {value 0..1, label, at}
- Music {src, volume, fadeIn, fadeOut, from} · Sfx {src, at, volume}
- Custom bits: useTime(), useTheme(), useFormat() → {w,h,u(px),portrait}, ramp(t,a,b,ease), ease.out|back|inOut, mix, rand, media(path) + anything from 'remotion'.
src = a file path on disk (attachments too) or a URL; the renderer copies local files in.
Style: one idea per scene, 2–4 s each, big type, one accent colour, motion on every scene, a strong hook in the first second, logo/CTA last. Match words to the user's language (Polish diacritics work).
Video editing: \`node "${dir}/ff.mjs" probe <file>\` (duration, size, fps) first. Cut/join/scale/crop/rotate/compress/extract audio/loudnorm/GIF: \`node "${dir}/ff.mjs" <ffmpeg args>\` (-y added; its filters may be limited — if one is missing, do it in the kit). Speed, colour, titles, captions, overlays, reframing to 9:16: a kit video with Clip (rate, look, focus) as the background — always works. Results go in ./renders/.
Graphics & photos: a still (meta.still = true, format post|square|thumb|banner|story) rendered with --format png; photo fixes (light, colour, crop, resize, collage) = a still with Photo {look, focus, zoom, fit}, --format jpg. 
AI images (photos, illustrations, backgrounds, 3D renders, product shots, logo ideas): \`node "${dir}/gen-image.mjs" "<what, in English, concrete>" --style photo|cinematic|product|food|portrait|3d|isometric|flat|anime|watercolor|neon|minimal|poster|background|logo|sticker --format post|square|reel|wide|thumb|banner [--n 2] --out assets/<name>.jpg\` (prints OUTPUT <path>; free tier ~15 s per image, never put text in the prompt). Then use it: as the deliverable itself, or as Photo/Bg in a kit graphic or video where you add the real text, logo and brand colours. Brand graphics set (post, story, banner, thumbnail) = one still per format with the same layout.
Fonts: display/body take any Google Fonts family by name (e.g. "Montserrat", "Lobster", "Archivo Black") or a font file path (.ttf/.otf/.woff2) — the renderer loads it.${brand}`;
}

/** The chat while access is not full: creative work needs to run the renderer. */
export const CREATIVE_NEEDS_FULL = `## ALTTER Studio
Videos, motion graphics, 3D, edits and graphics are rendered on this computer, which needs "Full control" for this chat. Tell the user in one line to switch the chat to Full control (bottom of the chat) and send the request again; you may describe the plan (scenes, format, length) meanwhile. End the answer with this exact line on its own: [[altter:needs-full]] (the app shows a button that switches and continues).`;

// ---------- live render progress ----------

export interface RenderProgress { id: string; stage: string; pct: number }

/** The newest render running in this folder (render.mjs writes .progress/<pid>.json). */
export function renderProgress(cwd: string): RenderProgress | null {
  const dir = join(studioDir(), '.progress');
  let best: (RenderProgress & { t: number }) | null = null;
  try {
    for (const f of readdirSync(dir)) {
      try {
        const p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        if (Date.now() - p.t > 15_000) continue;
        if (normalize(p.cwd).toLowerCase() !== normalize(cwd).toLowerCase()) continue;
        if (!best || p.t > best.t) best = p;
      } catch {}
    }
  } catch {}
  return best ? { id: best.id, stage: best.stage, pct: best.pct } : null;
}

// ---------- media results (rendered videos / images) ----------

export interface MediaItem { url: string; name: string; kind: 'video' | 'image' | 'audio'; size: number; file: string; mtime: number }

const MEDIA_EXT: Record<string, MediaItem['kind']> = { '.mp4': 'video', '.webm': 'video', '.mov': 'video', '.gif': 'image', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio' };
const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
const mediaIds = new Map<string, string>(); // file -> id
const mediaFiles = new Map<string, string>(); // id -> file

function mediaItem(file: string): MediaItem | null {
  const kind = MEDIA_EXT[extname(file).toLowerCase()];
  if (!kind || !existsSync(file)) return null;
  const st = statSync(file);
  if (!st.isFile()) return null;
  let id = mediaIds.get(file);
  if (!id) {
    id = randomBytes(12).toString('hex');
    mediaIds.set(file, id);
    mediaFiles.set(id, file);
  }
  return { url: `/media/${id}/${encodeURIComponent(basename(file))}?v=${Math.round(st.mtimeMs)}`, name: basename(file), kind, size: st.size, file, mtime: st.mtimeMs };
}

const inside = (file: string, dir: string) => {
  const f = normalize(file).toLowerCase();
  const d = normalize(dir).toLowerCase();
  return f === d || f.startsWith(d.endsWith(sep) ? d : d + sep);
};

/** A playable/viewable URL for a file ALTTER made (Media gallery). */
export const mediaFor = (file: string) => mediaItem(file);

/** Rendered files an answer points to (absolute, or relative to the chat's folder) — only inside that folder or the Studio. */
export function mediaIn(text: string, cwd: string): MediaItem[] {
  const found = new Map<string, MediaItem>();
  const re = /(?:[A-Za-z]:[\\/]|\/)?[^\s`'"<>|*?()[\]]+\.(?:mp4|webm|mov|gif|png|jpe?g|webp|mp3|wav|m4a)\b/gi;
  for (const raw of text.match(re) ?? []) {
    const file = normalize(isAbsolute(raw) ? raw : resolve(cwd, raw));
    if (found.has(file) || !(inside(file, cwd) || inside(file, studioDir()) || inside(file, generatedDir()))) continue;
    if (/[\\/]public[\\/]ext[\\/]/.test(file)) continue; // the kit's copies of inputs
    const m = mediaItem(file);
    if (m) found.set(file, m);
    if (found.size >= 8) break;
  }
  return [...found.values()];
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.cache', '.turbo', '.gradle', 'ext', '.svelte-kit', 'coverage']);
const OUTPUT_DIR = /(^|[\\/])(output|outputs|out|renders?|exports?|generated|final|dist[\\/]media)([\\/]|$)/i;

/**
 * Images, videos and audio the AI made or changed during an answer (files modified since `since`), so they show
 * in the chat even when the answer only names a folder. Frame dumps (many new files in one folder) are skipped
 * unless the answer names them; files the answer names and files in output-like folders come first.
 */
export function mediaMadeDuring(dirs: string[], since: number, text: string, limit = 8): string[] {
  const named = new Set((text.match(/[\w.-]{3,}/g) ?? []).map((s) => s.toLowerCase()));
  const found: { file: string; mtime: number; dir: string }[] = [];
  let visited = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || visited > 6000) return;
    let entries: import('node:fs').Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (++visited > 6000) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name.toLowerCase()) && !e.name.startsWith('.')) walk(p, depth + 1);
      } else if (MEDIA_EXT[extname(e.name).toLowerCase()]) {
        try {
          const st = statSync(p);
          if (st.mtimeMs >= since - 2000 && st.size > 0) found.push({ file: p, mtime: st.mtimeMs, dir });
        } catch {}
      }
    }
  };
  for (const d of [...new Set(dirs.map((x) => normalize(x)))]) if (existsSync(d)) walk(d, 0);
  const perDir = new Map<string, number>();
  for (const f of found) perDir.set(f.dir, (perDir.get(f.dir) ?? 0) + 1);
  const isNamed = (f: string) => {
    const b = basename(f).toLowerCase();
    return named.has(b) || named.has(b.slice(0, b.length - extname(b).length));
  };
  const score = (f: { file: string; dir: string }) => (isNamed(f.file) ? 4 : 0) + (OUTPUT_DIR.test(f.dir) ? 2 : 0);
  return found
    .filter((f) => isNamed(f.file) || (perDir.get(f.dir) ?? 0) <= 12)
    .sort((a, b) => score(b) - score(a) || b.mtime - a.mtime)
    .slice(0, limit)
    .map((f) => f.file);
}

/** Media for files stored with a message (only ones that still exist). */
export const mediaForFiles = (files: string[]) => files.map((f) => mediaItem(f)).filter((m): m is MediaItem => !!m);

/** Everything rendered so far: ./renders in the workspace and in every project folder. */
export function listRenders(folders: string[], limit = 60): (MediaItem & { folder: string })[] {
  const out: (MediaItem & { folder: string })[] = [];
  for (const folder of [workspaceDir(), ...folders]) {
    const dir = join(folder, 'renders');
    if (!existsSync(dir)) continue;
    try {
      for (const f of readdirSync(dir)) {
        const m = mediaItem(join(dir, f));
        if (m) out.push({ ...m, folder });
      }
    } catch {}
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

export function deleteRender(url: string, folders: string[]): boolean {
  const id = url.match(/^\/media\/([0-9a-f]{24})\//)?.[1];
  const file = id && mediaFiles.get(id);
  if (!file || ![workspaceDir(), ...folders].some((f) => inside(file, join(f, 'renders')))) return false;
  rmSync(file, { force: true });
  return true;
}

/** GET /media/<id>/<name> (capability URL, byte ranges for seeking). */
export function serveMedia(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
  const id = pathname.match(/^\/media\/([0-9a-f]{24})\//)?.[1];
  const file = id && mediaFiles.get(id);
  if (!file || !existsSync(file)) return false;
  sendFileRange(req, res, file, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(basename(file))}` });
  return true;
}
