#!/usr/bin/env node
// Style engine: show one scene in many animation styles BEFORE making the film, so the user can pick.
//   node style-preview.mjs "<the scene: who, where, doing what>" [--from frame.jpg] [--styles viral10 | clay,anime,pixel | all]
//                          [--format reel|square|wide] [--out assets/<name>/styles] [--lang pl|en] [--title "Który styl?"] [--via codex|gemini|openai]
// Makes one still per style with gen-image (the user's ChatGPT / Gemini; up to 3 at the same time), then a numbered
// sheet of all of them (StyleGrid). Prints "STYLE <id> <path>" per style, and "OUTPUT <sheet.jpg>".
// --from: redraws that frame (e.g. from the user's video) in every style — same people, poses and framing.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = {};
const words = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  else words.push(argv[i]);
}
const scene = words.join(' ').trim();
const lib = JSON.parse(readFileSync(join(DIR, 'styles.json'), 'utf8'));
if (!scene || opt.help) {
  console.log(`Usage: node style-preview.mjs "<scene>" [--from frame.jpg] [--styles viral10|all|${lib.styles.map((s) => s.id).join(',')}] [--format reel] [--out dir]`);
  console.log('Styles:'); for (const s of lib.styles) console.log(`  ${s.id.padEnd(10)} ${s.en} / ${s.pl}`);
  process.exit(scene ? 0 : 1);
}
const pick = String(opt.styles ?? 'viral10');
const ids = pick === 'all' ? lib.styles.map((s) => s.id) : lib.sets[pick] ?? pick.split(',').map((s) => s.trim()).filter(Boolean);
const styles = ids.map((id) => lib.styles.find((s) => s.id === id)).filter(Boolean);
if (!styles.length) { console.error(`No known styles in "${pick}" — see --help`); process.exit(2); }
const from = typeof opt.from === 'string' ? resolve(opt.from) : null;
if (from && !existsSync(from)) { console.error(`--from: file not found (${from})`); process.exit(2); }
const format = typeof opt.format === 'string' ? opt.format : 'reel';
const out = resolve(typeof opt.out === 'string' ? opt.out : `assets/styles-${Date.now()}`);
mkdirSync(out, { recursive: true });
// names and title in the user's language (--lang pl|en; the scene itself is usually English for the image AI)
const lang = typeof opt.lang === 'string' ? (/^pl/i.test(opt.lang) ? 'pl' : 'en') : /[ąćęłńóśźż]|\b(i|w|na|z|się)\b/i.test(scene) ? 'pl' : 'en';
const plStyles = (n) => (n === 1 ? 'styl' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'style' : 'stylów');

const run = (args) => new Promise((res) => {
  const p = spawn(process.execPath, [join(DIR, 'gen-image.mjs'), ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: process.env });
  let text = '';
  p.stdout.on('data', (d) => { text += d; });
  p.stderr.on('data', (d) => { text += d; });
  p.on('close', (code) => res({ code, text }));
});

console.log(`Previewing "${scene.slice(0, 80)}" in ${styles.length} styles (${from ? 'redrawing the frame' : 'from the description'}) — about ${Math.ceil(styles.length / 3) * 45} s…`);
const results = new Map();
let noAi = false;
const queue = [...styles];
await Promise.all([0, 1, 2].map(async () => {
  for (let s = queue.shift(); s; s = queue.shift()) {
    if (noAi) return;
    const file = join(out, `${s.id}.png`);
    const args = [scene, '--style', s.id, '--format', format, '--out', file];
    if (from) args.push('--from', from, '--restyle');
    if (typeof opt.via === 'string') args.push('--via', opt.via);
    const r = await run(args);
    if (/NO_IMAGE_AI/.test(r.text)) { noAi = true; console.error(r.text.trim().split('\n').pop()); return; }
    const got = r.text.match(/OUTPUT (.+\.(png|jpe?g|webp))/i)?.[1]?.trim();
    if (got && existsSync(got)) { results.set(s.id, got); console.log(`STYLE ${s.id} ${got}`); }
    else console.error(`  ${s.en}: ${r.text.trim().split('\n').slice(-2).join(' ').slice(0, 200)}`);
  }
}));
if (noAi) { console.error('NO_IMAGE_AI: sign in to ChatGPT/Codex (or Gemini) in ALTTER to make style previews.'); process.exit(3); }
const done = styles.filter((s) => results.has(s.id));
if (!done.length) { console.error('No style preview was made.'); process.exit(1); }

// the sheet: a numbered grid of all styles (a kit still), next to the stills
const name = `styles-${Date.now()}`;
const tsx = join(process.cwd(), 'videos', `${name}.tsx`);
mkdirSync(dirname(tsx), { recursive: true });
const items = done.map((s) => ({ name: s[lang] ?? s.en, src: results.get(s.id).replace(/\\/g, '/') }));
const title = typeof opt.title === 'string' ? opt.title : lang === 'pl' ? `${done.length} ${plStyles(done.length)} — który wybierasz?` : `${done.length} styles — which one?`;
writeFileSync(tsx, `import { StyleGrid } from 'alter-kit';
export const meta = { format: 'reel', still: true, theme: 'midnight' };
export default () => <StyleGrid title=${JSON.stringify(title)} items={${JSON.stringify(items)}} />;
`);
const sheet = join(out, 'sheet.jpg');
const r = await new Promise((res) => {
  const p = spawn(process.execPath, [join(DIR, 'render.mjs'), relative(process.cwd(), tsx), '--format', 'jpg', '--out', sheet], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let text = '';
  p.stdout.on('data', (d) => { text += d; });
  p.stderr.on('data', (d) => { text += d; });
  p.on('close', (code) => res({ code, text }));
});
writeFileSync(join(out, 'styles.json'), JSON.stringify(done.map((s) => ({ id: s.id, name: s[lang] ?? s.en, file: results.get(s.id), video: s.video })), null, 1));
if (existsSync(sheet)) console.log(`OUTPUT ${sheet}`);
else console.error(`The sheet did not render: ${r.text.trim().split('\n').slice(-3).join(' ').slice(0, 300)}`);
