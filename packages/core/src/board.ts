// The workspace whiteboard: rectangles, ellipses, arrows, sticky notes, text and free drawing, shared live.
// Each change is a small list of ops (put a shape / remove one); everyone in the workspace room gets them at once
// and the board is saved on this computer a moment later.
import { get, getDb, now, run } from './db.ts';
import { broadcast } from './rooms.ts';

export type ShapeType = 'rect' | 'ellipse' | 'line' | 'arrow' | 'note' | 'text' | 'pen';
export interface Shape {
  id: string;
  t: ShapeType;
  x: number; y: number; w: number; h: number;
  /** pen: points relative to x,y as a flat list [x0, y0, x1, y1, …] */
  p?: number[];
  stroke: string;
  fill: string;
  sw: number;
  text?: string;
  fs?: number;
  z: number;
  by?: string;
}
export type BoardOp = { put: Shape } | { del: string } | { clear: true };
interface Board { rev: number; shapes: Record<string, Shape> }

const MAX_SHAPES = 3000;
const boards = new Map<string, Board>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const fresh = new Map<string, number>();
let ready = false;
function tables() {
  if (ready) return;
  getDb().exec('CREATE TABLE IF NOT EXISTS ws_board (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
  ready = true;
}

function load(projectId: string): Board {
  let b = boards.get(projectId);
  if (b) return b;
  tables();
  const row = get<{ data: string }>('SELECT data FROM ws_board WHERE project_id = ?', projectId);
  try { b = row ? JSON.parse(row.data) : null; } catch { b = undefined; }
  if (!b || typeof b !== 'object' || !b.shapes) b = { rev: 0, shapes: {} };
  boards.set(projectId, b);
  return b;
}

function persist(projectId: string) {
  clearTimeout(timers.get(projectId));
  timers.set(projectId, setTimeout(() => {
    timers.delete(projectId);
    const b = boards.get(projectId);
    if (!b) return;
    tables();
    run('INSERT INTO ws_board (project_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at', projectId, JSON.stringify(b), now());
  }, 800));
}

const num = (v: unknown, d = 0, lim = 1e6) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : d);
const color = (v: unknown, d: string) => (typeof v === 'string' && /^(#[0-9a-f]{3,8}|transparent)$/i.test(v) ? v : d);
const TYPES: ShapeType[] = ['rect', 'ellipse', 'line', 'arrow', 'note', 'text', 'pen'];

function clean(s: any, by: string): Shape | null {
  if (!s || typeof s.id !== 'string' || !TYPES.includes(s.t)) return null;
  const out: Shape = {
    id: s.id.slice(0, 40), t: s.t,
    x: num(s.x), y: num(s.y), w: num(s.w), h: num(s.h),
    stroke: color(s.stroke, '#1e1e1e'), fill: color(s.fill, 'transparent'),
    sw: Math.max(0.5, Math.min(40, num(s.sw, 2))), z: num(s.z, 0, 1e12), by: by.slice(0, 60),
  };
  if (s.t === 'pen' && Array.isArray(s.p)) out.p = s.p.slice(0, 4000).map((v: unknown) => Math.round(num(v) * 10) / 10);
  if (typeof s.text === 'string') out.text = s.text.slice(0, 5000);
  if (s.fs !== undefined) out.fs = Math.max(8, Math.min(160, num(s.fs, 18)));
  return out;
}

export function getBoard(projectId: string) {
  const b = load(projectId);
  return { rev: b.rev, shapes: Object.values(b.shapes) };
}


/** Applies ops from one client and sends them to everyone else in the workspace room. */
export function saveBoard(projectId: string, body: { ops?: unknown[] }, cid: string, by = '') {
  const b = load(projectId);
  const ops: BoardOp[] = [];
  const did = new Set<string>();
  for (const raw of Array.isArray(body.ops) ? body.ops.slice(0, 400) : []) {
    const o = raw as any;
    if (o?.clear === true) {
      b.shapes = {};
      ops.push({ clear: true });
      did.add('clear');
    } else if (typeof o?.del === 'string') {
      const old = b.shapes[o.del];
      if (!old) continue;
      delete b.shapes[o.del];
      ops.push({ del: o.del });
      did.add(`del:${old.t}`);
    } else if (o?.put) {
      const s = clean(o.put, by || o.put.by || '');
      if (!s) continue;
      if (!b.shapes[s.id] && Object.keys(b.shapes).length >= MAX_SHAPES) continue;
      // still being drawn (the first few seconds of a new shape) counts as adding it
      const isNew = !b.shapes[s.id] || Date.now() - (fresh.get(s.id) ?? 0) < 8000;
      if (!b.shapes[s.id]) fresh.set(s.id, Date.now());
      if (fresh.size > 300) fresh.clear();
      const edited = s.text !== undefined && s.text !== (b.shapes[s.id]?.text ?? '') && (s.t === 'note' || s.t === 'text' || !isNew);
      b.shapes[s.id] = s;
      ops.push({ put: s });
      // codes the log screen turns into words in the reader's language: add:rect, chg:pen, del:note, write:…, clear
      did.add(edited ? `write:${(s.text ?? '').replace(/,/g, ' ').slice(0, 40)}` : isNew ? `add:${s.t}` : `chg:${s.t}`);
    }
  }
  if (!ops.length) return { rev: b.rev, changed: false, summary: '' };
  b.rev++;
  broadcast('ws:' + projectId, 'board', { cid, rev: b.rev, ops }, cid);
  persist(projectId);
  return { rev: b.rev, changed: true, summary: [...did].slice(0, 4).join(', ') };
}
