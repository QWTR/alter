// VoiceStudio managed by ALTTER: one click downloads the official Windows build from its GitHub release,
// checks it against the release's SHA256SUMS, installs it silently into ALTTER's data folder and runs it
// in the background (no window). Its web interface is shown inside ALTTER (Studio → Voice-over).
// The first launch needs VoiceStudio's one-time setup (it downloads Python and the speech libraries
// itself and asks about analytics): that screen opens once; afterwards everything runs inside ALTTER.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HOME } from './config.ts';

const REPO = 'debpalash/VoiceStudio';
export const VS_BASE = 'http://127.0.0.1:3900';
const root = () => join(HOME, 'voicestudio');
const appDir = () => join(root(), 'app');
const BG = '--voicestudio-background';

export type VsPhase = 'idle' | 'downloading' | 'verifying' | 'installing' | 'starting' | 'error';
const job: { phase: VsPhase; got: number; total: number; version?: string; error?: string } = { phase: 'idle', got: 0, total: 0 };
let startedAt = 0;
let setupOpened = false;

/** The installed VoiceStudio.exe (ALTTER's own install first, then a normal per-user install). */
export function vsExe(): string | undefined {
  const dirs = [appDir(), join(process.env.LOCALAPPDATA ?? '', 'Programs', 'VoiceStudio'), join(process.env.LOCALAPPDATA ?? '', 'Programs', 'voicestudio')];
  for (const d of dirs) {
    if (!d || !existsSync(d)) continue;
    const exe = readdirSync(d).find((f) => /^voicestudio\.exe$/i.test(f)) ?? readdirSync(d).find((f) => /\.exe$/i.test(f) && !/^uninstall/i.test(f));
    // child processes (the studio kit's voice.mjs) start it the same way
    if (exe) return (process.env.ALTER_VOICESTUDIO_EXE = join(d, exe));
  }
  return undefined;
}

async function backendUp(): Promise<boolean> {
  try { return (await fetch(`${VS_BASE}/health`, { signal: AbortSignal.timeout(2500) })).ok; } catch { return false; }
}

export async function vsAppStatus() {
  const exe = vsExe();
  const up = await backendUp();
  // started in the background but the backend never came: VoiceStudio is waiting for its one-time setup
  const needsSetup = !!exe && !up && job.phase !== 'starting' && startedAt > 0 && Date.now() - startedAt > 45_000;
  return {
    supported: process.platform === 'win32',
    installed: !!exe, up, needsSetup, setupOpened,
    phase: job.phase, got: job.got, total: job.total, version: job.version, error: job.error,
    ui: VS_BASE + '/',
  };
}

const gh = (path: string) => fetch(`https://api.github.com/repos/${REPO}/${path}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'ALTTER' }, signal: AbortSignal.timeout(20_000) });

/** Downloads, verifies and silently installs the latest Windows build. Returns at once; progress via vsAppStatus(). */
export function installVoiceStudio() {
  if (process.platform !== 'win32') throw Error('Automatic install is available on Windows; on macOS/Linux install VoiceStudio from its website.');
  if (['downloading', 'verifying', 'installing', 'starting'].includes(job.phase)) return;
  Object.assign(job, { phase: 'downloading', got: 0, total: 0, error: undefined });
  void (async () => {
    const setup = join(root(), 'VoiceStudio-setup.exe');
    try {
      const rel = await gh('releases/latest');
      if (!rel.ok) throw Error(`GitHub: HTTP ${rel.status}`);
      const j = await rel.json() as { tag_name: string; assets: { name: string; size: number; browser_download_url: string }[] };
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const asset = j.assets.find((a) => new RegExp(`^VoiceStudio-[\\w.-]+-win-${arch}\\.exe$`).test(a.name)) ?? j.assets.find((a) => /^VoiceStudio-[\w.-]+-win-x64\.exe$/.test(a.name));
      const sums = j.assets.find((a) => a.name === 'SHA256SUMS.txt');
      if (!asset || !sums) throw Error('This VoiceStudio release has no Windows installer with a checksum.');
      job.version = j.tag_name.replace(/^v/, '');
      job.total = asset.size;
      const want = (await (await fetch(sums.browser_download_url, { signal: AbortSignal.timeout(30_000) })).text())
        .split(/\r?\n/).map((l) => l.trim().split(/\s+\*?/)).find(([, n]) => n === asset.name)?.[0]?.toLowerCase();
      if (!want || !/^[a-f0-9]{64}$/.test(want)) throw Error('The checksum for the installer is missing.');

      mkdirSync(root(), { recursive: true });
      const res = await fetch(asset.browser_download_url, { headers: { 'user-agent': 'ALTTER' } });
      if (!res.ok || !res.body) throw Error(`Download: HTTP ${res.status}`);
      const hash = createHash('sha256');
      const body = Readable.fromWeb(res.body as any);
      body.on('data', (c: Buffer) => { hash.update(c); job.got += c.length; });
      await pipeline(body, createWriteStream(setup));

      job.phase = 'verifying';
      if (hash.digest('hex') !== want) throw Error('The download does not match the published checksum — not installed.');

      job.phase = 'installing';
      mkdirSync(appDir(), { recursive: true });
      // NSIS (electron-builder): silent, for this user only, into ALTTER's data folder (/D must be last, unquoted)
      const code = await new Promise<number>((resolve, reject) => {
        const p = spawn(setup, ['/S', '/currentuser', `/D=${appDir()}`], { windowsHide: true, stdio: 'ignore' });
        p.on('error', reject);
        p.on('exit', (c) => resolve(c ?? 1));
      });
      if (code !== 0) throw Error(`The installer stopped (exit ${code}).`);
      if (!vsExe()) throw Error('The installer finished but VoiceStudio.exe was not found.');
      rmSync(setup, { force: true });
      job.phase = 'starting';
      startVoiceStudio();
      // the first launch needs the one-time setup screen: open it right away so the user can finish it
      setTimeout(async () => { if (!(await backendUp())) openVoiceStudioWindow(); job.phase = 'idle'; }, 20_000);
    } catch (e) {
      Object.assign(job, { phase: 'error', error: (e as Error).message });
      rmSync(setup, { force: true });
    }
  })();
}

/** Runs VoiceStudio without a window (its own background mode). Idempotent: a second launch joins the first. */
export function startVoiceStudio(): boolean {
  const exe = vsExe();
  if (!exe) return false;
  startedAt = Date.now();
  const p = spawn(exe, [BG], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, VOICESTUDIO_IDLE_SHUTDOWN_S: '3600' } });
  p.on('error', () => {});
  p.unref();
  return true;
}

/** Opens VoiceStudio's own window (only needed for its one-time setup; a running copy just shows a window). */
export function openVoiceStudioWindow(): boolean {
  const exe = vsExe();
  if (!exe) return false;
  setupOpened = true;
  startedAt = Date.now();
  const p = spawn(exe, [], { detached: true, stdio: 'ignore' });
  p.on('error', () => {});
  p.unref();
  return true;
}

/** Stops a VoiceStudio ALTTER started (never one with a window open — VoiceStudio itself decides). */
export function stopVoiceStudio() {
  const exe = vsExe();
  if (!exe || !startedAt) return;
  try { spawn(exe, ['--voicestudio-stop'], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch { /* already gone */ }
}

/** Makes sure the backend answers, starting it when installed. Waits up to `ms`. */
export async function ensureVoiceStudio(ms = 90_000): Promise<boolean> {
  if (await backendUp()) return true;
  if (!startVoiceStudio()) return false;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000));
    if (await backendUp()) return true;
  }
  return false;
}

