// API client + a tiny stale-while-revalidate cache, so switching tabs renders instantly
// from memory while fresh data loads in the background.
import { computerGone } from './native';
import { useEffect, useSyncExternalStore } from 'react';

export type Access = 'chat' | 'read' | 'full';
export interface Avatar { palette: string; icon: string; eyes?: string; antenna?: string; mouth?: string }
export interface ProviderStatus {
  id: string; name: string; vendor: string; subscription: string; installed: boolean; version?: string;
  installCmd: string; loginCmd: string; isDefault: boolean; connected: boolean;
  models: { id: string; label: string }[]; efforts: string[];
  health?: { ok: boolean; checkedAt: string; error?: string; latencyMs?: number };
}
export interface Settings { defaultProvider: string; learning: boolean; usageStats?: boolean; language: string; userName: string; onboarded: boolean; onLimit: 'ask' | 'switch'; defaultAccess?: 'chat' | 'read' | 'full' }
export interface Limit { provider: string; message: string; until: string | null; at: string }
export interface UsageTotals { runs: number; input: number; output: number; cached: number; cost: number; today: { runs: number; input: number; output: number } }
export interface UsageSummary { days: number; byProvider: Record<string, UsageTotals>; daily: { day: string; provider: string; runs: number; input: number; output: number }[]; limits: Limit[] }
export interface Preview { url: string; file: string; root: string }
export interface Draft { id: string; kind: 'html' | 'css'; url: string; file: string; content: string; done: boolean }
export interface ChatError extends Error { code?: 'limit'; provider?: string; until?: string | null; alternatives?: { id: string; name: string }[] }
export interface Status {
  version: string; you: { kind: 'computer' | 'device'; name?: string }; providers: ProviderStatus[];
  counts: { agents: number; memories: number; conversations: number; projects: number };
  settings: Settings; paths: { data: string; projects: string }; lanUrls: string[];
}
export interface AgentGroup { id: string; name: string; description: string; members: string[]; lead?: string | null; createdAt: string }
export interface Project {
  id: string; name: string; description: string; instructions: string; color: string; icon: string; folder: string;
  createdAt: string; updatedAt: string; chats?: number; agents?: number; lastActivity?: string | null;
}
export interface Share { token: string; conversationId: string; createdAt: string; guestsCanSend: boolean }
export interface Conversation { id: string; title: string; provider: string | null; project_id: string | null; agent_id?: string | null; parent_id?: string | null; crew?: string | null; access: Access; created_at: string; updated_at: string; share?: Share | null }
export interface Attachment { id: string; name: string; type: string; size: number; url: string }
export interface Author { name: string; color: string }
export interface Message { id: number; role: 'user' | 'assistant'; content: string; provider: string | null; created_at: string; attachments?: Attachment[]; author?: Author | null; media?: MediaItem[]; /** pages that exist on disk (from the server) */ pages?: string[] }
/** A rendered video / image / sound the answer points to. */
export interface MediaItem { url: string; name: string; kind: 'video' | 'image' | 'audio'; size: number; mtime: number; folder?: string }
export interface RenderProgress { stage: string; pct: number; label?: string }
export interface Brand { accent?: string; accent2?: string; display?: string; body?: string; logo?: string; theme?: string; name?: string; fontFile?: string; hasImageKey?: boolean; reelUse?: string; swear?: string; audience?: string }
export interface StudioInfo { dir: string; ready: boolean; installing: boolean; upToDate: boolean; error: string | null; brand: Brand; renders: MediaItem[] }
export type MonitorType = 'http' | 'tcp' | 'ping' | 'command';
export interface MonitorSpec { type: MonitorType; target: string; everyMinutes: number; autoFix: boolean }
export interface MonitorState { status: 'ok' | 'fail' | 'unknown'; message: string; lastCheck: string | null; since: string | null; latencyMs?: number }
export interface Agent {
  id: string; name: string; avatar: Avatar; description: string; instructions: string; provider: string; schedule: string;
  model?: string; effort?: string;
  skills: string[]; tools: string[]; access: Access; projectId: string | null; monitor: MonitorSpec | null; monitorState: MonitorState | null;
  enabled: boolean; learns: boolean; templateId: string | null; nextRunAt: string | null; lastRunAt: string | null; running?: boolean;
  /** in a workspace list: the team it belongs to */
  team?: { id: string; name: string; lead: boolean } | null;
}
export interface Template extends Partial<Agent> { templateId: string; category: 'daily' | 'work' | 'creative' | 'automation'; name: string; instructions: string }
export interface Run {
  id: string; agent_id: string; status: 'running' | 'done' | 'error'; trigger: string; provider: string | null; output: string | null;
  error: string | null; detail: string | null; task?: string | null; author?: string | null; media?: MediaItem[]; attachments?: Attachment[]; started_at: string; finished_at: string | null; agent_name?: string; agent_avatar?: Avatar;
}
export interface Memory { id: string; kind: string; content: string; importance: number; source: string | null; projectId: string | null; updatedAt: string }
export interface Skill { id: string; name: string; description: string }
export interface Device { id: string; name: string; pairedAt: string; lastSeen?: string }

// ---------- auth ----------
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

export let token: string | null = null;

/** A guest who opened a share link: limited to that one chat. */
export interface GuestInfo { token: string; conversationId: string; title: string; host: string; name: string; guestsCanSend: boolean; /** a workspace member (whole project, picks access) */ member?: boolean }
export let guest: GuestInfo | null = null;
export function enterAsGuest(g: GuestInfo) {
  guest = g;
  token = g.member ? `ws:${g.token}` : `share:${g.token}`;
}
/** A workspace member, before a chat is picked: just the key. */
export function enterAsMember(key: string) {
  token = `ws:${key}`;
}
export function leaveGuest() {
  guest = null;
}

/** This tab in an online session (stays the same across reloads of the tab). */
export const clientId: string = (() => {
  try {
    const k = 'alter.cid';
    const v = sessionStorage.getItem(k) ?? Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem(k, v);
    return v;
  } catch {
    return Math.random().toString(36).slice(2, 12);
  }
})();
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function boot(): Promise<boolean> {
  try {
    const r = await fetch('/api/boot');
    const b = await r.json();
    if (b.token) {
      token = b.token;
      return true;
    }
  } catch {}
  token = store.get('alter.token');
  return !!token;
}

export function savePairedToken(t: string) {
  token = t;
  store.set('alter.token', t);
}
export function forgetToken() {
  token = null;
  store.set('alter.token', null);
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (res.status === 401) {
    onUnauthorized();
    throw new Error('Not paired');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    computerGone(res.status, data.error);
    throw new Error(data.error || res.statusText);
  }
  return data as T;
}

// ---------- cache ----------
type Entry = { data: unknown; at: number; promise?: Promise<unknown> };
const cache = new Map<string, Entry>();
const subs = new Map<string, Set<() => void>>();
const notify = (key: string) => subs.get(key)?.forEach((f) => f());

export function fetchKey<T>(key: string): Promise<T> {
  const e = cache.get(key);
  if (e?.promise) return e.promise as Promise<T>;
  const promise = api<T>(key)
    .then((data) => {
      cache.set(key, { data, at: Date.now() });
      notify(key);
      return data;
    })
    .catch((err) => {
      const cur = cache.get(key);
      if (cur) delete cur.promise;
      throw err;
    });
  cache.set(key, { data: e?.data, at: e?.at ?? 0, promise });
  return promise;
}

/** Instant render from cache, background revalidate when older than `maxAge`. `key` is the API path. */
export function useData<T>(key: string | null, maxAge = 4000): { data: T | undefined; loading: boolean } {
  const snapshot = useSyncExternalStore(
    (cb) => {
      if (!key) return () => {};
      if (!subs.has(key)) subs.set(key, new Set());
      subs.get(key)!.add(cb);
      return () => subs.get(key)?.delete(cb);
    },
    () => (key ? cache.get(key) : undefined),
  );
  useEffect(() => {
    if (!key) return;
    const e = cache.get(key);
    if (!e || (!e.promise && Date.now() - e.at > maxAge)) fetchKey(key).catch(() => {});
  }, [key, maxAge]);
  return { data: snapshot?.data as T | undefined, loading: !!key && snapshot?.data === undefined };
}

/** Mark keys starting with any prefix as stale and refetch the ones on screen. */
export function invalidate(...prefixes: string[]) {
  for (const key of cache.keys()) {
    if (prefixes.some((p) => key.startsWith(p))) {
      const e = cache.get(key)!;
      e.at = 0;
      if (subs.get(key)?.size) fetchKey(key).catch(() => {});
    }
  }
}

export function setCached<T>(key: string, updater: (prev: T | undefined) => T) {
  const e = cache.get(key);
  cache.set(key, { data: updater(e?.data as T | undefined), at: e?.at ?? Date.now() });
  notify(key);
}

export const prefetch = (...keys: string[]) => keys.forEach((k) => fetchKey(k).catch(() => {}));

// ---------- streaming chat ----------
export async function streamChat(
  body: { conversationId?: string | null; projectId?: string | null; agentId?: string | null; message: string; provider?: string; access?: Access; plan?: boolean; model?: string; effort?: string; attachments?: string[]; cid?: string; name?: string },
  on: { meta?: (m: { conversationId: string; provider: string; switchedFrom?: string }) => void; delta?: (t: string) => void; activity?: (t: string) => void; preview?: (p: Preview) => void; draft?: (d: Draft) => void; progress?: (p: RenderProgress | null) => void },
  signal?: AbortSignal,
): Promise<{ conversationId: string; text: string; provider: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let result: any = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = chunk.match(/^event: (.+)$/m)?.[1];
      const data = JSON.parse(chunk.match(/^data: (.*)$/m)?.[1] ?? 'null');
      if (ev === 'meta') on.meta?.(data);
      else if (ev === 'delta') on.delta?.(data.text);
      else if (ev === 'activity') on.activity?.(data.text);
      else if (ev === 'preview') on.preview?.(data);
      else if (ev === 'draft') on.draft?.(data);
      else if (ev === 'progress') on.progress?.(data);
      else if (ev === 'done') result = data;
      else if (ev === 'error') throw Object.assign(new Error(data.message), data);
    }
  }
  if (!result) throw new Error('Connection closed');
  return result;
}

// ---------- attachments ----------
export function uploadFile(file: File, onProgress?: (pct: number) => void, signal?: AbortSignal): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/uploads?name=${encodeURIComponent(file.name || 'file')}`);
    xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || xhr.statusText || 'Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.onabort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    xhr.send(file);
  });
}

// ---------- online sessions ----------
export interface RoomMember { cid: string; name: string; color: string; guest: boolean; joinedAt: number }
export interface Presence {
  cursor?: { a: string; fx: number; fy: number; sel?: string } | null;
  typing?: string;
  picks?: { selector: string; label: string; text: string }[];
}
export interface RemoteRun { user: string; author: Author | null; attachments: Attachment[]; text: string; steps: string[]; provider?: string; startedAt: number; cid: string }

export function connectRoom(
  conversationId: string,
  name: string,
  on: {
    hello: (d: { members: RoomMember[]; state: Record<string, Presence>; run: RemoteRun | null }) => void;
    members: (m: RoomMember[]) => void;
    state: (d: Presence & { cid: string; gone?: boolean }) => void;
    run: (d: { ev: string; cid: string; data: any }) => void;
  },
): () => void {
  let es: EventSource | null = null;
  let closed = false;
  const open = () => {
    es = new EventSource(`/api/room/${conversationId}?token=${encodeURIComponent(token ?? '')}&cid=${clientId}&name=${encodeURIComponent(name)}`);
    const sub = (type: string, fn: (d: any) => void) => es!.addEventListener(type, (e) => fn(JSON.parse((e as MessageEvent).data)));
    sub('hello', on.hello);
    sub('members', on.members);
    sub('state', on.state);
    sub('run', on.run);
    es.onerror = () => {
      es?.close();
      if (!closed) setTimeout(open, 3000);
    };
  };
  open();
  return () => {
    closed = true;
    es?.close();
  };
}

export function sendPresence(conversationId: string, patch: Presence) {
  fetch(`/api/room/${conversationId}/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ cid: clientId, ...patch }),
    keepalive: true,
  }).catch(() => {});
}

declare const __APP_VERSION__: string;

// ---------- live events ----------
export function connectEvents(handler: (type: string, data: any) => void): () => void {
  let es: EventSource | null = null;
  let closed = false;
  const types = ['run.started', 'run.activity', 'run.finished', 'monitor.changed', 'memory.added', 'agent.changed', 'project.changed', 'conversation.updated', 'provider.tested', 'provider.progress', 'project.scan', 'usage.limit', 'device.paired', 'settings.changed', 'studio.progress', 'hands.session', 'hands.stopped', 'agent.status', 'alert', 'push.changed', 'squad.update', 'hands.board', 'crew.preview', 'media.updated', 'prompts.changed', 'wslog.added'];
  const open = () => {
    es = new EventSource(`/api/events?token=${encodeURIComponent(token ?? '')}`);
    // ALTTER on the computer was updated (or restarted with a new version): load the new app
    es.addEventListener('hello', () => {
      fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()).then((h) => { if (h?.version && h.version !== __APP_VERSION__) { /* reload once per version — never a loop if the two ever disagree */ let tried = ''; try { tried = sessionStorage.getItem('altter.reloadedFor') ?? ''; sessionStorage.setItem('altter.reloadedFor', h.version); } catch {} if (tried !== h.version) location.reload(); } }).catch(() => {});
    });
    for (const type of types) es.addEventListener(type, (e) => handler(type, JSON.parse((e as MessageEvent).data)));
    es.onerror = () => {
      es?.close();
      if (!closed) setTimeout(open, 4000);
    };
  };
  open();
  return () => {
    closed = true;
    es?.close();
  };
}
