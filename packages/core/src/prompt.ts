import { activityDigest } from './activity.ts';
import { LANGUAGE_NAMES, loadConfig } from './config.ts';
import { formatMemories, relevantMemories } from './memory.ts';
import type { Project } from './projects.ts';
import { linksText } from './links.ts';

export function persona(): string {
  const cfg = loadConfig();
  const lang = LANGUAGE_NAMES[cfg.language] ?? 'English';
  // kept short on purpose: it is sent with every message
  return `You are ALTTER, the personal AI of ${cfg.userName || 'the user'}. Use the memory below; never make them repeat themselves.
Be brief and concrete, no filler. Suggest a useful next step in one line when you see one.
Reply in the user's language (default: ${lang}).`;
}

interface PromptParts {
  /** What is being asked right now (user message or agent task). */
  query: string;
  /** Agent / skill instructions layered on top of the persona. */
  instructions?: string;
  project?: Project;
  /** Prior turns, oldest first. */
  history?: { role: string; content: string }[];
  /** Extra context blocks (previous agent runs, monitor failures, etc.). */
  extra?: string;
  activityHours?: number;
  /** Agents speak without a user line. */
  asTask?: boolean;
}

// The activity log is only worth its tokens when the question is about the user's day / plans.
const ABOUT_DAY = /\b(today|yesterday|this (week|morning)|my day|plan|schedule|remind|what did i)|dzi[sś]|wczoraj|rano|dzie[nń]|tydzie[nń]|przypom|co robi|heute|gestern|hoy|ayer|aujourd|hier|сьогодні|вчора/i;

/** Older turns are shortened so long chats don't resend everything every time. */
function compactHistory(history: { role: string; content: string }[]): string {
  const keepFull = 6;
  return history
    .map((m, i) => {
      const recent = i >= history.length - keepFull;
      const max = recent ? 2500 : 280;
      const text = m.content.length > max ? `${m.content.slice(0, max)}…` : m.content;
      return `${m.role === 'user' ? 'User' : 'ALTTER'}: ${text}`;
    })
    .join('\n\n');
}

export function buildPrompt(p: PromptParts): string {
  const firstTurn = !p.history?.length;
  const wantsDay = p.asTask || firstTurn || ABOUT_DAY.test(p.query);
  const blocks = [
    persona(),
    p.instructions ? `## Your role\n${p.instructions}` : '',
    p.project
      ? `## Project: ${p.project.name}\n${p.project.description}\n${p.project.instructions.replace(/<!-- \/?alter:overview -->/g, '')}\nFolder (working directory): ${p.project.folder}
${linksText(p.project)}`.trim()
      : '',
    `## Memory\n${formatMemories(relevantMemories(p.query, firstTurn ? 12 : 8, p.project?.id))}`,
    wantsDay ? `## Recent activity\n${activityDigest(p.activityHours ?? 24, p.asTask ? 25 : 12)}` : '',
    p.extra ?? '',
    `## Now\n${new Date().toLocaleString()}`,
  ];
  if (p.history?.length) blocks.push('## Conversation\n' + compactHistory(p.history));
  blocks.push(p.asTask ? `## Task\n${p.query}` : `User: ${p.query}`);
  return blocks.filter(Boolean).join('\n\n');
}
