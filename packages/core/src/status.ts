// What each agent is doing right now (shown next to it in the menu, live).
import { emit } from './events.ts';

export interface AgentStatus { state: 'working' | 'idle'; text: string; since: number; doneAt?: number }
const map = new Map<string, AgentStatus>();

export function setAgentStatus(id: string, state: AgentStatus['state'], text = '') {
  const prev = map.get(id);
  const next: AgentStatus = state === 'working'
    ? { state, text: text.slice(0, 120), since: prev?.state === 'working' ? prev.since : Date.now() }
    : { state, text: text.slice(0, 120), since: Date.now(), doneAt: Date.now() };
  // activity lines arrive fast: only tell the UI when the text really changes
  if (prev && prev.state === next.state && prev.text === next.text) return;
  map.set(id, next);
  emit('agent.status', { id, ...next });
}

export const agentStatuses = () => Object.fromEntries(map);
