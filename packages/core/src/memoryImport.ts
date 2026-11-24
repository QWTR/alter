// Bring what other AIs already know about you into ALTTER's memory: paste the answer ChatGPT / Claude / Gemini
// give to "list everything you remember about me", or drop their data export (conversations.json). The AI here
// turns it into short memory items; near-duplicates of what ALTTER already knows are merged, not stored twice.
import { addMemory, formatMemories, listMemories, MEMORY_KINDS, type Memory, type MemoryKind } from './memory.ts';
import { resolveProvider } from './providers/index.ts';

export const IMPORT_SOURCES = ['chatgpt', 'claude', 'gemini', 'copilot', 'other'] as const;
type Source = (typeof IMPORT_SOURCES)[number];

const EXTRACT = `You are importing a user's memory into ALTTER, their personal AI assistant, from another AI assistant.
The text below is either that assistant's own list of what it remembers about the user, or the user's messages
from past conversations with it. Extract every durable, useful fact about the USER: who they are, their work and
company, projects, people in their life, preferences and style (also how they like answers written), routines,
goals, tools and accounts they use. Skip one-off questions, small talk and anything about the other assistant itself.
Write each memory as one short sentence in the user's own language (the language most of the text is in).

Answer with a JSON array and nothing else, e.g.
[{"kind":"profile","content":"Runs a small design studio in Kraków","importance":4}]
kinds: profile | preference | routine | project | person | fact; importance 1-5.`;

/** User-written text from a ChatGPT / Claude data export (conversations.json), newest conversations first. */
function fromExport(raw: string): string | null {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(data)) return null;
  const convs: { at: number; lines: string[] }[] = [];
  for (const c of data as any[]) {
    const lines: string[] = [];
    if (c?.mapping && typeof c.mapping === 'object') {
      // ChatGPT: a tree of nodes; the user's messages have author.role === 'user'
      const nodes = Object.values(c.mapping as Record<string, any>).map((n) => n?.message).filter((m) => m?.author?.role === 'user');
      nodes.sort((a, b) => (a.create_time ?? 0) - (b.create_time ?? 0));
      for (const m of nodes) {
        const parts = (m.content?.parts ?? []).filter((p: unknown) => typeof p === 'string').join(' ');
        if (parts.trim()) lines.push(parts.trim());
      }
      convs.push({ at: Number(c.update_time ?? c.create_time ?? 0) * 1000, lines });
    } else if (Array.isArray(c?.chat_messages)) {
      // Claude: chat_messages with sender 'human'
      for (const m of c.chat_messages) {
        const text = typeof m?.text === 'string' && m.text ? m.text : Array.isArray(m?.content) ? m.content.map((x: any) => x?.text ?? '').join(' ') : '';
        if (m?.sender === 'human' && text.trim()) lines.push(text.trim());
      }
      convs.push({ at: Date.parse(c.updated_at ?? c.created_at ?? '') || 0, lines });
    }
  }
  if (!convs.length) return null;
  convs.sort((a, b) => b.at - a.at);
  return convs.filter((c) => c.lines.length).map((c) => c.lines.map((l) => `- ${l.slice(0, 600)}`).join('\n')).join('\n\n');
}

const KIND_SET = new Set<string>(MEMORY_KINDS);

/** Without an AI connected: one memory per line of a pasted list. */
function plainLines(text: string): { kind: MemoryKind; content: string; importance: number }[] {
  return text.split(/\r?\n/).map((l) => l.replace(/^\s*([-*•·]|\d+[.)])\s*/, '').trim()).filter((l) => l.length >= 8 && l.length <= 400).slice(0, 200).map((content) => ({ kind: 'fact' as MemoryKind, content, importance: 3 }));
}

export async function importMemories(input: { text?: string; source?: string }): Promise<{ added: Memory[]; source: Source; fromExport: boolean }> {
  const source: Source = IMPORT_SOURCES.includes(input.source as Source) ? (input.source as Source) : 'other';
  const raw = String(input.text ?? '').trim();
  if (raw.length < 10) throw new Error('Paste what the other AI remembers about you, or choose its export file');
  const exported = raw.startsWith('[') ? fromExport(raw) : null;
  const text = (exported ?? raw).slice(0, 80_000);
  const provider = await resolveProvider('default', { avoidLimited: true });
  let items: { kind?: string; content?: string; importance?: number }[] = [];
  if (provider.id === 'demo') {
    if (exported) throw new Error('Connect an AI first: it is needed to read a whole export');
    items = plainLines(text);
  } else {
    const known = formatMemories(listMemories({ limit: 60 }));
    // a long export goes in a few pieces, at most 3 at a time
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 16_000) chunks.push(text.slice(i, i + 16_000));
    const run = async (chunk: string) => {
      const { text: out } = await provider.run({ prompt: `${EXTRACT}\n\n## Already in ALTTER's memory (don't repeat)\n${known}\n\n## Imported from ${source}\n${chunk}`, fast: true, timeoutMs: 4 * 60_000 });
      const json = out.match(/\[[\s\S]*\]/)?.[0];
      try { return json ? (JSON.parse(json) as typeof items) : []; } catch { return []; }
    };
    for (let i = 0; i < chunks.length; i += 3) (await Promise.all(chunks.slice(i, i + 3).map(run))).forEach((l) => items.push(...l));
    if (!items.length && !exported) items = plainLines(text);
  }
  const added: Memory[] = [];
  const seen = new Set<string>();
  for (const it of items.slice(0, 200)) {
    if (typeof it.content !== 'string' || !it.content.trim()) continue;
    const m = addMemory({ kind: KIND_SET.has(String(it.kind)) ? (it.kind as MemoryKind) : 'fact', content: it.content, importance: it.importance, source: `import:${source}` });
    if (!seen.has(m.id)) { seen.add(m.id); added.push(m); }
  }
  return { added, source, fromExport: !!exported };
}
