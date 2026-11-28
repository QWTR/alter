// ALTTER Studio: motion graphics, 3D, video edits and graphics made from code.
// A ready kit (Remotion + three.js + ffmpeg) is installed once into ~/.alter/studio; the AI only writes a short
// scene file with ready components and runs one render command — far fewer tokens than building a video from scratch.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { HOME, loadConfig, saveConfig, workspaceDir, generatedDir } from './config.ts';
import { emit } from './events.ts';
import { getUpload, sendFileRange } from './uploads.ts';
import { nativeKey } from './plugins.ts';
import { activeEngine } from './voiceover.ts';

export const studioDir = () => join(HOME, 'studio');
const kitDir = () => process.env.ALTER_STUDIO_KIT_DIR ?? resolve(import.meta.dirname, '../../../studio-kit');

export interface Brand { accent?: string; accent2?: string; display?: string; body?: string; logo?: string; theme?: string; name?: string; fontFile?: string; imageKey?: string; reelUse?: string; swear?: string; audience?: string }

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
  for (const k of ['accent', 'accent2', 'display', 'body', 'logo', 'theme', 'name', 'fontFile', 'imageKey', 'reelUse', 'swear', 'audience'] as const) if (typeof b[k] === 'string' && b[k]!.trim()) clean[k] = b[k]!.trim().slice(0, 300);
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
Other chats may be working in this same folder right now: give this job its own short unique name (the topic + 3 random letters) and use it for every file (videos/<name>.tsx, assets/<name>/…, renders). Never open, reuse, render or show a video file, frame or asset that you did not create in THIS chat, even if it sits in the folder.
1. Write \`videos/<name>.tsx\` in the working folder:
\`\`\`tsx
import { Timeline, Scene, Bg, Title, Text } from 'alter-kit';
export const meta = { format: 'reel', seconds: 12, theme: 'midnight' };
export default () => (<Timeline><Scene dur={3}><Bg variant="aurora" /><Title kicker="…" title="…" hl={['word']} /></Scene>…</Timeline>);
\`\`\`
2. Render: \`node "${dir}/render.mjs" videos/<name>.tsx --draft\` (half size, fast) to check, then without --draft for the final. Flags: --sizes reel,square,wide (all formats at once) · --format mp4|webm|gif|png|jpg · --at <sec> (one frame as an image) · --out <path>. It prints "OUTPUT <path>" (default ./renders/).
"WebGL context lost" lines at the end of a render are harmless. 3. Optionally look at a frame: \`--at 2 --format jpg --draft\` and open the image. End the answer with the output path(s) — ALTTER shows them as a player. If the result is a reel / short video (9:16), add the REEL HAND-OFF after the path:
${REEL_HANDOFF}

meta: format reel|story (1080×1920) square post(1080×1350) wide(1920×1080) thumb(1280×720) banner · seconds · fps (30) · theme midnight|neon|sunset|racing|luxury|mono|paper|fresh|bold · brand {accent, accent2, display, body} · still: true (one image: posters, posts, thumbnails — no Scene needed) · grain: true only if the user asks for film noise (off by default).
Times are seconds, relative to the Scene. Sizes are px on a 1080-wide frame (scaled to any format). place: center|top|bottom|left|right|top-left|bottom-left. Tall formats keep text out of the social UI zones automatically.
Components:
- Timeline {overlap=0.3} > Scene {dur, enter, exit: fade|up|down|left|right|zoom|blur|wipe|iris|none, tr} · Between {from, to} (show children for a while; time restarts at from)
- Bg {variant: glow|aurora|grid|dots|gradient|spotlight|solid, color, color2, intensity} · Particles {kind: specks|bokeh|confetti|snow, count} · Grain (film noise — OFF; only if the user asks for it)
- Text {text, at, out, size=96, anim: rise|pop|blur|fade|type|slide, hl: words in accent, marker (highlighter), stagger, place, face: display|body|mono, width, color}
- Title {kicker, title, sub, hl, at, out, place, size=120} · List {items, numbered, at} · Counter {to, from, prefix, suffix, decimals, label, at, dur} · Chip {label, value, icon (emoji), x, y | place, accent, at, out} · LowerThird {name, role, at, out} · Captions {text + dur | words [{text,start,end}], at, per=3, size, box}
- Photo {src, move: in|out|left|right|none, dur, fit, focus ("50% 30%"), zoom, look, dim, x,y,w,h,radius} · Clip {src, from (sec in source), rate (0.5 slow-mo, 2 fast), muted=true, volume, fit, focus, look, dim, x,y,w,h,radius} · look = warm|cool|film|bw|noir|vivid|fade|teal-orange or {brightness, contrast, saturate, warmth -1..1, hue, blur, vignette} · Device {type: phone|browser|laptop, url, at, scale, tilt} wrapping a Photo/Clip · Logo {src | text, sub, at, size}
- Scene3D {preset: orbs|card|cube|rings|blob|tunnel, image (card/cube), color, speed, scale, at} (abstract 3D only)
- WORLD (a real animated 3D world; read "${dir}/MODELS.md" for every model and prop before using it) World {sky, cam | follow, shake, tint} > Scenery {kind} (25 ready places: kitchen, office, park, beach…), Person, Crowd, Animal, Item (120 objects), furniture, buildings, nature; vehicles only when the topic needs one · anything missing: build it from Model + Part · overlays Tag, Badge, Say, Gauge, Notify, Shout, Stamp, Emoji, Arrow, Rating, Timer
- Bars {data [{label,value}], suffix, at} · Ring {value 0..1, label, at}
- STYLES (see STYLE ENGINE): StyleGrid {items [{name, src}], title, sub, cols} (a still: numbered style cards) · StyleShowcase {items [{name, src (image or clip), from}], title, sub, per=2.2, outro=3.5, cta, handle} (the viral "N animation styles" reel; meta.seconds = showcaseLength(n, per, outro))
- EDITS of the user's footage: Footage {src, keep [[from,to]], words, hits [{at, dur, src (an AI video clip), from, volume}], punch [times], captions} (all in source time) · Punch {at, to} · Shake {at, dur, amount}. Inserts are AI VIDEO clips (see CHAOS EDIT), never stills, emoji or synthetic sound effects.
- Music {src, volume, fadeIn, fadeOut, from} · Sfx {src, at, volume}
- Custom bits: useTime(), useTheme(), useFormat() → {w,h,u(px),portrait}, ramp(t,a,b,ease), ease.out|back|inOut, mix, rand, media(path) + anything from 'remotion'.
src = a file path on disk (attachments too) or a URL; the renderer copies local files in.
Style: one idea per scene, 2–4 s each, big type, one accent colour, motion on every scene, a strong hook in the first second, logo/CTA last.
Effects stay SUBTLE (users hate noisy FX): no film grain/noise, no glitches, flashes, RGB split, lens flares, confetti/particle storms, heavy shake or whoosh/boom/riser sound effects — unless the user asks for them. Allowed: soft fades and cuts, gentle camera moves, a small punch-in, at most a light shake (≤ 0.15) on one real impact, quiet background music under a voice. Match words to the user's language (Polish diacritics work).
Video editing: \`node "${dir}/ff.mjs" probe <file>\` (duration, size, fps) first. Cut/join/scale/crop/rotate/compress/extract audio/loudnorm/GIF: \`node "${dir}/ff.mjs" <ffmpeg args>\` (-y added; its filters may be limited — if one is missing, do it in the kit). Speed, colour, titles, captions, overlays, reframing to 9:16: a kit video with Clip (rate, look, focus) as the background — always works. Results go in ./renders/.
Graphics & photos: a still (meta.still = true, format post|square|thumb|banner|story) rendered with --format png; photo fixes (light, colour, crop, resize, collage) = a still with Photo {look, focus, zoom, fit}, --format jpg. 
AI images (photos, illustrations, backgrounds, 3D renders, product shots, logo ideas): \`node "${dir}/gen-image.mjs" "<what, in English, concrete>" --style photo|cinematic|product|food|portrait|isometric|neon|minimal|poster|background|logo|sticker or an animation style (clay|anime|pixel|flat|comic|3d|cartoon|lowpoly|storybook|bricks|watercolor|papercut|noir|real; add --from <img> --restyle to redraw a picture in it) --format post|square|reel|wide|thumb|banner [--n 2] --out assets/<name>.png\` (prints OUTPUT <path>). You (Claude) cannot draw; this script hands the picture to ChatGPT (the user's account, ~40 s each, up to 3 at once) or Gemini. If it exits with NO_IMAGE_AI, tell the user in one line to sign in to ChatGPT/Codex in ALTTER — never fake it with stock-looking pictures (--free is a last resort the user must ask for). Never put text in the prompt. Then use it: as the deliverable itself, or as Photo/Bg in a kit graphic or video where you add the real text, logo and brand colours. Brand graphics set (post, story, banner, thumbnail) = one still per format with the same layout.
Fonts: display/body take any Google Fonts family by name (e.g. "Montserrat", "Lobster", "Archivo Black") or a font file path (.ttf/.otf/.woff2) — the renderer loads it.${brand}`;
}

// ---------- connected AI services (Settings → Plugins: ElevenLabs, Higgsfield, fal) ----------

const hasVoice = () => !!activeEngine();
const voiceName = () => (activeEngine() === 'voicestudio' ? 'VoiceStudio (free, local on this computer)' : 'ElevenLabs');
function videoAIs(): string[] {
  const out: string[] = [];
  if (process.env.ALTER_HIGGSFIELD_KEY || (nativeKey('higgsfield', 'HF_API_KEY_ID') && nativeKey('higgsfield', 'HF_API_KEY_SECRET'))) out.push('Higgsfield (Seedance 2.0, Kling 3: --via higgsfield [--model kling])');
  if (process.env.ALTER_FAL_KEY || nativeKey('fal', 'FAL_KEY')) out.push('fal.ai (Seedance 2.0 --via seedance, Kling 3 --via kling, Veo 3.1 --via veo)');
  if (process.env.ALTER_GOOGLE_KEY) out.push('Gemini Omni (--via gemini)');
  return out;
}

/** How to make a voice-over: by ALTTER with the user's ElevenLabs, or by hand. */
function voiceGuide(): string {
  const dir = studioDir().replace(/\\/g, '/');
  return hasVoice()
    ? 'VOICE-OVER: ' + voiceName() + ' is READY — record it yourself, the user does nothing: write the script (one sentence per line; "…" = pause; hard words spelled as they sound) to assets/<reel>/voice.txt, then `node "' + dir + '/voice.mjs" --text-file assets/<reel>/voice.txt --out assets/<reel>/voice.mp3 [--voice "<name or id>"] [--speed 0.95] [--lang <2-letter language of the script, e.g. pl>]` → OUTPUT <mp3> and TIMES <mp3>.json {duration, lines, words} (exact timings, use them instead of voice-times). `--list` shows the account\'s voices (calm deep narrator = deadpan; pick by the mood). NO_VOICE_CREDITS = the month\'s characters are used up: say so and offer the manual way. NO_VOICE_KEY = the key stopped working: put [[altter:connect:elevenlabs]] on its own line.'
    : 'VOICE-OVER: no voice engine yet. Offer it once in one line: the free, local VoiceStudio app (ALTTER → Studio → Voice shows where to get it; once it is open ALTTER records the voice itself) — or, if they prefer, their ElevenLabs key: put [[altter:connect:elevenlabs]] on its own line. Meanwhile the manual way below still works. When connected: `node "' + dir + '/voice.mjs" --text-file assets/<reel>/voice.txt --out assets/<reel>/voice.mp3` → OUTPUT + TIMES json.';
}

/** Which video AI to use for clips (gen-video.mjs). */
function videoGuide(): string {
  const dir = studioDir().replace(/\\/g, '/');
  const ais = videoAIs();
  return (ais.length ? 'VIDEO AI connected: ' + ais.join(' · ') + '.' : 'No video AI key connected yet (Higgsfield or fal.ai in Settings → Plugins).') +
    ' Clips: `node "' + dir + '/gen-video.mjs" "<motion, camera, what happens, in English>" --from <start frame> [--last <end frame>] --seconds 4-10 --format reel --out assets/<name>/v<N>.mp4 [--via higgsfield|seedance|kling|veo|gemini]` (prints OUTPUT; 1–5 min; run up to 3 at once in the background). Without --via it takes the first connected one. NO_VIDEO_AI → put the connect cards it names on their own lines ([[altter:connect:higgsfield]] / [[altter:connect:fal]]) and explain in one line what each gives (Higgsfield: Seedance 2.0 + Kling 3 with a Higgsfield API balance; fal.ai: Seedance 2.0, Kling 3, Veo 3.1, pay per clip). NO_VIDEO_BILLING → the key works but its balance is empty: say where to top up.';
}

// ---------- the style engine: one scene in many animation styles ----------

const STYLE_WORDS = /(styl|style|claymation|plastelin|anime|pixel ?art|low-?poly|komiks|comic|storybook|bajkow|klock|lego|kresk[óo]wk|cartoon|akwarel|watercolou?r|wycinank|paper ?cut|noir|wygl[ąa]da[ćł]? (film|animac)|look of)/i;
const STYLE_FOR = /(film|wideo|video|animac|animat|rolk|reel|scen|klip|clip|postaci|character|obraz|zdj[ęe]ci|image|picture|podgl[ąa]d|preview)/i;
/** "show me how it looks in different styles", "10 animation styles", "make it claymation" (or a follow-up). */
export function wantsStyles(message: string, history: { content: string }[] = []): boolean {
  if (/\b\d{1,2}\s*(styl|style|animation styles)/i.test(message)) return true;
  if (STYLE_WORDS.test(message) && STYLE_FOR.test(message)) return true;
  return history.slice(-4).some((m) => /style-preview\.mjs|STYLE ENGINE|StyleShowcase|StyleGrid/.test(m.content));
}

export function styleGuide(): string {
  const dir = studioDir().replace(/\\/g, '/');
  let list = 'clay — Claymation · anime · pixel — Pixel Art · flat — Flat Vector · comic · 3d · cartoon · lowpoly · storybook · bricks — Toy Bricks · watercolor · papercut · noir · real';
  try {
    const lib = JSON.parse(readFileSync(join(studioDir(), 'styles.json'), 'utf8'));
    list = lib.styles.map((x: { id: string; en: string; pl: string }) => x.id + ' — ' + x.en + ' / ' + x.pl).join(' · ') + '. Sets: ' + Object.keys(lib.sets ?? {}).join(', ') + ' (viral10 = the 10 from the popular "animation styles" reels).';
  } catch { /* the kit is not installed yet */ }
  return String.raw`## STYLE ENGINE (show how the film will look in different animation styles, then make it in the chosen one)
Styles (id — name): ${list}
1. PREVIEW FIRST whenever the user wants a film/animation/reel "in a style", asks which style fits, or asks to see styles: \`node "${dir}/style-preview.mjs" "<the scene in English: who, where, doing what, the camera>" --styles viral10|all|clay,anime,… --lang <the user's language: pl|en> --out assets/<name>/styles [--from <frame.jpg>]\` → one line per style "STYLE <id> <path>" and "OUTPUT <sheet.jpg>" (a numbered sheet of all of them). ChatGPT draws them (~45 s per 3). With the user's own photo or video use --from (for a video first take a frame: \`node "${dir}/ff.mjs" -ss <sec> -i <video> -frames:v 1 -q:v 2 assets/<name>/frame.jpg\`) — every style then redraws the same people, poses and framing. Answer with the sheet path (ALTTER shows it) and a clickable ask block (altter block, type "ask") with the style names as options — never "answer with a number". If the user already named a style, preview just that one (and 2 close alternatives).
2. THE FILM IN THE CHOSEN STYLE (shots of 3–6 s, one idea each; the same character description in every prompt):
   a) start frame per shot: \`node "${dir}/gen-image.mjs" "<the shot>" --style <id> --format reel --out assets/<name>/s<N>.png\` (for the user's own footage: --from <their frame> --restyle);
   b) animate each frame with a video AI (below), adding the style's motion words to every prompt (styles.json "video", e.g. "stop-motion claymation animation, slightly jittery handmade motion") so all clips stay in one style;
   c) put it together in the kit: Timeline of Scenes with Clip {src} (+ voice and Captions for a story), render, look at frames, final render.
   No video AI connected → show the connect cards (below) and say plainly that stills with a zoom are not animation; offer the kit's own animated 3D world (World) meanwhile.
3. THE VIRAL "N ANIMATION STYLES" REEL (a numbered list on the left fills in, each style plays on the right, then all of them + "comment for the prompts"): make the previews (step 1) → animate every style's still (step 2b, --seconds 4, the same motion prompt for all) — without a video AI use the stills (they get a slow push-in) → then
\`\`\`tsx
import { StyleShowcase, showcaseLength } from 'alter-kit';
const ITEMS = [{ name: 'Claymation', src: 'assets/<name>/styles/clay.mp4' }, { name: 'Anime', src: 'assets/<name>/styles/anime.mp4' }]; // plain string paths (the renderer copies only literal paths)
export const meta = { format: 'reel', seconds: showcaseLength(ITEMS.length, 2.2, 3.5), theme: 'midnight' };
export default () => <StyleShowcase title="10 animation styles" sub="(which one is yours?)" items={ITEMS} per={2.2} cta="Comment STYLE for the prompts" handle="@…" />;
\`\`\`
   Titles and names in the user's language. Optional quiet music. After the render give the REEL HAND-OFF and, as promised by the CTA, the exact prompt of every style (a code block each) — the user can post them as the reply to comments.
${videoGuide()}`;
}

// ---------- reel preferences (Studio → Brand): what reels are for, swearing, audience ----------

const USE: Record<string, string> = { ad: 'an ad for a product or business (end with the product + CTA)', fun: 'entertainment / memes for social media (no product unless named)', edu: 'education / explaining something (clear, still funny)', personal: 'personal / for friends (inside jokes are fine)' };
const SWEAR: Record<string, string> = {
  none: 'NO swearing or vulgar words at all (voice-over, captions, overlays)',
  mild: 'mild only ("kurde", "cholera", "do diabła" level) — at most 1–2 for punch',
  full: 'strong swearing is allowed where it makes it funnier (deadpan "kurwa" on the twist lands) — never slurs or insults aimed at real groups or real people; platforms may limit reach of ads with swearing, say so once if it is an ad',
};
/** The user's defaults for reels, or what to ask before writing the script. */
export function reelPrefs(mode: 'ask' | 'soft' = 'ask'): string {
  const b = getBrand();
  const known = [b.reelUse && USE[b.reelUse] && `purpose: ${USE[b.reelUse]}`, b.swear && SWEAR[b.swear] && `language: ${SWEAR[b.swear]}`, b.audience && `audience / platform: ${b.audience}`].filter(Boolean);
  const missing = [!(b.reelUse && USE[b.reelUse]) && 'what the reel is for (ad for which product / entertainment / education / personal)', !(b.swear && SWEAR[b.swear]) && 'whether it may swear (none / mild / full)', !b.audience && 'who it is for and where it goes (TikTok / Instagram / YouTube…)'].filter(Boolean);
  return `## REEL PREFERENCES (Studio → Brand)
${known.length ? 'Set by the user: ' + known.join(' · ') + '. Follow them unless this chat says otherwise.' : 'None set in Studio.'}
${missing.length && mode === 'soft' ? `Not set: ${missing.join('; ')}. Do NOT stop to ask: assume entertainment, keep the user's own words as they are and add no swearing of your own; at the end add one line that they can set this once in Studio → Brand → Reels.` : missing.length ? `Not set: ${missing.join('; ')}. If this chat has not answered these yet, your FIRST answer to a new reel request is only these questions as ONE clickable ask block (no script yet, never "answer 1b 2c"): a fenced altter block {"type":"ask","title":"…","questions":[{"q":"…","options":["…","…"]}]} — one question per missing item, 2–4 short options each, in the user's language. Add one line: "You can set these once in Studio → Brand → Reels, then I won't ask." When they answer (or say "whatever / you pick"), continue with the method. Never ask again in the same chat. These questions were turned on by the user on purpose: they win over older memories like "do reels without asking"; skip them only when THIS message says so (e.g. "bez pytania", "[TEST ALTTER]", "you pick") — then assume entertainment and no swearing.` : 'Do not ask about these — go straight to the method.'}`;
}

// ---------- after a reel: the scenario, the script and how to make one like it ----------

const ELEVEN_STEPS = `ElevenLabs (the voice-over; the free plan is enough to start). Easiest: connect it once in ALTTER (Settings → Plugins → ElevenLabs, paste the API key from elevenlabs.io/app/developers/api-keys) — then ALTTER records the voice itself. By hand:
   1. elevenlabs.io → sign up / log in → "Text to Speech" (in the app: Create → Text to Speech).
   2. Voice: Voices → Voice Library → search "narrator" / "documentary" (calm, deep, deadpan works best for absurd stories) → Add → pick it. For Polish choose the model "Eleven Multilingual v2" (or the newest multilingual one).
   3. Settings: Stability ~35–45%, Similarity ~75%, Style ~30–40%, Speaker boost on, Speed 1.0 (0.9 for a slower, drier read).
   4. Paste the whole voice-over script (one sentence per line; "…" = a pause). Words it says wrong: write them the way they sound (e.g. "WiFi" → "łajfaj", "AI" → "ej aj") — the captions keep the right spelling.
   5. Generate → listen → regenerate only the lines that sound off (select the line → Regenerate) → Download → MP3.
   6. Send the MP3 here in the chat (drag it in) with "make the reel with this voice" — ALTTER times every word, builds the scenes to it and adds the captions.`;

/** Appended to every reel guide: after the final render, teach the user to make one like it. */
const REEL_HANDOFF = `## REEL HAND-OFF (after the final render — in the user's language, short headings, scannable)
After the output path add a section titled like "How to make a reel like this" with:
1. **Scenario** — the idea in one line, why it works (the hook, the escalation, the twist, the dry ending), then the beats with times (0:00–0:03 hook: …), taken from the reel you just made.
2. **Script** — a code block with the exact voice-over text used (one sentence per line, ready to paste into ElevenLabs). For an edit of the user's own footage: their spoken lines (cleaned) plus what each insert shows, so they can film a new one.
3. **Step by step** — numbered, concrete, nothing assumed:
   - the idea: how to pick a topic/product and the absurd escalation (3 example ideas in their niche);
   - the voice: ${ELEVEN_STEPS}
     (for an edit of their own video instead: film 30–60 s vertically, calm deadpan explanation of an ordinary thing, steady phone, good light, one take; then send the video with "make it a crazy reel");
   - what to write to ALTTER (the exact message), what ALTTER does, how to ask for changes ("slower captions", "different ending", "swap scene 3");
   - publishing: first frame = the hook, caption idea, 3–5 hashtags, best length (20–45 s), post as a Reel/TikTok in 9:16.
4. One line: "Questions about any step — ask, I'll walk you through it." Keep the whole hand-off under ~35 lines; never repeat the whole build log.`;

const REEL_HOWTO = /(jak|w jaki spos[óo]b|co zrobi[ćc]|poka[żz]|naucz|krok po kroku|how (do i|to|can i)|teach me|step by step)[^.?!\n]{0,80}(rolk|reel|tiktok|short|film|wideo|video|animac|3d|lektor|g[łl]os|voice|eleven|scenari|skrypt|script)|(eleven ?labs|elevenlabs)/i;
/** "How do I make a reel like this / a 3D animation / the voice?" — a coach answer, works in any access mode. */
export function wantsReelHowTo(message: string, history: { content: string }[] = []): boolean {
  if (REEL_HOWTO.test(message)) return true;
  return /(jak|how)\b/i.test(message) && history.slice(-4).some((m) => /REEL HAND-OFF|How to make a reel like this|Jak zrobi[ćc] tak[ąa] rolk/i.test(m.content));
}

/** Coach mode: help the user make a reel (or a similar one) themselves, every step. */
export function reelCoachGuide(): string {
  return `## REEL COACH (the user asks how to make a reel / a 3D animation / a voice-over, or how to make one like the one in this chat)
${reelPrefs().replace(/your FIRST answer to a new reel request is only these questions[^.]*\./, 'still give a full answer now (script fitting the most likely answer), and ask these briefly at the end so the next script fits.')}
Answer as a patient step-by-step guide in the user's language — they may be a complete beginner. Help with EVERYTHING they ask: the idea, the script, the voice, filming, sending it to ALTTER, changes, posting.
- If it is about a reel from this chat: start from that reel (its scenario and script), then the steps to make another like it.
- Otherwise ask nothing first: pick the most likely kind and say which other kinds exist in one line — (a) a 3D story / absurd ad with a voice-over on any topic (ALTTER builds the animated 3D world: people, animals, rooms, places, objects), (b) a crazy edit of their own video with AI video inserts, (c) motion graphics / a promo with text and logo.
- Always give: a ready script they can use right now (code block, one sentence per line, 30–45 s), then numbered steps. For the voice: ${ELEVEN_STEPS}
  No ElevenLabs? Their own voice works too: record it on the phone in a quiet room, 20 cm from the mouth, one take per sentence is fine — send the file the same way.
- Be concrete: exact buttons, exact settings, exact messages to type to ALTTER. Short paragraphs, numbered steps, no theory.
- End by offering the next step ("Send the MP3 when ready" / "Shall I write 3 more scripts?"). If they ask a follow-up about one step, explain just that step in more detail.`;
}

// ---------- story reels: a 3D story / absurd ad with a voice-over, made just by asking in the chat ----------

const STORY = /(rolk|reel|tiktok|shorts?\b|reklam|spot\b|teledysk|ad\b|commercial|promo|filmik|video|wideo)/i;
const STORY_KIND = /(histor|story|fabu|scenari|lektor|narrat|voice|g[łl]os|3d|absurd|pojeb|popierd|zwariow|[śs]mieszn|kreskówk|animowan|postaci|bohater|character|funny|crazy|weird|surreal|pixar)/i;
/** A story reel (3D, a plot, a voice-over)? Also follow-ups in a chat that is already making one. */
export function wantsStoryReel(message: string, history: { content: string }[] = []): boolean {
  if (STORY.test(message) && STORY_KIND.test(message)) return true;
  // the user answered the reel questions ("1b 2c"): the request is a few messages back
  if (history.slice(-4).some((m) => STORY.test(m.content) && STORY_KIND.test(m.content))) return true;
  return history.slice(-6).some((m) => /voice-times\.mjs|STORY REEL|tekst dla lektora|voice-over script/i.test(m.content));
}

/** The method behind the 3D story reels, written so that a small model can follow it step by step. */
export function storyReelGuide(): string {
  const dir = studioDir().replace(/\\/g, '/');
  const ASK_GO = '```altter\n{"type":"ask","questions":[{"q":"Robimy?","options":["Tak, rób rolkę","Zmień scenariusz","Inny pomysł"]}]}\n```';
  return `${reelPrefs()}

## STORY REEL (an animated 3D story with a voice-over, 9:16) — follow the steps in order
You run the whole method; the user only asks. Work like a film crew: writer → director → model maker → editor → checker.

### RULES THAT ALWAYS APPLY
1. TOPIC. The reel is about what THIS message asks for, nothing else. Do not add cars, roads, driving, racing, police or speedometers unless the user's request is about them. Memories of the user's older projects (cars, apps, brands) are NOT the topic. No product or brand unless named in this chat; if an ad has no product yet, write [PRODUCT] in the last line and ask.
2. "3D" means a real animated 3D world built in code with the kit (World + models), with moving characters and a moving camera. Never still pictures with a zoom. gen-image only when the user asks for AI / realistic pictures.
3. EVERY THING IN THE SCRIPT MUST BE ON SCREEN AS ITSELF. For each noun in the shot list pick, in this order: (a) a kit model that IS that thing (Person, Animal, Item, Scenery, furniture… — the full list is in "${dir}/MODELS.md": READ THAT FILE before writing the scene); (b) if the kit has no such thing, BUILD it from <Model> + <Part> (8–25 parts, see MODELS.md "Rule 3"). Never use a different object "instead" and never leave a thing out.
4. NOTHING WRONG ON A MODEL. A normal car has no police lights (only kind="police" | "ambulance" | "firetruck" flash). No hats, props, flames or effects the script does not mention. Check each model's props against the script.
5. CONSISTENCY. Define every character and important object ONCE as a const (colours, hair, outfit, plate) and spread it into every shot: \`const ola = { shirt: '#e84393', hairStyle: 'ponytail' } as const;\` → \`<Person {...ola} pos=… />\`.
6. Length: what they asked; otherwise 25–40 s; never over 50 s. One sentence = one shot of 2–4 s.

### STEP 1 — first answer: the script (no files yet)
Write it in the user's language:
a) One-line pitch: title · format 9:16 · length.
b) "Voice-over" in a code block, one sentence per line, 8–14 lines. How to make it GOOD:
   - Line 1 is the hook: one concrete, impossible or very specific image ("Pani Halina od 40 lat karmi gołębie. Dziś gołębie przyniosły rachunek."). Never start with a greeting, a question to the viewer or "Did you know".
   - One main character with a name, an age or a job, and ONE clear want. The viewer must know who it is by line 2.
   - Every 1–2 lines something changes and gets bigger (a new obstacle, a worse idea, a higher number). Each step follows from the one before — absurd, but logical inside its own world.
   - Concrete beats abstract: names, numbers, objects, places ("3 kilo sernika", not "dużo jedzenia"). Short sentences, 5–10 words, spoken language.
   - One real twist near the end that re-reads the beginning, then a dry last line. Narrate crazy events in a calm, deadpan voice — that contrast is the joke. Do not explain the joke, no morals, no "and that's why…".
   - Ads: the product solves the problem in the last 2 lines; the story is not about the product before that.
   - Take the second or third idea, not the first one that comes to mind. Avoid: talking animals as the only joke, "it was all a dream", robots taking over, generic office boredom.
c) Shot list: one row per line — time · where (which Scenery / place) · who and what they do (pose, mood, movement) · camera (wide / close-up / push-in / orbit) · overlay (Tag, Say, Gauge, Notify…). Vary shot sizes: after a wide shot use a close-up; change the place at least twice in the reel.
d) Model check, one line: "Kit models: … · To build: …" — every noun from the shot list sorted into one of the two groups (rule 3).
e) ${hasVoice() ? 'Voice: ' + voiceName() + ' is ready — say you will record it yourself (name the voice) when they say go.' : 'Voice: offer the free local VoiceStudio (Studio → Voice in ALTTER) or the one-minute ElevenLabs connection ([[altter:connect:elevenlabs]] on its own line — then ALTTER records it itself), or the manual way:\n  ' + ELEVEN_STEPS}
f) End with a choice the user can CLICK (never "answer A or B" in text) — an ask block in the user's language, e.g.:
${ASK_GO}
### STEP 2 — build (full access; when the user says go or sends the MP3)
a) ${voiceGuide()}
   Timings of an MP3 the user sent: \`node "${dir}/voice-times.mjs" "<mp3>" --text "<the voice-over lines>"\` → JSON {duration, lines[{text,start,end}], words[{text,start,end}]}. Without an MP3 use ~0.38 s per word. Over 50 s → tell the user (or speed it up with ff.mjs atempo, max 1.15).
b) Read "${dir}/MODELS.md" (exact names and props — do not guess them). Then write videos/<reel>.tsx:
   - at the top: the consts for characters and objects (rule 5) and your own models built from Model + Part (rule 3);
   - one <Scene> per voice line, dur = that line's length, enter="none" exit="none", inside <Timeline overlap={0}>;
   - each Scene = one <World> (a Scenery or your own Ground + things, the characters, a camera that moves a little) + overlays;
   - outside the Timeline: <Music src="<voice.mp3>" volume={1} /> and <Captions words={words} per={1} size={110} upper={false} y={1180} />.
   Skeleton (replace everything with YOUR story — it only shows the shape, it is not the topic):
\`\`\`tsx
import { Timeline, Scene, World, Scenery, Person, Animal, Item, Model, Part, Tag, Say, Gauge, Captions, Music } from 'alter-kit';
export const meta = { format: 'reel', seconds: 30, theme: 'midnight', grain: false };
const words = [/* from voice.mjs / voice-times */];
const hero = { skin: '#f3cda8', shirt: '#e84393', pants: '#2c3e66', hair: '#5a3b22', hairStyle: 'ponytail' } as const;
const Toaster = (p: any) => (<Model shadow={0.2} {...p}>
  <Part shape="round" size={[0.34, 0.22, 0.2]} pos={[0, 0.11, 0]} color="#d8dbe0" metal={0.6} shine={0.8} />
  <Part shape="box" size={[0.24, 0.02, 0.03]} pos={[0, 0.221, -0.04]} color="#22252b" /><Part shape="box" size={[0.24, 0.02, 0.03]} pos={[0, 0.221, 0.04]} color="#22252b" />
  <Part shape="box" size={[0.03, 0.08, 0.02]} pos={[0.18, 0.12, 0]} color="#22252b" />
</Model>);
export default () => (<>
  <Timeline overlap={0}>
    <Scene dur={3.2} enter="none" exit="none">
      <World sky="indoor" cam={[{ t: 0, pos: [3, 2.3, 7], look: [0, 1.2, -0.5] }, { t: 3.2, pos: [1.8, 2, 5.2], look: [0, 1.3, -0.5] }]}>
        <Scenery kind="kitchen" />
        <Person {...hero} pos={[-0.6, 0, 0.4]} face={15} mood="surprised" pose="point" />
        <Toaster pos={[0.2, 0.96, -3.05]} />
      </World>
      <Tag text="Ola, 29" x={360} y={520} />
    </Scene>
    {/* …one Scene per line… */}
  </Timeline>
  <Music src="assets/reel/voice.mp3" volume={1} fadeIn={0} fadeOut={0.2} />
  <Captions words={words} per={1} size={110} upper={false} y={1180} />
</>);
\`\`\`
   Camera recipes (a standing person's chest is y 1.2, the face y 1.7): wide \`pos [3, 2.3, 7]\` · medium \`pos [1.5, 1.9, 4]\` · close-up \`pos [0.6, 1.8, 2.2], look [x, 1.7, z]\` · from above \`pos [0, 7, 5]\`. Keep the camera at least 1.5 m from walls and things and never inside a wall (indoor rooms are about 9 × 7 m, open towards +z). Characters face +z (the camera); turn them to each other with face (90 = looks to +x, −90 = to −x).
   Overlays are px on a 1080 × 1920 frame: keep them between y 250 and y 1050 (captions sit at y ≈ 1180; the very top and bottom are covered by the app's buttons), never over a face. A Tag goes just above the head.
c) CHECK — do not skip, this is what makes it good:
   1. \`node "${dir}/render.mjs" videos/<reel>.tsx --at <t> --format jpg --draft\` for one frame in the middle of EVERY shot (one after another). Read every line it prints: "NOT IN THE KIT" and "WARN" lines must be fixed before going on.
   2. OPEN each frame and check it against the script: is every named thing visible and recognisable? is anything there that should not be (a car, a siren, a hat)? are the characters the same as in the other shots? heads inside the frame? the camera not inside an object or a wall? overlays readable and not on a face?
   3. Fix and re-render the frames you changed. Then one \`--draft\` render of the whole reel, then the final render (no flag).
d) Answer with the output path, then the REEL HAND-OFF. If something from the script could not be shown, say so plainly in one line.

${REEL_HANDOFF}`;
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

// ---------- answers running at the same time (two chats in one folder must not get each other's files) ----------

interface Turn { from: number; to: number; dirs: string[] }
const turns = new Map<number, Turn>();
let turnSeq = 0;
const under = (a: string, b: string) => { const x = normalize(a).toLowerCase(), y = normalize(b).toLowerCase(); return x === y || x.startsWith(y + sep) || y.startsWith(x + sep); };
/** An answer starts working in these folders. */
export function beginTurn(dirs: string[]): number {
  const now = Date.now();
  for (const [id, t] of turns) if ((t.to !== Infinity && now - t.to > 3 * 3600_000) || now - t.from > 12 * 3600_000) turns.delete(id);
  turns.set(++turnSeq, { from: now, to: Infinity, dirs: [...new Set(dirs.map((d) => normalize(d)))] });
  return turnSeq;
}
/** The answer is done (also when it failed). */
export function endTurn(id: number) {
  const t = turns.get(id);
  if (t && t.to === Infinity) t.to = Date.now();
}
/** Did another answer work in one of the same folders while this one ran? Then new files there may be the other chat's. */
export function turnShared(id: number): boolean {
  const me = turns.get(id);
  if (!me) return false;
  const end = me.to === Infinity ? Date.now() : me.to;
  for (const [oid, o] of turns) if (oid !== id && o.from <= end && o.to > me.from && o.dirs.some((d) => me.dirs.some((m) => under(d, m)))) return true;
  return false;
}

/**
 * Images, videos and audio the AI made or changed during an answer (files modified since `since`), so they show
 * in the chat even when the answer only names a folder. Frame dumps (many new files in one folder) are skipped
 * unless the answer names them; files the answer names and files in output-like folders come first.
 */
export function mediaMadeDuring(dirs: string[], since: number, text: string, limit = 8, namedOnly = false): string[] {
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
    // another chat worked in the same folder at the same time: only files this answer names are surely its own
    .filter((f) => isNamed(f.file) || (!namedOnly && (perDir.get(f.dir) ?? 0) <= 12))
    .sort((a, b) => score(b) - score(a) || b.mtime - a.mtime)
    .slice(0, limit)
    .map((f) => f.file);
}

/** Pictures / videos the answer points to by their full path ("D:\Gierka\shots\01_menu.png"), even when they were made earlier:
 * the user asked to see them, so they are shown in the chat instead of a bare list of paths. */
const loose = (n: string) => n.toLowerCase().replace(/[×✕]/g, 'x').replace(/[\s_-]+/g, '');
function lookalike(file: string): string | null {
  try {
    const want = loose(basename(file));
    const name = readdirSync(dirname(file)).find((n) => loose(n) === want);
    return name ? join(dirname(file), name) : null;
  } catch { return null; }
}
export function mediaNamedIn(text: string, limit = 24): string[] {
  const exts = Object.keys(MEDIA_EXT).map((e) => e.slice(1)).join('|');
  const re = new RegExp(String.raw`(?:(?<![\w\\/])[A-Za-z]:[\\/]|\\\\)[^\n\r"'<>|*?\`\]\[]*?\.(?:${exts})(?![\w])`, 'gi');
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    let raw = m[0].trim();
    // markdown image links escape spaces ("My%20project")
    if (raw.includes('%')) { try { raw = decodeURIComponent(raw); } catch {} }
    const f = normalize(raw);
    // the AI may retype a name a little differently (× for x, other case): match it in that folder
    const hit = existsSync(f) ? f : lookalike(f);
    if (hit && !out.includes(hit) && mediaItem(hit)) out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
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

// ---------- chaos edits: the user's own clip → deadpan tutorial with absurd AI VIDEO inserts ----------

const EDIT_WORDS = /(zmontuj|montaż|montuj|przer[óo]b|edytuj|edit|vfx|efekt|chaos|pojeb|popierd|absurd|zwariow|[śs]mieszn|crazy|insane|viral|rolk|reel|tiktok|insta|wstawk)/i;
/** A video attached and an ask to edit it into something crazy (or a follow-up in a chat that is doing it). */
export function wantsChaosEdit(message: string, history: { content: string }[] = [], hasVideo = false): boolean {
  if (hasVideo && EDIT_WORDS.test(message)) return true;
  return history.slice(-6).some((m) => /CHAOS EDIT|gen-video\.mjs|gen-image\.mjs[^\n]*--from|<Footage|Veo pack|labs\.google\/flow|Frames to video|NO_VIDEO_|grab-download|ALTTER frame input|gemini\.google\.com/i.test(m.content));
}

export function chaosEditGuide(): string {
  const dir = studioDir().replace(/\\/g, '/');
  return `${reelPrefs('soft')}
(For an edit of the user's own video the voice stays theirs: the language preference applies to captions you add and to the AI clips' prompts.)

## CHAOS EDIT (the user's own video → a "deadpan tutorial gone absurd" reel with AI VIDEO inserts)
The format (viral on Instagram/TikTok): someone calmly explains an ordinary thing (how to use stairs, a vacuum, a kettle…). At 3–6 moments the picture HARD-CUTS to a short AI-generated VIDEO that starts from that exact frame — same person, same room, same camera — and then something impossible happens in motion: the stairs fire rocket boosters and blast through the roof, crash and explode; the vacuum turns into a jet engine and swallows the kitchen. 2–5 s later it hard-cuts back to the real footage, which goes on exactly where it stopped, as if nothing happened. While the clip plays the user's video is PAUSED: only the clip's own sound is heard — the voice and the clip never play at the same time, and no word is lost.
HARD RULES: the inserts are VIDEOS made by a video AI from the real frame. Never use still pictures as inserts (no Ken Burns, no zooming photos), never add emoji / flying icons / particles / glitches / flashes on top, never add synthesised sound effects — the AI clip's own sound (Gemini/Kling make it) is the sound. Clean hard cuts only.
1. Look: \`node "${dir}/ff.mjs" probe <video>\` and \`node "${dir}/voice-times.mjs" <video>\` (words + lines with times; any language). Read the transcript.
2. Plan (4–8 short lines to the user, then go on): what to KEEP (cut long pauses, false starts, fumbling — usually 30–55 s stays) and 3–6 HITS — source times where the person names or touches the object. Each hit is a visual punchline in MOTION that ESCALATES (weird → bigger → biggest) and takes what they say literally or to the extreme ("rozłączamy odkurzacz" → it bursts apart into a hundred flying parts; "zbiornik na kurz" → the bin opens into a black hole and the room gets sucked in). Physical, cinematic, real-looking: fire, rockets, explosions, transformation, giant scale, the room turning into space/ocean.
3. Which video AI — ${videoAIs().length ? 'a video AI key IS connected (' + videoAIs().join(' · ') + '): use (B) gen-video first — it is automatic and the most reliable; (A) only if it fails' : 'in this order'}:
   (A) THE USER'S OWN GEMINI IN THEIR BROWSER (default; their Google AI subscription, no keys). You have the Claude in Chrome tools (mcp__claude-in-chrome__*) — they work in the user's own signed-in browser (Chrome / Brave / Edge). Load them with ToolSearch first (one call: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__find,mcp__claude-in-chrome__file_upload,mcp__claude-in-chrome__tabs_close_mcp"). Never type into or read their other tabs or chats. Per hit, in its OWN new tab (tabs_context_mcp {createIfEmpty:true} once, then tabs_create_mcp; run up to 3 hits at the same time, the rest after):
     i. navigate the tab to https://gemini.google.com/app , then javascript_tool SETUP (opens the tools menu, picks "Create video", adds a hidden file input):
        const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); const lab=(e)=>(e.getAttribute('aria-label')||e.innerText||'').trim(); for(let i=0;i<30&&!document.querySelector('[contenteditable=true]');i++) await sleep(500); [...document.querySelectorAll('button')].find(b=>/narzędzi|Dodaj pliki|upload|tools/i.test(lab(b)))?.click(); await sleep(900); const it=[...document.querySelectorAll('button,[role=menuitem],[role=menuitemcheckbox],[role=option]')].find(e=>/^(Utwórz film|Create video|Create videos|Video|Wideo)$/i.test((e.innerText||'').trim())); it?.click(); await sleep(900); let f=document.getElementById('alter-file'); if(!f){f=document.createElement('input');f.type='file';f.id='alter-file';f.setAttribute('aria-label','ALTTER frame input');f.style.cssText='position:fixed;left:0;top:0;width:10px;height:10px;opacity:0.01;z-index:99999';document.body.appendChild(f);} ({video: !!it, signedIn: !/^(Zaloguj się|Sign in)$/im.test(document.body.innerText)})
        If signedIn is false: tell the user in one line to sign in to Gemini in that browser, and wait. If video is false the plan has no video in this browser: go to (B).
     ii. find "ALTTER frame input" → file_upload { ref, paths: [absolute path of assets/<reel>/f<N>.jpg] }.
     iii. javascript_tool SEND (put the English prompt in PROMPT; start it with "Use this image as the exact first frame and animate it."):
        const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); const lab=(e)=>(e.getAttribute('aria-label')||e.innerText||'').trim(); const PROMPT="..."; const file=document.getElementById('alter-file').files[0]; const ed=document.querySelector('[contenteditable=true]'); ed.focus(); const dt=new DataTransfer(); dt.items.add(new File([file],file.name,{type:file.type})); ed.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); await sleep(2500); ed.focus(); document.execCommand('insertText',false,PROMPT); await sleep(500); const fmt=[...document.querySelectorAll('button')].find(b=>/^Format obrazu|^Aspect ratio/i.test(lab(b))); if(fmt&&!/pionow|9:16|portrait/i.test(lab(fmt))){fmt.click(); await sleep(700); [...document.querySelectorAll('button,[role=menuitem],[role=menuitemradio],[role=option]')].find(e=>/pionow|9:16|portrait/i.test(e.innerText||''))?.click(); await sleep(700);} [...document.querySelectorAll('button')].find(b=>/^(Wyślij|Send)/i.test(lab(b)))?.click(); await sleep(4000); location.href
     iv. WAIT (a video takes 1–4 min; each call waits ≤ 38 s, repeat it): const end=Date.now()+38000; let v; while(Date.now()<end){v=document.querySelector('video'); if(v&&(v.currentSrc||v.src))break; await new Promise(r=>setTimeout(r,4000));} ({ready: !!(v&&(v.currentSrc||v.src)), said: [...document.querySelectorAll('model-response')].pop()?.innerText?.slice(0,200)})
        If it says it is at capacity / try again later: wait ~2 min, then redo this hit from i. in the same tab. If it refuses the content: soften the prompt (no injuries, no weapons) and redo. If it says the daily limit is reached: finish the hits you have and tell the user which ones are missing and that the limit resets tomorrow.
     v. javascript_tool DOWNLOAD: const v=document.querySelector('video'); const r=await fetch(v.currentSrc||v.src,{credentials:'include'}); const b=await r.blob(); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='alter-<reel>-v<N>.mp4'; document.body.appendChild(a); a.click(); a.remove(); b.size
        then \`node "${dir}/grab-download.mjs" <that size> assets/<reel>/v<N>.mp4\` (finds it in Downloads by size, even under a temporary name). Close the tab when the clip is saved.
     Gemini's clips are 8–10 s with their own sound; the payoff is usually in the first 3–5 s — use dur 3–4.5 in the hit and cut right after the payoff.
   (B) a connected video AI key, or if (A) is impossible: \`node "${dir}/gen-video.mjs" "<motion>" --from <frame> --seconds 5 --format reel --out assets/<reel>/v<N>.mp4\` — Higgsfield / fal.ai (Settings → Plugins: Seedance 2.0, Kling 3, Veo 3.1) or a Gemini key (Media → Keys). NO_VIDEO_BILLING = the key has no balance/credits yet. If gen-video prints NO_VIDEO_AI, put [[altter:connect:higgsfield]] and [[altter:connect:fal]] on their own lines once (the user may connect one and say continue). If NEITHER is available (gen-video prints NO_VIDEO_AI and there is no Higgsfield plugin), use the user's OWN subscription by hand — never fall back to stills: (C) make a "Veo pack": extract the frame of every hit (step 4a) into assets/<reel>/, then answer with, per hit: the frame file path (ALTTER shows it, they can download it) and a ready English prompt in a code block. Tell them in 3 lines: open Google Flow (labs.google/flow — included in Google AI Pro/Ultra) or the Gemini app → Video → "Frames to video" / add the image, paste the prompt, 9:16, generate, download, and send all the clips back here in this chat (any order — say which is which by name v1, v2…). Also one line: for fully automatic inserts paste a Gemini API key in Media → Keys (aistudio.google.com/apikey; Google AI Pro/Ultra include monthly credits for it at developers.google.com/profile) — then ALTTER makes the clips itself. When the clips arrive (attachments in a later message), check each one and continue from step 5 with them as the hits.
4. For every hit (start them all at once in the background, then wait):
   a) the real frame at the hit: \`node "${dir}/ff.mjs" -ss <at> -i <video> -frames:v 1 -q:v 2 assets/<reel>/f<N>.jpg\`
   b) the clip FROM THAT FRAME (start image = the real frame, so the cut is invisible). Prompt in English, concrete motion and camera: "Handheld phone video. The man keeps holding the vacuum; after half a second it violently transforms into a roaring jet turbine, sucking towels, magnets and a chair into it, the fridge door rips off and flies in, camera shakes. Realistic, same kitchen and lighting." 5 s, 9:16.
   c) (only if the video AI can't do the change in one go) make an end frame first with \`node "${dir}/gen-image.mjs" "<the changed scene>" --from assets/<reel>/f<N>.jpg --format reel --out assets/<reel>/e<N>.png\` and use it as the end/last frame of the clip.
   Then watch each clip (ff.mjs probe + a few frames as jpg): it must start like the real frame and the absurd thing must clearly happen. Regenerate a weak one once.
5. videos/<reel>.tsx — everything in SOURCE time, Footage does the cutting:
\`\`\`tsx
import { Footage, footageLength } from 'alter-kit';
const words = [/* all words from voice-times, spelling fixed */];
const KEEP: [number, number][] = [[0.2, 9.8], [13, 33.5], [34, 44], [52, 63]];
const HITS = [
  { at: 24.2, dur: 3.5, src: 'assets/<reel>/v1.mp4' },
  { at: 36.0, dur: 4, src: 'assets/<reel>/v2.mp4', from: 0.3 },
];
export const meta = { format: 'reel', seconds: footageLength(KEEP, HITS), theme: 'bold', grain: false };
export default () => (
  <Footage src="<the user's video path>" keep={KEEP} words={words} hits={HITS}
    punch={[/* 0–3 source times for a sharp zoom on a deadpan look */]}
    captions={{ per: 2, size: 84, y: 1300, upper: false }} />
);
\`\`\`
Hit: at = source time where the video pauses and the clip goes in — the SAME moment as the clip's start frame, and on a word boundary (a word's start or end from voice-times, never inside a word; pick the frame there in step 4a), dur = how long the clip plays (2.5–5 s; cut right after the payoff), src = the clip, from = skip the clip's first seconds, volume = the clip's sound (default 1). meta.seconds MUST be footageLength(KEEP, HITS) — the clips add to the length. Never set mode:'over' for AI clips (that would play the voice and the clip at the same time). Use absolute paths if a relative one is not found.
6. Check: render frames just before, inside and after 2–3 hits (--at <output sec> --format jpg --draft) and LOOK: the cut in is seamless, the absurd thing is visible, captions readable. Then the final render (no --draft). End with the output path and one line per hit (what happens), then the REEL HAND-OFF (below).

${REEL_HANDOFF}`;
}
