#!/usr/bin/env node
// Picks up a file the browser just downloaded (e.g. a Gemini video saved from the page) and moves it into the project.
//   node grab-download.mjs <exact size in bytes> <out path> [--wait 90]
// Matches by size among files changed in the last 15 min in the Downloads folder — any name, also a pending .tmp /
// .crdownload (some browsers keep it under a temp name until "keep / save as" is confirmed).
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const [sizeArg, outArg] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--wait');
const waitS = Number(process.argv[process.argv.indexOf('--wait') + 1]) || 90;
const size = Number(sizeArg);
if (!size || !outArg) {
  console.log('Usage: node grab-download.mjs <size-bytes> <out.mp4> [--wait 90]');
  process.exit(1);
}
const dirs = [process.env.ALTER_DOWNLOADS, join(homedir(), 'Downloads'), join(homedir(), 'Pobrane')].filter((d) => d && existsSync(d));
const out = resolve(outArg);
const end = Date.now() + waitS * 1000;
while (Date.now() < end) {
  for (const d of dirs) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (!st.isFile() || st.size !== size || Date.now() - st.mtimeMs > 15 * 60_000) continue;
      mkdirSync(dirname(out), { recursive: true });
      copyFileSync(p, out);
      console.log(`OUTPUT ${out}  (from ${name})`);
      process.exit(0);
    }
  }
  await new Promise((r) => setTimeout(r, 1500));
}
console.error(`NOT_FOUND: no file of ${size} bytes in ${dirs.join(', ')} — the browser may be asking where to save it; ask the user to confirm the download, then run this again.`);
process.exit(2);
