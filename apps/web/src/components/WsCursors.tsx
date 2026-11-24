// Everyone's pointer on the workspace, on every screen of it (chats, agents, team, tasks, docs, invoices,
// calendar, automations), not only over the chat prompt. A pointer is placed by the element under it when that
// element has a data-anchor (so it lands right whatever the window size), otherwise by its spot in the workspace.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { clientId, invalidate, token, type RoomMember } from '../api';

type WsCursor = { s: string; x: number; y: number; a?: string; fx?: number; fy?: number; bx?: number; by?: number } | null;

// the whiteboard rides on the same connection: its ops, and a way to map pointers to board coordinates
type BoardMsg = { cid: string; rev: number; ops: any[] };
const boardBus = new Set<(d: BoardMsg | 'hello') => void>();
export const onBoard = (fn: (d: BoardMsg | 'hello') => void) => (boardBus.add(fn), () => void boardBus.delete(fn));
export interface BoardView { el: Element; toWorld: (x: number, y: number) => [number, number]; toScreen: (x: number, y: number) => [number, number] }
let boardView: BoardView | null = null;
export const setBoardView = (v: BoardView | null) => {
  boardView = v;
  dispatchEvent(new Event('ws-board-view'));
};
export const boardMoved = () => dispatchEvent(new Event('ws-board-view'));
const HIDE_KEY = 'altter.hideCursors';

export function useCursorsHidden(): [boolean, (v: boolean) => void] {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
  });
  const set = (v: boolean) => {
    setHidden(v);
    try { localStorage.setItem(HIDE_KEY, v ? '1' : '0'); } catch {}
  };
  return [hidden, set];
}

/** Joins the workspace room and shares my pointer while it is over the workspace. */
export function useWsCursors(root: RefObject<HTMLElement | null>, q: string, screen: string, on: boolean) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [cursors, setCursors] = useState<Record<string, WsCursor>>({});
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const qs = (q ? q.slice(1) + '&' : '') + `token=${encodeURIComponent(token ?? '')}&cid=${clientId}`;

  useEffect(() => {
    if (!on) return;
    let es: EventSource | null = null;
    let closed = false;
    const open = () => {
      es = new EventSource(`/api/wsroom?${qs}`);
      const sub = (type: string, fn: (d: any) => void) => es!.addEventListener(type, (e) => fn(JSON.parse((e as MessageEvent).data)));
      sub('hello', (d) => {
        setMembers(d.members ?? []);
        setCursors(Object.fromEntries(Object.entries(d.state ?? {}).map(([k, v]: [string, any]) => [k, v?.cursor ?? null])));
        boardBus.forEach((f) => f('hello'));
        refresh(); // (re)connected: catch up on anything missed
      });
      sub('board', (d) => boardBus.forEach((f) => f(d)));
      sub('changed', (d) => refresh(d?.kind));
      sub('members', setMembers);
      sub('state', ({ cid, gone, cursor }) =>
        setCursors((all) => {
          if (gone) {
            const { [cid]: _, ...rest } = all;
            return rest;
          }
          return { ...all, [cid]: cursor ?? null };
        }),
      );
      es.onerror = () => {
        es?.close();
        if (!closed) setTimeout(open, 3000);
      };
    };
    open();
    return () => {
      closed = true;
      es?.close();
      setMembers([]);
      setCursors({});
    };
  }, [qs, on]);

  // my pointer: at most ~16 updates a second, and "gone" when it leaves the workspace or the screen changes
  useEffect(() => {
    const el = root.current;
    if (!el || !on) return;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: WsCursor | undefined;
    const post = (c: WsCursor) => {
      pending = c;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const body = JSON.stringify({ cid: clientId, cursor: pending });
        fetch(`/api/wsroom/state${q}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body, keepalive: true }).catch(() => {});
      }, 60);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const now = Date.now();
      if (now - last < 50) return;
      last = now;
      const box = el.getBoundingClientRect();
      const c: NonNullable<WsCursor> = { s: screenRef.current, x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
      const a = (e.target as HTMLElement).closest?.('[data-anchor]') as HTMLElement | null;
      if (boardView && boardView.el.contains(e.target as Node)) {
        [c.bx, c.by] = boardView.toWorld(e.clientX, e.clientY);
      } else if (a && el.contains(a) && a.dataset.anchor !== 'preview') {
        const r = a.getBoundingClientRect();
        c.a = a.dataset.anchor;
        c.fx = r.width ? (e.clientX - r.left) / r.width : 0;
        c.fy = r.height ? (e.clientY - r.top) / r.height : 0;
      }
      post(c);
    };
    const leave = () => post(null);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    addEventListener('blur', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      removeEventListener('blur', leave);
      if (timer) clearTimeout(timer);
    };
  }, [root, q, on]);

  const others = members.filter((m) => m.cid !== clientId);
  return { others, cursors };
}

/** Other people's pointers over the whole workspace (only theirs on the screen I am looking at). */
export function WsCursorLayer({ root, screen, others, cursors }: { root: RefObject<HTMLElement | null>; screen: string; others: RoomMember[]; cursors: Record<string, WsCursor> }) {
  const [, redraw] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; redraw((n) => n + 1); });
    };
    el.addEventListener('scroll', kick, true);
    addEventListener('resize', kick);
    addEventListener('ws-board-view', kick);
    return () => {
      el.removeEventListener('scroll', kick, true);
      removeEventListener('resize', kick);
      removeEventListener('ws-board-view', kick);
      cancelAnimationFrame(raf);
    };
  }, [root]);
  const el = root.current;
  if (!el) return null;
  const box = el.getBoundingClientRect();
  return (
    <div className="ws-cursors" aria-hidden>
      {others.map((m) => {
        const c = cursors[m.cid];
        if (!c || c.s !== screen) return null;
        let x = c.x * box.width;
        let y = c.y * box.height;
        if (c.bx !== undefined && c.by !== undefined) {
          if (!boardView) return null;
          const [sx, sy] = boardView.toScreen(c.bx, c.by);
          const r = boardView.el.getBoundingClientRect();
          if (sx < r.left || sy < r.top || sx > r.right || sy > r.bottom) return null;
          x = sx - box.left;
          y = sy - box.top;
        } else if (c.a) {
          const a = el.querySelector(`[data-anchor="${CSS.escape(c.a)}"]`);
          if (a) {
            const r = a.getBoundingClientRect();
            x = r.left - box.left + r.width * (c.fx ?? 0);
            y = r.top - box.top + r.height * (c.fy ?? 0);
          }
        }
        if (x < -4 || y < -4 || x > box.width + 4 || y > box.height + 4) return null;
        return (
          <div key={m.cid} className="ws-cursor" style={{ transform: `translate(${x}px, ${y}px)`, ['--c' as any]: m.color }}>
            <svg width="20" height="22" viewBox="0 0 20 22"><path d="M2.5 2.2 17 10.4a.6.6 0 0 1-.1 1.1l-6 1.7-3 5.9a.6.6 0 0 1-1.1-.1L2 3a.6.6 0 0 1 .5-.8z" fill="var(--c)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            <span>{m.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// someone changed something in the workspace: refresh the screens that show it (gathered for a moment, once)
const KINDS: Record<string, string[]> = {
  task: ['/api/ws/tasks', '/api/ws/calendar'], tasks: ['/api/ws/tasks', '/api/ws/calendar'], plan: ['/api/ws/tasks', '/api/ws/calendar'],
  doc: ['/api/ws/docs'], docs: ['/api/ws/docs'], report: ['/api/ws/docs'],
  sale: ['/api/ws/sales'], sales: ['/api/ws/sales'],
  chat: ['/api/ws/chats'], chats: ['/api/ws/chats'], agent: ['/api/ws/agents'], agents: ['/api/ws/agents'],
  rules: ['/api/ws/me'], member: ['/api/ws/me'],
};
const due = new Set<string>(['/api/ws/log']);
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function refresh(kind?: string) {
  for (const k of KINDS[kind ?? ''] ?? ['/api/ws/']) due.add(k);
  due.add('/api/ws/log');
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const keys = [...due];
    due.clear();
    invalidate(...keys);
  }, 120);
}
