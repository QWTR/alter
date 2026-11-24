// Workspaces for a whole company. People and departments live at the company level; each person has one key
// (kept on their device) that opens every workspace (project) they are assigned to. Inside a workspace the team
// shares chats, tasks (a board), documents and reports, a calendar and automations. The AI runs on this computer.
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { all, get, getDb, now, run } from './db.ts';
import { loadConfig, saveConfig } from './config.ts';
import { colorFor } from './rooms.ts';
import { emit } from './events.ts';
import { getProject, listProjects } from './projects.ts';
import { getAgent, listAgents, runAgent } from './agents.ts';
import { resolveProvider } from './providers/index.ts';
import { notifyPhones } from './push.ts';

// ---------- people & departments ----------
export interface Person {
  id: string;
  token: string;
  name: string;
  color: string;
  /** Job title, e.g. "Frontend developer". */
  title: string;
  /** admin: may manage tasks of everyone, departments and automations of their workspaces. */
  role: 'admin' | 'member';
  departmentIds: string[];
  projectIds: string[];
  createdAt: string;
  joinedAt: string | null;
  lastSeen: string | null;
}
/** Kept for older imports. */
export type WsMember = Person;
export interface Department { id: string; name: string; color: string }

const DEPT_COLORS = ['#7c5cff', '#3987e5', '#199e70', '#d95926', '#c98500', '#d55181', '#20c997', '#9085e9'];

function cfg() {
  const c = loadConfig() as any;
  // v0.15 kept members per project: fold them into company people once
  if (Array.isArray(c.members) && c.members.length && !c.people) {
    c.people = c.members.map((m: any) => ({ id: m.id, token: m.token, name: m.name, color: m.color, title: '', role: 'member', departmentIds: [], projectIds: [m.projectId], createdAt: m.createdAt, joinedAt: m.joinedAt, lastSeen: m.lastSeen }));
    delete c.members;
    saveConfig();
  }
  c.people ??= [];
  c.departments ??= [];
  c.wsRules ??= {};
  return c as { people: Person[]; departments: Department[]; wsRules: Record<string, Partial<WsRules>>; userName?: string };
}
export const people = () => cfg().people;
export const departments = () => cfg().departments;
export const peopleOf = (projectId: string) => people().filter((p) => p.projectIds.includes(projectId));
/** Kept for older imports. */
export const membersOf = peopleOf;

export const isOnline = (p: Pick<Person, 'lastSeen'>) => !!p.lastSeen && Date.now() - Date.parse(p.lastSeen) < 70_000;
/** Safe to show to the team (no keys). */
export const publicPerson = (p: Person) => ({ id: p.id, name: p.name, color: p.color, title: p.title, role: p.role, departmentIds: p.departmentIds, projectIds: p.projectIds, joined: !!p.joinedAt, online: isOnline(p), lastSeen: p.lastSeen });
export const publicMember = publicPerson;

export function addPerson(input: { name: string; title?: string; role?: string; departmentIds?: string[]; projectIds?: string[] }): Person {
  const name = String(input.name ?? '').trim().slice(0, 40) || 'Teammate';
  const p: Person = {
    id: randomUUID(), token: randomBytes(24).toString('base64url'), name, color: colorFor(name + Date.now()),
    title: String(input.title ?? '').slice(0, 60), role: input.role === 'admin' ? 'admin' : 'member',
    departmentIds: cleanIds(input.departmentIds, departments().map((d) => d.id)),
    projectIds: cleanIds(input.projectIds, listProjects().map((x) => x.id)),
    createdAt: now(), joinedAt: null, lastSeen: null,
  };
  people().push(p);
  saveConfig();
  emit('workspace.changed', {});
  return p;
}
export function updatePerson(id: string, patch: Partial<Pick<Person, 'name' | 'title' | 'role' | 'departmentIds' | 'projectIds'>>): Person | undefined {
  const p = people().find((x) => x.id === id);
  if (!p) return;
  if (typeof patch.name === 'string' && patch.name.trim()) p.name = patch.name.trim().slice(0, 40);
  if (typeof patch.title === 'string') p.title = patch.title.slice(0, 60);
  if (patch.role === 'admin' || patch.role === 'member') p.role = patch.role;
  if (Array.isArray(patch.departmentIds)) p.departmentIds = cleanIds(patch.departmentIds, departments().map((d) => d.id));
  if (Array.isArray(patch.projectIds)) p.projectIds = cleanIds(patch.projectIds, listProjects().map((x) => x.id));
  saveConfig();
  emit('workspace.changed', {});
  return p;
}
export function removePerson(id: string): boolean {
  const c = cfg();
  const before = c.people.length;
  c.people = c.people.filter((p) => p.id !== id);
  saveConfig();
  emit('workspace.changed', {});
  return c.people.length < before;
}
/** Invite from a project page: a new person for this workspace. */
export const inviteMember = (projectId: string, name: string) => addPerson({ name, projectIds: [projectId] });
/** Take someone out of one workspace (they keep the others). */
export function removeMember(projectId: string, id: string): boolean {
  const p = people().find((x) => x.id === id);
  if (!p || !p.projectIds.includes(projectId)) return false;
  p.projectIds = p.projectIds.filter((x) => x !== projectId);
  saveConfig();
  emit('workspace.changed', { projectId });
  return true;
}
export function dropProjectMembers(projectId: string) {
  for (const p of people()) p.projectIds = p.projectIds.filter((x) => x !== projectId);
  delete cfg().wsRules[projectId];
  saveConfig();
  run('DELETE FROM tasks WHERE project_id = ?', projectId);
  run('DELETE FROM docs WHERE project_id = ?', projectId);
}

export function addDepartment(name: string): Department {
  const d: Department = { id: randomUUID(), name: name.trim().slice(0, 40) || 'Department', color: DEPT_COLORS[departments().length % DEPT_COLORS.length] };
  departments().push(d);
  saveConfig();
  emit('workspace.changed', {});
  return d;
}
export function updateDepartment(id: string, patch: { name?: string; color?: string }) {
  const d = departments().find((x) => x.id === id);
  if (!d) return;
  if (typeof patch.name === 'string' && patch.name.trim()) d.name = patch.name.trim().slice(0, 40);
  if (typeof patch.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.color)) d.color = patch.color;
  saveConfig();
  emit('workspace.changed', {});
  return d;
}
export function removeDepartment(id: string): boolean {
  const c = cfg();
  const before = c.departments.length;
  c.departments = c.departments.filter((d) => d.id !== id);
  for (const p of c.people) p.departmentIds = p.departmentIds.filter((x) => x !== id);
  run('UPDATE tasks SET department_id = NULL WHERE department_id = ?', id);
  saveConfig();
  emit('workspace.changed', {});
  return c.departments.length < before;
}

const cleanIds = (ids: unknown, valid: string[]) => (Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === 'string' && valid.includes(x)))] : []);

export function memberByToken(token: string): Person | undefined {
  const t = Buffer.from(token);
  return people().find((m) => {
    const x = Buffer.from(m.token);
    return x.length === t.length && timingSafeEqual(x, t);
  });
}
/** Marks the person as here now (presence), saved at most every 25 s. */
export function touchMember(m: Person) {
  const ts = now();
  let dirty = false;
  if (!m.joinedAt) { m.joinedAt = ts; dirty = true; }
  if (!m.lastSeen || Date.now() - Date.parse(m.lastSeen) > 25_000) { m.lastSeen = ts; dirty = true; }
  if (dirty) saveConfig();
}

// ---------- tables ----------
let ready = false;
function tables() {
  if (ready) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'normal',
      assignee TEXT,
      department_id TEXT,
      due TEXT,
      position REAL NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      done_at TEXT
    );
    CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id, status, position);
    CREATE TABLE IF NOT EXISTS task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS task_comments_task ON task_comments(task_id, id);
    CREATE TABLE IF NOT EXISTS docs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'doc',
      author TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS docs_project ON docs(project_id, updated_at);
  `);
  ready = true;
}

// ---------- who did it ----------
/** "owner" · "p:<personId>" · "a:<agentId>" */
export interface Actor { id: string; name: string; color: string }
export const ownerActor = (): Actor => ({ id: 'owner', name: loadConfig().userName || 'Owner', color: '#7c5cff' });
export const personActor = (p: Person): Actor => ({ id: `p:${p.id}`, name: p.name, color: p.color });
function actorName(id: string | null): string | null {
  if (!id) return null;
  if (id === 'owner') return loadConfig().userName || 'Owner';
  if (id.startsWith('p:')) return people().find((p) => p.id === id.slice(2))?.name ?? null;
  if (id.startsWith('a:')) return getAgent(id.slice(2))?.name ?? null;
  return null;
}

// ---------- tasks ----------
export const STATUSES = ['todo', 'doing', 'review', 'done'] as const;
export type TaskStatus = (typeof STATUSES)[number];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export interface Task {
  id: string; project_id: string; title: string; description: string; status: TaskStatus; priority: string;
  assignee: string | null; department_id: string | null; due: string | null; position: number;
  created_by: string | null; created_at: string; updated_at: string; done_at: string | null;
  comments?: number;
}
export interface TaskComment { id: number; task_id: string; author: Actor; body: string; created_at: string }

export function listTasks(projectId: string): Task[] {
  tables();
  return all<Task>(`SELECT t.*, (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) AS comments FROM tasks t WHERE project_id = ? ORDER BY position, created_at`, projectId);
}
export const getTask = (id: string) => (tables(), get<Task>('SELECT * FROM tasks WHERE id = ?', id));

const validAssignee = (projectId: string, a: unknown): string | null => {
  if (typeof a !== 'string' || !a) return null;
  if (a === 'owner') return a;
  if (a.startsWith('p:') && peopleOf(projectId).some((p) => p.id === a.slice(2))) return a;
  if (a.startsWith('a:') && getAgent(a.slice(2))) return a;
  return null;
};
const validDue = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 16) : null);

export function createTask(projectId: string, input: Partial<Task>, by: Actor): Task {
  tables();
  const id = randomUUID();
  const ts = now();
  const status = STATUSES.includes(input.status as TaskStatus) ? input.status! : 'todo';
  const top = get<{ p: number | null }>('SELECT MIN(position) AS p FROM tasks WHERE project_id = ? AND status = ?', projectId, status)?.p ?? 0;
  run(
    'INSERT INTO tasks (id, project_id, title, description, status, priority, assignee, department_id, due, position, created_by, created_at, updated_at, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, projectId, String(input.title ?? '').trim().slice(0, 200) || 'Task', String(input.description ?? '').slice(0, 20000),
    status, PRIORITIES.includes(String(input.priority)) ? String(input.priority) : 'normal',
    validAssignee(projectId, input.assignee), departments().some((d) => d.id === input.department_id) ? input.department_id! : null,
    validDue(input.due), top - 1, by.id, ts, ts, status === 'done' ? ts : null,
  );
  const t = getTask(id)!;
  emit('workspace.changed', { projectId, task: id });
  void afterAssign(t, null, by);
  return t;
}

export function updateTask(id: string, patch: Partial<Task>, by: Actor): Task | undefined {
  const cur = getTask(id);
  if (!cur) return;
  const next = { ...cur };
  if (typeof patch.title === 'string' && patch.title.trim()) next.title = patch.title.trim().slice(0, 200);
  if (typeof patch.description === 'string') next.description = patch.description.slice(0, 20000);
  if (STATUSES.includes(patch.status as TaskStatus)) next.status = patch.status!;
  if (PRIORITIES.includes(String(patch.priority))) next.priority = String(patch.priority);
  if ('assignee' in patch) next.assignee = validAssignee(cur.project_id, patch.assignee);
  if ('department_id' in patch) next.department_id = departments().some((d) => d.id === patch.department_id) ? patch.department_id! : null;
  if ('due' in patch) next.due = validDue(patch.due);
  if (typeof patch.position === 'number' && Number.isFinite(patch.position)) next.position = patch.position;
  next.done_at = next.status === 'done' ? cur.done_at ?? now() : null;
  run('UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, assignee = ?, department_id = ?, due = ?, position = ?, updated_at = ?, done_at = ? WHERE id = ?',
    next.title, next.description, next.status, next.priority, next.assignee, next.department_id, next.due, next.position, now(), next.done_at, id);
  if (cur.status !== next.status) addComment(id, by, `→ ${next.status}`, true);
  emit('workspace.changed', { projectId: cur.project_id, task: id });
  const t = getTask(id)!;
  void afterAssign(t, cur, by);
  if (cur.status !== 'done' && t.status === 'done') void onDone(t, by);
  return t;
}

export function deleteTask(id: string): boolean {
  const t = getTask(id);
  if (!t) return false;
  run('DELETE FROM task_comments WHERE task_id = ?', id);
  run('DELETE FROM tasks WHERE id = ?', id);
  emit('workspace.changed', { projectId: t.project_id });
  return true;
}

export function listComments(taskId: string): TaskComment[] {
  tables();
  return all<{ id: number; task_id: string; author: string; body: string; created_at: string }>('SELECT * FROM task_comments WHERE task_id = ? ORDER BY id', taskId)
    .map((c) => ({ ...c, author: JSON.parse(c.author) as Actor }));
}
export function addComment(taskId: string, by: Actor, body: string, system = false): TaskComment | undefined {
  tables();
  const t = getTask(taskId);
  if (!t) return;
  const text = String(body ?? '').trim().slice(0, 20000);
  if (!text) return;
  const r = run('INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?, ?, ?, ?)', taskId, JSON.stringify(system ? { ...by, system: true } : by), text, now());
  if (!system) emit('workspace.changed', { projectId: t.project_id, task: taskId });
  return { id: Number(r.lastInsertRowid), task_id: taskId, author: by, body: text, created_at: now() };
}

/** A task given to an agent: the agent does it right away and reports back on the task. */
async function afterAssign(t: Task, before: Task | null, by: Actor) {
  if (!t.assignee?.startsWith('a:') || before?.assignee === t.assignee || t.status === 'done') return;
  const agent = getAgent(t.assignee.slice(2));
  if (!agent) return;
  updateTaskQuiet(t.id, { status: 'doing' });
  addComment(t.id, { id: t.assignee, name: agent.name, color: '#ffa94d' }, '▶ Working on it…', true);
  emit('workspace.changed', { projectId: t.project_id, task: t.id });
  try {
    const project = getProject(t.project_id);
    const brief = [`Task from the "${project?.name ?? 'team'}" workspace, given by ${by.name}.`, `# ${t.title}`, t.description, t.due ? `Due: ${t.due}` : '', 'Do the task, then reply with a short report of what you did (and links/paths to anything you made).'].filter(Boolean).join('\n\n');
    const r = await runAgent(agent.id, 'team', '', brief);
    addComment(t.id, { id: t.assignee, name: agent.name, color: '#ffa94d' }, r.status === 'error' ? `⚠ ${r.error ?? 'Failed'}` : (r.output ?? 'Done.'));
    updateTaskQuiet(t.id, { status: r.status === 'error' ? 'todo' : 'review' });
  } catch (e) {
    addComment(t.id, { id: t.assignee, name: agent.name, color: '#ffa94d' }, `⚠ ${(e as Error).message}`);
    updateTaskQuiet(t.id, { status: 'todo' });
  }
  emit('workspace.changed', { projectId: t.project_id, task: t.id });
}
const updateTaskQuiet = (id: string, p: { status: TaskStatus }) => run('UPDATE tasks SET status = ?, updated_at = ?, done_at = ? WHERE id = ?', p.status, now(), p.status === 'done' ? now() : null, id);

async function onDone(t: Task, by: Actor) {
  const rules = rulesOf(t.project_id);
  if (!rules.notifyDone) return;
  const project = getProject(t.project_id);
  await notifyPhones({ title: `✓ ${t.title}`, body: `${by.name} · ${project?.name ?? ''}` } as any).catch(() => {});
}

// ---------- docs & reports ----------
export interface Doc { id: string; project_id: string; title: string; body: string; kind: 'doc' | 'report' | 'notes'; author: Actor; created_at: string; updated_at: string }
const rowDoc = (d: any): Doc => ({ ...d, author: JSON.parse(d.author) });
export function listDocs(projectId: string): Omit<Doc, 'body'>[] {
  tables();
  return all<any>('SELECT id, project_id, title, kind, author, created_at, updated_at, substr(body, 1, 220) AS excerpt FROM docs WHERE project_id = ? ORDER BY updated_at DESC', projectId).map(rowDoc);
}
export const getDoc = (id: string) => { tables(); const d = get<any>('SELECT * FROM docs WHERE id = ?', id); return d ? rowDoc(d) : undefined; };
export function saveDoc(projectId: string, input: { id?: string; title?: string; body?: string; kind?: string }, by: Actor): Doc {
  tables();
  const ts = now();
  const kind = ['doc', 'report', 'notes'].includes(String(input.kind)) ? String(input.kind) : 'doc';
  const cur = input.id ? getDoc(input.id) : undefined;
  if (cur && cur.project_id === projectId) {
    run('UPDATE docs SET title = ?, body = ?, updated_at = ? WHERE id = ?', String(input.title ?? cur.title).trim().slice(0, 200) || cur.title, typeof input.body === 'string' ? input.body.slice(0, 200_000) : cur.body, ts, cur.id);
    emit('workspace.changed', { projectId, doc: cur.id });
    return getDoc(cur.id)!;
  }
  const id = randomUUID();
  run('INSERT INTO docs (id, project_id, title, body, kind, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, projectId, String(input.title ?? '').trim().slice(0, 200) || 'Untitled', String(input.body ?? '').slice(0, 200_000), kind, JSON.stringify(by), ts, ts);
  emit('workspace.changed', { projectId, doc: id });
  return getDoc(id)!;
}
export function deleteDoc(id: string): boolean {
  const d = getDoc(id);
  if (!d) return false;
  run('DELETE FROM docs WHERE id = ?', id);
  emit('workspace.changed', { projectId: d.project_id });
  return true;
}

/** What the AI needs to know about a workspace to report on it or plan in it. */
function snapshot(projectId: string, days: number) {
  const since = Date.now() - days * 86400_000;
  const tasks = listTasks(projectId);
  const deptName = (id: string | null) => departments().find((d) => d.id === id)?.name ?? '';
  const line = (t: Task) => `- [${t.status}] ${t.title}${t.assignee ? ` — ${actorName(t.assignee) ?? '?'}` : ''}${t.department_id ? ` (${deptName(t.department_id)})` : ''}${t.due ? ` · due ${t.due}` : ''}${t.priority !== 'normal' ? ` · ${t.priority}` : ''}`;
  const doneRecently = tasks.filter((t) => t.status === 'done' && t.done_at && Date.parse(t.done_at) >= since);
  const open = tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.due && Date.parse(t.due) < Date.now());
  const comments = all<{ title: string; author: string; body: string; created_at: string }>(
    `SELECT t.title, c.author, c.body, c.created_at FROM task_comments c JOIN tasks t ON t.id = c.task_id WHERE t.project_id = ? AND c.created_at >= ? ORDER BY c.id DESC LIMIT 40`, projectId, new Date(since).toISOString());
  const chats = all<{ title: string; content: string; created_at: string }>(
    `SELECT c.title, m.content, m.created_at FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.project_id = ? AND m.role = 'user' AND m.created_at >= ? ORDER BY m.id DESC LIMIT 30`, projectId, new Date(since).toISOString());
  const team = peopleOf(projectId).map((p) => `- ${p.name}${p.title ? ` (${p.title})` : ''}${p.departmentIds.length ? ` · ${p.departmentIds.map(deptName).join(', ')}` : ''}`);
  return [
    `Team:\n- ${loadConfig().userName || 'Owner'} (owner)\n${team.join('\n')}`,
    `Agents: ${listAgents(projectId).map((a) => a.name).join(', ') || 'none'}`,
    `Done in the last ${days} days (${doneRecently.length}):\n${doneRecently.map(line).join('\n') || '- nothing'}`,
    `Open (${open.length}):\n${open.slice(0, 60).map(line).join('\n') || '- nothing'}`,
    overdue.length ? `Overdue (${overdue.length}):\n${overdue.map(line).join('\n')}` : '',
    comments.length ? `Recent task notes:\n${comments.map((c) => `- ${c.title}: ${JSON.parse(c.author).name}: ${c.body.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n')}` : '',
    chats.length ? `What the team asked the AI recently:\n${chats.map((c) => `- [${c.title}] ${c.content.replace(/\s+/g, ' ').slice(0, 160)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

const langName = () => ({ pl: 'Polish', de: 'German', es: 'Spanish', fr: 'French', uk: 'Ukrainian' } as Record<string, string>)[loadConfig().language] ?? 'English';

async function ask(prompt: string): Promise<string> {
  const provider = await resolveProvider('default');
  const { text } = await provider.run({ prompt, access: 'chat', timeoutMs: 180_000 });
  return text.trim();
}

/** A written status report (saved as a document). */
export async function makeReport(projectId: string, days: number, by: Actor): Promise<Doc> {
  const p = getProject(projectId);
  if (!p) throw new Error('Workspace not found');
  const body = await ask(`You write the team status report for the "${p.name}" workspace, covering the last ${days} days.
Write it in ${langName()}, in Markdown: a 2–3 sentence summary first, then sections "Done", "In progress", "Blocked / overdue", "Next steps" (concrete, with owners), and "Per person" (one line each). Be factual — use only the data below, don't invent work. Short and scannable.

${snapshot(projectId, days)}`);
  const date = new Date().toLocaleDateString(loadConfig().language === 'pl' ? 'pl-PL' : 'en-GB');
  return saveDoc(projectId, { title: `${loadConfig().language === 'pl' ? 'Raport' : 'Report'} · ${date}`, body: body.replace(/^```(?:markdown|md)?\n|```$/g, ''), kind: 'report' }, by);
}

/** "Break this goal into tasks": the AI plans, the tasks land on the board (assigned where it is clear). */
export async function planTasks(projectId: string, goal: string, by: Actor): Promise<Task[]> {
  const p = getProject(projectId);
  if (!p) throw new Error('Workspace not found');
  const team = [{ id: 'owner', name: loadConfig().userName || 'Owner', title: 'owner' }, ...peopleOf(projectId).map((x) => ({ id: `p:${x.id}`, name: x.name, title: [x.title, ...x.departmentIds.map((d) => departments().find((y) => y.id === d)?.name ?? '')].filter(Boolean).join(', ') }))];
  const agents = listAgents(projectId).filter((a) => !a.monitor).map((a) => ({ id: `a:${a.id}`, name: a.name, title: `AI agent: ${a.description || a.instructions.slice(0, 80)}` }));
  const out = await ask(`Break the goal below into a practical task list for the "${p.name}" team. Today is ${new Date().toISOString().slice(0, 10)}.
Return ONLY JSON: an array of 3–12 objects {"title": short imperative, "description": 1–3 lines incl. what "done" means, "priority": "low"|"normal"|"high"|"urgent", "assignee": one id from the list below or null, "dueInDays": number or null, "department": department name or null}.
Assign by role/skills; give work an AI agent can do alone to that agent; leave null when unclear. Titles and descriptions in ${langName()}.

People and agents (id — name — role):
${[...team, ...agents].map((x) => `${x.id} — ${x.name} — ${x.title}`).join('\n')}
Departments: ${departments().map((d) => d.name).join(', ') || 'none'}

Goal:
"""
${goal.slice(0, 4000)}
"""`);
  const json = out.match(/\[[\s\S]*\]/)?.[0];
  if (!json) throw new Error('The AI did not return a task list — try again');
  let items: any[];
  try { items = JSON.parse(json); } catch { throw new Error('The AI returned a broken list — try again'); }
  const created: Task[] = [];
  for (const it of items.slice(0, 15)) {
    if (!it?.title) continue;
    const dept = departments().find((d) => d.name.toLowerCase() === String(it.department ?? '').toLowerCase());
    const due = typeof it.dueInDays === 'number' && it.dueInDays >= 0 ? new Date(Date.now() + it.dueInDays * 86400_000).toISOString().slice(0, 10) : null;
    created.push(createTask(projectId, { title: it.title, description: it.description ?? '', priority: it.priority, assignee: it.assignee, department_id: dept?.id ?? null, due }, by));
  }
  return created.reverse();
}

// ---------- calendar ----------
const icsEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Deadlines as a calendar feed — subscribe once in Google / Outlook / Apple Calendar. */
export function tasksIcs(projectIds: string[]): string {
  tables();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ALTTER//Workspace//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:ALTTER', 'X-PUBLISHED-TTL:PT15M'];
  for (const pid of projectIds) {
    const p = getProject(pid);
    for (const t of listTasks(pid).filter((x) => x.due)) {
      const d = t.due!.slice(0, 10).replace(/-/g, '');
      const next = new Date(Date.parse(t.due!.slice(0, 10)) + 86400_000).toISOString().slice(0, 10).replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${t.id}@altter`, `DTSTAMP:${t.updated_at.replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
        `SUMMARY:${icsEsc(`${t.status === 'done' ? '✓ ' : ''}${t.title}${p ? ` [${p.name}]` : ''}`)}`,
        `DESCRIPTION:${icsEsc([t.assignee ? `→ ${actorName(t.assignee) ?? ''}` : '', t.description].filter(Boolean).join('\n').slice(0, 1500))}`, 'END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ---------- automations ----------
export interface WsRules {
  /** A status report every Monday morning (saved to Documents). */
  weeklyReport: boolean;
  /** Every weekday morning: what is due today and what is overdue (saved to Documents). */
  dailyDigest: boolean;
  /** Phone notification when a task is done. */
  notifyDone: boolean;
  lastWeekly?: string;
  lastDaily?: string;
}
export const rulesOf = (projectId: string): WsRules => ({ weeklyReport: false, dailyDigest: false, notifyDone: false, ...(cfg().wsRules[projectId] ?? {}) });
export function setRules(projectId: string, patch: Partial<WsRules>): WsRules {
  const r = { ...rulesOf(projectId) };
  for (const k of ['weeklyReport', 'dailyDigest', 'notifyDone'] as const) if (typeof patch[k] === 'boolean') r[k] = patch[k]!;
  cfg().wsRules[projectId] = r;
  saveConfig();
  emit('workspace.changed', { projectId });
  return r;
}

function digest(projectId: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const open = listTasks(projectId).filter((t) => t.status !== 'done' && t.due);
  const due = open.filter((t) => t.due!.slice(0, 10) === today);
  const late = open.filter((t) => t.due!.slice(0, 10) < today);
  const line = (t: Task) => `- **${t.title}**${t.assignee ? ` — ${actorName(t.assignee)}` : ''} · ${t.due!.slice(0, 10)}`;
  const pl = loadConfig().language === 'pl';
  return [`## ${pl ? 'Na dziś' : 'Due today'} (${due.length})`, due.map(line).join('\n') || (pl ? '_Nic._' : '_Nothing._'), `## ${pl ? 'Po terminie' : 'Overdue'} (${late.length})`, late.map(line).join('\n') || (pl ? '_Nic._' : '_Nothing._')].join('\n\n');
}

let timer: NodeJS.Timeout | null = null;
/** Checks the workspace automations every 10 minutes. */
export function startWorkspaceAutomations() {
  if (timer) return;
  const tick = async () => {
    const d = new Date();
    const day = d.toISOString().slice(0, 10);
    for (const [pid, r] of Object.entries(cfg().wsRules)) {
      if (!getProject(pid)) continue;
      const weekday = d.getDay();
      if (r.dailyDigest && weekday >= 1 && weekday <= 5 && d.getHours() >= 8 && r.lastDaily !== day) {
        r.lastDaily = day; saveConfig();
        saveDoc(pid, { title: `${loadConfig().language === 'pl' ? 'Plan dnia' : 'Today'} · ${d.toLocaleDateString()}`, body: digest(pid), kind: 'notes' }, { id: 'auto', name: 'ALTTER', color: '#7c5cff' });
      }
      if (r.weeklyReport && weekday === 1 && d.getHours() >= 9 && r.lastWeekly !== day) {
        r.lastWeekly = day; saveConfig();
        await makeReport(pid, 7, { id: 'auto', name: 'ALTTER', color: '#7c5cff' }).catch((e) => console.error('[alter] weekly report', (e as Error).message));
      }
    }
  };
  timer = setInterval(() => void tick().catch(() => {}), 10 * 60_000);
  timer.unref?.();
  setTimeout(() => void tick().catch(() => {}), 90_000).unref?.();
}

/** Counts for the workspace cards. */
export function workspaceStats(projectId: string) {
  tables();
  const r = get<{ open: number; done: number; late: number }>(`SELECT SUM(status != 'done') AS open, SUM(status = 'done') AS done, SUM(status != 'done' AND due IS NOT NULL AND due < ?) AS late FROM tasks WHERE project_id = ?`, new Date().toISOString().slice(0, 10), projectId);
  return { open: r?.open ?? 0, done: r?.done ?? 0, late: r?.late ?? 0, people: peopleOf(projectId).length };
}
