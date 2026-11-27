#!/usr/bin/env node
// Alter Studio renderer.
//   node render.mjs <video.tsx> [--draft] [--sizes reel,square,wide] [--format mp4|webm|gif|png|jpg] [--at 2.5] [--out path]
// The video file exports `meta` and a default component built from 'alter-kit'. Output path is printed as "OUTPUT <path>".
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STUDIO = dirname(fileURLToPath(import.meta.url));
const FORMATS = { reel: [1080, 1920], story: [1080, 1920], square: [1080, 1080], post: [1080, 1350], wide: [1920, 1080], thumb: [1280, 720], banner: [1500, 500] };

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(['sizes', 'format', 'at', 'out']);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const name = a.slice(2);
    flags[name] = VALUE_FLAGS.has(name) ? argv[++i] : true;
  } else positional.push(a);
}
const flag = (name) => flags[name];
const file = positional[0];
if (!file) {
  console.error('Usage: node render.mjs <video.tsx> [--draft] [--sizes reel,square] [--format mp4|webm|gif|png|jpg] [--at seconds] [--out path]');
  process.exit(2);
}
const src = resolve(process.cwd(), file);
if (!existsSync(src)) {
  console.error(`No such file: ${src}`);
  process.exit(2);
}
const draft = !!flag('draft');
const format = String(flag('format') ?? '').toLowerCase();
const at = flag('at') !== undefined ? Number(flag('at')) : undefined;
const sizes = flag('sizes') ? String(flag('sizes')).split(',').map((s) => s.trim()).filter(Boolean) : [null];
const id = basename(src, extname(src)).replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'video';

// ---- progress, read by Alter to draw a progress bar in the chat ----
const progDir = join(STUDIO, '.progress');
mkdirSync(progDir, { recursive: true });
const progFile = join(progDir, `${process.pid}.json`);
let lastWrite = 0;
const progress = (stage, pct, force = false) => {
  const now = Date.now();
  if (!force && now - lastWrite < 400) return;
  lastWrite = now;
  lastProg = { cwd: process.cwd(), id, stage, pct: Math.round(pct * 1000) / 10, t: now };
  try { writeFileSync(progFile, JSON.stringify(lastProg)); } catch {}
};
// a slow step (starting the browser, one heavy frame) reports nothing for a while: keep the file fresh so the bar stays
let lastProg = null;
const beat = setInterval(() => { if (lastProg) { try { writeFileSync(progFile, JSON.stringify({ ...lastProg, t: Date.now() })); } catch {} } }, 2000);
beat.unref();
const done = () => { clearInterval(beat); lastProg = null; try { rmSync(progFile, { force: true }); } catch {} };
process.on('exit', done);

// ---- the video being rendered + the media files it points at ----
const source = readFileSync(src, 'utf8');
const key = (p) => p.replace(/[^a-zA-Z0-9.-]+/g, '_').slice(-140);
const extDir = join(STUDIO, 'public', 'ext');
mkdirSync(extDir, { recursive: true });
for (const m of source.matchAll(/(?:\bmedia\(|\b(?:src|image|music)\s*=\s*\{?)\s*(["'`])((?:\\.|(?!\1).)+)\1/g)) {
  const lit = m[2];
  if (/^(https?:|data:|blob:)/.test(lit)) continue;
  const real = lit.replace(/\\\\/g, '\\');
  const path = isAbsolute(real) ? real : [resolve(dirname(src), real), resolve(process.cwd(), real)].find((p) => existsSync(p)) ?? resolve(dirname(src), real);
  if (!existsSync(path) || !statSync(path).isFile()) continue;
  const dest = join(extDir, key(lit));
  if (!existsSync(dest) || statSync(dest).size !== statSync(path).size) copyFileSync(path, dest);
}
// any other quoted path to a media file (inside objects / arrays: hits={[{ src: '…', sfx: '…' }]})
for (const m of source.matchAll(/(["'`])([^"'`\n]{3,400}?\.(?:png|jpe?g|webp|gif|avif|svg|mp4|mov|webm|m4v|mkv|mp3|wav|m4a|aac|ogg|flac))\1/gi)) {
  const lit = m[2];
  if (/^(https?:|data:|blob:)/.test(lit)) continue;
  const real = lit.replace(/\\\\/g, '\\');
  const path = isAbsolute(real) ? real : [resolve(dirname(src), real), resolve(process.cwd(), real)].find((p) => existsSync(p)) ?? resolve(dirname(src), real);
  if (!existsSync(path) || !statSync(path).isFile()) continue;
  const dest = join(extDir, key(lit));
  if (!existsSync(dest) || statSync(dest).size !== statSync(path).size) copyFileSync(path, dest);
}
// font files the video names (brand fonts)
for (const m of source.matchAll(/(["'`])([^"'`\n]+\.(?:ttf|otf|woff2?))\1/gi)) {
  const lit = m[2];
  const real = lit.replace(/\\\\/g, '\\');
  const path = isAbsolute(real) ? real : [resolve(dirname(src), real), resolve(process.cwd(), real)].find((p) => existsSync(p)) ?? resolve(dirname(src), real);
  if (existsSync(path) && statSync(path).isFile()) copyFileSync(path, join(extDir, key(lit)));
}
// any Google Font the video names → registered with the kit (only those get bundled)
const BUILTIN = new Set(['Inter', 'Space Grotesk', 'Playfair Display', 'Bebas Neue', 'JetBrains Mono', 'Syne']);
const fontNames = new Set();
for (const m of source.matchAll(/(?:\b(?:display|body|fontName)\s*:\s*|\bfont\(\s*)(["'])([A-Za-z0-9 ]{2,40})\1/g)) if (!BUILTIN.has(m[2])) fontNames.add(m[2].trim());
const gfDir = join(STUDIO, 'node_modules', '@remotion', 'google-fonts', 'dist', 'esm');
const gf = [...fontNames].map((n) => ({ n, mod: n.replace(/\s+/g, '') })).filter((x) => existsSync(join(gfDir, x.mod + '.mjs')));
const fontCode = gf
  .map((x, i) => `import * as gf${i} from '@remotion/google-fonts/${x.mod}';
registerFont(${JSON.stringify(x.n)}, () => { const info: any = (gf${i} as any).getInfo(); const subsets = ['latin', 'latin-ext'].filter((s) => info.subsets.includes(s)); const weights = Object.keys(info.fonts.normal ?? {}).filter((w) => ['400', '500', '600', '700', '800', '900'].includes(w)); return (gf${i} as any).loadFont('normal', { subsets, weights }); });
`)
  .join('');
const fontHead = gf.length ? "import { registerFont } from './kit/stage';\n" + fontCode : '';
const fwd = (p) => p.replace(/\\/g, '/');
writeFileSync(join(STUDIO, 'src', 'videos.gen.ts'), `// written by render.mjs\n${fontHead}import * as v0 from ${JSON.stringify(fwd(src))};\nexport const VIDEOS: { id: string; mod: any }[] = [{ id: ${JSON.stringify(id)}, mod: v0 }];\n`);

// ---- names the video imports from 'alter-kit' that the kit does not have: say so plainly (weaker models invent components) ----
{
  const kitSrc = join(STUDIO, 'src', 'kit');
  const have = new Set(['AbsoluteFill', 'Img', 'OffthreadVideo', 'Audio', 'Sequence', 'useCurrentFrame', 'useVideoConfig', 'interpolate', 'spring', 'staticFile']);
  for (const f of readdirSync(kitSrc)) if (/\.tsx?$/.test(f)) for (const m of readFileSync(join(kitSrc, f), 'utf8').matchAll(/export (?:const|function|type|interface) ([A-Za-z0-9_]+)/g)) have.add(m[1]);
  const wanted = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]alter-kit['"]/g)].flatMap((m) => m[1].split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean));
  const missing = [...new Set(wanted.filter((n) => !have.has(n)))];
  if (missing.length) {
    console.error('NOT IN THE KIT: ' + missing.join(', ') + '. These components do not exist in alter-kit. Read ' + join(STUDIO, 'MODELS.md') + ' for what exists (Person, Animal, Item, Scenery, Car…). Anything else: build it yourself in the video file from <Model> + <Part> (see MODELS.md "Build your own model").');
    process.exit(2);
  }
  if (/<Car\b/.test(source) && /<Car\b[^>]*\bsiren\b/.test(source) && !/<Car\b[^>]*kind=["'{]+(police|ambulance|firetruck)/.test(source)) console.error('WARN a <Car> has siren but is not kind="police" | "ambulance" | "firetruck": civilian cars get no emergency lights (the siren prop is ignored).');
}
const warns = new Set();
const onBrowserLog = (log) => { const m = /ALTTER-WARN (.*)/.exec(log.text ?? ''); if (m) warns.add(m[1]); };

const { bundle } = await import('@remotion/bundler');
const { renderMedia, renderStill, selectComposition, ensureBrowser } = await import('@remotion/renderer');

progress('browser', 0, true);
// Remotion's own headless Chrome (downloaded once); if that is not possible, a Chrome / Edge already on the computer
const SYSTEM_BROWSERS = [
  process.env.ALTER_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
let browser = {};
try {
  await ensureBrowser({ onBrowserDownload: () => ({ version: null, onProgress: ({ percent }) => progress('browser', percent * 0.1) }) });
} catch (e) {
  const exe = SYSTEM_BROWSERS.find((p) => existsSync(p));
  if (!exe) throw e;
  console.error(`Using ${exe} (could not download Remotion's Chrome: ${e.message})`);
  browser = { browserExecutable: exe, chromeMode: 'chrome-for-testing' };
}
progress('bundle', 0.1, true);
const NM = join(STUDIO, 'node_modules');
const serveUrl = await bundle({
  entryPoint: join(STUDIO, 'src', 'index.ts'),
  publicDir: join(STUDIO, 'public'),
  onProgress: (p) => progress('bundle', 0.1 + (p / 100) * 0.15),
  webpackOverride: (c) => ({
    ...c,
    resolve: {
      ...c.resolve,
      alias: { ...(c.resolve?.alias ?? {}), 'alter-kit': join(STUDIO, 'src', 'kit', 'index.ts') },
      modules: [NM, 'node_modules'],
    },
    resolveLoader: { ...(c.resolveLoader ?? {}), modules: [NM, 'node_modules'] },
  }),
});

const comp = await selectComposition({ serveUrl, id, inputProps: {}, ...browser });
const isStill = comp.durationInFrames <= 1 || at !== undefined || ['png', 'jpg', 'jpeg', 'webp'].includes(format);
const ext = isStill ? (['jpg', 'jpeg'].includes(format) ? 'jpg' : format === 'webp' ? 'webp' : 'png') : format === 'webm' ? 'webm' : format === 'gif' ? 'gif' : 'mp4';
const outFlag = flag('out');
const outputs = [];
for (let i = 0; i < sizes.length; i++) {
  const size = sizes[i];
  const dims = size && FORMATS[size] ? FORMATS[size] : [comp.width, comp.height];
  const composition = { ...comp, width: dims[0], height: dims[1] };
  const name = `${id}${size ? `-${size}` : ''}${draft ? '-draft' : ''}.${ext}`;
  const output = typeof outFlag === 'string'
    ? (sizes.length > 1 || extname(outFlag) === '' ? join(resolve(outFlag), name) : resolve(outFlag))
    : join(process.cwd(), 'renders', name);
  mkdirSync(dirname(output), { recursive: true });
  const base = 0.25 + (0.75 * i) / sizes.length;
  const span = 0.75 / sizes.length;
  if (isStill) {
    await renderStill({ ...browser, onBrowserLog, composition, serveUrl, output, frame: at !== undefined ? Math.min(comp.durationInFrames - 1, Math.round(at * comp.fps)) : 0, imageFormat: ext === 'jpg' ? 'jpeg' : ext, scale: draft ? 0.5 : 1, ...(ext === 'jpg' ? { jpegQuality: 92 } : {}) });
    progress('render', base + span, true);
  } else {
    await renderMedia({
      ...browser, onBrowserLog, composition, serveUrl, outputLocation: output, inputProps: {},
      codec: ext === 'webm' ? 'vp8' : ext === 'gif' ? 'gif' : 'h264',
      everyNthFrame: ext === 'gif' ? 2 : 1,
      scale: draft ? 0.5 : 1,
      ...(ext === 'mp4' ? { crf: draft ? 28 : 18, pixelFormat: 'yuv420p' } : {}),
      imageFormat: 'jpeg', jpegQuality: draft ? 70 : 92,
      onProgress: ({ progress: p }) => progress('render', base + span * p),
    });
  }
  outputs.push(output);
}
done();
for (const w of warns) console.log(`WARN ${w}`);
for (const o of outputs) console.log(`OUTPUT ${o}`);
