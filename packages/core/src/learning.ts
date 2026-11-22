import { loadConfig } from './config.ts';
import { addMemory, formatMemories, listMemories, type Memory } from './memory.ts';
import { resolveProvider } from './providers/index.ts';

const REFLECT = `You maintain the long-term memory of a personal AI assistant called Alter.
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
export function learnFrom(exchange: string, source: string): void {
  if (!loadConfig().learning || exchange.trim().length < 40) return;
  queue = queue.then(() => reflect(exchange, source)).catch((err) => console.warn('[alter] learning skipped:', err.message));
}

async function reflect(exchange: string, source: string): Promise<Memory[]> {
  const provider = await resolveProvider('default');
  if (provider.id === 'demo') return [];
  const known = formatMemories(listMemories({ limit: 60 }));
  const prompt = `${REFLECT}\n\n## Known memories\n${known}\n\n## Exchange\n${exchange.slice(0, 12_000)}`;
  const { text } = await provider.run({ prompt, fast: true, timeoutMs: 3 * 60_000 });
  const json = text.match(/\[[\s\S]*\]/)?.[0];
  if (!json) return [];
  const items = JSON.parse(json) as { kind?: string; content?: string; importance?: number }[];
  const added: Memory[] = [];
  for (const it of items.slice(0, 8)) {
    if (typeof it.content !== 'string' || !it.content.trim()) continue;
    added.push(addMemory({ kind: it.kind as Memory['kind'], content: it.content, importance: it.importance, source }));
  }
  return added;
}
