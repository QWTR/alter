// Updates: asks GitHub for the newest ALTTER release (public, no account, nothing about the user is sent),
// tells the UI when a newer one exists, and on the computer installs it by itself — quietly:
// - quick update: when the new release runs on the same Electron, only the app files (~2 MB zip) are
//   downloaded and swapped in after ALTTER closes. No installer, no window, shortcuts untouched.
// - full update: otherwise the installer runs silently as an update (keeps the desktop shortcut).
// A tiny helper (ALTTER.exe itself in node mode — no console window) waits for ALTTER to close,
// swaps the files or runs the installer, and starts ALTTER again. The UI shows each step with progress.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { emit } from './events.ts';
import { VERSION } from './version.ts';

const REPO = 'QWTR/alter';
const PAGE = `https://github.com/${REPO}/releases/latest`;
const SETUP = `https://github.com/${REPO}/releases/latest/download/ALTTER-Setup.exe`;
const APP_ZIP = 'ALTTER-app.zip';
const APK = `https://github.com/${REPO}/releases/latest/download/ALTTER.apk`;
const EVERY = 2 * 3600_000;

export interface UpdateProgress {
  /** download → unpack → restart; error when it failed */
  stage: 'download' | 'unpack' | 'restart' | 'error';
  /** quick = only the app files; full = the whole installer */
  mode: 'quick' | 'full';
  done: number;
  total: number;
  error?: string;
}

export interface UpdateInfo {
  current: string;
  latest: string | null;
  available: boolean;
  notes: string;
  page: string;
  setupUrl: string;
  apkUrl: string;
  checkedAt: string | null;
  /** Version of the phone app in the newest release (desktop-only fixes reuse the previous APK). */
  apkVersion: string | null;
  /** This computer can install it by itself (the Windows desktop app). */
  canInstall: boolean;
  /** Size of what will be downloaded, and whether only the app files change. */
  quick?: boolean;
  size?: number;
  installing?: boolean;
  progress?: UpdateProgress;
  error?: string;
}

/** "0.14.0" > "0.13.2"; tags may start with "v". */
export function newer(a: string, b: string): boolean {
  const p = (v: string) => v.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

const inDesktopApp = () => process.platform === 'win32' && !!process.versions.electron;
let info: UpdateInfo = { current: VERSION, latest: null, available: false, notes: '', page: PAGE, setupUrl: SETUP, apkUrl: APK, checkedAt: null, apkVersion: null, canInstall: inDesktopApp() };
let timer: NodeJS.Timeout | null = null;
let assets: { quick?: { url: string; size: number }; setup?: { url: string; size: number } } = {};

export const updateInfo = () => info;

export async function checkUpdate(): Promise<UpdateInfo> {
  if (info.installing) return info;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'ALTTER-updater' }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const j = (await r.json()) as { tag_name?: string; body?: string; html_url?: string; assets?: { name: string; size: number; browser_download_url: string }[] };
    const latest = String(j.tag_name ?? '').replace(/^v/i, '');
    const was = info.available;
    const body = String(j.body ?? '');
    const apk = body.match(/^\s*(?:<!--\s*)?apk:\s*v?([\d.]+)/im)?.[1] ?? null;
    // the quick update only fits when the new app runs on the same Electron as this one
    const electron = body.match(/electron:\s*v?([\d.]+)/i)?.[1] ?? null;
    const zip = j.assets?.find((a) => a.name === APP_ZIP);
    const setup = j.assets?.find((a) => a.name === 'ALTTER-Setup.exe');
    assets = {
      quick: zip && electron && electron === process.versions.electron ? { url: zip.browser_download_url, size: zip.size } : undefined,
      setup: setup ? { url: setup.browser_download_url, size: setup.size } : { url: SETUP, size: 0 },
    };
    info = {
      ...info, apkVersion: apk ?? (latest || null), latest: latest || null, available: !!latest && newer(latest, VERSION),
      notes: body.slice(0, 2000), page: j.html_url || PAGE, checkedAt: new Date().toISOString(), error: undefined,
      quick: !!assets.quick, size: (assets.quick ?? assets.setup)?.size || undefined,
    };
    if (info.available && !was) emit('update.available', { latest: info.latest });
  } catch (e) {
    info = { ...info, checkedAt: new Date().toISOString(), error: (e as Error).message };
  }
  return info;
}

/** Checks a minute after start, then every 2 hours. */
export function startUpdateChecks() {
  if (timer || process.env.ALTER_NO_UPDATE_CHECK) return;
  setTimeout(() => void checkUpdate(), 60_000).unref();
  timer = setInterval(() => void checkUpdate(), EVERY);
  timer.unref();
}

const progress = (p: UpdateProgress) => {
  info = { ...info, progress: p };
  emit('update.progress', p);
};

async function download(url: string, file: string, size: number, mode: UpdateProgress['mode']) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'ALTTER-updater' } });
  if (!r.ok || !r.body) throw new Error(`Download failed (${r.status})`);
  const total = Number(r.headers.get('content-length')) || size || 0;
  const out = createWriteStream(file);
  let done = 0, last = 0;
  progress({ stage: 'download', mode, done, total });
  const reader = r.body.getReader();
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    done += value.length;
    if (!out.write(value)) await new Promise<void>((res) => out.once('drain', () => res()));
    if (Date.now() - last > 250) { last = Date.now(); progress({ stage: 'download', mode, done, total }); }
  }
  await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
  progress({ stage: 'download', mode, done, total: total || done });
  if (total && done < total) throw new Error('The download is incomplete — try again');
}

/** Runs after ALTTER closed: swap the app files (or run the installer), then start ALTTER again. Plain node, no window. */
const HELPER = `
const fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process');
const [pid, appDir, mode, src] = process.argv.slice(2);
const exe = path.join(appDir, 'ALTTER.exe');
const alive = () => { try { process.kill(Number(pid), 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => { try { fs.appendFileSync(path.join(require('os').tmpdir(), 'altter-update.log'), new Date().toISOString() + ' ' + m + '\\n'); } catch {} };
const start = () => spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')) }).unref();
(async () => {
  for (let i = 0; i < 200 && alive(); i++) await sleep(300);
  await sleep(1200);
  if (mode === 'full') {
    log('installer ' + src);
    spawnSync(src, ['/S', '--updated', '--force-run', '/D=' + appDir], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  const res = path.join(appDir, 'resources'), old = path.join(appDir, 'resources.old');
  let moved = false;
  for (let i = 0; i < 40 && !moved; i++) {
    try { fs.rmSync(old, { recursive: true, force: true }); fs.renameSync(res, old); moved = true; } catch (e) { await sleep(500); if (i === 39) log('rename failed ' + e.message); }
  }
  if (moved) {
    try { fs.renameSync(src, res); log('swapped'); }
    catch (e) { log('swap failed ' + e.message); try { fs.renameSync(old, res); } catch {} }
  }
  start();
  await sleep(3000);
  try { fs.rmSync(old, { recursive: true, force: true }); } catch {}
})().catch((e) => { log(e.stack); start(); });
`;

/** Desktop app: download the update, close ALTTER, put the new version in place and start it again. */
export async function installUpdate(): Promise<void> {
  if (!inDesktopApp()) throw new Error('Download the new version from ' + PAGE);
  if (info.installing) return;
  if (!info.available) await checkUpdate();
  if (!info.available) throw new Error('ALTTER is up to date');
  const appDir = dirname(process.execPath);
  const quick = assets.quick;
  const mode: UpdateProgress['mode'] = quick ? 'quick' : 'full';
  info = { ...info, installing: true, progress: undefined };
  try {
    const work = join(tmpdir(), `altter-update-${info.latest}`);
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    let src: string;
    if (quick) {
      const zip = join(work, APP_ZIP);
      await download(quick.url, zip, quick.size, mode);
      progress({ stage: 'unpack', mode, done: 0, total: 1 });
      // the new app files go next to the current ones (same drive → the swap is a rename)
      src = join(appDir, 'resources.new');
      rmSync(src, { recursive: true, force: true });
      mkdirSync(src, { recursive: true });
      const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
      const r = spawnSync(tar, ['-xf', zip, '-C', src], { windowsHide: true, encoding: 'utf8' });
      if (r.status !== 0 || !existsSync(join(src, 'app.asar'))) throw new Error('Could not unpack the update' + (r.stderr ? `: ${r.stderr.trim().slice(0, 200)}` : ''));
      progress({ stage: 'unpack', mode, done: 1, total: 1 });
    } else {
      src = join(work, `ALTTER-Setup-${info.latest}.exe`);
      await download(assets.setup?.url ?? SETUP, src, assets.setup?.size ?? 0, mode);
      if (statSync(src).size < 5_000_000) throw new Error('The download is incomplete — try again');
    }
    progress({ stage: 'restart', mode, done: 1, total: 1 });
    const helper = join(work, 'altter-update.cjs');
    writeFileSync(helper, HELPER);
    spawn(process.execPath, [helper, String(process.pid), appDir, mode, src], {
      detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }).unref();
    // let the UI show "restarting" for a moment, then close (the helper waits for this process to end)
    setTimeout(() => process.exit(0), 1500);
  } catch (e) {
    info = { ...info, installing: false };
    progress({ stage: 'error', mode, done: 0, total: 0, error: (e as Error).message });
    throw e;
  }
}
