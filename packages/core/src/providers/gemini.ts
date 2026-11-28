import { workspaceDir } from '../config.ts';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
let modelCache: { at: number; list: { id: string; label: string }[] } | undefined;
async function agyModels(): Promise<{ id: string; label: string }[]> {
  if (modelCache && Date.now() - modelCache.at < 6 * 3600_000) return modelCache.list;
  const r = await runProcess(agyBin(), ['models'], { timeoutMs: 30_000 }).catch(() => undefined);
  const list = (r?.stdout ?? '').split(/\r?\n/).map((l) => { const [id, label] = l.split('\t').map((s) => s?.trim()); return { id, label: label || id }; })
    .filter((m) => /^[a-z0-9][\w.-]+$/.test(m.id ?? '') && m.id.includes('-'));
  if (list.length) modelCache = { at: Date.now(), list };
  return list;
}
const slugs = async () => (await agyModels()).map((m) => m.id);
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
  // every model agy offers this account (Gemini, plus the Claude / GPT-OSS ones Antigravity hosts); Pro/Flash = newest
  listModels: async () => {
    const list = await agyModels();
    return list.length ? [{ id: 'pro', label: 'Pro' }, { id: 'flash', label: 'Flash' }, ...list] : [];
  },
  efforts: ['low', 'medium', 'high', 'xhigh'],
  detect: detectAgy,

  async run({ prompt, onDelta, onActivity, fileDirs = [], access = 'chat', cwd, signal, timeoutMs, model, effort, fast, mcp = [] }) {
    const slug = await slugFor(model, fast);
    const mcpNames = addAgyMcp(mcp);
    try {
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
    if (!out && signal?.aborted) throw new Error('Stopped.');
    if (!out) {
      const msg = error || r.stderr.trim() || `agy exited with code ${r.code}`;
      if (/auth|sign in|login|credential/i.test(msg)) authCache = { at: Date.now(), ok: false };
      throw new Error(msg);
    }
    authCache = { at: Date.now(), ok: true };
    return { text: out, usage };
    } finally {
      removeAgyMcp(mcpNames);
    }
  },
};

// ---- MCP servers for one run ----
// agy has no per-run MCP flag (--settings rejects mcpServers): it reads ~/.gemini/config/mcp_config.json.
// ALTTER adds its servers (alter_hands, alter_media, …) there for the run and removes them afterwards;
// the user's own entries are never touched. Leftovers from a crash are swept on the next run.
type McpServer = { name: string; url?: string; headers?: Record<string, string>; command?: string; args?: string[]; env?: Record<string, string> };
const agyMcpFile = () => join(process.env.ANTIGRAVITY_GEMINI_DIR || join(home, '.gemini'), 'config', 'mcp_config.json');
const OURS = /^(alter|altter)_[a-z]+(_\d+)?$/;
const live = new Set<string>();
let swept = false;

function editAgyMcp(fn: (servers: Record<string, unknown>) => void) {
  const file = agyMcpFile();
  let cfg: { mcpServers?: Record<string, unknown> } = {};
  try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch { /* missing or unreadable: start fresh */ }
  const servers = cfg.mcpServers && typeof cfg.mcpServers === 'object' ? cfg.mcpServers : {};
  fn(servers);
  cfg.mcpServers = servers;
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  renameSync(tmp, file);
}

function addAgyMcp(list: McpServer[]): string[] {
  if (!list.length && swept) return [];
  const names: string[] = [];
  try {
    editAgyMcp((servers) => {
      if (!swept) { for (const k of Object.keys(servers)) if (OURS.test(k) && !live.has(k)) delete servers[k]; swept = true; }
      for (const m of list) {
        // two chats at once get alter_hands and alter_hands_2, each with its own session URL
        let name = m.name;
        for (let i = 2; live.has(name); i++) name = `${m.name}_${i}`;
        const shim = isWin && /^(npx|uvx|npm|pnpm|bunx)$/i.test(m.command ?? '');
        servers[name] = m.url
          ? { serverUrl: m.url, ...(m.headers ? { headers: m.headers } : {}), disabled: false }
          : { command: shim ? 'cmd' : m.command, args: shim ? ['/c', m.command!, ...(m.args ?? [])] : m.args ?? [], ...(m.env ? { env: m.env } : {}), disabled: false };
        live.add(name);
        names.push(name);
      }
    });
  } catch { /* without the file Gemini simply runs without these tools */ }
  return names;
}

function removeAgyMcp(names: string[]) {
  if (!names.length) return;
  for (const n of names) live.delete(n);
  try { editAgyMcp((servers) => { for (const n of names) delete servers[n]; }); } catch { /* swept next run */ }
}
