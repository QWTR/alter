// What is connected to a project (extra folders, sites, APIs, repos) — kept apart from setup.ts
// so prompt/chat/agents can read it without import cycles.
import { existsSync } from 'node:fs';
import { all } from './db.ts';
import type { Project } from './projects.ts';

export interface ProjectLink {
  id: string;
  kind: 'folder' | 'site' | 'api' | 'repo';
  name: string;
  target: string;
  /** The automation that watches it (sites/APIs). */
  agentId?: string | null;
}

export const projectLinks = (p: Project | undefined): ProjectLink[] => ((p as any)?.links ?? []) as ProjectLink[];

/** Extra folders the AI may read/work in for this project (besides its own folder). */
export const projectDirs = (p: Project | undefined): string[] => projectLinks(p).filter((l) => l.kind === 'folder' && existsSync(l.target)).map((l) => l.target);

/** For the prompt: what is connected to this project, with the live state of watched things. */
export function linksText(p: Project | undefined): string {
  const links = projectLinks(p);
  if (!links.length) return '';
  const agents = new Map(all<{ id: string; data: string }>('SELECT id, data FROM agents').map((r) => [r.id, JSON.parse(r.data)]));
  return 'Connected to this project:\n' + links.map((l) => {
    const a = l.agentId ? agents.get(l.agentId) : undefined;
    const st = a?.monitorState ? ` — watched every ${a.monitor?.everyMinutes} min, now ${a.monitorState.status}${a.monitorState.message ? ` (${a.monitorState.message})` : ''}` : '';
    return `- ${l.kind}: ${l.name} → ${l.target}${l.kind === 'folder' ? ' (you can read/work here too)' : ''}${st}`;
  }).join('\n');
}
