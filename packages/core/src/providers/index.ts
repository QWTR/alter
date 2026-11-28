import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadConfig, saveConfig } from '../config.ts';
import { emit } from '../events.ts';
import { claude } from './claude.ts';
import { codex } from './codex.ts';
import { gemini } from './gemini.ts';
import { demo } from './demo.ts';
import type { Provider, ProviderStatus } from './types.ts';
import { instrument, isLimited } from '../usage.ts';

export const providers: Provider[] = [claude, codex, gemini, demo].map(instrument);

const detectCache = new Map<string, { at: number; installed: boolean; version?: string }>();

async function detect(p: Provider, fresh = false) {
  const hit = detectCache.get(p.id);
  if (hit && !fresh && Date.now() - hit.at < 5 * 60_000) return hit;
  const d = { at: Date.now(), ...(await p.detect()) };
  detectCache.set(p.id, d);
  return d;
}

export async function providerStatuses(fresh = false): Promise<ProviderStatus[]> {
  const resolved = await resolveProvider('default');
  const health = loadConfig().providerHealth;
  return Promise.all(
    providers.map(async (p) => {
      const d = await detect(p, fresh);
      let h = staleHealth(p.id, health[p.id]);
      // already signed in through the CLI itself (e.g. after a reinstall): connected, no test call needed
      if (!h && d.installed && p.id !== 'demo' && (await p.authStatus?.().catch(() => undefined)) === true) {
        markConnected(p.id);
        h = loadConfig().providerHealth[p.id];
      }
      const live = d.installed ? await p.listModels?.().catch(() => undefined) : undefined;
      const liveEfforts = d.installed ? await p.listEfforts?.().catch(() => undefined) : undefined;
      return {
        id: p.id,
        name: p.name,
        vendor: p.vendor,
        subscription: p.subscription,
        installed: d.installed,
        version: d.version,
        installCmd: p.installCmd,
        loginCmd: p.loginCmd,
        isDefault: p.id === resolved.id,
        models: live?.length ? live : p.models ?? [],
        efforts: liveEfforts?.length ? liveEfforts : p.efforts ?? [],
        connected: p.id === 'demo' ? true : d.installed && !!h?.ok,
        health: h,
      };
    }),
  );
}

/**
 * 'default' → configured default if usable, else the first connected (tested OK) provider,
 * else the first installed one, else demo.
 */
export async function resolveProvider(id?: string, opts: { avoidLimited?: boolean } = {}): Promise<Provider> {
  const cfg = loadConfig();
  const wanted = !id || id === 'default' ? cfg.defaultProvider : id;
  const explicit = providers.find((p) => p.id === wanted);
  const avoid = (p: Provider) => !!opts.avoidLimited && isLimited(p.id);
  if (explicit && !avoid(explicit) && (await detect(explicit)).installed) return explicit;
  const real = providers.filter((p) => p.id !== 'demo' && !avoid(p));
  for (const p of real) if (cfg.providerHealth[p.id]?.ok && (await detect(p)).installed) return p;
  for (const p of real) if ((await detect(p)).installed) return p;
  if (opts.avoidLimited && explicit) return explicit; // nothing else available — let the caller show the limit
  return demo;
}

/** Real round-trip through the subscription: proves the CLI is installed AND signed in. */
export async function testProvider(id: string) {
  const p = providers.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  const t = Date.now();
  let result;
  try {
    if (!(await detect(p, true)).installed) throw new Error('not-installed');
    const { text } = await p.run({ prompt: 'Reply with exactly: OK', fast: true, access: 'chat', timeoutMs: 90_000 });
    if (!/ok/i.test(text)) throw new Error(text.slice(0, 200));
    result = { ok: true, checkedAt: new Date().toISOString(), latencyMs: Date.now() - t, ...(id === 'gemini' ? { via: 'agy' } : {}) };
  } catch (err) {
    const msg = (err as Error).message;
    result = { ok: false, checkedAt: new Date().toISOString(), error: /login|auth|credential|sign in|401|unauthor/i.test(msg) ? 'not-signed-in' : msg.slice(0, 300) };
  }
  const cfg = loadConfig();
  cfg.providerHealth[id] = result;
  saveConfig();
  emit('provider.tested', { id, ...result });
  return result;
}

// Where each official CLI keeps its own login (ALTTER never reads these — it only watches for a change).
const CRED_FILES: Record<string, string[]> = {
  claude: [join(homedir(), '.claude', '.credentials.json'), join(homedir(), '.claude.json')],
  codex: [join(homedir(), '.codex', 'auth.json')],
};
const credFiles = (p: Provider) => p.credFiles ?? CRED_FILES[p.id] ?? [];
const mtime = (files: string[]) => Math.max(0, ...files.map((f) => { try { return statSync(f).mtimeMs; } catch { return 0; } }));
const connecting = new Map<string, () => void>();

function killTree(pid?: number) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    else process.kill(-pid, 'SIGTERM');
  } catch {}
}

function installHidden(p: Provider): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn(p.installCmd, { shell: true, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr?.on('data', (d) => (err += d));
    child.on('error', rej);
    child.on('close', (code) => (code === 0 ? res() : rej(new Error(err.trim().split(/\r?\n/).slice(-3).join(' ') || `install failed (${code})`))));
  });
}

function markConnected(id: string) {
  const cfg = loadConfig();
  cfg.providerHealth[id] = { ok: true, checkedAt: new Date().toISOString(), ...(id === 'gemini' ? { via: 'agy' } : {}) };
  saveConfig();
  emit('provider.tested', { id, ok: true });
}

/** A "connected" Gemini from before 0.16.7 was the retired Gemini CLI — check it again through agy. */
function staleHealth(id: string, h: ProviderStatus['health']) {
  if (id !== 'gemini' || !h || (h as { via?: string }).via === 'agy') return h;
  const cfg = loadConfig();
  delete cfg.providerHealth[id];
  saveConfig();
  return undefined;
}

/**
 * Connects a subscription with the vendor's own flow — without any terminal window:
 *  1. installs the official CLI silently (progress shown in the app),
 *  2. if the CLI is already signed in, that's it,
 *  3. otherwise starts the vendor's sign-in in the background; only the browser opens,
 *     and the sign-in link is also shown in ALTTER in case the browser didn't open.
 * ALTTER never sees credentials: the official CLI stores its own login.
 */
export async function connectProvider(id: string): Promise<{ started: true }> {
  const p = providers.find((x) => x.id === id);
  if (!p || id === 'demo') throw new Error(`Unknown provider: ${id}`);
  connecting.get(id)?.();
  const progress = (stage: string, extra: Record<string, unknown> = {}) => emit('provider.progress', { id, stage, ...extra });

  (async () => {
    let child: ReturnType<typeof spawn> | undefined;
    try {
      if (!(await detect(p, true)).installed) {
        progress('installing');
        await (p.install ? p.install() : installHidden(p));
        detectCache.delete(p.id);
      }
      progress('checking');
      // after an expired login the CLI may still say "logged in" (the token can't be refreshed): sign in for real
      const expired = loadConfig().providerHealth[id]?.error === 'not-signed-in';
      if (!expired && (await p.authStatus?.()) === true) {
        markConnected(id);
        progress('done');
        return;
      }

      progress('signing-in');
      const before = mtime(credFiles(p));
      const args = p.loginArgs ?? ['-p', 'Reply with exactly: OK'];
      const env = { ...process.env };
      delete env.CLAUDECODE;
      delete env.CLAUDE_CODE_ENTRYPOINT;
      const bin = p.loginBin?.() ?? id;
      child = spawn([/\s/.test(bin) ? `"${bin}"` : bin, ...args].join(' '), { shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env });
      let exited = false;
      let sentUrl = false;
      const onOut = (d: Buffer) => {
        const url = String(d).match(/https:\/\/[^\s"'<>]+/)?.[0];
        if (url && !sentUrl) {
          sentUrl = true;
          progress('signing-in', { url });
        }
      };
      child.stdout?.on('data', onOut);
      child.stderr?.on('data', onOut);
      child.on('exit', () => (exited = true));
      child.on('error', () => (exited = true));

      const deadline = Date.now() + 10 * 60_000;
      let stopped = false;
      let lastPoll = Date.now();
      const c = child;
      connecting.set(id, () => { stopped = true; killTree(c.pid); });
      while (!stopped && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        // keyring logins (agy) leave no file to watch: ask the CLI every ~10 s instead
        const keyring = !credFiles(p).length && Date.now() - lastPoll > 10_000;
        if (keyring) lastPoll = Date.now();
        const changed = mtime(credFiles(p)) > before;
        if (!changed && !exited && !(keyring && (await p.authStatus?.()) === true)) continue;
        const signed = (await p.authStatus?.()) ?? (await testProvider(id)).ok;
        if (signed) {
          markConnected(id);
          progress('done');
          return;
        }
        if (exited) {
          progress('cancelled');
          return;
        }
      }
      if (!stopped) progress('cancelled');
    } catch (err) {
      progress('error', { error: (err as Error).message });
    } finally {
      killTree(child?.pid);
      connecting.delete(id);
    }
  })();
  return { started: true };
}

export type { Access, Provider, ProviderStatus } from './types.ts';
export { ACCESS_LEVELS } from './types.ts';
