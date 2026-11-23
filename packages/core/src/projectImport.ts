// Bring an existing project into ALTTER: a folder on disk or a link (git repository / website),
// then let the AI look through it once and write a short overview that every chat in the project reuses.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { LANGUAGE_NAMES, loadConfig, projectsDir } from './config.ts';
import { emit } from './events.ts';
import { learnFrom } from './learning.ts';
import { addMemory } from './memory.ts';
import { createProject, getProject, listProjects, updateProject, type Project } from './projects.ts';
import { resolveProvider } from './providers/index.ts';

const GIT_RE = /^(https?:\/\/|git@)[^\s]+?(\.git)?\/?$/i;
const REPO_HOSTS = /github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|\.git$/i;

function run(cmd: string, args: string[], cwd?: string): Promise<{ code: number; err: string }> {
  return new Promise((res) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true, shell: process.platform === 'win32' });
    let err = '';
    child.stderr?.on('data', (d) => (err += d));
    child.on('error', (e) => res({ code: -1, err: e.message }));
    child.on('close', (code) => res({ code: code ?? -1, err }));
  });
}

const nameFromUrl = (url: string) => basename(url.replace(/\.git\/?$/, '').replace(/\/+$/, '')) || 'project';

export async function importProject(input: { source: string; name?: string; color?: string; icon?: string }): Promise<Project> {
  const source = input.source.trim().replace(/^"(.*)"$/, '$1');
  if (!source) throw new Error('Give a folder path or a link');
  // the same folder / link again → the existing project (no duplicates)
  const norm = (x: string) => x.replace(/[\\/]+$/, '').toLowerCase();
  const existing = listProjects().find((p) => (p.folder && norm(p.folder) === norm(source)) || norm(p.description) === norm(source));
  if (existing) return existing;
  let project: Project;

  if (existsSync(source) && statSync(source).isDirectory()) {
    project = createProject({ name: input.name?.trim() || basename(source) || 'Project', folder: source, color: input.color, icon: input.icon ?? 'code', description: '' });
  } else if (GIT_RE.test(source) && REPO_HOSTS.test(source)) {
    const name = input.name?.trim() || nameFromUrl(source);
    let folder = join(projectsDir(), name.replace(/[^\w.-]+/g, '-'));
    for (let i = 2; existsSync(folder); i++) folder = `${folder.replace(/-\d+$/, '')}-${i}`;
    const r = await run('git', ['clone', '--depth', '1', source, folder]);
    if (r.code !== 0) throw new Error(r.code === -1 ? 'Git is not installed on this computer' : r.err.trim().split(/\r?\n/).pop() || 'git clone failed');
    project = createProject({ name, folder, color: input.color, icon: input.icon ?? 'code', description: source });
  } else if (/^https?:\/\//i.test(source)) {
    // a website / docs / design link: the project keeps the link and the AI reads it on the web
    project = createProject({ name: input.name?.trim() || new URL(source).hostname, color: input.color, icon: input.icon ?? 'globe', description: source, instructions: `Main link: ${source}` });
  } else {
    throw new Error('That folder does not exist and it is not a link');
  }

  scanProject(project.id).catch(() => {});
  return project;
}

/** A cheap file tree (no contents) so the AI does not have to explore blindly — saves tokens. */
function tree(dir: string, depth = 0, out: string[] = [], budget = { n: 0 }): string[] {
  if (depth > 2 || budget.n > 160) return out;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir).filter((e) => !/^(\.git|node_modules|dist|build|\.next|\.venv|venv|__pycache__|target|\.cache)$/.test(e));
  } catch {
    return out;
  }
  for (const e of entries.slice(0, 40)) {
    budget.n++;
    let isDir = false;
    try {
      isDir = statSync(join(dir, e)).isDirectory();
    } catch {}
    out.push(`${'  '.repeat(depth)}${e}${isDir ? '/' : ''}`);
    if (isDir) tree(join(dir, e), depth + 1, out, budget);
  }
  return out;
}

const SCAN_PROMPT = `You are onboarding onto a project so you can help with it later.
Look through the project (README, manifest/config files, the main source folders — open only what you need).
Then reply with a compact overview in Markdown, max 200 words, in {LANG}:
- **What it is** (1–2 sentences)
- **Stack** (languages, frameworks, key libraries)
- **Structure** (the few folders/files that matter)
- **How to run / build** (exact commands if present)
- **Notes** (anything unusual: deployment, env vars, TODOs)
No preamble.`;

// Scans run one after another in the background (several folders/links added at once, e.g. during setup).
let scanQueue: Promise<unknown> = Promise.resolve();
export function scanProject(id: string): Promise<Project | undefined> {
  emit('project.scan', { id, status: 'running' });
  const job = scanQueue.then(() => doScan(id));
  scanQueue = job.catch(() => {});
  return job;
}

async function doScan(id: string): Promise<Project | undefined> {
  const p = getProject(id);
  if (!p) return;
  emit('project.scan', { id, status: 'running' });
  try {
    const provider = await resolveProvider('default', { avoidLimited: true });
    const link = /^https?:\/\//.test(p.description) ? `\nProject link: ${p.description}` : '';
    const files = existsSync(p.folder) ? tree(p.folder).join('\n') : '';
    const prompt = `${SCAN_PROMPT.replace('{LANG}', LANGUAGE_NAMES[loadConfig().language] ?? 'English')}${link}\n\n## File tree\n${files || '(empty folder — rely on the link)'}`;
    const { text } = await provider.run({ prompt, access: 'read', cwd: p.folder, fast: false, timeoutMs: 8 * 60_000 });
    const overview = text.trim();
    const instructions = [p.instructions.replace(/<!-- alter:overview -->[\s\S]*<!-- \/alter:overview -->/, '').trim(), `<!-- alter:overview -->\n${overview}\n<!-- /alter:overview -->`].filter(Boolean).join('\n\n');
    const next = updateProject(id, { instructions, description: p.description || overview.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.replace(/[*_-]/g, '').trim().slice(0, 140) });
    addMemory({ kind: 'project', content: `Project "${p.name}": ${overview.replace(/\s+/g, ' ').slice(0, 300)}`, importance: 3, source: 'scan', projectId: id });
    // what someone works on says a lot about them: let the memory learn who the user is from it
    learnFrom(`The user works on this project ("${p.name}"${p.description && /^https?:/.test(p.description) ? `, ${p.description}` : ''}). Overview:
${overview}`, `scan:${id}`, null);
    emit('project.scan', { id, status: 'done' });
    return next;
  } catch (err) {
    emit('project.scan', { id, status: 'error', error: (err as Error).message });
  }
}

/** Native folder picker on the computer running ALTTER (Windows), so nobody has to type paths. */
export function pickFolder(): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const ps = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.ShowNewFolderButton = $true; $f = New-Object System.Windows.Forms.Form; $f.TopMost = $true; if ($d.ShowDialog($f) -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; Write-Output $d.SelectedPath }`;
  return new Promise((res) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', () => res(out.trim() || null));
    child.on('error', () => res(null));
  });
}
