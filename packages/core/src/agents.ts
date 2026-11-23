import { randomUUID } from 'node:crypto';
import { logActivity } from './activity.ts';
import { all, get, now, run } from './db.ts';
import { emit } from './events.ts';
import { learnFrom } from './learning.ts';
import { MONITOR_TYPES, runCheck, type MonitorSpec, type MonitorState } from './monitor.ts';
import { getProject } from './projects.ts';
import { buildPrompt } from './prompt.ts';
import { ACCESS_LEVELS, resolveProvider, type Access } from './providers/index.ts';
import { isValidSchedule, nextRun } from './schedule.ts';
import { skillsText } from './skills.ts';
import { postAlert } from './alerts.ts';
import { projectDirs } from './links.ts';
import { setAgentStatus } from './status.ts';
import { pluginServers, pluginsGuide, pluginTools } from './plugins.ts';
import { notifyPhones } from './push.ts';

export interface Avatar {
  /** robot face (see apps/web/src/components/Robot.tsx) */
  eyes?: string;
  antenna?: string;
  mouth?: string;
  /** palette key, see apps/web (violet, ocean, sunset, mint, rose, amber, slate, lime) */
  palette: string;
  /** icon key, see apps/web */
  icon: string;
}

export interface Agent {
  id: string;
  name: string;
  avatar: Avatar;
  description: string;
  /** What the agent does on every run, in plain language. */
  instructions: string;
  provider: string;
  /** Model alias for the agent's AI ('' = that AI's default) and how hard it thinks. */
  model?: string;
  effort?: string;
  schedule: string;
  skills: string[];
  /** Extra Claude Code tools the agent may use unattended, e.g. "mcp__gmail__*". */
  tools: string[];
  access: Access;
  projectId: string | null;
  /** Automation: a health check ALTTER runs itself; the agent wakes up when it fails. */
  monitor: MonitorSpec | null;
  monitorState: MonitorState | null;
  enabled: boolean;
  /** Send the result of every run to the phones (alerts from monitors always go). */
  notify?: boolean;
  /** Feed what the agent finds back into ALTTER's memory. */
  learns: boolean;
  templateId: string | null;
  nextRunAt: string | null;
  nextCheckAt: string | null;
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
  detail: string | null;
  started_at: string;
  finished_at: string | null;
}

export type AgentInput = Partial<Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'nextRunAt' | 'lastRunAt' | 'nextCheckAt' | 'monitorState'>> & {
  name: string;
  instructions: string;
};

export type Template = AgentInput & { templateId: string; category: 'daily' | 'work' | 'creative' | 'automation' };

/** Ready-made characters. Names/descriptions are translated in the UI by templateId. */
export const TEMPLATES: Template[] = [
  {
    templateId: 'morning-brief',
    category: 'daily',
    name: 'Morning brief',
    avatar: { palette: 'sunset', icon: 'sunrise', eyes: 'happy', antenna: 'bulb', mouth: 'smile' },
    description: 'Every morning: what matters today, what was left open, one smart suggestion.',
    instructions:
      "Write my morning brief. Using what you know about me and yesterday's activity: 1) the 3 things that matter most today, " +
      '2) anything left open or forgotten, 3) one concrete suggestion to make the day better. Max 12 lines.',
    schedule: 'daily 08:00',
    skills: ['daily-report'],
  },
  {
    templateId: 'evening-review',
    category: 'daily',
    name: 'Evening review',
    avatar: { palette: 'violet', icon: 'moon', eyes: 'sleepy', antenna: 'dish', mouth: 'line' },
    description: 'Every evening: what got done, patterns in your day, a plan for tomorrow.',
    instructions:
      "Review my day from the activity log: what I did, what I avoided, any pattern you notice in how I work. " +
      'End with a short plan for tomorrow. Note new habits or routines you discover so you remember them.',
    schedule: 'daily 21:00',
    skills: ['daily-report'],
  },
  {
    templateId: 'inbox',
    category: 'work',
    name: 'Inbox assistant',
    avatar: { palette: 'ocean', icon: 'mail', eyes: 'visor', antenna: 'double', mouth: 'grill' },
    description: 'Sorts your e-mail, drafts replies in your style, flags what is urgent.',
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
    category: 'creative',
    name: 'Content producer',
    avatar: { palette: 'rose', icon: 'clapperboard', eyes: 'round', antenna: 'bolt', mouth: 'o' },
    description: 'Reel and short-video ideas, hooks and scripts in your voice.',
    instructions:
      'Propose 3 short-form video (reel/short) ideas for this week based on my projects and what I have been talking about. ' +
      'For the best one write a hook, a shot list and the script.',
    schedule: 'weekly mon 10:00',
    skills: ['social-reels'],
  },
  {
    templateId: 'researcher',
    category: 'work',
    name: 'Researcher',
    avatar: { palette: 'mint', icon: 'telescope', eyes: 'cyclops', antenna: 'dish', mouth: 'line' },
    description: 'Watches the web for news in your field and sends a short digest.',
    instructions:
      'Search the web for the most important news of the last week in my field and for my current projects. ' +
      'Give me 5 items max, each with one line on why it matters to me and a link.',
    schedule: 'weekly fri 09:00',
    access: 'read',
  },
  {
    templateId: 'server-guard',
    category: 'automation',
    name: 'Server guard',
    avatar: { palette: 'lime', icon: 'server', eyes: 'visor', antenna: 'bulb', mouth: 'grill' },
    description: 'Checks your server every few minutes. If it goes down, diagnoses the problem from this computer and tries to fix it.',
    instructions:
      'The health check for my server failed. From this computer: find out why (network, DNS, VPN, the service itself), ' +
      'try safe fixes (reconnect, restart the connection or the service), then check again. ' +
      'Report what was wrong, what you did, and whether it is fixed. Never delete data.',
    schedule: 'manual',
    access: 'full',
    monitor: { type: 'http', target: 'https://example.com', everyMinutes: 5, autoFix: true },
  },
  {
    templateId: 'pc-health',
    category: 'automation',
    name: 'PC doctor',
    avatar: { palette: 'slate', icon: 'cpu', eyes: 'square', antenna: 'double', mouth: 'line' },
    description: 'Once a day: disk space, updates, crashed apps, anything slowing your computer down.',
    instructions:
      'Check the health of this computer: free disk space, pending updates, recent errors in the system logs, ' +
      'processes using lots of memory. Report only what needs attention and how to fix it. Do not change anything.',
    schedule: 'daily 12:00',
    access: 'read',
  },
  {
    templateId: 'coach',
    category: 'daily',
    name: 'Focus coach',
    avatar: { palette: 'amber', icon: 'target', eyes: 'round', antenna: 'bolt', mouth: 'smile' },
    description: 'Nudges you during the day: reminders, breaks, what to do next.',
    instructions:
      'Look at my day so far and my goals. Give me one short nudge: what to focus on in the next 2 hours, ' +
      'and a reminder of anything I am likely to forget. Max 4 lines.',
    schedule: 'weekdays 13:00',
  },
];

interface Row {
  id: string;
  data: string;
  created_at: string;
  updated_at: string;
}

const DEFAULT_AVATAR: Avatar = { palette: 'violet', icon: 'sparkles' };

const toAgent = (r: Row): Agent => {
  const d = JSON.parse(r.data);
  return {
    avatar: DEFAULT_AVATAR,
    access: 'chat',
    projectId: null,
    monitor: null,
    monitorState: null,
    templateId: null,
    nextCheckAt: null,
    ...d,
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

export const listAgents = (projectId?: string): Agent[] =>
  all<Row>('SELECT * FROM agents ORDER BY created_at')
    .map(toAgent)
    .filter((a) => !projectId || a.projectId === projectId);

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
  emit('agent.changed', { ...a, running: running.has(a.id) });
  return a;
}

function normalizeMonitor(m: unknown): MonitorSpec | null {
  if (!m || typeof m !== 'object') return null;
  const x = m as Partial<MonitorSpec>;
  if (!x.type || !MONITOR_TYPES.includes(x.type) || !x.target?.trim()) return null;
  return { type: x.type, target: x.target.trim(), everyMinutes: Math.max(1, Math.min(1440, Math.round(x.everyMinutes ?? 5))), autoFix: x.autoFix !== false };
}

function normalize(input: Partial<AgentInput>, base?: Agent): Agent {
  const ts = now();
  const merged = { ...base, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as Agent;
  const schedule = (merged.schedule ?? 'manual').trim() || 'manual';
  if (!isValidSchedule(schedule)) throw new Error(`Invalid schedule "${schedule}". Try: manual, every 30m, daily 08:00, weekdays 09:00, weekly mon 10:00`);
  if (!merged.name?.trim()) throw new Error('Agent needs a name');
  if (!merged.instructions?.trim()) throw new Error('Agent needs instructions');
  const enabled = merged.enabled ?? true;
  const monitor = normalizeMonitor(merged.monitor);
  const scheduleChanged = !base || base.schedule !== schedule || base.enabled !== enabled;
  const monitorChanged = !base || JSON.stringify(base.monitor) !== JSON.stringify(monitor) || base.enabled !== enabled;
  return {
    id: base?.id ?? randomUUID(),
    name: merged.name.trim(),
    avatar: merged.avatar?.palette ? merged.avatar : DEFAULT_AVATAR,
    description: merged.description ?? '',
    instructions: merged.instructions.trim(),
    provider: merged.provider || 'default',
    model: merged.model ?? '',
    effort: merged.effort ?? '',
    schedule,
    skills: merged.skills ?? [],
    tools: merged.tools ?? [],
    access: ACCESS_LEVELS.includes(merged.access) ? merged.access : 'chat',
    projectId: merged.projectId ?? null,
    monitor,
    monitorState: monitorChanged ? (monitor ? { status: 'unknown', message: '', lastCheck: null, since: null } : null) : (base?.monitorState ?? null),
    enabled,
    learns: merged.learns ?? true,
    notify: merged.notify ?? false,
    templateId: merged.templateId ?? null,
    nextRunAt: scheduleChanged ? (enabled ? nextRun(schedule, new Date())?.toISOString() ?? null : null) : (base?.nextRunAt ?? null),
    nextCheckAt: monitorChanged ? (enabled && monitor ? new Date().toISOString() : null) : (base?.nextCheckAt ?? null),
    lastRunAt: base?.lastRunAt ?? null,
    createdAt: base?.createdAt ?? ts,
    updatedAt: ts,
  };
}

export function createAgent(input: AgentInput): Agent {
  return persist(normalize(input));
}

export function createFromTemplate(templateId: string, overrides: Partial<AgentInput> = {}): Agent {
  const t = TEMPLATES.find((x) => x.templateId === templateId);
  if (!t) throw new Error(`Unknown template ${templateId}`);
  const { category: _, ...input } = t;
  return createAgent({ ...input, ...overrides });
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

export type RunView = Run & { agent_name?: string; agent_avatar?: Avatar; project_id?: string | null };

export const listRuns = (opts: { agentId?: string; projectId?: string; limit?: number } = {}): RunView[] => {
  const limit = opts.limit ?? 60;
  const runs = opts.agentId
    ? all<Run>('SELECT * FROM runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?', opts.agentId, limit)
    : all<Run>('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?', limit * 3);
  const agents = new Map(listAgents().map((a) => [a.id, a]));
  return runs
    .map((r) => {
      const a = agents.get(r.agent_id);
      return { ...r, agent_name: a?.name, agent_avatar: a?.avatar, project_id: a?.projectId ?? null };
    })
    .filter((r) => !opts.projectId || r.project_id === opts.projectId)
    .slice(0, limit);
};

const running = new Set<string>();
export const isRunning = (id: string) => running.has(id);

const aborts = new Map<string, AbortController>();
/** Stops a running agent (its AI process is killed, the run is marked as stopped). */
export function stopAgent(id: string): boolean {
  const a = aborts.get(id);
  if (!a) return false;
  a.abort();
  return true;
}

export async function runAgent(id: string, trigger: 'manual' | 'schedule' | 'monitor' | 'team' = 'manual', context = '', task?: string, mcp?: { name: string; url: string }[]): Promise<Run> {
  const agent = getAgent(id);
  if (!agent) throw new Error('Agent not found');
  if (running.has(id)) throw new Error(`${agent.name} is already running`);
  running.add(id);
  const ctrl = new AbortController();
  aborts.set(id, ctrl);
  setAgentStatus(id, 'working', task ? task.replace(/\s+/g, ' ') : trigger === 'monitor' ? 'checking an alert' : 'running its task');

  const runId = randomUUID();
  run('INSERT INTO runs (id, agent_id, status, trigger, started_at) VALUES (?, ?, ?, ?, ?)', runId, id, 'running', trigger, now());
  emit('run.started', { id: runId, agentId: id, agent_name: agent.name, agent_avatar: agent.avatar });
  const steps: string[] = [];

  try {
    const provider = await resolveProvider(agent.provider, { avoidLimited: true });
    const project = getProject(agent.projectId);
    run('UPDATE runs SET provider = ? WHERE id = ?', provider.id, runId);

    const previous = listRuns({ agentId: id, limit: 4 })
      .filter((r) => r.status === 'done' && r.output)
      .slice(0, 3)
      .map((r) => `### ${new Date(r.started_at).toLocaleString()}\n${r.output!.slice(0, 1500)}`)
      .join('\n\n');
    const skills = skillsText(agent.skills);
    const accessNote =
      agent.access === 'full'
        ? 'You may run commands on this computer (Windows: PowerShell/cmd) to diagnose and fix things. Prefer safe, reversible actions.'
        : agent.access === 'read'
          ? 'You may read files and search the web, but do not change anything.'
          : '';
    const prompt = buildPrompt({
      query: task ?? agent.instructions,
      asTask: true,
      project,
      instructions: `You are "${agent.name}", an agent inside ALTTER. ${agent.description}${task ? `\nYour role: ${agent.instructions}` : ''}\n${accessNote}${skills ? `\n\n${skills}` : ''}`,
      extra: [context, pluginsGuide(), previous ? `## Your previous runs (build on them, don't repeat them)\n${previous}` : ''].filter(Boolean).join('\n\n'),
      activityHours: 36,
    });

    const own = agent.provider === 'default' || agent.provider === provider.id;
    const { text } = await provider.run({
      prompt,
      model: own ? agent.model || undefined : undefined,
      effort: own ? agent.effort || undefined : undefined,
      access: agent.access,
      tools: [...agent.tools, ...pluginTools()],
      cwd: project?.folder,
      fileDirs: projectDirs(project),
      mcp: [...(mcp ?? []), ...pluginServers()],
      timeoutMs: 60 * 60_000,
      signal: ctrl.signal,
      onActivity: (step) => {
        if (ctrl.signal.aborted) return;
        steps.push(step);
        setAgentStatus(id, 'working', step);
        emit('run.activity', { id: runId, agentId: id, step });
      },
    });
    run('UPDATE runs SET status = ?, output = ?, detail = ?, finished_at = ? WHERE id = ?', 'done', text, steps.length ? JSON.stringify(steps.slice(-50)) : null, now(), runId);
    logActivity('agent', `${agent.name} finished: ${text.replace(/\s+/g, ' ').slice(0, 140)}`, runId);
    if (trigger === 'monitor') postAlert(agent, { kind: 'report', message: text }).catch(() => {});
    else if (agent.notify && trigger === 'schedule')
      notifyPhones({ title: agent.name, body: text.replace(/[#*`>_]/g, '').replace(/s+/g, ' ').trim().slice(0, 300), url: `/agents/${id}`, tag: `run-${id}` }).catch(() => {});
    if (agent.learns) learnFrom(`Agent "${agent.name}" task: ${agent.instructions}\n\nResult:\n${text}`, `agent:${id}`, agent.projectId);
  } catch (err) {
    const msg = ctrl.signal.aborted ? 'Stopped' : err instanceof Error ? err.message : String(err);
    run('UPDATE runs SET status = ?, error = ?, detail = ?, finished_at = ? WHERE id = ?', 'error', msg, steps.length ? JSON.stringify(steps.slice(-50)) : null, now(), runId);
    logActivity('agent', `${agent.name} failed: ${msg.slice(0, 140)}`, runId);
    if (!ctrl.signal.aborted && (trigger === 'monitor' || agent.notify)) postAlert(agent, { kind: 'error', message: msg }).catch(() => {});
  } finally {
    running.delete(id);
    aborts.delete(id);
    setAgentStatus(id, 'idle', task ? task.replace(/\s+/g, ' ') : '');
    const fresh = getAgent(id);
    if (fresh) {
      fresh.lastRunAt = now();
      if (trigger !== 'monitor') fresh.nextRunAt = fresh.enabled ? nextRun(fresh.schedule, new Date())?.toISOString() ?? null : null;
      persist(fresh);
    }
  }
  const result = get<Run>('SELECT * FROM runs WHERE id = ?', runId)!;
  emit('run.finished', { ...result, agent_name: agent.name, agent_avatar: agent.avatar });
  return result;
}

/** Runs an automation's health check now; on a new failure wakes the agent (to fix or report). */
export async function checkMonitor(id: string, wakeAgent = true): Promise<MonitorState | null> {
  const agent = getAgent(id);
  if (!agent?.monitor) return null;
  const res = await runCheck(agent.monitor);
  const fresh = getAgent(id);
  if (!fresh?.monitor) return null;
  const prev = fresh.monitorState ?? { status: 'unknown', message: '', lastCheck: null, since: null };
  const status = res.ok ? 'ok' : 'fail';
  const state: MonitorState = {
    status,
    message: res.message,
    lastCheck: now(),
    since: prev.status === status ? (prev.since ?? now()) : now(),
    latencyMs: res.latencyMs,
  };
  fresh.monitorState = state;
  fresh.nextCheckAt = new Date(Date.now() + fresh.monitor.everyMinutes * 60_000).toISOString();
  persist(fresh);
  emit('monitor.changed', { agentId: id, state, name: fresh.name, previous: prev.status });

  const newFailure = status === 'fail' && prev.status !== 'fail';
  const m0 = fresh.monitor;
  if (newFailure) {
    logActivity('monitor', `${fresh.name}: check failed — ${res.message}`, id);
    postAlert(fresh, { kind: 'fail', target: `${m0.type} ${m0.target}`, message: res.message, autoFix: m0.autoFix && fresh.access === 'full' }).catch(() => {});
  }
  if (status === 'ok' && prev.status === 'fail') {
    logActivity('monitor', `${fresh.name}: back to normal`, id);
    postAlert(fresh, { kind: 'ok', target: `${m0.type} ${m0.target}`, message: res.message }).catch(() => {});
  }

  if (wakeAgent && newFailure && !running.has(id)) {
    const m = fresh.monitor;
    const context =
      `## ALERT — health check failed\nCheck: ${m.type} ${m.target}\nResult: ${res.message}\nChecked at: ${state.lastCheck}\n` +
      (m.autoFix && fresh.access === 'full'
        ? 'Diagnose and fix it now, then verify the check passes again.'
        : 'Diagnose the likely cause and tell the user exactly what to do. Do not change anything.');
    runAgent(id, 'monitor', context)
      .then(() => (m.autoFix ? checkMonitor(id, false) : null))
      .catch(() => {});
  }
  return state;
}

/** Every 20 s: due scheduled agents run; due monitors are checked. Missed runs (sleep) fire once on wake. */
export function startScheduler(): () => void {
  run(`UPDATE runs SET status = 'error', error = 'ALTTER was stopped during this run', finished_at = ? WHERE status = 'running'`, now());
  const checking = new Set<string>();
  const tick = () => {
    const t = Date.now();
    for (const a of listAgents()) {
      if (!a.enabled) continue;
      if (a.nextRunAt && Date.parse(a.nextRunAt) <= t && !running.has(a.id)) {
        runAgent(a.id, 'schedule').catch((e) => console.warn(`[alter] agent ${a.name}:`, e.message));
      }
      if (a.monitor && (!a.nextCheckAt || Date.parse(a.nextCheckAt) <= t) && !checking.has(a.id)) {
        checking.add(a.id);
        checkMonitor(a.id)
          .catch((e) => console.warn(`[alter] monitor ${a.name}:`, e.message))
          .finally(() => checking.delete(a.id));
      }
    }
  };
  const timer = setInterval(tick, 20_000);
  tick();
  return () => clearInterval(timer);
}
