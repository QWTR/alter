// Updates: asks GitHub for the newest ALTTER release (public, no account, nothing about the user is sent),
// tells the UI when a newer one exists, and on the computer downloads + runs the installer by itself.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { emit } from './events.ts';
import { VERSION } from './version.ts';

const REPO = 'QWTR/alter';
const PAGE = `https://github.com/${REPO}/releases/latest`;
const SETUP = `https://github.com/${REPO}/releases/latest/download/ALTTER-Setup.exe`;
const APK = `https://github.com/${REPO}/releases/latest/download/ALTTER.apk`;
const EVERY = 2 * 3600_000;

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
  installing?: boolean;
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

export const updateInfo = () => info;

export async function checkUpdate(): Promise<UpdateInfo> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'ALTTER-updater' }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const j = (await r.json()) as { tag_name?: string; body?: string; html_url?: string; draft?: boolean; prerelease?: boolean };
    const latest = String(j.tag_name ?? '').replace(/^v/i, '');
    const was = info.available;
    const apk = String(j.body ?? '').match(/^\s*(?:<!--\s*)?apk:\s*v?([\d.]+)/im)?.[1] ?? null;
    info = { ...info, apkVersion: apk ?? (latest || null), latest: latest || null, available: !!latest && newer(latest, VERSION), notes: String(j.body ?? '').slice(0, 2000), page: j.html_url || PAGE, checkedAt: new Date().toISOString(), error: undefined };
    if (info.available && !was) emit('update.available', { latest: info.latest });
  } catch (e) {
    info = { ...info, checkedAt: new Date().toISOString(), error: (e as Error).message };
  }
  return info;
}

/** Checks a minute after start, then every 6 hours. */
export function startUpdateChecks() {
  if (timer || process.env.ALTER_NO_UPDATE_CHECK) return;
  setTimeout(() => void checkUpdate(), 60_000).unref();
  timer = setInterval(() => void checkUpdate(), EVERY);
  timer.unref();
}

/** Desktop app: download the installer, close ALTTER, install over it and start it again. */
export async function installUpdate(): Promise<void> {
  if (!inDesktopApp()) throw new Error('Download the new version from ' + PAGE);
  if (info.installing) return;
  if (!info.available) await checkUpdate();
  if (!info.available) throw new Error('ALTTER is up to date');
  info = { ...info, installing: true };
  emit('update.progress', { stage: 'download' });
  try {
    const file = join(tmpdir(), `ALTTER-Setup-${info.latest}.exe`);
    const r = await fetch(SETUP, { redirect: 'follow', headers: { 'user-agent': 'ALTTER-updater' } });
    if (!r.ok || !r.body) throw new Error(`Download failed (${r.status})`);
    await pipeline(Readable.fromWeb(r.body as any), createWriteStream(file));
    if (!existsSync(file) || statSync(file).size < 5_000_000) throw new Error('The download is incomplete — try again');
    emit('update.progress', { stage: 'install' });
    // the installer refuses to run while ALTTER is open: start it a few seconds after we quit
    const dir = dirname(process.execPath);
    const cmd = `timeout /t 3 /nobreak >nul & start "" "${file}" /S --force-run /D=${dir}`;
    spawn('cmd.exe', ['/d', '/c', cmd], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
    setTimeout(() => process.exit(0), 800);
  } catch (e) {
    info = { ...info, installing: false };
    emit('update.progress', { stage: 'error', error: (e as Error).message });
    throw e;
  }
}
