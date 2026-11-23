import { loadConfig } from './config.ts';
import { addMemory, formatMemories, relevantMemories, type Memory } from './memory.ts';
import { resolveProvider } from './providers/index.ts';
import { isLimited } from './usage.ts';

const REFLECT = `You maintain the long-term memory of a personal AI assistant called ALTTER.
Read the exchange below and extract ONLY durable, useful facts about the USER that will still matter
in a week: who they are, their work and projects, people in their life, preferences and style,
daily routines and habits, recurring tasks, goals. Skip small talk, one-off details and anything
already in "Known memories". Write each memory as one short sentence in the user's language.

Answer with a JSON array and nothing else, e.g.
[{"kind":"routine","content":"Starts work around 9:00 by checking e-mail","importance":3}]
kinds: profile | preference | routine | project | person | fact; importance 1-5.
If there is nothing worth remembering, answer [].`;

let queue: Promise<unknown> = Promise.resolve();

/** Fire-and-forget: learn from a conversation turn or an agent result. Runs one at a time, on the fast model. */
// Token saver: chat turns are buffered per conversation and reflected on together (after a quiet
// minute or every 4 turns) instead of one background AI call per message.
const buffers = new Map<string, { parts: string[]; projectId?: string | null; timer?: ReturnType<typeof setTimeout> }>();
const flush = (key: string) => {
  const b = buffers.get(key);
  if (!b) return;
  buffers.delete(key);
  clearTimeout(b.timer);
  const exchange = b.parts.join('\n\n---\n\n');
  queue = queue.then(() => reflect(exchange, key, b.projectId)).catch((err) => console.warn('[alter] learning skipped:', err.message));
};

export function learnFrom(exchange: string, source: string, projectId?: string | null): void {
  if (!loadConfig().learning || exchange.trim().length < 40) return;
  // agent results are already one big chunk — learn right away
  if (!source.startsWith('chat:')) {
    queue = queue.then(() => reflect(exchange, source, projectId)).catch((err) => console.warn('[alter] learning skipped:', err.message));
    return;
  }
  const b = buffers.get(source) ?? { parts: [], projectId };
  // the assistant's long answers rarely hold facts about the user — keep the user's side whole, trim the rest
  b.parts.push(exchange.length > 3000 ? `${exchange.slice(0, 3000)}…` : exchange);
  clearTimeout(b.timer);
  buffers.set(source, b);
  if (b.parts.length >= 4) flush(source);
  else b.timer = setTimeout(() => flush(source), 60_000);
}

async function reflect(exchange: string, source: string, projectId?: string | null): Promise<Memory[]> {
  const provider = await resolveProvider('default', { avoidLimited: true });
  if (provider.id === 'demo' || isLimited(provider.id)) return []; // never spend a limited subscription on background work
  const known = formatMemories(relevantMemories(exchange, 25, projectId));
  const prompt = `${REFLECT}\n\n## Known memories\n${known}\n\n## Exchange\n${exchange.slice(0, 12_000)}`;
  const { text } = await provider.run({ prompt, fast: true, timeoutMs: 3 * 60_000 });
  const json = text.match(/\[[\s\S]*\]/)?.[0];
  if (!json) return [];
  const items = JSON.parse(json) as { kind?: string; content?: string; importance?: number }[];
  const added: Memory[] = [];
  for (const it of items.slice(0, 8)) {
    if (typeof it.content !== 'string' || !it.content.trim()) continue;
    // facts about the work itself stay with the project; facts about the person are global
    const kind = it.kind as Memory['kind'];
    added.push(addMemory({ kind, content: it.content, importance: it.importance, source, projectId: kind === 'project' || kind === 'fact' ? projectId : null }));
  }
  return added;
}
