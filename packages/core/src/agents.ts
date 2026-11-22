import { randomUUID } from 'node:crypto';
import { logActivity } from './activity.ts';
import { all, get, now, run } from './db.ts';
import { emit } from './events.ts';
import { learnFrom } from './learning.ts';
import { buildPrompt } from './prompt.ts';
import { resolveProvider } from './providers/index.ts';
import { isValidSchedule, nextRun } from './schedule.ts';
import { skillsText } from './skills.ts';

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** What the agent does on every run, in plain language. */
  instructions: string;
  provider: string;
  schedule: string;
  skills: string[];
  /** Claude Code tools the agent may use unattended, e.g. "WebSearch", "mcp__gmail__*". */
  tools: string[];
  enabled: boolean;
  /** Feed what the agent finds back into Alter's memory. */
  learns: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  agent_id: string;
  status: 'running' | 'done' | 'error';
  trigger: string;
  provider: string | null;
  output: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export type AgentInput = Partial<Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'nextRunAt' | 'lastRunAt'>> & { name: string; instructions: string };

export const TEMPLATES: (AgentInput & { templateId: string })[] = [
  {
    templateId: 'morning-brief',
    name: 'Morning brief',
    emoji: '☀️',
    description: 'Every morning: what matters today, what was left open yesterday, one smart suggestion.',
    instructions:
      'Write my morning brief. Using what you know about me and yesterday\'s activity: 1) the 3 things that matter most today, ' +
      '2) anything left open or forgotten, 3) one concrete suggestion to make the day better. Max 12 lines.',
    schedule: 'daily 08:00',
    skills: ['daily-report'],
  },
  {
    templateId: 'evening-review',
    name: 'Evening review',
    emoji: '🌙',
    description: 'Every evening: what got done, patterns in your day, a plan for tomorrow.',
    instructions:
      'Review my day from the activity log: what I did, what I avoided, any pattern you notice in how I work. ' +
      'End with a short plan for tomorrow. Note new habits or routines you discover so you remember them.',
    schedule: 'daily 21:00',
    skills: ['daily-report'],
  },
  {
    templateId: 'inbox',
    name: 'Inbox assistant',
    emoji: '📬',
    description: 'Triage e-mail: what needs a reply, drafts in your style, what can wait. Needs a mail connector (MCP) in Claude Code.',
    instructions:
      'Go through my unread e-mail from the last few hours. Group it into: needs my reply (with a short draft in my style), ' +
      'FYI, and can be ignored. Never send anything — only drafts.',
    schedule: 'every 2h',
    skills: ['email-triage'],
    tools: ['mcp__gmail__*'],
    provider: 'claude',
    enabled: false,
  },
  {
    templateId: 'content',
    name: 'Content producer',
    emoji: '🎬',
    description: 'Ideas, hooks and scripts for reels / shorts in your voice, based on what you are working on.',
    instructions:
      'Propose 3 short-form video (reel/short) ideas for this week based on my projects and what I have been talking about. ' +
      'For the best one write a hook, a shot list and the script.',
    schedule: 'weekly mon 10:00',
    skills: ['social-reels'],
  },
];

interface Row {
  id: string;
  data: string;
  created_at: string;
  updated_at: string;
}

const toAgent = (r: Row): Agent => ({ ...JSON.parse(r.data), id: r.id, createdAt: r.created_at, updatedAt: r.updated_at });

export const listAgents = (): Agent[] => all<Row>('SELECT * FROM agents ORDER BY created_at').map(toAgent);

export function getAgent(id: string): Agent | undefined {
  const r = get<Row>('SELECT * FROM agents WHERE id = ?', id);
  return r ? toAgent(r) : undefined;
}

function persist(a: Agent): Agent {
  const { id, createdAt, updatedAt, ...data } = a;
  run(
    `INSERT INTO agents (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    id,
    JSON.stringify(data),
    createdAt,
    updatedAt,
  );
  emit('agent.changed', a);
  return a;
}

function normalize(input: Partial<AgentInput>, base?: Agent): Agent {
  const ts = now();
  const merged = { ...base, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as Agent;
  const schedule = (merged.schedule ?? 'manual').trim();
  if (!isValidSchedule(schedule)) throw new Error(`Invalid schedule "${schedule}". Try: manual, every 30m, daily 08:00, weekdays 09:00, weekly mon 10:00`);
  if (!merged.name?.trim()) throw new Error('Agent needs a name');
  if (!merged.instructions?.trim()) throw new Error('Agent needs instructions');
  const enabled = merged.enabled ?? true;
  const scheduleChanged = !base || base.schedule !== schedule || base.enabled !== enabled;
  return {
    id: base?.id ?? randomUUID(),
    name: merged.name.trim(),
    emoji: merged.emoji || '🤖',
    description: merged.description ?? '',
    instructions: merged.instructions.trim(),
    provider: merged.provider || 'default',
    schedule,
    skills: merged.skills ?? [],
    tools: merged.tools ?? [],
    enabled,
    learns: merged.learns ?? true,
    nextRunAt: scheduleChanged ? (enabled ? nextRun(schedule, new Date())?.toISOString() ?? null : null) : (base?.nextRunAt ?? null),
    lastRunAt: base?.lastRunAt ?? null,
    createdAt: base?.createdAt ?? ts,
    updatedAt: ts,
  };
}

export function createAgent(input: AgentInput): Agent {
  return persist(normalize(input));
}

export function createFromTemplate(templateId: string): Agent {
  const t = TEMPLATES.find((x) => x.templateId === templateId);
  if (!t) throw new Error(`Unknown template ${templateId}`);
  const { templateId: _, ...input } = t;
  return createAgent(input);
}

export function updateAgent(id: string, patch: Partial<AgentInput>): Agent | undefined {
  const cur = getAgent(id);
  return cur ? persist(normalize(patch, cur)) : undefined;
}

export function deleteAgent(id: string): boolean {
  run('DELETE FROM runs WHERE agent_id = ?', id);
  const ok = Number(run('DELETE FROM agents WHERE id = ?', id).changes) > 0;
  if (ok) emit('agent.changed', { id, deleted: true });
  return ok;
}

export const listRuns = (agentId?: string, limit = 50): (Run & { agent_name?: string; agent_emoji?: string })[] => {
  const runs = agentId
    ? all<Run>('SELECT * FROM runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?', agentId, limit)
    : all<Run>('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?', limit);
  const agents = new Map(listAgents().map((a) => [a.id, a]));
  return runs.map((r) => ({ ...r, agent_name: agents.get(r.agent_id)?.name, agent_emoji: agents.get(r.agent_id)?.emoji }));
};

const running = new Set<string>();
export const isRunning = (id: string) => running.has(id);

export async function runAgent(id: string, trigger: 'manual' | 'schedule' = 'manual'): Promise<Run> {
  const agent = getAgent(id);
  if (!agent) throw new Error('Agent not found');
  if (running.has(id)) throw new Error(`${agent.name} is already running`);
  running.add(id);

  const runId = randomUUID();
  run('INSERT INTO runs (id, agent_id, status, trigger, started_at) VALUES (?, ?, ?, ?, ?)', runId, id, 'running', trigger, now());
  emit('run.started', { id: runId, agentId: id });

  try {
    const provider = await resolveProvider(agent.provider);
    run('UPDATE runs SET provider = ? WHERE id = ?', provider.id, runId);

    const previous = listRuns(id, 4)
      .filter((r) => r.status === 'done' && r.output)
      .slice(0, 3)
      .map((r) => `### ${new Date(r.started_at).toLocaleString()}\n${r.output!.slice(0, 1500)}`)
      .join('\n\n');
    const skills = skillsText(agent.skills);
    const prompt = buildPrompt({
      query: `Run your task now: ${agent.instructions}`,
      instructions: `You are the "${agent.name}" agent inside Alter. ${agent.description}\n\n${agent.instructions}${skills ? `\n\n${skills}` : ''}`,
      extra: previous ? `## Your previous runs (build on them, don't repeat them)\n${previous}` : '',
      activityHours: 36,
    });

    const { text } = await provider.run({ prompt, tools: agent.tools, timeoutMs: 15 * 60_000 });
    run('UPDATE runs SET status = ?, output = ?, finished_at = ? WHERE id = ?', 'done', text, now(), runId);
    logActivity('agent', `${agent.emoji} ${agent.name} finished: ${text.replace(/\s+/g, ' ').slice(0, 140)}`, runId);
    if (agent.learns) learnFrom(`Agent "${agent.name}" task: ${agent.instructions}\n\nResult:\n${text}`, `agent:${id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    run('UPDATE runs SET status = ?, error = ?, finished_at = ? WHERE id = ?', 'error', msg, now(), runId);
    logActivity('agent', `${agent.emoji} ${agent.name} failed: ${msg.slice(0, 140)}`, runId);
  } finally {
    running.delete(id);
    const fresh = getAgent(id);
    if (fresh) {
      fresh.lastRunAt = now();
      fresh.nextRunAt = fresh.enabled ? nextRun(fresh.schedule, new Date())?.toISOString() ?? null : null;
      persist(fresh);
    }
  }
  const result = get<Run>('SELECT * FROM runs WHERE id = ?', runId)!;
  emit('run.finished', { ...result, agent_name: agent.name, agent_emoji: agent.emoji });
  return result;
}

/** Checks every 20 s for agents that are due. Missed runs (computer was asleep) fire once on wake. */
export function startScheduler(): () => void {
  // Runs that were "running" when Alter stopped will never finish.
  run(`UPDATE runs SET status = 'error', error = 'Alter was stopped during this run', finished_at = ? WHERE status = 'running'`, now());
  const tick = () => {
    const t = Date.now();
    for (const a of listAgents()) {
      if (a.enabled && a.nextRunAt && Date.parse(a.nextRunAt) <= t && !running.has(a.id)) {
        runAgent(a.id, 'schedule').catch((e) => console.warn(`[alter] agent ${a.name}:`, e.message));
      }
    }
  };
  const timer = setInterval(tick, 20_000);
  tick();
  return () => clearInterval(timer);
}
