// Live "what is this agent doing" for the menu and agent pages (fed by the agent.status event).
import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../api';

export interface AgentStatus { state: 'working' | 'idle'; text: string; since: number; doneAt?: number }
let map: Record<string, AgentStatus> = {};
let loaded = false;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

export function pushAgentStatus(d: { id: string } & AgentStatus) {
  map = { ...map, [d.id]: { state: d.state, text: d.text, since: d.since, doneAt: d.doneAt } };
  ping();
}

export function useAgentStatuses(): Record<string, AgentStatus> {
  useEffect(() => {
    if (loaded) return;
    loaded = true;
    api<Record<string, AgentStatus>>('/api/agent-status').then((s) => { map = { ...s, ...map }; ping(); }).catch(() => { loaded = false; });
  }, []);
  return useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => map);
}

/** Short human line: "chat: …" → the text, tool steps shortened. */
export function statusLine(s: AgentStatus | undefined): string {
  if (!s?.text) return '';
  return s.text.replace(/^chat:\s*/, '').replace(/^(Bash|PowerShell): /, '$ ').slice(0, 70);
}
