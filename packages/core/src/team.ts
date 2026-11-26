// Agents working together: in any chat, @Name (or @Group) brings other agents in. The AI answering
// gets an MCP tool server ("alter_team") to ask them — each asked agent runs with its own role,
// AI and access, and its answer comes back to the one who asked. Asked agents can ask further
// (two levels deep at most), so a lead can split a job, collect the parts and put them together.
import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAgent, isRunning, listAgents, runAgent, setTeamHook, type Agent } from './agents.ts';
import { listeningPort } from './pairing.ts';
import { loadConfig, saveConfig } from './config.ts';
import { emit } from './events.ts';
import { agentStatuses } from './status.ts';

export interface AgentGroup { id: string; name: string; description: string; members: string[]; lead?: string | null; createdAt: string }

export const listGroups = (): AgentGroup[] => ((loadConfig() as any).agentGroups ?? []) as AgentGroup[];

export function saveGroup(input: Partial<AgentGroup> & { name: string; members: string[] }): AgentGroup {
  const name = input.name?.trim();
  if (!name) throw new Error('The group needs a name');
  const members = [...new Set(input.members ?? [])].filter((id) => !!getAgent(id));
  if (!members.length) throw new Error('Pick at least one agent');
  const cfg = loadConfig() as any;
  const list: AgentGroup[] = cfg.agentGroups ?? [];
  const cur = input.id ? list.find((g) => g.id === input.id) : undefined;
  const g: AgentGroup = { id: cur?.id ?? randomUUID(), name: name.slice(0, 40), description: input.description?.slice(0, 200) ?? '', members, lead: input.lead && members.includes(input.lead) ? input.lead : members[0], createdAt: cur?.createdAt ?? new Date().toISOString() };
  cfg.agentGroups = [...list.filter((x) => x.id !== g.id), g];
  saveConfig();
  emit('agent.changed', { group: g.id });
  return g;
}

export function deleteGroup(id: string): boolean {
  const cfg = loadConfig() as any;
  const before = (cfg.agentGroups ?? []).length;
  cfg.agentGroups = (cfg.agentGroups ?? []).filter((g: AgentGroup) => g.id !== id);
  saveConfig();
  emit('agent.changed', { group: id, deleted: true });
  return cfg.agentGroups.length !== before;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

/** Agents and groups named with @ in a message (longest names first, so "@Ann Marie" beats "@Ann"). */
export function mentionsIn(message: string): { agents: Agent[]; groups: AgentGroup[] } {
  if (!message.includes('@')) return { agents: [], groups: [] };
  const text = norm(message);
  const hit = (name: string) => {
    const n = norm(name);
    const at = text.indexOf('@' + n);
    if (at < 0) return false;
    const after = text[at + 1 + n.length];
    return !after || !/[\p{L}\d]/u.test(after);
  };
  const groups = listGroups().filter((g) => hit(g.name));
  const fromGroups = new Set(groups.flatMap((g) => g.members));
  const agents = listAgents().filter((a) => !a.monitor && (hit(a.name) || fromGroups.has(a.id)));
  return { agents, groups };
}

export const wantsTeam = (message: string) => message.includes('@') || /\b(zapytaj|porozmawiaj|skonsultuj|wykorzystaj|deleguj|zesp[oó]ł agent|innych agent|other agents?|ask (the )?agent|delegate|consult)\b/i.test(message);

// ---------- MCP sessions ----------
interface TeamSession { token: string; caller: string; callerAgentId: string | null; depth: number; asked: number; signal?: AbortSignal }
const sessions = new Map<string, TeamSession>();
const MAX_ASKS = 12;

export function openTeam(caller: string, callerAgentId: string | null, depth = 0, signal?: AbortSignal): TeamSession {
  const s: TeamSession = { token: randomBytes(18).toString('base64url'), caller, callerAgentId, depth, asked: 0, signal };
  sessions.set(s.token, s);
  return s;
}
export const closeTeam = (s: TeamSession) => sessions.delete(s.token);
export const teamMcpUrl = (port: number, s: TeamSession) => `http://127.0.0.1:${port}/mcp/team/${s.token}`;

// Every agent on a team gets the team tool on each run (its own chat, the team's job, a schedule):
// it can hand work to a teammate or ask one, and gets the answer back — the lead talks to UI, UI asks Gameplay…
export function teamToolsFor(agent: Agent, signal?: AbortSignal) {
  const groups = listGroups().filter((g) => g.members.includes(agent.id));
  if (!groups.length) return null;
  const s = openTeam(agent.name, agent.id, 0, signal);
  const mates = groups.flatMap((g) => g.members.filter((id) => id !== agent.id).map((id) => {
    const a = getAgent(id);
    return a ? `- ${a.name}${g.lead === a.id ? ' (lead)' : ''}: ${(a.description || a.instructions).replace(/^[^:]{1,40}:\s*/, '').replace(/\s+/g, ' ').slice(0, 120)}` : '';
  })).filter(Boolean);
  const lead = groups.some((g) => g.lead === agent.id);
  const guide = `## Your team: ${groups.map((g) => '@' + g.name).join(', ')} — tool ask_agent from the "alter_team" MCP server
You work together with:\n${[...new Set(mates)].join('\n')}
- ask_agent(name, task) gives a teammate a task or a question and returns their answer (it can take minutes; independent asks can run in parallel). Use it instead of saying you have no connection to them.
- ${lead ? 'You lead: pass the user\'s decisions and new rules on to the right teammates yourself, give them concrete tasks, collect their answers and report back.' : 'Ask the teammate who owns a part instead of guessing (e.g. the code contract, a file path), and tell the lead when you finish something others depend on.'}
- Something only another role may change (files outside your access, their department): ask that teammate to do it.`;
  return { mcp: { name: 'alter_team', url: teamMcpUrl(listeningPort(), s) }, guide, close: () => closeTeam(s) };
}
setTeamHook(teamToolsFor);

/** Runs an agent on a task for someone and returns what it says. */
export async function askAgent(agent: Agent, task: string, from: string, depth: number, port: number): Promise<string> {
  if (isRunning(agent.id)) return `${agent.name} is busy with another task right now. Try again in a while, or go on without them and say so.`;
  // the asked agent may ask others too, one level further
  const sub = depth < 1 ? openTeam(agent.name, agent.id, depth + 1) : null;
  try {
    const r = await runAgent(agent.id, 'team', `## Asked by ${from}\nAnswer ${from} directly and concretely — they will use your answer in their work. If you did something (files, changes), say exactly what and where.`, task, sub ? [{ name: 'alter_team', url: teamMcpUrl(port, sub) }] : [], from);
    if (r.status === 'error') return `${agent.name} could not do it: ${r.error ?? 'error'}`;
    return r.output ?? '(no answer)';
  } finally {
    if (sub) closeTeam(sub);
  }
}

const TOOLS = [
  { name: 'list_agents', description: 'The user\'s agents and groups you can work with: name, role, what they are doing right now.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ask_agent', description: 'Give another agent a task or a question and get its answer back (it works with its own role, AI and access; it can take minutes). Several asks can run at the same time — call them in parallel for independent parts.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Agent name (or a group name: everyone in it gets the task)' }, task: { type: 'string', description: 'What exactly to do or answer, with all context it needs' } }, required: ['name', 'task'] } },
];

function describeAgents(): string {
  const st = agentStatuses();
  const agents = listAgents().filter((a) => !a.monitor && a.enabled !== false);
  const lines = agents.map((a) => `- ${a.name}: ${(a.description || a.instructions).replace(/\s+/g, ' ').slice(0, 140)}${st[a.id]?.state === 'working' ? ` [busy: ${st[a.id].text}]` : ''}`);
  const groups = listGroups().map((g) => `- @${g.name}: ${g.members.map((id) => getAgent(id)?.name).filter(Boolean).join(', ')}${g.description ? ` — ${g.description}` : ''}`);
  return `Agents:\n${lines.join('\n') || '(none)'}${groups.length ? `\n\nGroups:\n${groups.join('\n')}` : ''}`;
}

export async function handleTeamMcp(req: IncomingMessage, res: ServerResponse, token: string, port: number) {
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
    if (name === 'list_agents') return text(describeAgents());
    if (name !== 'ask_agent') return text(`Unknown tool ${name}`, true);
    if (s.signal?.aborted) return text('Stopped by the user.', true);
    if (++s.asked > MAX_ASKS) return text('Enough asking for this answer — finish with what you have.', true);
    const who = String(a.name ?? '').replace(/^@/, '').trim();
    const task = String(a.task ?? '').trim();
    if (!who || !task) return text('name and task are needed', true);
    const group = listGroups().find((g) => norm(g.name) === norm(who));
    const targets = group ? group.members.map(getAgent).filter((x): x is Agent => !!x) : listAgents().filter((x) => norm(x.name) === norm(who));
    if (!targets.length) return text(`No agent "${who}". ${describeAgents()}`, true);
    const mine = targets.filter((x) => x.id !== s.callerAgentId);
    if (!mine.length) return text('That is you — do it yourself.', true);
    const answers = await Promise.all(mine.map(async (x) => `### ${x.name}\n${await askAgent(x, task, s.caller, s.depth, port).catch((e) => `${x.name} failed: ${(e as Error).message}`)}`));
    return text(answers.join('\n\n'));
  };
  const handle = async (m: any) => {
    if (m.id === undefined) return null;
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
    switch (m.method) {
      case 'initialize':
        return ok({ protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'alter-team', version: '1.0.0' } });
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

export function teamGuide(mentioned: { agents: Agent[]; groups: AgentGroup[] }): string {
  const names = [...mentioned.groups.map((g) => `@${g.name} (${g.members.map((id) => getAgent(id)?.name).filter(Boolean).join(', ')})`), ...mentioned.agents.filter((a) => !mentioned.groups.some((g) => g.members.includes(a.id))).map((a) => `@${a.name}`)];
  return `## Working with the user's other agents — tools from the "alter_team" MCP server
${names.length ? `The user brought in: ${names.join(', ')}. Involve them — that is what the user wants.` : 'You may involve the user\'s other agents when it clearly helps.'}
- ask_agent(name, task): give each one a clear, self-contained part (or ask for their opinion/check). Independent parts → ask in parallel. A group name sends the task to everyone in it.
- You lead: split the job, collect their answers, resolve conflicts, then give the user ONE combined result. Say briefly who did what (e.g. "Maks wrote the copy, Ola checked the numbers").
- list_agents shows everyone and who is busy. Don't ask an agent to do something outside its role when another fits better.`;
}
