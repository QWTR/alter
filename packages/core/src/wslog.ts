// The workspace log: who did what and when, across the whole workspace (prompts sent to the AI, chats, agents,
// tasks, documents, invoices, the whiteboard, people joining). Kept on this computer, newest first.
import { all, getDb, now, run } from './db.ts';
import { emit } from './events.ts';
import type { Actor } from './workspace.ts';
import { broadcast } from './rooms.ts';

/** Tells everyone with this workspace open that something changed, so their screens refresh at once. */
export const wsChanged = (projectId: string, kind: string) => broadcast('ws:' + projectId, 'changed', { kind });

export interface WsLogEntry { id: number; project_id: string; at: string; actor: Actor; action: string; detail: string; ref: string | null }

let ready = false;
function tables() {
  if (ready) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS ws_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      at TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      ref TEXT
    );
    CREATE INDEX IF NOT EXISTS ws_log_project ON ws_log(project_id, id);
  `);
  ready = true;
}

// the same person doing the same thing to the same item within a minute is one entry (typing a document, drawing)
const recent = new Map<string, { id: number; t: number; parts: string[] }>();

export function wsLog(projectId: string | null | undefined, actor: Actor, action: string, detail = '', ref?: string | null, merge = false) {
  if (!projectId) return;
  try {
    tables();
    const key = `${projectId}|${actor.id}|${action}|${ref ?? ''}`;
    const last = merge ? recent.get(key) : undefined;
    const clean = detail.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (last && Date.now() - last.t < 60_000) {
      // one entry for a burst of work: "added rectangle, added note, wrote “…”"
      if (!action.startsWith('board.')) last.parts = [];
      for (const part of clean.split(', ')) if (part && !last.parts.includes(part)) last.parts.push(part);
      if (last.parts.length > 12) last.parts.splice(0, last.parts.length - 12);
      run('UPDATE ws_log SET at = ?, detail = ? WHERE id = ?', now(), last.parts.join(', ').slice(0, 400), last.id);
      last.t = Date.now();
    } else {
      const id = Number(run('INSERT INTO ws_log (project_id, at, actor, action, detail, ref) VALUES (?, ?, ?, ?, ?, ?)', projectId, now(), JSON.stringify(actor), action, clean, ref ?? null).lastInsertRowid);
      if (merge) recent.set(key, { id, t: Date.now(), parts: clean ? clean.split(', ') : [] });
      if (recent.size > 500) recent.clear();
    }
    emit('wslog.added', { projectId });
    wsChanged(projectId, action.split('.')[0]);
  } catch (e) {
    console.error('[alter] ws log', (e as Error).message);
  }
}

export function listWsLog(projectId: string, opts: { before?: number; limit?: number; who?: string; action?: string } = {}): WsLogEntry[] {
  tables();
  const where = ['project_id = ?'];
  const args: (string | number)[] = [projectId];
  if (opts.before) { where.push('id < ?'); args.push(opts.before); }
  if (opts.action) { where.push('action LIKE ?'); args.push(opts.action.replace(/[%_]/g, '') + '%'); }
  if (opts.who) { where.push('actor LIKE ?'); args.push(`%"id":"${opts.who.replace(/["%_\\]/g, '')}"%`); }
  args.push(Math.min(500, Math.max(1, opts.limit ?? 200)));
  return all<any>(`SELECT * FROM ws_log WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, ...args).map((r) => ({ ...r, actor: JSON.parse(r.actor) }));
}
