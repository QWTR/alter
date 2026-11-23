import { randomUUID } from 'node:crypto';
import { all, get, now, run } from './db.ts';
import { emit } from './events.ts';

export const MEMORY_KINDS = ['profile', 'preference', 'routine', 'project', 'person', 'fact'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface Memory {
  id: string;
  kind: MemoryKind;
  content: string;
  tags: string[];
  importance: number;
  source: string | null;
  /** null = about the user in general; otherwise belongs to one project. */
  projectId: string | null;
  uses: number;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  kind: MemoryKind;
  content: string;
  tags: string;
  importance: number;
  source: string | null;
  project_id: string | null;
  uses: number;
  created_at: string;
  updated_at: string;
}

const toMemory = (r: Row): Memory => ({
  id: r.id,
  kind: r.kind,
  content: r.content,
  tags: JSON.parse(r.tags),
  importance: r.importance,
  source: r.source,
  projectId: r.project_id ?? null,
  uses: r.uses,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/**
 * Cheap language-agnostic tokens: lowercase words, and long words cut to a 5-letter stem
 * so inflected forms match (Polish "maile", "maili", "mailami" → "maila"/"maile"… close enough).
 */
export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 3) continue;
    out.add(w.length > 5 ? w.slice(0, 5) : w);
  }
  return out;
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface NewMemory {
  kind?: MemoryKind;
  content: string;
  tags?: string[];
  importance?: number;
  source?: string;
  projectId?: string | null;
}

/** Adds a memory, or reinforces an existing near-duplicate instead of storing it twice. */
export function addMemory(m: NewMemory): Memory {
  const content = m.content.trim().slice(0, 1000);
  if (!content) throw new Error('Memory content is empty');
  const kind: MemoryKind = MEMORY_KINDS.includes(m.kind as MemoryKind) ? (m.kind as MemoryKind) : 'fact';
  const importance = Math.min(5, Math.max(1, Math.round(m.importance ?? 3)));
  const projectId = m.projectId ?? null;
  const t = tokens(content);

  for (const existing of all<Row>("SELECT * FROM memories WHERE kind = ? AND IFNULL(project_id, '') = ?", kind, projectId ?? '')) {
    if (similarity(t, tokens(existing.content)) >= 0.75) {
      const newer = content.length >= existing.content.length ? content : existing.content;
      run(
        'UPDATE memories SET content = ?, importance = ?, updated_at = ? WHERE id = ?',
        newer,
        Math.max(existing.importance, importance),
        now(),
        existing.id,
      );
      return toMemory(get<Row>('SELECT * FROM memories WHERE id = ?', existing.id)!);
    }
  }

  const id = randomUUID();
  const ts = now();
  run(
    'INSERT INTO memories (id, kind, content, tags, importance, source, project_id, uses, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
    id,
    kind,
    content,
    JSON.stringify(m.tags ?? []),
    importance,
    m.source ?? null,
    projectId,
    ts,
    ts,
  );
  const mem = toMemory(get<Row>('SELECT * FROM memories WHERE id = ?', id)!);
  emit('memory.added', mem);
  return mem;
}

export function updateMemory(id: string, patch: Partial<Pick<Memory, 'content' | 'kind' | 'importance' | 'tags'>>): Memory | undefined {
  const cur = get<Row>('SELECT * FROM memories WHERE id = ?', id);
  if (!cur) return undefined;
  run(
    'UPDATE memories SET content = ?, kind = ?, importance = ?, tags = ?, updated_at = ? WHERE id = ?',
    patch.content ?? cur.content,
    patch.kind ?? cur.kind,
    patch.importance ?? cur.importance,
    patch.tags ? JSON.stringify(patch.tags) : cur.tags,
    now(),
    id,
  );
  return toMemory(get<Row>('SELECT * FROM memories WHERE id = ?', id)!);
}

export function deleteMemory(id: string): boolean {
  return Number(run('DELETE FROM memories WHERE id = ?', id).changes) > 0;
}

export function listMemories(opts: { q?: string; kind?: string; projectId?: string; limit?: number } = {}): Memory[] {
  const rows = opts.kind
    ? all<Row>('SELECT * FROM memories WHERE kind = ? ORDER BY updated_at DESC', opts.kind)
    : all<Row>('SELECT * FROM memories ORDER BY updated_at DESC');
  const mems = rows.map(toMemory).filter((m) => !opts.projectId || m.projectId === opts.projectId);
  if (!opts.q?.trim()) return mems.slice(0, opts.limit ?? 500);
  return rank(mems, opts.q).slice(0, opts.limit ?? 100);
}

function rank(mems: Memory[], query: string): Memory[] {
  const q = tokens(query);
  return mems
    .map((m) => {
      const t = tokens(m.content + ' ' + m.tags.join(' '));
      let overlap = 0;
      for (const w of q) if (t.has(w)) overlap++;
      return { m, score: overlap * 2 + m.importance * 0.3 };
    })
    .filter((x) => x.score > x.m.importance * 0.3)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}

/** What ALTTER should keep in mind: the core profile, this project's memories, and whatever matches the query. */
export function relevantMemories(query: string, limit = 14, projectId?: string | null): Memory[] {
  const allMems = all<Row>('SELECT * FROM memories')
    .map(toMemory)
    .filter((m) => !m.projectId || m.projectId === projectId);
  const core = allMems
    .filter((m) => (projectId && m.projectId === projectId) || ((m.kind === 'profile' || m.kind === 'preference' || m.kind === 'routine') && m.importance >= 3))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10);
  const picked = new Map(core.map((m) => [m.id, m]));
  for (const m of rank(allMems, query)) {
    if (picked.size >= limit) break;
    picked.set(m.id, m);
  }
  const result = [...picked.values()];
  for (const m of result) run('UPDATE memories SET uses = uses + 1 WHERE id = ?', m.id);
  return result;
}

export function formatMemories(mems: Memory[]): string {
  if (!mems.length) return '(nothing yet — you are just getting to know the user)';
  return mems.map((m) => `- [${m.kind}${m.projectId ? ', this project' : ''}] ${m.content}`).join('\n');
}
