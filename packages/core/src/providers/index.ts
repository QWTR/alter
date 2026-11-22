import { spawn } from 'node:child_process';
import { loadConfig } from '../config.ts';
import { claude } from './claude.ts';
import { codex } from './codex.ts';
import { gemini } from './gemini.ts';
import { demo } from './demo.ts';
import type { Provider, ProviderStatus } from './types.ts';

export const providers: Provider[] = [claude, codex, gemini, demo];

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
  return Promise.all(
    providers.map(async (p) => {
      const d = await detect(p, fresh);
      return {
        id: p.id,
        name: p.name,
        subscription: p.subscription,
        installed: d.installed,
        version: d.version,
        installCmd: p.installCmd,
        loginCmd: p.loginCmd,
        loginHint: p.loginHint,
        isDefault: p.id === resolved.id,
      };
    }),
  );
}

/** 'default' → configured default if installed, else first installed real provider, else demo. */
export async function resolveProvider(id?: string): Promise<Provider> {
  const wanted = !id || id === 'default' ? loadConfig().defaultProvider : id;
  const explicit = providers.find((p) => p.id === wanted);
  if (explicit && (await detect(explicit)).installed) return explicit;
  for (const p of providers) {
    if (p.id !== 'demo' && (await detect(p)).installed) return p;
  }
  return demo;
}

/**
 * Opens a terminal on the computer running Alter with the vendor's own install/login flow.
 * Alter never sees credentials: the official CLI stores its own login.
 */
export async function openLoginTerminal(id: string): Promise<{ command: string }> {
  const p = providers.find((x) => x.id === id);
  if (!p || !p.loginCmd) throw new Error(`Unknown provider: ${id}`);
  const installed = (await detect(p, true)).installed;
  const command = installed ? p.loginCmd : `${p.installCmd} && ${p.loginCmd}`;
  detectCache.delete(p.id);

  if (process.platform === 'win32') {
    spawn(`start "Alter - connect ${p.name}" cmd /k "${command}"`, { shell: true, detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    const script = `tell application "Terminal" to do script "${command.replace(/"/g, '\\"')}"`;
    spawn('osascript', ['-e', script, '-e', 'tell application "Terminal" to activate'], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('x-terminal-emulator', ['-e', 'bash', '-lc', `${command}; exec bash`], { detached: true, stdio: 'ignore' }).unref();
  }
  return { command };
}

export type { Provider, ProviderStatus } from './types.ts';
