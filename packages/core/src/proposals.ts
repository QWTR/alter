// "Make me an automation that…" in a chat: the AI answers with a ready proposal (a fenced
// ```alter-automation block); the chat shows it as a card and one click turns it into a real agent.
import { createAgent, type Agent, type AgentInput } from './agents.ts';
import { get, run } from './db.ts';
import { emit } from './events.ts';
import { getConversation, type Message } from './chat.ts';
import { logActivity } from './activity.ts';

export const PROPOSAL_FENCE = 'alter-automation';

export interface Proposal {
  name: string;
  description?: string;
  instructions: string;
  schedule?: string;
  monitor?: { type: 'http' | 'tcp' | 'ping' | 'command'; target: string; everyMinutes?: number; autoFix?: boolean } | null;
  access?: 'chat' | 'read' | 'full';
  icon?: string;
  palette?: string;
  /** Set once the user created it. */
  createdId?: string;
}

const ICONS = 'sparkles sunrise moon mail clapperboard telescope server cpu target folder briefcase rocket palette code camera music heart globe shield zap bot brain calendar bag pen megaphone book home wrench trend users film idea database radar';
const PALETTES = 'violet ocean sunset mint rose amber slate lime';

export const AUTOMATION_GUIDE = `## Automations (ALTTER can run things for the user on its own)
When the user wants something done regularly, at a time, or watched (a daily summary, a reminder, checking a site/server, a weekly report…), propose an automation: one short sentence on what it will do, then exactly one block:
\`\`\`${PROPOSAL_FENCE}
{"name":"Short name","description":"One line for the list","instructions":"What to do on every run, written as a task for an AI agent: concrete steps, what to report","schedule":"daily 08:00","monitor":null,"access":"read","icon":"sunrise","palette":"amber"}
\`\`\`
- schedule: manual | every 30m | every 2h | daily 08:00 | weekdays 09:00 | weekly mon 10:00 (24h clock, the user's local time)
- monitor (instead of a schedule, for "watch / alert me when X is down"): {"type":"http|tcp|ping|command","target":"https://… | host:port | host | shell command (exit 0 = ok)","everyMinutes":5,"autoFix":false} with "schedule":"manual". ALTTER runs the check itself and wakes the agent only when it fails.
- access: chat (only thinks/writes), read (may read files and the web), full (may run commands and change files — only when the task needs it)
- icon: one of ${ICONS}; palette: one of ${PALETTES}
- Valid JSON, instructions in the user's language. Do not create it yourself (no cron, Task Scheduler, scripts): ALTTER shows the block as a card and the user creates it with one click. If details are unclear, pick sensible defaults and say they can be changed. For changes, send a new full block.`;

const WANTS = /automat|harmonogram|codzienn|co\s?dzie[nń]|co\s?tydzie|co\s?godzin|co\s+\d+\s*(min|godz|h)|ka[zż]d(y|ego|ej)\s+(dzie|rano|wiecz|poniedz|wtor|[sś]rod|czwart|pi[aą]t|sobot|niedziel|tydz|godzin)|przypominaj|pilnuj|monitoruj|sprawdzaj|regularnie|cyklicz|automation|schedul|every\s+(day|morning|week|hour|\d+)|daily|weekly|hourly|remind me|keep an eye|monitor|watch (my|the|for)|cron|automatisier|täglich|jede[nr]?\s+(tag|woche|stunde)|automatiza|cada\s+(día|semana|hora)|automatis|chaque\s+(jour|semaine|heure)|автоматиз|щодня|щотижня|кожн(ого|ий)\s+(дня|ранку|тижня|годин)/i;

/** Only pay for the guide's tokens when the chat is about automating something. */
export function wantsAutomation(message: string, history: { content: string }[] = []): boolean {
  return WANTS.test(message) || history.slice(-2).some((m) => m.content.includes('```' + PROPOSAL_FENCE));
}

const BLOCK = new RegExp('```' + PROPOSAL_FENCE + '[^\\n]*\\n([\\s\\S]*?)```', 'g');

export function proposalsIn(text: string): { raw: string; start: number; end: number; proposal: Proposal | null }[] {
  return [...text.matchAll(BLOCK)].map((m) => {
    let proposal: Proposal | null = null;
    try {
      const p = JSON.parse(m[1]);
      if (p && typeof p.name === 'string' && typeof p.instructions === 'string') proposal = p;
    } catch {}
    return { raw: m[1], start: m.index!, end: m.index! + m[0].length, proposal };
  });
}

/** Create the agent proposed in a chat answer; the block remembers it so the card shows "created". */
export function acceptProposal(conversationId: string, messageId: number, index: number, edits: Partial<Proposal> = {}): { agent: Agent; message: Message } {
  const conv = getConversation(conversationId);
  if (!conv) throw new Error('Conversation not found');
  const msg = get<Message>('SELECT * FROM messages WHERE id = ? AND conversation_id = ?', messageId, conversationId);
  if (!msg || msg.role !== 'assistant') throw new Error('Message not found');
  const blocks = proposalsIn(msg.content);
  const b = blocks[index];
  if (!b?.proposal) throw new Error('This proposal could not be read');
  if (b.proposal.createdId) throw new Error('Already created');
  const p: Proposal = { ...b.proposal, ...Object.fromEntries(Object.entries(edits).filter(([, v]) => v !== undefined)) };
  const monitor = p.monitor && p.monitor.target ? { type: p.monitor.type, target: p.monitor.target, everyMinutes: p.monitor.everyMinutes ?? 5, autoFix: p.monitor.autoFix === true } : null;
  const input: AgentInput = {
    name: p.name.slice(0, 60),
    // the AI's one-liner usually names the time: it would lie after the user changed the schedule
    description: edits.schedule && edits.schedule !== b.proposal.schedule ? '' : p.description ?? '',
    instructions: p.instructions,
    schedule: monitor ? 'manual' : p.schedule || 'manual',
    monitor,
    // fixing things on its own needs full access; otherwise never more than the proposal asked for
    access: monitor?.autoFix ? 'full' : p.access === 'full' || p.access === 'read' ? p.access : 'chat',
    projectId: conv.project_id,
    provider: conv.provider ?? 'default',
    avatar: { palette: PALETTES.split(' ').includes(p.palette ?? '') ? p.palette! : 'violet', icon: ICONS.split(' ').includes(p.icon ?? '') ? p.icon! : 'sparkles' },
    enabled: true,
  };
  const agent = createAgent(input);
  const saved = JSON.stringify({ ...p, createdId: agent.id });
  const content = msg.content.slice(0, b.start) + '```' + PROPOSAL_FENCE + '\n' + saved + '\n```' + msg.content.slice(b.end);
  run('UPDATE messages SET content = ? WHERE id = ?', content, messageId);
  logActivity('agent', `Automation created from chat: ${agent.name}`, agent.id);
  emit('conversation.updated', { id: conversationId });
  return { agent, message: { ...msg, content } };
}
