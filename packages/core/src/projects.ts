import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { projectsDir } from './config.ts';
import { all, get, now, run } from './db.ts';
import { emit } from './events.ts';

/**
 * A project is a workspace: its own chats, agents, memory and a real folder on disk.
 * Chats in a project run the AI inside that folder, so it can read (or, with full access, work on) its files.
 */
export interface Project {
  id: string;
  name: string;
  description: string;
  /** Standing context for every chat/agent in this project ("client X, brand voice Y, deadline Z"). */
  instructions: string;
  color: string;
  icon: string;
  folder: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProjectInput = Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>> & { name: string };

interface Row {
  id: string;
  data: string;
  created_at: string;
  updated_at: string;
}

const toProject = (r: Row): Project => ({ ...JSON.parse(r.data), id: r.id, createdAt: r.created_at, updatedAt: r.updated_at });

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50) || 'project';

export function listProjects(): (Project & { chats: number; agents: number; lastActivity: string | null })[] {
  const projects = all<Row>('SELECT * FROM projects ORDER BY updated_at DESC').map(toProject);
  const chats = new Map(all<{ project_id: string; n: number; last: string }>('SELECT project_id, COUNT(*) n, MAX(updated_at) last FROM conversations WHERE project_id IS NOT NULL GROUP BY project_id').map((r) => [r.project_id, r]));
  const agents = new Map<string, number>();
  for (const r of all<{ data: string }>('SELECT data FROM agents')) {
    const pid = JSON.parse(r.data).projectId;
    if (pid) agents.set(pid, (agents.get(pid) ?? 0) + 1);
  }
  return projects.map((p) => ({ ...p, chats: chats.get(p.id)?.n ?? 0, agents: agents.get(p.id) ?? 0, lastActivity: chats.get(p.id)?.last ?? null }));
}

export function getProject(id: string | null | undefined): Project | undefined {
  if (!id) return undefined;
  const r = get<Row>('SELECT * FROM projects WHERE id = ?', id);
  return r ? toProject(r) : undefined;
}

function persist(p: Project): Project {
  const { id, createdAt, updatedAt, ...data } = p;
  run(
    `INSERT INTO projects (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    id,
    JSON.stringify(data),
    createdAt,
    updatedAt,
  );
  emit('project.changed', p);
  return p;
}

export function createProject(input: ProjectInput): Project {
  if (!input.name?.trim()) throw new Error('Project needs a name');
  const ts = now();
  let folder = input.folder?.trim();
  if (!folder) {
    const base = join(projectsDir(), slug(input.name));
    folder = base;
    for (let i = 2; existsSync(folder); i++) folder = `${base}-${i}`;
  }
  mkdirSync(folder, { recursive: true });
  return persist({
    id: randomUUID(),
    name: input.name.trim(),
    description: input.description ?? '',
    instructions: input.instructions ?? '',
    color: input.color ?? 'violet',
    icon: input.icon ?? 'folder',
    folder,
    archived: false,
    createdAt: ts,
    updatedAt: ts,
  });
}

export function updateProject(id: string, patch: Partial<ProjectInput>): Project | undefined {
  const cur = getProject(id);
  if (!cur) return undefined;
  const clean = Object.fromEntries(Object.entries(patch).filter(([k, v]) => v !== undefined && k !== 'id'));
  const next = { ...cur, ...clean, updatedAt: now() } as Project;
  if (next.folder !== cur.folder) mkdirSync(next.folder, { recursive: true });
  return persist(next);
}

/** Removes the project from ALTTER. The folder on disk is left untouched. Chats are detached, not deleted. */
export function deleteProject(id: string): boolean {
  run('UPDATE conversations SET project_id = NULL WHERE project_id = ?', id);
  const ok = Number(run('DELETE FROM projects WHERE id = ?', id).changes) > 0;
  if (ok) emit('project.changed', { id, deleted: true });
  return ok;
}

export function touchProject(id: string | null | undefined): void {
  if (id) run('UPDATE projects SET updated_at = ? WHERE id = ?', now(), id);
}
