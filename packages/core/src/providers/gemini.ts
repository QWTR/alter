import { workspaceDir } from '../config.ts';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { runProcess, tryJson } from './process.ts';
import type { Provider } from './types.ts';

/**
 * Google AI subscription (Free / Pro / Ultra) through Google's official Antigravity CLI (`agy`).
 * Google retired the Gemini CLI sign-in for personal accounts; `agy` is its successor and signs in with the
 * same Google account (login kept in the OS keyring by agy itself — ALTTER never sees it).
 * ALTTER installs agy on its own (Google's release manifest, SHA-512 checked) — no Antigravity app needed.
 */
const isWin = process.platform === 'win32';
const home = homedir();
const binDir = isWin ? join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'agy', 'bin') : join(home, '.local', 'bin');
const binPath = join(binDir, isWin ? 'agy.exe' : 'agy');
/** The agy binary: ALTTER's/Google's default install place, else whatever `agy` is on PATH. */
export const agyBin = () => (existsSync(binPath) ? binPath : 'agy');

const MANIFESTS = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests';
function platform() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  return `${isWin ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'}_${arch}`;
}

/** Downloads Google's agy release for this computer and checks its SHA-512 against Google's manifest. */
export async function installAgy(): Promise<void> {
  const m = await (await fetch(`${MANIFESTS}/${platform()}.json`)).json() as { url?: string; sha512?: string; version?: string };
  if (!m.url || !m.sha512) throw new Error('Antigravity CLI: no release for this computer');
  const r = await fetch(m.url);
  if (!r.ok) throw new Error(`Antigravity CLI download failed (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  const sum = createHash('sha512').update(buf).digest('hex');
  if (sum.toLowerCase() !== m.sha512.toLowerCase()) throw new Error('Antigravity CLI: checksum mismatch — download rejected');
  mkdirSync(dirname(binPath), { recursive: true });
  const tmp = binPath + '.download';
  writeFileSync(tmp, buf);
  if (!isWin) chmodSync(tmp, 0o755);
  renameSync(tmp, binPath);
}

// 'pro' / 'flash' → the newest matching slug agy offers right now (slugs change with every Gemini release)
let modelCache: { at: number; list: string[] } | undefined;
async function slugs(): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.at < 6 * 3600_000) return modelCache.list;
  const r = await runProcess(agyBin(), ['models'], { timeoutMs: 30_000 }).catch(() => undefined);
  const list = (r?.stdout ?? '').split(/\r?\n/).map((l) => l.split('\t')[0].trim()).filter((s) => /^[a-z0-9][\w.-]+$/.test(s) && s.includes('-'));
  if (list.length) modelCache = { at: Date.now(), list };
  return list;
}
async function slugFor(model?: string, fast?: boolean): Promise<string | undefined> {
  const want = fast && !model ? 'flash' : model;
  if (!want) return undefined;
  const list = await slugs();
  if (list.includes(want)) return want;
  const gem = list.filter((s) => s.startsWith('gemini'));
  if (want === 'flash') return gem.find((s) => /flash-medium$/.test(s)) ?? gem.find((s) => /flash/.test(s));
  if (want === 'pro') return gem.find((s) => !/flash/.test(s) && /-high$/.test(s)) ?? gem.find((s) => !/flash/.test(s));
  return undefined;
}

async function detectAgy(): Promise<{ installed: boolean; version?: string }> {
  try {
    const r = await runProcess(agyBin(), ['--version'], { timeoutMs: 20_000 });
    if (r.code !== 0) return { installed: false };
    return { installed: true, version: `agy ${r.stdout.trim().split('\n')[0]}` };
  } catch {
    return { installed: false };
  }
}

let authCache: { at: number; ok: boolean } | undefined;

export const gemini: Provider = {
  id: 'gemini',
  name: 'Gemini',
  vendor: 'Google',
  subscription: 'Google AI Pro / Ultra · free Google account',
  installCmd: 'irm https://antigravity.google/cli/install.ps1 | iex',
  loginCmd: 'agy acp --login',
  loginArgs: ['acp', '--login'],
  loginBin: agyBin,
  install: installAgy,
  credFiles: [],
  async authStatus() {
    if (authCache && Date.now() - authCache.at < (authCache.ok ? 5 * 60_000 : 8_000)) return authCache.ok;
    if (!(await detectAgy()).installed) return undefined;
    const r = await runProcess(agyBin(), ['-p=Reply with exactly: OK', '--output-format', 'json', '--disable-slash-commands'], { timeoutMs: 45_000, cwd: workspaceDir() }).catch(() => undefined);
    if (!r) return undefined;
    const ev = tryJson(r.stdout.trim().split(/\r?\n/).pop() ?? '');
    const ok = ev?.status === 'SUCCESS';
    if (!ok && !/auth|sign|login|credential/i.test(r.stdout + r.stderr)) return undefined;
    authCache = { at: Date.now(), ok };
    return ok;
  },
  models: [
    { id: 'pro', label: 'Pro' },
    { id: 'flash', label: 'Flash' },
  ],
  efforts: ['low', 'medium', 'high', 'xhigh'],
  detect: detectAgy,

  async run({ prompt, onDelta, onActivity, fileDirs = [], access = 'chat', cwd, signal, timeoutMs, model, effort, fast }) {
    const slug = await slugFor(model, fast);
    let text = '';
    let final = '';
    let error = '';
    let step: number | undefined;
    let usage: { input: number; output: number; cached?: number } | undefined;
    const r = await runProcess(agyBin(), [
      '--output-format', 'stream-json', '--input-format', 'stream-json', '--disable-slash-commands',
      ...(access === 'full' ? ['--dangerously-skip-permissions'] : []),
      ...(slug ? ['--model', slug] : []),
      ...(effort ? ['--effort', effort] : []),
      ...fileDirs.flatMap((d) => ['--add-dir', d]),
      '-p=',
    ], {
      input: JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n',
      cwd: cwd ?? workspaceDir(),
      signal,
      timeoutMs,
      onLine(line) {
        const ev = tryJson(line);
        if (!ev) return;
        const st = ev.step_update;
        if (st?.step_type === 'agent_response' && st.text_delta) {
          const chunk = (text && st.step_index !== step ? '\n\n' : '') + st.text_delta;
          step = st.step_index;
          text += chunk;
          onDelta?.(chunk);
        }
        if (st?.step_type === 'tool' && st.state === 'ACTIVE' && st.tool_name) {
          const p = st.tool_info?.parameters ?? {};
          onActivity?.(st.tool_name === 'run_command' ? `Shell: ${String(p.CommandLine ?? '').slice(0, 120)}` : `${st.tool_name}${p.AbsolutePath ?? p.TargetFile ? `: ${p.AbsolutePath ?? p.TargetFile}` : ''}`);
        }
        if (ev.event === 'result') {
          const res = ev.result ?? {};
          final = res.response ?? '';
          if (res.status === 'ERROR') error = res.error ?? 'Gemini error';
          const u = res.usage;
          if (u) usage = { input: Math.max(0, (u.input_tokens ?? 0) - (u.cache_read_tokens ?? 0)), cached: u.cache_read_tokens ?? 0, output: (u.output_tokens ?? 0) + (u.thinking_tokens ?? 0) };
        }
      },
    });
    const out = (text || final).trim();
    if (!out) {
      const msg = error || r.stderr.trim() || `agy exited with code ${r.code}`;
      if (/auth|sign in|login|credential/i.test(msg)) authCache = { at: Date.now(), ok: false };
      throw new Error(msg);
    }
    authCache = { at: Date.now(), ok: true };
    return { text: out, usage };
  },
};
