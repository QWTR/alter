import { workspaceDir } from '../config.ts';
import { detectCli, runProcess, tryJson } from './process.ts';
import type { Provider } from './types.ts';

// pictures go to the model directly; other files it opens itself (read-only sandbox can read anywhere)
const images = (files: string[]) => {
  const list = files.filter((f) => /.(png|jpe?g|gif|webp|bmp)$/i.test(f) && !f.includes(','));
  return list.length ? ['--image', list.join(',')] : [];
};

/** ChatGPT Plus / Pro subscription through the official OpenAI Codex CLI (`codex exec`). */
export const codex: Provider = {
  id: 'codex',
  name: 'ChatGPT',
  vendor: 'OpenAI',
  subscription: 'ChatGPT Plus / Pro',
  installCmd: 'npm install -g @openai/codex',
  loginCmd: 'codex login',
  loginArgs: ['login'],
  async authStatus() {
    const r = await runProcess('codex', ['login', 'status'], { timeoutMs: 20_000 }).catch(() => undefined);
    if (!r) return undefined;
    return r.code === 0 && !/not logged in/i.test(r.stdout + r.stderr);
  },
  efforts: ['minimal', 'low', 'medium', 'high'],
  detect: () => detectCli('codex'),

  async run({ prompt, onDelta, onActivity, files = [], access = 'chat', cwd, signal, timeoutMs, model, effort, mcp = [] }) {
    const sandbox = access === 'full' ? ['--dangerously-bypass-approvals-and-sandbox'] : ['--sandbox', 'read-only'];
    const messages: string[] = [];
    let error = '';
    let usage: { input: number; output: number; cached?: number } | undefined;
    const r = await runProcess('codex', ['exec', ...images(files), '--json', '--skip-git-repo-check', ...sandbox, ...(model ? ['-m', model] : []), ...(effort ? ['-c', `model_reasoning_effort=${effort}`] : []), ...mcp.flatMap(codexMcp), '-'], {
      input: prompt,
      cwd: cwd ?? workspaceDir(),
      signal,
      timeoutMs,
      onLine(line) {
        const ev = tryJson(line);
        if (!ev) return;
        const item = ev.item ?? {};
        let text: string | undefined;
        if (ev.type === 'item.completed' && (item.type === 'agent_message' || item.item_type === 'assistant_message')) text = item.text;
        if (ev.type === 'item.started' && item.type === 'command_execution') onActivity?.(`Shell: ${String(item.command ?? '').slice(0, 120)}`);
        if (ev.msg?.type === 'agent_message') text = ev.msg.message;
        if (ev.type === 'error' || ev.msg?.type === 'error') error = ev.message ?? ev.msg?.message ?? 'Codex error';
        if (ev.type === 'turn.completed' && ev.usage) usage = { input: ev.usage.input_tokens ?? 0, cached: ev.usage.cached_input_tokens ?? 0, output: ev.usage.output_tokens ?? 0 };
        if (text) {
          messages.push(text);
          onDelta?.((messages.length > 1 ? '\n\n' : '') + text);
        }
      },
    });

    let text = messages.join('\n\n').trim();
    if (!text && r.code === 0 && !r.stdout.trimStart().startsWith('{')) text = r.stdout.trim();
    if (!text) throw new Error(error || r.stderr.trim() || `codex exited with code ${r.code}`);
    return { text, usage };
  },
};

/** -c overrides for one MCP server (values are TOML; JSON strings/arrays are valid TOML). */
function codexMcp(m: { name: string; url?: string; headers?: Record<string, string>; command?: string; args?: string[]; env?: Record<string, string> }): string[] {
  const k = `mcp_servers.${m.name}`;
  const table = (o: Record<string, string>) => `{${Object.entries(o).map(([a, b]) => `${JSON.stringify(a)}=${JSON.stringify(b)}`).join(',')}}`;
  if (m.url) return ['-c', `${k}.url=${JSON.stringify(m.url)}`, ...(m.headers ? ['-c', `${k}.http_headers=${table(m.headers)}`] : [])];
  const shim = process.platform === 'win32' && /^(npx|uvx|npm|pnpm|bunx)$/i.test(m.command ?? '');
  const command = shim ? 'cmd' : m.command!;
  const args = shim ? ['/c', m.command!, ...(m.args ?? [])] : m.args ?? [];
  return ['-c', `${k}.command=${JSON.stringify(command)}`, '-c', `${k}.args=${JSON.stringify(args)}`, ...(m.env ? ['-c', `${k}.env=${table(m.env)}`] : [])];
}
