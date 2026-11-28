import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HOME, userSkillsDir } from './config.ts';

/**
 * Skills ("nakładki") are Markdown instruction packs an agent can wear:
 * how to triage e-mail, how to write a reel script, the house style for reports…
 * Built-ins live in the repo's /skills, the user's own in ~/.alter/skills.
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  builtIn: boolean;
  source?: { url: string; sha: string; path: string; installedAt: string };
  /** When the chat message matches, the skill is added to the answer by itself. */
  triggers?: string;
}

const builtInDir = process.env.ALTER_SKILLS_DIR ?? resolve(import.meta.dirname, '../../../skills');

/** Paths a skill can name: {{SKILLS}} (the built-in skills folder, with tools/ and vendor/) and {{DATA}} (ALTTER's data folder). */
const fill = (body: string) => body.replaceAll('{{SKILLS}}', builtInDir.replace(/\\/g, '/')).replaceAll('{{DATA}}', HOME.replace(/\\/g, '/')).replaceAll('{{STUDIO}}', join(HOME, 'studio').replace(/\\/g, '/'));

function parse(id: string, raw: string, builtIn: boolean): Skill {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].trim();
    }
  }
  return { id, name: meta.name ?? id, description: meta.description ?? '', body: fill((m ? m[2] : raw).trim()), builtIn, triggers: meta.triggers || undefined };
}

export function listSkills(): Skill[] {
  const out = new Map<string, Skill>();
  for (const [dir, builtIn] of [[builtInDir, true], [userSkillsDir(), false]] as const) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!builtIn && !file.startsWith('.') && existsSync(join(dir, file, 'SKILL.md')) && existsSync(join(dir, file, '.altter-source.json'))) {
        try {
          const skill = parse(file, readFileSync(join(dir, file, 'SKILL.md'), 'utf8'), false);
          skill.source = JSON.parse(readFileSync(join(dir, file, '.altter-source.json'), 'utf8'));
          // Relative references in third-party skills resolve to the installed package.
          skill.body = `Package directory: ${join(dir, file)}\n\n${skill.body}`;
          out.set(file, skill);
        } catch { /* An incomplete package cannot break the legacy skills list. */ }
        continue;
      }
      if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue;
      const id = file.slice(0, -3);
      out.set(id, parse(id, readFileSync(join(dir, file), 'utf8'), builtIn)); // user skills override built-ins
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function skillsText(ids: string[]): string {
  if (!ids.length) return '';
  const byId = new Map(listSkills().map((s) => [s.id, s]));
  return ids
    .map((id) => byId.get(id))
    .filter((s): s is Skill => !!s)
    .map((s) => `### Skill: ${s.name}\n${s.body}`)
    .join('\n\n');
}

/** Expert know-how for this message: up to 2 skills whose triggers match (websites, motion, video, automations…). */
export function expertSkills(message: string): { names: string[]; text: string } {
  const hits: { s: Skill; n: number }[] = [];
  for (const sk of listSkills()) {
    if (!sk.triggers) continue;
    let re: RegExp;
    try { re = new RegExp(sk.triggers, 'giu'); } catch { continue; }
    const n = message.match(re)?.length ?? 0;
    if (n) hits.push({ s: sk, n });
  }
  const top = hits.sort((a, b) => b.n - a.n).slice(0, 2).map((h) => h.s);
  if (!top.length) return { names: [], text: '' };
  const body = top.map((s) => `### ${s.name}\n${s.body}`).join('\n\n');
  return { names: top.map((s) => s.name), text: `Expert know-how for this task (use it, do not quote it):\n\n${body}` };
}
