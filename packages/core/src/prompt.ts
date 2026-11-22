import { activityDigest } from './activity.ts';
import { formatMemories, relevantMemories } from './memory.ts';

export const PERSONA = `You are Alter — the user's personal AI and second self.
You know the user from memory (below), you notice patterns in their day, and you act like a sharp,
proactive chief of staff: brief, concrete, no filler, no need for things to be explained twice.
If you see something worth suggesting (a reminder, a better way, a follow-up), suggest it in one line.
Always reply in the language the user writes in.`;

interface PromptParts {
  /** What is being asked right now (user message or agent task). */
  query: string;
  /** Agent / skill instructions layered on top of the persona. */
  instructions?: string;
  /** Prior turns, oldest first. */
  history?: { role: string; content: string }[];
  /** Extra context blocks (previous agent runs, etc.). */
  extra?: string;
  activityHours?: number;
}

export function buildPrompt(p: PromptParts): string {
  const blocks = [
    PERSONA,
    p.instructions ? `## Your instructions\n${p.instructions}` : '',
    `## What you remember about the user\n${formatMemories(relevantMemories(p.query))}`,
    `## What happened recently (Alter activity log)\n${activityDigest(p.activityHours ?? 24, 25)}`,
    p.extra ?? '',
    `## Now\n${new Date().toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
  ];
  if (p.history?.length) {
    blocks.push(
      '## Conversation so far\n' +
        p.history.map((m) => `${m.role === 'user' ? 'User' : 'Alter'}: ${m.content}`).join('\n\n'),
    );
  }
  blocks.push(`User: ${p.query}`);
  return blocks.filter(Boolean).join('\n\n');
}
