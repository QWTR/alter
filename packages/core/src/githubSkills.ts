import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { userSkillsDir } from './config.ts';

type Entry = { path: string; type: string; mode: string; size?: number };
export interface GitHubSource { owner: string; repo: string; ref?: string; path: string }
export function parseGitHubSource(source: string): GitHubSource {
  const url = new URL(source);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port) throw Error('Use an https://github.com/owner/repo URL.');
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(1).map(decodeURIComponent);
  const [owner, repo, kind, ref, ...rest] = parts;
  if (!/^[\w-]+$/.test(owner ?? '') || !/^[\w.-]+$/.test(repo ?? '') || (kind && !['tree', 'blob'].includes(kind))) throw Error('Invalid GitHub repository URL.');
  const path = rest.join('/');
  if (path && !safePath(path)) throw Error('Invalid package path.');
  if (kind && !ref) throw Error('The URL must include a branch or commit.');
  return { owner, repo: repo.replace(/\.git$/, ''), ref, path };
}
export function safePath(path: string): boolean {
  return !!path && path.split('/').every(part => !!part && part !== '.' && part !== '..' && !/[\\:\x00-\x1f]/.test(part) && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ALTTER-skills' };
async function get(url: string, max = 2_000_000): Promise<Uint8Array> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000), redirect: 'error' });
  if (!response.ok) throw Error(`GitHub HTTP ${response.status}${response.status === 403 || response.status === 429 ? ' — rate limit; try again later.' : ''}`);
  const reader = response.body!.getReader();let size = 0;const chunks: Uint8Array[] = [];
  try {
    for (;;) { const { value, done } = await reader.read();if (done) break;size += value.length;if (size > max) throw Error('GitHub file exceeds the size limit.');chunks.push(value); }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
const json = async (url: string) => JSON.parse(Buffer.from(await get(url, 8_000_000)).toString('utf8'));
const rawUrl = (s: GitHubSource, sha: string, path: string) => `https://raw.githubusercontent.com/${s.owner}/${s.repo}/${sha}/${path.split('/').map(encodeURIComponent).join('/')}`;
type Tree = { sha: string; entries: Entry[] };
const trees = new Map<string, { expires: number; value: Promise<Tree> }>();
async function tree(s: GitHubSource, pin?: string): Promise<{ sha: string; entries: Entry[] }> {
  if (pin && !/^[a-f0-9]{40}$/.test(pin)) throw Error('Invalid commit SHA.');
  const key = `${s.owner.toLowerCase()}/${s.repo.toLowerCase()}@${pin ?? s.ref ?? 'default'}`;
  const cached = trees.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = loadTree(s, pin);
  trees.set(key, { expires: Date.now() + 5 * 60_000, value });
  try {
    const result = await value;
    trees.set(`${s.owner.toLowerCase()}/${s.repo.toLowerCase()}@${result.sha}`, { expires: Date.now() + 60 * 60_000, value });
    while (trees.size > 64) trees.delete(trees.keys().next().value!);
    return result;
  } catch (e) { trees.delete(key);throw e; }
}
async function loadTree(s: GitHubSource, pin?: string): Promise<Tree> {
  const base = `https://api.github.com/repos/${s.owner}/${s.repo}`;
  const ref = pin ?? s.ref ?? (await json(base)).default_branch;
  const commit = await json(`${base}/commits/${encodeURIComponent(ref)}`);
  const data = await json(`${base}/git/trees/${commit.sha}?recursive=1`);
  if (data.truncated) throw Error('Repository is too large to inspect safely. Use a smaller skills repository.');
  return { sha: commit.sha, entries: data.tree.filter((e: Entry) => e.type === 'blob' && e.mode !== '120000' && safePath(e.path)) };
}
export async function searchGitHubSkills(query: string) {
  if (query.trim().length < 2 || query.length > 100) throw Error('Enter 2–100 characters.');
  const data = await json(`https://api.github.com/search/repositories?q=${encodeURIComponent(query.trim() + ' skills in:name,description')}&per_page=8`);
  return data.items.map((r: any) => ({ name: r.full_name, description: r.description ?? '', url: r.html_url }));
}
export async function previewGitHubSkills(source: string, selected?: string, pin?: string) {
  const s = parseGitHubSource(source);const { sha, entries } = await tree(s, pin);
  const requested = s.path.endsWith('SKILL.md') ? s.path : s.path ? s.path + '/' : '';
  const packages = entries.filter(e => /(^|\/)SKILL\.md$/.test(e.path) && (!requested || e.path === requested || e.path.startsWith(requested))).map(e => e.path);
  if (!packages.length) throw Error('No SKILL.md found at this repository path. Existing local Markdown skills remain supported.');
  if (selected && !packages.includes(selected)) throw Error('Select a SKILL.md from this repository.');
  const path = selected ?? (packages.length === 1 ? packages[0] : undefined);
  if (!path) return { source, sha, packages };
  const prefix = path.slice(0, -'SKILL.md'.length);
  const files = entries.filter(e => e.path.startsWith(prefix));
  if (files.length > 100 || files.some(e => (e.size ?? 0) > 2_000_000) || files.reduce((n,e) => n + (e.size ?? 0),0) > 8_000_000) throw Error('Package exceeds the limit (100 files, 2 MB/file, 8 MB total).');
  const body = Buffer.from(await get(rawUrl(s, sha, path), 512_000)).toString('utf8');
  return { source, sha, packages, path, body, files: files.map(e => e.path) };
}
export async function installGitHubSkill(source: string, path: string, sha: string) {
  if (!sha || !path) throw Error('Preview and select a package first.');
  const p = await previewGitHubSkills(source, path, sha);
  if (!p.files || !p.path) throw Error('Select a package.');
  const s = parseGitHubSource(source);const prefix = path.slice(0, -'SKILL.md'.length);
  const id = `github-${s.owner}-${s.repo}-${createHash('sha256').update(path).digest('hex').slice(0, 10)}`;
  const target = join(userSkillsDir(), id);
  if (existsSync(target)) throw Error('This package is already installed.');
  // Download all content before writing. No git hooks, package installers or foreign scripts run.
  const content: { path: string; data: Uint8Array }[] = [];let total = 0;
  for (const file of p.files) {
    const relative = file.slice(prefix.length);if (!safePath(relative)) throw Error('Unsafe package file.');
    const data = await get(rawUrl(s, sha, file));total += data.length;if (total > 8_000_000) throw Error('Package exceeds 8 MB.');content.push({ path: relative, data });
  }
  const stage = join(userSkillsDir(), `.download-${id}-${Date.now()}`);mkdirSync(stage, { recursive: true });
  for (const f of content) { const dest = join(stage, f.path);mkdirSync(dirname(dest), { recursive: true });writeFileSync(dest, f.data); }
  const metadata = { url: source, sha: p.sha, path, installedAt: new Date().toISOString() };
  writeFileSync(join(stage, '.altter-source.json'), JSON.stringify(metadata, null, 2));
  renameSync(stage, target);
  return { id, source: metadata };
}
