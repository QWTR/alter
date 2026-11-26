// The AI council: the AI that leads a chat (e.g. Claude) consults the user's other AIs (ChatGPT, Gemini) through the
// "alter_council" MCP server — a plan from all three for a big build, a second opinion, help when it is stuck.
// Everyone runs on the user's own subscription; the consulted AIs may read the project (read-only) but never change it.
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { providers, providerStatuses } from './providers/index.ts';
import { isLimited } from './usage.ts';

const NAMES: Record<string, string> = { claude: 'Claude', codex: 'ChatGPT', gemini: 'Gemini' };
export const aiName = (id: string) => NAMES[id] ?? id;
const idOf = (s: string): string | null => {
  const t = s.toLowerCase();
  if (/all|every|wszys/.test(t)) return 'all';
  if (/gpt|openai|codex|chat/.test(t)) return 'codex';
  if (/gemini|google|bard/.test(t)) return 'gemini';
  if (/claude|anthropic/.test(t)) return 'claude';
  return null;
};

interface CouncilSession { token: string; lead: string; members: string[]; cwd?: string; dirs?: string[]; signal?: AbortSignal; asked: number; onActivity?: (t: string) => void }
const sessions = new Map<string, CouncilSession>();
const MAX_ASKS = 10;

/** The other AIs the user has connected (and that are not over their limit right now). */
export async function councilMembers(lead: string): Promise<string[]> {
  const st = await providerStatuses().catch(() => []);
  return st.filter((p) => p.connected && p.id !== 'demo' && p.id !== lead && !isLimited(p.id)).map((p) => p.id);
}
export function openCouncil(o: Omit<CouncilSession, 'token' | 'asked'>): CouncilSession {
  const s: CouncilSession = { ...o, token: randomBytes(18).toString('base64url'), asked: 0 };
  sessions.set(s.token, s);
  return s;
}
export const closeCouncil = (s: CouncilSession) => sessions.delete(s.token);
export const councilMcpUrl = (port: number, s: CouncilSession) => `http://127.0.0.1:${port}/mcp/council/${s.token}`;

/** Asked explicitly ("razem z ChatGPT", "naradźcie się w trójkę") or a big build where three heads help. */
export const wantsCouncil = (message: string) =>
  /(chat ?gpt|gemini|w tr[oó]jk[eęą]|we tr[oó]jk[eęą]|razem z (innymi )?ai|narad[zź]|skonsultuj|konsult|wsp[oó]lnie zaplanuj|council|consult|other ais?|second opinion|druga opinia)/i.test(message);
export const bigBuild = (message: string) =>
  message.length > 1500 || /(\bgr[aęyą]\b|gierk|\bgame\b|aplikacj|\bapp\b|prototyp|unity|unreal|godot|silnik gry|game engine|architektur|zbuduj (mi )?(ca[łl]|syst|platform|serwis)|from scratch|od zera)/i.test(message);

export function councilGuide(lead: string, members: string[], big: boolean): string {
  const who = members.map(aiName).join(' and ');
  return `## The AI council: tool ask_ai from the "alter_council" MCP server
You are ${aiName(lead)} and you lead. You can consult the user's other AIs: ${who}. They run on the user's own subscriptions and can read this project's files (read-only, they never change them).
- ${big ? 'This is a big build: BEFORE you start, ask them in parallel (ai: "all") for their plan, the architecture and the risks. Give the key requirements and constraints, not the whole document. Merge the best ideas into ONE plan and tell the user the plan in a few lines (who suggested what), then build it yourself.' : 'For a big build (a game, an app, a large feature, an architecture choice), ask them first in parallel (ai: "all") for a plan and risks, then merge into one plan.'}
- Stuck (the same error twice, an engine/API you are unsure about): ask them with the exact error, what you already tried and the file paths.
- Before you finish a big or risky change, you may ask one of them to review the plan or the risky part.
- No consulting for small, clear tasks. You write the code and you decide; their answers are advice. Say in one short line who suggested what.`;
}

async function askAi(s: CouncilSession, id: string, question: string): Promise<string> {
  const p = providers.find((x) => x.id === id);
  if (!p) return `${aiName(id)} is not available.`;
  s.onActivity?.(`${aiName(id)} is thinking…`);
  const prompt = `You are ${aiName(id)}, consulted by ${aiName(s.lead)}, the AI that leads this task in ALTTER (the user's personal AI app). ${aiName(s.lead)} will build it; you advise.
You may read the project files in the current folder to ground your answer (read-only: do not change, create or delete anything). Use only the file reading and search tools (view file, list folder, grep / find): never run shell commands, open a browser or call other tools, because nobody is there to approve them and the request would just fail. If you cannot see something, answer from the question and say what you assumed.
Answer ${aiName(s.lead)} directly and concretely: the plan, the decision or the fix, with file paths and short code where it helps. Point out risks and what you would do differently. Keep it under about 600 words unless a full plan is asked for. Answer in English.

## Question from ${aiName(s.lead)}
${question}`;
  const r = await p.run({ prompt, access: 'read', cwd: s.cwd, fileDirs: s.dirs, signal: s.signal, timeoutMs: 15 * 60_000 });
  return r.text?.trim() || '(no answer)';
}

const TOOLS = [
  {
    name: 'ask_ai',
    description: 'Consult the user\'s other AIs (ChatGPT, Gemini, Claude — whichever is connected and not you) and get their answer back: a plan for a big build, a second opinion, help with an error. ai: "all" asks every one of them in parallel. It can take a few minutes.',
    inputSchema: { type: 'object', properties: { ai: { type: 'string', description: '"all", "chatgpt", "gemini" or "claude"' }, question: { type: 'string', description: 'A self-contained question with the context they need (requirements, error text, file paths)' } }, required: ['ai', 'question'] },
  },
  { name: 'list_ais', description: 'Which other AIs you can consult right now.', inputSchema: { type: 'object', properties: {} } },
];

export async function handleCouncilMcp(req: IncomingMessage, res: ServerResponse, token: string) {
  const s = sessions.get(token);
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  if (!s) return reply(404, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Session ended' } });
  if (req.method !== 'POST') return reply(req.method === 'DELETE' ? 200 : 405, {});
  const raw = await new Promise<string>((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return reply(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) });
  const call = async (name: string, a: any) => {
    if (name === 'list_ais') return text(s.members.length ? `You can consult: ${s.members.map(aiName).join(', ')}.` : 'No other AI is connected.');
    if (name !== 'ask_ai') return text(`Unknown tool ${name}`, true);
    if (s.signal?.aborted) return text('Stopped by the user.', true);
    if (++s.asked > MAX_ASKS) return text('Enough consulting for this answer — decide with what you have.', true);
    const question = String(a.question ?? '').trim();
    if (!question) return text('question is needed', true);
    const want = idOf(String(a.ai ?? 'all')) ?? 'all';
    const targets = want === 'all' ? s.members : s.members.filter((m) => m === want);
    if (!targets.length) return text(want === s.lead ? 'That is you — decide yourself.' : `${aiName(want)} is not connected. You can consult: ${s.members.map(aiName).join(', ') || 'nobody'}.`, true);
    const answers = await Promise.all(targets.map(async (id) => `### ${aiName(id)}\n${await askAi(s, id, question).catch((e) => `${aiName(id)} failed: ${(e as Error).message}`)}`));
    return text(answers.join('\n\n'));
  };
  const handle = async (m: any) => {
    if (m.id === undefined) return null;
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
    switch (m.method) {
      case 'initialize':
        return ok({ protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'alter-council', version: '1.0.0' } });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS });
      case 'tools/call':
        try {
          return ok(await call(m.params?.name, m.params?.arguments ?? {}));
        } catch (e) {
          return ok(text(`Error: ${(e as Error).message}`, true));
        }
      default:
        return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Unknown method ${m.method}` } };
    }
  };
  const out = Array.isArray(msg) ? (await Promise.all(msg.map(handle))).filter(Boolean) : await handle(msg);
  if (out === null || (Array.isArray(out) && !out.length)) return reply(202, undefined);
  reply(200, out);
}
