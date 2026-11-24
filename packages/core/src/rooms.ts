// Online sessions: several people in one chat at the same time.
//  - presence: who is here, their cursor (over the chat or the live preview), what they are typing, which elements they picked
//  - the AI's answer streams to everyone, whoever asked
//  - a share link lets a guest (no pairing) into exactly one chat
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { loadConfig, saveConfig } from './config.ts';
import { memberByToken, touchMember } from './workspace.ts';

export interface Share {
  token: string;
  conversationId: string;
  createdAt: string;
  /** Guests may also send messages to the AI (otherwise they watch, point and type along). */
  guestsCanSend: boolean;
}

export interface Guest {
  guest: true;
  share: Share;
  /** A workspace member: the whole project (not one chat), keeps their key. */
  member?: import('./workspace.ts').Person;
}

const COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#20c997', '#f06595', '#5c7cfa', '#94d82d'];
export const colorFor = (seed: string) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

// ---------- share links ----------
const shares = (): Share[] => ((loadConfig() as any).shares ??= []);

export const shareFor = (conversationId: string) => shares().find((s) => s.conversationId === conversationId);

export function startShare(conversationId: string, guestsCanSend = true): Share {
  const cur = shareFor(conversationId);
  if (cur) {
    cur.guestsCanSend = guestsCanSend;
    saveConfig();
    return cur;
  }
  const s: Share = { token: randomBytes(18).toString('base64url'), conversationId, createdAt: new Date().toISOString(), guestsCanSend };
  shares().push(s);
  saveConfig();
  return s;
}

export function stopShare(conversationId: string): boolean {
  const cfg = loadConfig() as any;
  const before = shares().length;
  cfg.shares = shares().filter((s) => s.conversationId !== conversationId);
  saveConfig();
  // guests in the room are sent away
  const room = rooms.get(conversationId);
  if (room) for (const m of room.members.values()) if (m.guest) m.close();
  return cfg.shares.length < before;
}

export function shareByToken(token: string): Share | undefined {
  const t = Buffer.from(token);
  return shares().find((s) => {
    const x = Buffer.from(s.token);
    return x.length === t.length && timingSafeEqual(x, t);
  });
}

/** Bearer `share:<token>` → a guest limited to that one chat. */
export function authenticateGuest(bearer: string | undefined): Guest | null {
  if (bearer?.startsWith('ws:')) {
    const member = memberByToken(bearer.slice(3));
    if (!member) return null;
    touchMember(member);
    return { guest: true, member, share: { token: '', conversationId: '', createdAt: member.createdAt, guestsCanSend: true } };
  }
  if (!bearer?.startsWith('share:')) return null;
  const share = shareByToken(bearer.slice(6));
  return share ? { guest: true, share } : null;
}

export const isGuest = (auth: unknown): auth is Guest => !!auth && (auth as Guest).guest === true;

// ---------- rooms ----------
export interface Member {
  cid: string;
  name: string;
  color: string;
  guest: boolean;
  joinedAt: number;
  send: (event: string, data: unknown) => void;
  close: () => void;
}

/** The answer being written right now (for people who join mid-way). */
interface LiveRun {
  cid: string;
  author: { name: string; color: string } | null;
  user: string;
  attachments: unknown[];
  text: string;
  steps: string[];
  provider?: string;
  startedAt: number;
  abort?: AbortController;
}

interface Room {
  members: Map<string, Member>;
  /** Last presence state of each member (cursor, typing, picks). */
  state: Map<string, Record<string, unknown>>;
  run: LiveRun | null;
}

const rooms = new Map<string, Room>();
const roomOf = (id: string) => {
  let r = rooms.get(id);
  if (!r) rooms.set(id, (r = { members: new Map(), state: new Map(), run: null }));
  return r;
};

const memberList = (r: Room) => [...r.members.values()].map(({ cid, name, color, guest, joinedAt }) => ({ cid, name, color, guest, joinedAt }));

export function broadcast(conversationId: string, event: string, data: unknown, exceptCid?: string) {
  const r = rooms.get(conversationId);
  if (!r) return;
  for (const m of r.members.values()) if (m.cid !== exceptCid) m.send(event, data);
}

export function joinRoom(conversationId: string, member: Omit<Member, 'joinedAt'>): () => void {
  const r = roomOf(conversationId);
  // the same tab reconnecting replaces its old connection
  r.members.get(member.cid)?.close();
  r.members.set(member.cid, { ...member, joinedAt: Date.now() });
  member.send('hello', {
    members: memberList(r),
    state: Object.fromEntries(r.state),
    run: r.run ? { ...r.run, abort: undefined } : null,
  });
  broadcast(conversationId, 'members', memberList(r));
  return () => {
    if (r.members.get(member.cid)?.send !== member.send) return; // already replaced
    r.members.delete(member.cid);
    r.state.delete(member.cid);
    broadcast(conversationId, 'members', memberList(r));
    broadcast(conversationId, 'state', { cid: member.cid, gone: true });
    if (!r.members.size && !r.run) rooms.delete(conversationId);
  };
}

const STATE_KEYS = ['cursor', 'typing', 'picks', 'focus'];
export function setPresence(conversationId: string, cid: string, patch: Record<string, unknown>) {
  const r = rooms.get(conversationId);
  if (!r?.members.has(cid)) return;
  const clean: Record<string, unknown> = {};
  for (const k of STATE_KEYS) if (k in patch) clean[k] = patch[k];
  if (typeof clean.typing === 'string') clean.typing = clean.typing.slice(0, 4000);
  if (Array.isArray(clean.picks)) clean.picks = clean.picks.slice(0, 20);
  r.state.set(cid, { ...(r.state.get(cid) ?? {}), ...clean });
  broadcast(conversationId, 'state', { cid, ...clean }, cid);
}

export const roomMembers = (conversationId: string) => (rooms.has(conversationId) ? memberList(rooms.get(conversationId)!) : []);

// ---------- the AI answer, mirrored to everyone in the room ----------
export function runStarted(conversationId: string, run: Omit<LiveRun, 'text' | 'steps' | 'startedAt'>) {
  const r = roomOf(conversationId);
  r.run = { ...run, text: '', steps: [], startedAt: Date.now() };
  broadcast(conversationId, 'run', { ev: 'start', cid: run.cid, data: { user: run.user, author: run.author, attachments: run.attachments, startedAt: r.run.startedAt } }, run.cid);
}

export function runEvent(conversationId: string, ev: string, data: any) {
  const r = rooms.get(conversationId);
  if (!r?.run) return;
  if (ev === 'delta') r.run.text += data.text;
  else if (ev === 'activity') r.run.steps.push(data.text);
  else if (ev === 'meta') r.run.provider = data.provider;
  broadcast(conversationId, 'run', { ev, cid: r.run.cid, data }, r.run.cid);
  if (ev === 'done' || ev === 'error') {
    r.run = null;
    if (!r.members.size) rooms.delete(conversationId);
  }
}

export const isRunningIn = (conversationId: string) => !!rooms.get(conversationId)?.run;

/** Anyone in the room may stop the answer (it runs on the owner's computer either way). */
export function stopRun(conversationId: string): boolean {
  const run = rooms.get(conversationId)?.run;
  if (!run?.abort) return false;
  run.abort.abort();
  return true;
}
