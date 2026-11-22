import { randomUUID } from 'node:crypto';
import { logActivity } from './activity.ts';
import { all, get, now, run } from './db.ts';
import { emit } from './events.ts';
import { learnFrom } from './learning.ts';
import { buildPrompt } from './prompt.ts';
import { resolveProvider } from './providers/index.ts';

export interface Conversation {
  id: string;
  title: string;
  provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: string | null;
  created_at: string;
}

export const listConversations = (limit = 50) =>
  all<Conversation>('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?', limit);

export const getConversation = (id: string) => get<Conversation>('SELECT * FROM conversations WHERE id = ?', id);

export const getMessages = (conversationId: string, limit = 200) =>
  all<Message>('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?', conversationId, limit).reverse();

export function deleteConversation(id: string): boolean {
  return Number(run('DELETE FROM conversations WHERE id = ?', id).changes) > 0;
}

export interface ChatRequest {
  conversationId?: string;
  message: string;
  provider?: string;
  onDelta?: (text: string) => void;
  onMeta?: (meta: { conversationId: string; provider: string }) => void;
  signal?: AbortSignal;
}

export async function chat(req: ChatRequest): Promise<{ conversationId: string; text: string; provider: string }> {
  const message = req.message.trim();
  if (!message) throw new Error('Empty message');

  let conv = req.conversationId ? getConversation(req.conversationId) : undefined;
  if (!conv) {
    const id = randomUUID();
    const ts = now();
    const title = message.replace(/\s+/g, ' ').slice(0, 60);
    run('INSERT INTO conversations (id, title, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', id, title, req.provider ?? null, ts, ts);
    conv = getConversation(id)!;
  }

  const provider = await resolveProvider(req.provider ?? conv.provider ?? 'default');
  req.onMeta?.({ conversationId: conv.id, provider: provider.id });

  const history = getMessages(conv.id, 16).map((m) => ({ role: m.role, content: m.content }));
  run('INSERT INTO messages (conversation_id, role, content, provider, created_at) VALUES (?, ?, ?, ?, ?)', conv.id, 'user', message, null, now());
  logActivity('chat', `User asked: ${message.slice(0, 160)}`, conv.id);

  const prompt = buildPrompt({ query: message, history });
  const { text } = await provider.run({ prompt, onDelta: req.onDelta, signal: req.signal });

  run('INSERT INTO messages (conversation_id, role, content, provider, created_at) VALUES (?, ?, ?, ?, ?)', conv.id, 'assistant', text, provider.id, now());
  run('UPDATE conversations SET updated_at = ? WHERE id = ?', now(), conv.id);
  emit('conversation.updated', { id: conv.id });

  learnFrom(`User: ${message}\n\nAlter: ${text}`, `chat:${conv.id}`);
  return { conversationId: conv.id, text, provider: provider.id };
}
