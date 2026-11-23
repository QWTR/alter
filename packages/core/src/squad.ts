// Teams that run themselves: "make yourself a team for X" → the AI proposes a lead + departments + a
// tester (```alter-team card). One click creates the agents and their group, then the lead runs the job:
// plan → every department works in parallel in the shared project folder → the tester checks for real →
// fixes go back to whoever owns them → test again (a few rounds max) → a final report (+ phone push).
// Afterwards "@Team do Y" starts the same loop again. Progress is a live ```alter-teamrun board in the chat.
import { randomUUID } from 'node:crypto';
import { logActivity } from './activity.ts';
import { createAgent, getAgent, isRunning, runAgent, stopAgent, type Agent } from './agents.ts';
import { getConversation, updateConversation, type Message } from './chat.ts';
import { loadConfig, saveConfig } from './config.ts';
import { all, get, now, run } from './db.ts';
import { emit } from './events.ts';
import { createProject, getProject } from './projects.ts';
import { resolveProvider } from './providers/index.ts';
import { notifyPhones } from './push.ts';
import { listGroups, mentionsIn, saveGroup, type AgentGroup } from './team.ts';

export const TEAM_FENCE = 'alter-team';
export const RUN_FENCE = 'alter-teamrun';

export interface TeamMemberSpec { name: string; role: string; instructions: string; access?: 'read' | 'full'; icon?: string; palette?: string }
export interface TeamCard {
  name: string;
  goal: string;
  lead: { name: string; instructions: string };
  members: TeamMemberSpec[];
  tester?: { name: string; instructions: string } | null;
  rounds?: number;
  start?: boolean;
  done?: boolean;
  groupId?: string;
}

interface SquadMeta { groupId: string; leadId: string; testerId: string | null; projectId: string | null; rounds: number }

export const TEAM_GUIDE = `## Building a team of agents
When the user asks you to make/organise a team or group of agents, departments, a "chief/lead" who splits the work, or a big multi-part job "with agents" — don't just describe it: answer with one short sentence and exactly one block the app turns into a card ("Create team and start"):
\`\`\`${TEAM_FENCE}
{"name":"Short team name (1-2 words, used as @Name)","goal":"the job, concrete, in the user's language",
 "lead":{"name":"Chief","instructions":"how the lead splits and checks the work"},
 "members":[
  {"name":"Frontend","role":"builds the UI","instructions":"standing instructions for this department","access":"full","icon":"code","palette":"ocean"},
  {"name":"Backend","role":"API + database","instructions":"…","access":"full","icon":"server","palette":"mint"}
 ],
 "tester":{"name":"QA","instructions":"runs the build/tests, opens the result, reports concrete problems per department"},
 "rounds":3,"start":true}
\`\`\`
Rules: 2-6 members with clear, non-overlapping departments; names short and distinct; access "full" for anyone who must create/change files or run commands, "read" for research/review only. Always include a tester unless the job has nothing checkable. rounds = how many test→fix rounds at most (1-5). icon: code, server, palette, pen, film, globe, database, megaphone, trend, shield, rocket, idea, book, camera, music, brain, wrench. palette: violet, ocean, sunset, mint, rose, amber, slate, lime. Valid JSON. Never create agents yourself any other way — the card does it.`;

const WANTS = /(zesp[oó]ł|zespol|team\b|grup[aęy]? agent|agent(ów|ow|ami)\b|dzia[łl](y|ów|ach)?\b|szef|chief|kierown|podziel (to|prac|zadani)|department|squad|crew)/i;
export const wantsTeamCard = (message: string, history: { content: string }[] = []) => WANTS.test(message) || history.slice(-2).some((m) => m.content.includes('```' + TEAM_FENCE));

const BLOCK = new RegExp('```' + TEAM_FENCE + '[^\\n]*\\n([\\s\\S]*?)```', 'g');
export function teamsIn(text: string) {
  return [...text.matchAll(BLOCK)].map((m) => {
    let card: TeamCard | null = null;
    try {
      const p = JSON.parse(m[1]);
      if (p && Array.isArray(p.members) && p.goal) card = p;
    } catch {}
    return { start: m.index!, end: m.index! + m[0].length, card };
  });
}

const squads = (): Record<string, SquadMeta> => ((loadConfig() as any).squads ??= {});
export const squadOf = (groupId: string): SquadMeta | undefined => squads()[groupId];

/** "@Team …" where Team is a self-running team → its group. */
export function squadFor(message: string): AgentGroup | null {
  const m = mentionsIn(message);
  return m.groups.find((g) => !!squadOf(g.id)) ?? null;
}

const ICONS = ['code', 'server', 'palette', 'pen', 'film', 'globe', 'database', 'megaphone', 'trend', 'shield', 'rocket', 'idea', 'book', 'camera', 'music', 'brain', 'wrench', 'sparkles', 'users', 'bot'];
const PALETTES = ['violet', 'ocean', 'sunset', 'mint', 'rose', 'amber', 'slate', 'lime'];

/** Creates the team from its card (agents + group + shared project), then starts the job. */
export function applyTeam(conversationId: string, messageId: number, index: number, skip: number[] = []): { card: TeamCard; message: Message; groupId: string; boardId: number | null } {
  let conv = getConversation(conversationId);
  if (!conv) throw new Error('Conversation not found');
  const msg = get<Message>('SELECT * FROM messages WHERE id = ? AND conversation_id = ?', messageId, conversationId);
  if (!msg || msg.role !== 'assistant') throw new Error('Message not found');
  const b = teamsIn(msg.content)[index];
  if (!b?.card) throw new Error('This card could not be read');
  if (b.card.done) throw new Error('Already created');
  const card = b.card;
  const provider = conv.provider ?? 'default';
  let project = getProject(conv.project_id);
  if (!project) {
    project = createProject({ name: card.name.slice(0, 60) || 'Team', description: card.goal.slice(0, 200) });
    conv = updateConversation(conversationId, { projectId: project.id })!;
  }
  const make = (name: string, description: string, instructions: string, access: 'read' | 'full', icon: string, palette: string) =>
    createAgent({ name: name.slice(0, 60), description: description.slice(0, 200), instructions, schedule: 'manual', access, projectId: project!.id, provider, avatar: { palette, icon }, enabled: true });

  const lead = make(card.lead?.name || 'Lead', `${card.name}: lead`, card.lead?.instructions || 'Split the job between the team, then check it.', 'read', 'users', 'violet');
  const members = card.members
    .filter((_, i) => !skip.includes(i))
    .slice(0, 8)
    .map((m, i) => make(m.name, `${card.name}: ${m.role}`, m.instructions || m.role, m.access === 'read' ? 'read' : 'full', ICONS.includes(m.icon ?? '') ? m.icon! : ICONS[i % ICONS.length], PALETTES.includes(m.palette ?? '') ? m.palette! : PALETTES[(i + 1) % PALETTES.length]));
  const tester = card.tester && !skip.includes(-1) ? make(card.tester.name || 'QA', `${card.name}: tests and checks`, card.tester.instructions || 'Check the work for real and report problems.', 'full', 'shield', 'amber') : null;
  if (!members.length) throw new Error('Keep at least one member');

  const group = saveGroup({ name: card.name, description: card.goal.slice(0, 200), members: [lead.id, ...members.map((a) => a.id), ...(tester ? [tester.id] : [])], lead: lead.id });
  squads()[group.id] = { groupId: group.id, leadId: lead.id, testerId: tester?.id ?? null, projectId: project.id, rounds: Math.max(1, Math.min(5, Number(card.rounds) || 3)) };
  saveConfig();

  const saved: TeamCard = { ...card, done: true, groupId: group.id };
  const content = msg.content.slice(0, b.start) + '```' + TEAM_FENCE + '\n' + JSON.stringify(saved) + '\n```' + msg.content.slice(b.end);
  run('UPDATE messages SET content = ? WHERE id = ?', content, messageId);
  logActivity('agent', `Team "${card.name}" created (${members.length + 1 + (tester ? 1 : 0)} agents)`, project.id);
  emit('conversation.updated', { id: conversationId });
  emit('agent.changed', { group: group.id });
  const boardId = card.start === false ? null : startSquad(conversationId, group.id, card.goal).messageId;
  return { card: saved, message: { ...msg, content }, groupId: group.id, boardId };
}

// ---------- the run ----------
type Phase = 'plan' | 'work' | 'test' | 'fix' | 'report' | 'done' | 'stopped' | 'error';
interface MemberState { id: string; name: string; role: string; avatar: Agent['avatar']; status: 'waiting' | 'working' | 'done' | 'error'; task?: string; note?: string; kind: 'lead' | 'member' | 'tester' }
export interface Board {
  runId: string; team: string; groupId: string; goal: string; phase: Phase; round: number; rounds: number;
  members: MemberState[]; issues: { member: string; problem: string }[]; report?: string; error?: string; startedAt: string; finishedAt?: string;
}

const live = new Map<string, { board: Board; messageId: number; conversationId: string; cancelled: boolean }>();

function save(r: { board: Board; messageId: number; conversationId: string }, intro: string) {
  const content = `${intro}\n\n\`\`\`${RUN_FENCE}\n${JSON.stringify(r.board)}\n\`\`\``;
  run('UPDATE messages SET content = ? WHERE id = ?', content, r.messageId);
  emit('squad.update', { conversationId: r.conversationId, messageId: r.messageId, runId: r.board.runId, phase: r.board.phase });
}

/** Starts the job; returns the board message (the chat shows it at once). */
export function startSquad(conversationId: string, groupId: string, goal: string, userText?: string): { messageId: number; content: string } {
  const g = listGroups().find((x) => x.id === groupId);
  const meta = squadOf(groupId);
  if (!g || !meta) throw new Error('Team not found');
  if ([...live.values()].some((r) => r.board.groupId === groupId && !['done', 'stopped', 'error'].includes(r.board.phase))) throw new Error(`${g.name} is already working`);
  const members: MemberState[] = g.members.map((id) => getAgent(id)).filter((a): a is Agent => !!a).map((a) => ({
    id: a.id, name: a.name, role: a.description.replace(/^[^:]*:\s*/, ''), avatar: a.avatar, status: 'waiting',
    kind: a.id === meta.leadId ? 'lead' : a.id === meta.testerId ? 'tester' : 'member',
  }));
  const board: Board = { runId: randomUUID(), team: g.name, groupId, goal, phase: 'plan', round: 1, rounds: meta.rounds, members, issues: [], startedAt: new Date().toISOString() };
  const intro = `**${g.name}** — ${goal.slice(0, 300)}`;
  const content = `${intro}\n\n\`\`\`${RUN_FENCE}\n${JSON.stringify(board)}\n\`\`\``;
  const r = run('INSERT INTO messages (conversation_id, role, content, provider, created_at) VALUES (?, ?, ?, ?, ?)', conversationId, 'assistant', content, null, now());
  const messageId = Number(r.lastInsertRowid);
  const state = { board, messageId, conversationId, cancelled: false };
  live.set(board.runId, state);
  emit('conversation.updated', { id: conversationId });
  orchestrate(state, meta, intro, userText ?? goal).catch((e) => {
    board.phase = 'error';
    board.error = (e as Error).message;
    board.finishedAt = new Date().toISOString();
    save(state, intro);
  });
  return { messageId, content };
}

export function stopSquad(runId: string): boolean {
  const r = live.get(runId);
  if (!r) return false;
  r.cancelled = true;
  for (const m of r.board.members) stopAgent(m.id);
  return true;
}

/** After a restart nothing is running any more: boards that were mid-way are marked as stopped. */
export function recoverSquads() {
  const rows = all<{ id: number; content: string }>(`SELECT id, content FROM messages WHERE role = 'assistant' AND content LIKE ? ORDER BY id DESC LIMIT 50`, '%```' + RUN_FENCE + '%');
  for (const r of rows) {
    const m = r.content.match(new RegExp('```' + RUN_FENCE + '\\n([\\s\\S]*?)\\n```'));
    if (!m) continue;
    try {
      const b = JSON.parse(m[1]) as Board;
      if (['done', 'stopped', 'error'].includes(b.phase)) continue;
      b.phase = 'stopped';
      b.finishedAt = new Date().toISOString();
      for (const x of b.members) if (x.status === 'working') x.status = 'error';
      run('UPDATE messages SET content = ? WHERE id = ?', r.content.replace(m[1], JSON.stringify(b)), r.id);
    } catch {}
  }
}

const firstJson = (text: string): any => {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try { return JSON.parse(raw); } catch { return null; }
};

async function waitFree(id: string, cancelled: () => boolean) {
  while (isRunning(id) && !cancelled()) await new Promise((r) => setTimeout(r, 1500));
}

async function orchestrate(state: { board: Board; messageId: number; conversationId: string; cancelled: boolean }, meta: SquadMeta, intro: string, userText: string) {
  const b = state.board;
  const lead = getAgent(meta.leadId)!;
  const workers = b.members.filter((m) => m.kind === 'member');
  const tester = b.members.find((m) => m.kind === 'tester');
  const project = getProject(meta.projectId);
  const set = (id: string, patch: Partial<MemberState>) => { Object.assign(b.members.find((m) => m.id === id) ?? {}, patch); save(state, intro); };
  const stopped = () => state.cancelled;
  const roster = workers.map((w) => `- ${w.id} · ${w.name}: ${w.role}`).join('\n');
  const results: { name: string; task: string; output: string }[] = [];
  const brief = () =>
    `You are part of the team "${b.team}". Team goal (from the user): ${userText}\n` +
    (project?.folder ? `Shared project folder (everyone works here; keep files organised by department): ${project.folder}\n` : '') +
    `Team:\n${b.members.map((m) => `- ${m.name} (${m.kind === 'lead' ? 'lead' : m.kind === 'tester' ? 'tester' : m.role})`).join('\n')}\n` +
    (results.length ? `\nWork already done by the team (latest last):\n${results.slice(-8).map((r) => `### ${r.name}: ${r.task.slice(0, 200)}\n${r.output.slice(0, 1200)}`).join('\n\n')}` : '');

  const leadThink = async (prompt: string): Promise<string> => {
    set(lead.id, { status: 'working' });
    const provider = await resolveProvider(lead.provider, { avoidLimited: true });
    const { text } = await provider.run({ prompt: `You are "${lead.name}", the lead of the team "${b.team}". ${lead.instructions}\n\n${prompt}`, access: 'chat', timeoutMs: 8 * 60_000 });
    set(lead.id, { status: 'done' });
    return text;
  };

  // 1. plan
  const planText = await leadThink(
    `Team goal (from the user): ${userText}\n${project?.folder ? `Shared folder: ${project.folder}\n` : ''}Departments:\n${roster}\n\n` +
      'Split the goal into concrete tasks for the departments (1-3 tasks each, only who is needed; tasks of one department run in order, departments run in parallel). Each task must say exactly what to produce and where. ' +
      'If a department needs another one\'s result first (e.g. docs describe the finished page), list that department in "after" — otherwise leave it empty so they work at the same time. ' +
      'Answer ONLY with JSON: {"summary":"one line in the user\'s language","tasks":[{"member":"<id from the list>","task":"…","after":["<id>"]}]}',
  );
  if (stopped()) return finish('stopped');
  const plan = firstJson(planText);
  const who = (x: unknown) => workers.find((w) => w.id === x || w.name.toLowerCase() === String(x).toLowerCase())?.id;
  let tasks: { member: string; task: string }[] = Array.isArray(plan?.tasks) ? plan.tasks.filter((t: any) => who(t.member) && t.task) : [];
  // who waits for whom (first round only; fixes run side by side)
  let after = new Map<string, string[]>();
  for (const t of Array.isArray(plan?.tasks) ? plan.tasks : []) {
    const id = who(t.member);
    const deps = (Array.isArray(t.after) ? t.after : []).map(who).filter((d: string | undefined): d is string => !!d && d !== id);
    if (id && deps.length) after.set(id, [...new Set([...(after.get(id) ?? []), ...deps])]);
  }
  // no circles: a dependency that (through others) waits for this department is dropped
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean => from === to || (!seen.has(from) && (seen.add(from), (after.get(from) ?? []).some((d) => reaches(d, to, seen))));
  for (const [id, ds] of after) after.set(id, ds.filter((d) => !reaches(d, id)));
  tasks = tasks.map((t) => ({ member: who(t.member)!, task: String(t.task) }));
  if (plan?.summary) set(lead.id, { note: String(plan.summary).slice(0, 200) });
  if (!tasks.length) tasks = workers.map((w) => ({ member: w.id, task: `${userText}\n(Your part: ${w.role}.)` }));

  for (;;) {
    // 2. work (departments in parallel, each department's tasks in order)
    b.phase = b.round === 1 ? 'work' : 'fix';
    save(state, intro);
    const byMember = new Map<string, string[]>();
    for (const t of tasks) byMember.set(t.member, [...(byMember.get(t.member) ?? []), t.task]);
    const finished = new Map<string, { promise: Promise<void>; resolve: () => void }>();
    for (const id of byMember.keys()) { let resolve!: () => void; const promise = new Promise<void>((r) => (resolve = r)); finished.set(id, { promise, resolve }); }
    const deps = after;
    after = new Map();
    await Promise.all([...byMember].map(async ([id, list]) => {
      const waitFor = (deps.get(id) ?? []).filter((d) => finished.has(d) && d !== id);
      if (waitFor.length) {
        set(id, { status: 'waiting', task: list[0], note: `⏳ ${waitFor.map((d) => getAgent(d)?.name ?? d).join(', ')}` });
        await Promise.all(waitFor.map((d) => finished.get(d)!.promise));
      }
      try { await runList(id, list); } finally { finished.get(id)!.resolve(); }
    }));
    async function runList(id: string, list: string[]) {
      for (const task of list) {
        if (stopped()) return;
        await waitFree(id, stopped);
        set(id, { status: 'working', task, note: undefined });
        try {
          const r = await runAgent(id, 'team', brief(), task);
          const out = r.status === 'done' ? (get<{ output: string }>('SELECT output FROM runs WHERE id = ?', r.id)?.output ?? '') : '';
          const latest = get<{ output: string | null; status: string; error: string | null }>('SELECT output, status, error FROM runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT 1', id);
          const text = out || latest?.output || '';
          if (latest?.status === 'error') { set(id, { status: 'error', note: latest.error ?? 'error' }); continue; }
          results.push({ name: getAgent(id)?.name ?? id, task, output: text });
          set(id, { status: 'done', note: text.replace(/[#*`>_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160) });
        } catch (e) {
          set(id, { status: 'error', note: (e as Error).message });
        }
      }
    }
    if (stopped()) return finish('stopped');

    // 3. test
    b.phase = 'test';
    save(state, intro);
    let verdict: { ok?: boolean; issues?: { member: string; problem: string }[] } | null = null;
    const checkPrompt =
      `Check the team's work against the goal for real: open/run what was built, run the build and tests if there are any, look at the result like the user would. ` +
      `Then end your answer with ONE JSON line: {"ok":true|false,"issues":[{"member":"<department name>","problem":"concrete problem + where + how to see it"}]}. ` +
      `Departments: ${workers.map((w) => w.name).join(', ')}. Only real problems that block the goal; ok=true when the goal is met.`;
    if (tester) {
      await waitFree(tester.id, stopped);
      set(tester.id, { status: 'working', task: checkPrompt.slice(0, 120) });
      try {
        await runAgent(tester.id, 'team', brief(), checkPrompt);
        const last = get<{ output: string | null; status: string; error: string | null }>('SELECT output, status, error FROM runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT 1', tester.id);
        verdict = firstJson(last?.output?.split('\n').reverse().find((l) => l.trim().startsWith('{')) ?? last?.output ?? '');
        results.push({ name: tester.name, task: 'test', output: last?.output ?? '' });
        set(tester.id, { status: last?.status === 'error' ? 'error' : 'done', note: verdict?.ok ? 'OK' : `${verdict?.issues?.length ?? 0} issue(s)` });
      } catch (e) {
        set(tester.id, { status: 'error', note: (e as Error).message });
      }
    } else {
      verdict = firstJson(await leadThink(`${brief()}\n\nReview the work. ${checkPrompt}`));
    }
    if (stopped()) return finish('stopped');
    const issues = (verdict?.issues ?? []).filter((i) => i && i.problem).slice(0, 12);
    b.issues = issues.map((i) => ({ member: String(i.member ?? ''), problem: String(i.problem) }));
    save(state, intro);
    if (verdict?.ok || !issues.length || b.round >= b.rounds) break;

    // 4. fixes go to whoever owns them
    b.round++;
    tasks = issues.map((i) => {
      const w = workers.find((x) => x.name.toLowerCase() === String(i.member).toLowerCase() || x.id === i.member) ?? workers.find((x) => String(i.member).toLowerCase().includes(x.name.toLowerCase())) ?? workers[0];
      return { member: w.id, task: `Fix this problem the tester found: ${i.problem}` };
    });
  }

  // 5. report
  b.phase = 'report';
  save(state, intro);
  b.report = await leadThink(
    `${brief()}\n\nOpen problems after the last test: ${b.issues.length ? b.issues.map((i) => `${i.member}: ${i.problem}`).join('; ') : 'none'}.\n` +
      `Write the final report for the user in the language of the goal: what was made (with file paths / how to open it), how it was checked, and what is left (if anything). Short, concrete, Markdown.`,
  );
  return finish('done');

  function finish(phase: Phase) {
    b.phase = phase;
    b.finishedAt = new Date().toISOString();
    for (const m of b.members) if (m.status === 'working' || m.status === 'waiting') m.status = phase === 'done' ? 'done' : m.status === 'working' ? 'error' : 'waiting';
    save(state, intro);
    live.delete(b.runId);
    logActivity('agent', `Team "${b.team}" ${phase}: ${b.goal.slice(0, 120)}`, state.conversationId);
    if (phase === 'done')
      notifyPhones({ title: `${b.team} ✓`, body: (b.report ?? '').replace(/[#*`>_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240), url: `/chat/${state.conversationId}`, tag: `team-${b.runId}` }).catch(() => {});
  }
}
