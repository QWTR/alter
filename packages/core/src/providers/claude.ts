import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workspaceDir } from '../config.ts';
import { detectCli, runProcess, tryJson } from './process.ts';
import type { Access, Provider } from './types.ts';

// "Read" access may also look at the system state (network, services, disks, logs) — commands that only report, never change.
const DIAG_SHELL = ['netstat', 'ping', 'tracert', 'traceroute', 'nslookup', 'ipconfig', 'systeminfo', 'tasklist', 'whoami', 'hostname', 'docker ps', 'docker logs', 'docker inspect', 'git status', 'git log'];
const DIAG_PS = [
  'Test-NetConnection', 'Test-Connection', 'Resolve-DnsName', 'Get-NetTCPConnection', 'Get-NetAdapter', 'Get-NetIPConfiguration', 'Get-NetIPAddress',
  'Get-Service', 'Get-Process', 'Get-Volume', 'Get-PSDrive', 'Get-WinEvent', 'Get-EventLog', 'Get-ComputerInfo', 'Get-HotFix', 'Get-VpnConnection', 'Get-Date',
];
const READ_TOOLS = [
  'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch',
  ...DIAG_SHELL.map((c) => `Bash(${c}:*)`),
  ...DIAG_SHELL.map((c) => `PowerShell(${c}:*)`),
  ...DIAG_PS.map((c) => `PowerShell(${c}:*)`),
];

// The user's own claude.ai connectors (signed in to their Claude account): calendar, mail, files. They act on the
// user's accounts, not this computer, so they work in every access level — "add it to my calendar" just happens.
const OWN_CONNECTORS = [
  'Google_Calendar', 'Gmail', 'Google_Drive', 'Google_Docs', 'Google_Sheets', 'Microsoft_365', 'Outlook', 'Outlook_Calendar',
  'Notion', 'Slack', 'Asana', 'Linear', 'Atlassian', 'Calendly', 'Zoom', 'HubSpot', 'Canva', 'Figma', 'Box', 'Dropbox',
].map((n) => `mcp__claude_ai_${n}`);

function accessArgs(access: Access, extra: string[]): string[] {
  if (access === 'full') return ['--permission-mode', 'bypassPermissions', ...(extra.length ? ['--allowedTools', extra.join(',')] : [])];
  if (access === 'read') return ['--allowedTools', [...READ_TOOLS, ...OWN_CONNECTORS, ...extra].join(',')];
  // chat: web + the user's own account connectors (+ explicitly granted tools such as an MCP mail connector)
  const tools = ['WebSearch', 'WebFetch', ...OWN_CONNECTORS, ...extra];
  return ['--allowedTools', tools.join(','), '--disallowedTools', 'Bash,Edit,Write,NotebookEdit,PowerShell'];
}

function describeTool(name: string, input: any): string {
  if (!input) return name;
  // the on-screen tools: say what the agent is doing, not just the tool name
  if (name.startsWith('mcp__alter_hands__')) {
    const code = typeof input.code === 'string' ? input.code : '';
    const what = code
      ? (code.match(/^\s*#\s*(.+)$/m)?.[1] ?? code.split('\n').find((l: string) => l.trim() && !/^\s*(import|from)\s/.test(l)) ?? '')
      : input.text ?? input.prompt ?? input.query ?? input.id ?? input.view ?? input.target ?? input.keys ?? (Array.isArray(input.tasks) ? input.tasks.map((t: any) => t.who).join(', ') : '') ?? '';
    const to = input.to ? `→${input.to} ` : '';
    return `${name}: ${to}${String(what).replace(/\s+/g, ' ').slice(0, 120)}`;
  }
  // the AI council: who is asked and about what
  if (name === 'mcp__alter_council__ask_ai') {
    const ai = String(input.ai ?? 'all').toLowerCase();
    const who = /all|wszys/.test(ai) ? 'ChatGPT + Gemini' : /gpt|codex|chat/.test(ai) ? 'ChatGPT' : /gemini/.test(ai) ? 'Gemini' : /claude/.test(ai) ? 'Claude' : ai;
    return `Council → ${who}: ${String(input.question ?? '').replace(/\s+/g, ' ').slice(0, 110)}`;
  }
  // file paths stay whole (the UI shows the file name and opens a live preview from them)
  if (input.file_path || input.notebook_path) return `${name}: ${input.file_path ?? input.notebook_path}`;
  const arg = input.command ?? input.path ?? input.pattern ?? input.url ?? input.query ?? '';
  return `${name}${arg ? `: ${String(arg).replace(/\s+/g, ' ').slice(0, 120)}` : ''}`;
}

/** Claude Pro / Max subscription through the official Claude Code CLI (`claude -p`). */
export const claude: Provider = {
  id: 'claude',
  name: 'Claude',
  vendor: 'Anthropic',
  subscription: 'Claude Pro / Max',
  installCmd: 'npm install -g @anthropic-ai/claude-code',
  loginCmd: 'claude auth login',
  loginArgs: ['auth', 'login'],
  async authStatus() {
    const r = await runProcess('claude', ['auth', 'status', '--json'], { timeoutMs: 20_000 }).catch(() => undefined);
    const j = r && tryJson(r.stdout.trim());
    return j ? !!j.loggedIn : undefined;
  },
  models: [
    { id: 'opus', label: 'Opus' },
    { id: 'sonnet', label: 'Sonnet' },
    { id: 'haiku', label: 'Haiku' },
  ],
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  detect: () => detectCli('claude'),

  steerable: true,

  async run({ prompt, onDelta, onActivity, onDraft, fileDirs = [], fast, access = 'chat', tools = [], cwd, signal, timeoutMs, model, effort, mcp = [], blockTools = [], inbox, browser }) {
    // file writes stream in as partial tool input: forwarded so the preview can build the page live
    const drafts = new Map<number, { id: string; tool: string; json: string }>();
    let draftSeq = 0;
    // stream-json input keeps stdin open, so messages sent while Claude works reach it mid-answer
    // (it reads them at the next step, like typing into a running Claude Code session)
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', ...accessArgs(access, [...tools, ...mcp.map((m) => `mcp__${m.name}__*`)])];
    const userLine = (text: string) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';
    const followUps: { text: string; at: number }[] = [];
    let waitingAnswer = false; // a follow-up was sent and its answer hasn't started yet
    let pipe: { write: (s: string) => void; end: () => void } | undefined;
    let stopListening: (() => void) | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    // a result means "done" unless more work follows: end stdin after a short quiet moment
    const finish = () => {
      stopListening?.();
      stopListening = undefined;
      pipe?.end();
    };
    let mcpFile: string | undefined;
    if (mcp.length) {
      // a file, not inline JSON: quoting JSON through the Windows shell is fragile
      mcpFile = join(tmpdir(), `alter-mcp-${process.pid}-${Date.now()}.json`);
      writeFileSync(mcpFile, JSON.stringify({ mcpServers: Object.fromEntries(mcp.map((m) => [m.name, mcpEntry(m)])) }));
      args.push('--mcp-config', mcpFile);
    }
    if (blockTools.length) args.push('--disallowedTools', blockTools.join(','));
    if (browser) args.push('--chrome');
    for (const d of fileDirs) args.push('--add-dir', d);
    if (fast) args.push('--model', 'haiku');
    else if (model) args.push('--model', model);
    if (effort && !fast) args.push('--effort', effort);

    let streamed = '';
    let final = '';
    let error = '';
    let usage: { input: number; output: number; cached?: number; costUsd?: number } | undefined;
    const r = await runProcess('claude', args, {
      input: userLine(prompt),
      cwd: cwd ?? workspaceDir(),
      signal,
      timeoutMs,
      onStdin(p) {
        pipe = p;
        stopListening = inbox?.listen((text) => {
          if (closeTimer) { clearTimeout(closeTimer); closeTimer = undefined; }
          followUps.push({ text, at: -1 });
          waitingAnswer = true;
          p.write(userLine(text));
          onActivity?.(`Follow-up: ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
        });
      },
      onLine(line) {
        const ev = tryJson(line);
        if (!ev) return;
        if (ev.type === 'result') {
          if (closeTimer) clearTimeout(closeTimer);
          closeTimer = setTimeout(finish, waitingAnswer ? 8000 : 1200);
        } else if (closeTimer && ev.type !== 'rate_limit_event') {
          clearTimeout(closeTimer);
          closeTimer = undefined;
        }
        const se = ev.type === 'stream_event' ? ev.event : undefined;
        // the first new text after a follow-up is where its answer starts
        if (waitingAnswer && se?.type === 'content_block_start' && se.content_block?.type === 'text') {
          waitingAnswer = false;
          for (const f of followUps) if (f.at < 0) f.at = streamed.length;
        }
        if (onDraft && se?.type === 'content_block_start' && se.content_block?.type === 'tool_use' && /^(Write|Edit|MultiEdit)$/.test(se.content_block.name)) {
          drafts.set(se.index, { id: `${se.content_block.id ?? ''}${++draftSeq}`, tool: se.content_block.name, json: '' });
        } else if (onDraft && se?.type === 'content_block_delta' && se.delta?.type === 'input_json_delta' && drafts.has(se.index)) {
          const d = drafts.get(se.index)!;
          d.json += se.delta.partial_json ?? '';
          onDraft({ ...d, done: false });
          return;
        } else if (onDraft && se?.type === 'content_block_stop' && drafts.has(se.index)) {
          onDraft({ ...drafts.get(se.index)!, done: true });
          drafts.delete(se.index);
          return;
        }
        if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
          streamed += ev.event.delta.text;
          onDelta?.(ev.event.delta.text);
        } else if (ev.type === 'stream_event' && ev.event?.type === 'content_block_start' && ev.event.content_block?.type === 'thinking') {
          onActivity?.('Thinking');
        } else if (ev.type === 'stream_event' && ev.event?.type === 'content_block_start' && streamed && !streamed.endsWith('\n')) {
          streamed += '\n\n';
          onDelta?.('\n\n');
        } else if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
          for (const block of ev.message.content) if (block.type === 'tool_use') onActivity?.(describeTool(block.name, block.input));
        } else if (ev.type === 'result') {
          const u = ev.usage ?? {};
          usage = { input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), cached: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0, costUsd: ev.total_cost_usd };
          if (ev.is_error) error = String(ev.result ?? ev.subtype ?? 'Claude returned an error');
          else final = String(ev.result ?? '');
        }
      },
    });
    if (closeTimer) clearTimeout(closeTimer);
    stopListening?.();
    if (mcpFile) rmSync(mcpFile, { force: true });
    for (const f of followUps) if (f.at < 0) f.at = streamed.length;

    if (r.timedOut) {
      const note = `\n\n⏱️ Stopped: the time limit (${Math.round((timeoutMs ?? 600_000) / 60_000)} min) ran out before the work was finished.`;
      streamed += note;
      onDelta?.(note);
    }
    const text = streamed.trim() || final.trim();
    // stopped by the user (stop button, "stop all agents" on the screen): say so instead of a cryptic exit code
    if (!text && signal?.aborted) throw new Error('Stopped.');
    if (!text) throw new Error(error || r.stderr.trim() || `Claude stopped unexpectedly (exit code ${r.code}). Write "continue" to try again.`);
    if (!streamed && final) onDelta?.(final);
    return { text, usage, followUps: followUps.length && streamed.trim() ? followUps : undefined };
  },
};

/** One MCP server in Claude Code's config. On Windows, npx/uvx are .cmd shims, so they run through cmd /c. */
export function mcpEntry(m: { url?: string; headers?: Record<string, string>; command?: string; args?: string[]; env?: Record<string, string> }) {
  if (m.url) return { type: 'http', url: m.url, ...(m.headers ? { headers: m.headers } : {}) };
  const shim = process.platform === 'win32' && /^(npx|uvx|npm|pnpm|bunx)$/i.test(m.command ?? '');
  return { type: 'stdio', command: shim ? 'cmd' : m.command, args: shim ? ['/c', m.command!, ...(m.args ?? [])] : m.args ?? [], ...(m.env ? { env: m.env } : {}) };
}
