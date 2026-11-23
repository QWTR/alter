// "Here's my site / this is the folder / watch this API and ping my phone": the AI answers with
// one ```alter-setup card listing what it will set up (project, folders, sites, APIs, automations,
// phone alerts); one click applies all of it. Everything stays editable in the project afterwards.
import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { logActivity } from './activity.ts';
import { createAgent, type Agent } from './agents.ts';
import { getConversation, updateConversation, type Message } from './chat.ts';
import { get, run } from './db.ts';
import { emit } from './events.ts';
import { createProject, getProject, updateProject, type Project } from './projects.ts';
import { pushSubs } from './push.ts';
import { projectLinks, type ProjectLink } from './links.ts';
export { projectLinks, projectDirs, linksText, type ProjectLink } from './links.ts';

export const SETUP_FENCE = 'alter-setup';

export type SetupStep =
  | { do: 'project'; name: string; description?: string; folder?: string; instructions?: string }
  | { do: 'folder'; path: string; name?: string }
  | { do: 'site' | 'api'; url: string; name?: string; watch?: boolean; everyMinutes?: number; autoFix?: boolean }
  | { do: 'repo'; url: string; name?: string }
  | { do: 'automation'; name: string; instructions: string; schedule?: string; access?: 'chat' | 'read' | 'full'; description?: string; icon?: string; palette?: string; notify?: boolean }
  | { do: 'instructions'; text: string }
  | { do: 'notify' };

export interface Setup {
  title: string;
  summary?: string;
  steps: SetupStep[];
  /** Filled in once applied. */
  done?: boolean;
  results?: { ok: boolean; note: string }[];
}

export const SETUP_GUIDE = `## Setting things up from the chat (projects, folders, sites, APIs, alerts)
When the user gives a link, a folder path, an API, a server, or asks to add/watch/connect something to a project — do not just explain: answer with one short sentence and exactly one block the app turns into a card with an "Apply" button:
\`\`\`${SETUP_FENCE}
{"title":"Short title","summary":"one line: what will be set up","steps":[
 {"do":"project","name":"Name","description":"one line","folder":"optional existing path"},
 {"do":"folder","path":"D:\\\\work\\\\shop","name":"Shop code"},
 {"do":"site","url":"https://example.com","name":"Shop","watch":true,"everyMinutes":5,"autoFix":false},
 {"do":"api","url":"https://api.example.com/health","name":"Shop API","watch":true,"everyMinutes":2},
 {"do":"repo","url":"https://github.com/owner/repo","name":"Repo"},
 {"do":"automation","name":"Daily SEO check","instructions":"task for an AI agent","schedule":"daily 08:00","access":"read","notify":true},
 {"do":"instructions","text":"standing context for every chat in this project"},
 {"do":"notify"}
]}
\`\`\`
Rules: only the steps that are needed, in this order. "project" only when the chat is not in a project yet and the user wants one (otherwise everything goes into the current project). "watch" sites/APIs the user cares about being up (that is how phone alerts work); "autoFix": true only if the user wants ALTTER to fix things itself (it gets full control). Add {"do":"notify"} when the user wants alerts on the phone and none are on yet. schedule: manual | every 30m | daily 08:00 | weekdays 09:00 | weekly mon 10:00. Valid JSON (escape backslashes in Windows paths). Never set things up yourself with scripts/cron — the card does it. You may first look at the site/folder (if you can) to name things well and suggest what is worth watching.`;

const WANTS = /https?:\/\/|\b[a-z]:\\|(^|\s)\/(home|srv|var|opt|users?)\/|\b(folder|katalog|ścieżk|sciezk|path|repo|github|gitlab|stron[aęy]|witryn|site|website|domen|domain|api\b|endpoint|webhook|serwer|server|vps|monitor|pilnuj|obserwuj|powiadom|notif|alert|dodaj do projektu|add to (the )?project|podłącz|podlacz|connect)/i;

export function wantsSetup(message: string, history: { content: string }[] = []): boolean {
  return WANTS.test(message) || history.slice(-2).some((m) => m.content.includes('```' + SETUP_FENCE));
}

const BLOCK = new RegExp('```' + SETUP_FENCE + '[^\\n]*\\n([\\s\\S]*?)```', 'g');

export function setupsIn(text: string): { start: number; end: number; setup: Setup | null }[] {
  return [...text.matchAll(BLOCK)].map((m) => {
    let setup: Setup | null = null;
    try {
      const p = JSON.parse(m[1]);
      if (p && Array.isArray(p.steps)) setup = { title: String(p.title ?? 'Setup'), summary: p.summary, steps: p.steps, done: p.done, results: p.results };
    } catch {}
    return { start: m.index!, end: m.index! + m[0].length, setup };
  });
}

export function addLink(projectId: string, link: Omit<ProjectLink, 'id'>): ProjectLink {
  const p = getProject(projectId);
  if (!p) throw new Error('Project not found');
  const links = projectLinks(p).filter((l) => !(l.kind === link.kind && l.target === link.target));
  const full = { ...link, id: randomUUID() };
  updateProject(projectId, { links: [...links, full] } as any);
  return full;
}

export function removeLink(projectId: string, linkId: string): boolean {
  const p = getProject(projectId);
  if (!p) return false;
  const links = projectLinks(p);
  const next = links.filter((l) => l.id !== linkId);
  updateProject(projectId, { links: next } as any);
  return next.length !== links.length;
}

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const normUrl = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);

function watchAgent(project: Project, step: { url: string; name?: string; everyMinutes?: number; autoFix?: boolean; do: string }, provider: string): Agent {
  const url = normUrl(step.url);
  const name = step.name?.trim() || hostOf(url);
  return createAgent({
    name: `${name} — ${step.do === 'api' ? 'API' : 'monitor'}`.slice(0, 60),
    description: url,
    instructions: `Watch ${url} (${step.do}). When the check fails: find out why (status, response, DNS, certificate, recent changes in the project folder, server logs if reachable) and ${step.autoFix ? 'fix it, then verify the check passes again' : 'tell the user in 3–5 lines what is wrong and exactly what to do; do not change anything'}.`,
    schedule: 'manual',
    monitor: { type: 'http', target: url, everyMinutes: Math.max(1, Math.min(1440, step.everyMinutes ?? 5)), autoFix: step.autoFix === true },
    access: step.autoFix ? 'full' : 'read',
    projectId: project.id,
    provider,
    notify: true,
    avatar: { palette: step.do === 'api' ? 'ocean' : 'mint', icon: step.do === 'api' ? 'server' : 'globe' },
    enabled: true,
  });
}

/** Applies a setup card. Each step reports on its own: one bad path does not undo the rest. */
export function applySetup(conversationId: string, messageId: number, index: number, skip: number[] = []): { setup: Setup; message: Message; projectId: string | null } {
  let conv = getConversation(conversationId);
  if (!conv) throw new Error('Conversation not found');
  const msg = get<Message>('SELECT * FROM messages WHERE id = ? AND conversation_id = ?', messageId, conversationId);
  if (!msg || msg.role !== 'assistant') throw new Error('Message not found');
  const b = setupsIn(msg.content)[index];
  if (!b?.setup) throw new Error('This card could not be read');
  if (b.setup.done) throw new Error('Already applied');
  const setup = b.setup;
  const provider = conv.provider ?? 'default';
  let project = getProject(conv.project_id);
  const results: { ok: boolean; note: string }[] = [];
  const need = () => {
    if (project) return project;
    // anything project-shaped without a project: make one named after the card
    project = createProject({ name: setup.title.slice(0, 60) || 'Project' });
    conv = updateConversation(conversationId, { projectId: project.id })!;
    return project;
  };

  setup.steps.forEach((s, i) => {
    if (skip.includes(i)) return results.push({ ok: false, note: 'skipped' });
    try {
      switch (s.do) {
        case 'project': {
          if (project) {
            project = updateProject(project.id, { description: s.description || project.description, instructions: s.instructions ? `${project.instructions}\n${s.instructions}`.trim() : project.instructions })!;
            results.push({ ok: true, note: project.name });
            break;
          }
          const folder = s.folder?.trim() ? resolve(s.folder.trim()) : undefined;
          if (folder && !existsSync(folder)) throw new Error(`No folder ${folder}`);
          project = createProject({ name: s.name, description: s.description ?? '', instructions: s.instructions ?? '', folder });
          conv = updateConversation(conversationId, { projectId: project.id })!;
          results.push({ ok: true, note: project.name });
          break;
        }
        case 'folder': {
          const p = need();
          const path = resolve(s.path.trim());
          if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`No folder ${path}`);
          addLink(p.id, { kind: 'folder', name: s.name?.trim() || path.split(/[\\/]/).filter(Boolean).pop() || path, target: path });
          results.push({ ok: true, note: path });
          break;
        }
        case 'site':
        case 'api': {
          const p = need();
          const url = normUrl(s.url);
          new URL(url);
          const agent = s.watch === false ? null : watchAgent(p, s, provider);
          addLink(p.id, { kind: s.do, name: s.name?.trim() || hostOf(url), target: url, agentId: agent?.id ?? null });
          results.push({ ok: true, note: agent ? `${url} · ${agent.monitor?.everyMinutes} min` : url });
          break;
        }
        case 'repo': {
          const p = need();
          addLink(p.id, { kind: 'repo', name: s.name?.trim() || s.url.replace(/^https?:\/\/(www\.)?/, ''), target: s.url.trim() });
          results.push({ ok: true, note: s.url });
          break;
        }
        case 'automation': {
          const p = project;
          const agent = createAgent({
            name: s.name.slice(0, 60),
            description: s.description ?? '',
            instructions: s.instructions,
            schedule: s.schedule || 'manual',
            access: s.access === 'full' || s.access === 'read' ? s.access : 'chat',
            projectId: p?.id ?? null,
            provider,
            notify: s.notify === true,
            avatar: { palette: s.palette || 'violet', icon: s.icon || 'sparkles' },
            enabled: true,
          });
          results.push({ ok: true, note: `${agent.name} · ${agent.schedule}` });
          break;
        }
        case 'instructions': {
          const p = need();
          project = updateProject(p.id, { instructions: `${p.instructions}\n${s.text}`.trim() })!;
          results.push({ ok: true, note: s.text.slice(0, 80) });
          break;
        }
        case 'notify':
          results.push({ ok: pushSubs().length > 0, note: pushSubs().length ? `${pushSubs().length}` : 'phone' });
          break;
        default:
          results.push({ ok: false, note: 'unknown step' });
      }
    } catch (e) {
      results.push({ ok: false, note: (e as Error).message });
    }
  });

  const saved: Setup = { ...setup, done: true, results };
  const content = msg.content.slice(0, b.start) + '```' + SETUP_FENCE + '\n' + JSON.stringify(saved) + '\n```' + msg.content.slice(b.end);
  run('UPDATE messages SET content = ? WHERE id = ?', content, messageId);
  logActivity('project', `Set up from chat: ${setup.title}`, (project as Project | undefined)?.id ?? conversationId);
  emit('conversation.updated', { id: conversationId });
  return { setup: saved, message: { ...msg, content }, projectId: (project as Project | undefined)?.id ?? null };
}
