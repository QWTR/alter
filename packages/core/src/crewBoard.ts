// The shared board of a crew (several agents on one screen at once): who is on it, the lead's plan,
// and every note they post to each other. Kept per lead chat, shown live in that chat and saved to disk.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME } from './config.ts';
import { emit } from './events.ts';

export interface CrewNote { name: string; color: string; text: string; at: number; to?: string }
export interface CrewMember { name: string; color: string; conversationId?: string; state: 'working' | 'done' | 'stopped'; action: string; task?: string; lead?: boolean }
export interface CrewBoard { crew: string; members: CrewMember[]; plan: { who: string; task: string; status: 'todo' | 'working' | 'done' }[]; notes: CrewNote[]; startedAt: number; updatedAt: number }

const boards = new Map<string, CrewBoard>();
const dir = () => join(HOME, 'crews');
const file = (crew: string) => join(dir(), crew.replace(/[^\w-]/g, '') + '.json');

export function getBoard(crew: string): CrewBoard {
  let b = boards.get(crew);
  if (!b) {
    try {
      if (existsSync(file(crew))) b = JSON.parse(readFileSync(file(crew), 'utf8')) as CrewBoard;
    } catch {}
    b ??= { crew, members: [], plan: [], notes: [], startedAt: Date.now(), updatedAt: Date.now() };
    boards.set(crew, b);
  }
  return b;
}
export const hasBoard = (crew: string) => boards.has(crew) || existsSync(file(crew));

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Something changed: tell the chat (throttled) and save. */
export function touchBoard(crew: string) {
  const b = getBoard(crew);
  b.updatedAt = Date.now();
  if (timers.has(crew)) return;
  timers.set(crew, setTimeout(() => {
    timers.delete(crew);
    if (!crew.startsWith('t:')) try {
      mkdirSync(dir(), { recursive: true });
      writeFileSync(file(crew), JSON.stringify(boards.get(crew)));
    } catch {}
    emit('hands.board', { crew });
  }, 250));
}

export function joinBoard(crew: string, m: Omit<CrewMember, 'state' | 'action'>) {
  const b = getBoard(crew);
  // a new round in the same chat starts with a clean board
  if (m.lead && b.members.every((x) => x.state !== 'working')) {
    b.members = [];
    b.plan = [];
    b.notes = [];
    b.startedAt = Date.now();
  }
  const cur = b.members.find((x) => x.name === m.name);
  if (cur) Object.assign(cur, m, { state: 'working', action: 'starting' });
  else b.members.push({ ...m, state: 'working', action: 'starting' });
  touchBoard(crew);
}

export function memberUpdate(crew: string, name: string, patch: Partial<CrewMember>) {
  const m = getBoard(crew).members.find((x) => x.name === name);
  if (!m) return;
  const changed = Object.entries(patch).some(([k, v]) => (m as any)[k] !== v);
  if (!changed) return;
  Object.assign(m, patch);
  touchBoard(crew);
}

export function postNote(crew: string, n: CrewNote) {
  const b = getBoard(crew);
  b.notes.push(n);
  if (b.notes.length > 120) b.notes.shift();
  touchBoard(crew);
}

export function setPlan(crew: string, tasks: { who: string; task: string }[]) {
  const b = getBoard(crew);
  b.plan = tasks.slice(0, 20).map((t) => ({ who: String(t.who).slice(0, 40), task: String(t.task).slice(0, 300), status: 'todo' as const }));
  for (const m of b.members) {
    const mine = b.plan.filter((p) => p.who.toLowerCase() === m.name.toLowerCase()).map((p) => p.task);
    if (mine.length) m.task = mine.join(' · ').slice(0, 300);
  }
  touchBoard(crew);
}

export function planStatus(crew: string, who: string, status: 'working' | 'done') {
  const b = getBoard(crew);
  let hit = false;
  for (const p of b.plan) if (p.who.toLowerCase() === who.toLowerCase() && p.status !== 'done') { p.status = status; hit = true; }
  if (hit) touchBoard(crew);
}
