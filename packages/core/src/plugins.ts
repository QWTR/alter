// Plugins: MCP servers that give ALTTER's AIs new powers (Higgsfield video/images, Figma, Blender,
// a real browser, GitHub, Notion…). A curated marketplace + "add your own" (URL, command, or the JSON
// from a project's README). Enabled plugins are handed to every chat and agent run.
import { randomUUID } from 'node:crypto';
import { loadConfig, saveConfig } from './config.ts';
import { emit } from './events.ts';
import { detectCli, runProcess } from './providers/process.ts';

export interface McpServer {
  name: string;
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface Plugin {
  id: string;
  /** Tool prefix the AI sees (mcp__<name>__…). */
  name: string;
  title: string;
  catalogId?: string;
  transport: 'http' | 'stdio';
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** Signs in with the service's account in the browser (no key). Registered with the AI apps themselves. */
  oauth?: boolean;
  enabled: boolean;
  addedAt: string;
}

export interface CatalogEntry {
  id: string;
  title: string;
  category: 'create' | 'design' | 'web' | 'dev' | 'work' | 'data';
  icon: string; // lucide icon name used by the UI
  color: string;
  /** Short, in English; the UI shows a translated line when it has one. */
  description: string;
  homepage: string;
  transport: 'http' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  oauth?: boolean;
  /** Keys the user pastes once (stored locally, passed as env vars / headers). */
  keys?: { name: string; label: string; help?: string; header?: string; prefix?: string }[];
  /** Something that must exist first (an app, an add-on). */
  needs?: string;
  popular?: boolean;
}

/** Curated, well-known servers (official ones first). */
export const CATALOG: CatalogEntry[] = [
  { id: 'higgsfield', title: 'Higgsfield', category: 'create', icon: 'Clapperboard', color: '#c6ff3d', description: 'Cinematic AI video and images (Higgsfield models, Kling, Veo, Seedance…) right from the chat. Uses your Higgsfield credits.', homepage: 'https://higgsfield.ai/mcp', transport: 'http', url: 'https://mcp.higgsfield.ai/mcp', oauth: true, popular: true },
  { id: 'figma', title: 'Figma', category: 'design', icon: 'PenTool', color: '#a259ff', description: 'Reads your selected Figma frames (layout, styles, variables) so the AI builds them pixel-perfect. Turn on "Dev Mode MCP server" in the Figma desktop app.', homepage: 'https://help.figma.com/hc/en-us/articles/32132100833559', transport: 'http', url: 'http://127.0.0.1:3845/mcp', needs: 'Figma desktop app → Preferences → Enable Dev Mode MCP server', popular: true },
  { id: 'blender', title: 'Blender', category: 'create', icon: 'Box', color: '#ff7a1a', description: 'Builds and edits 3D scenes in Blender: objects, materials, Poly Haven assets, renders.', homepage: 'https://github.com/ahujasid/blender-mcp', transport: 'stdio', command: 'uvx', args: ['blender-mcp'], needs: 'Blender + the blender-mcp add-on (addon.py) turned on, and uv installed', popular: true },
  { id: 'playwright', title: 'Playwright browser', category: 'web', icon: 'Globe', color: '#2ead33', description: 'A real browser the AI can drive: open pages, click, fill forms, test your sites, take screenshots.', homepage: 'https://github.com/microsoft/playwright-mcp', transport: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'], popular: true },
  { id: 'chrome-devtools', title: 'Chrome DevTools', category: 'web', icon: 'Bug', color: '#4285f4', description: 'Debug pages like a front-end engineer: console, network, performance traces, Lighthouse-style checks.', homepage: 'https://github.com/ChromeDevTools/chrome-devtools-mcp', transport: 'stdio', command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] },
  { id: 'context7', title: 'Context7 docs', category: 'dev', icon: 'BookOpen', color: '#10b981', description: 'Up-to-date docs and code examples for any library, so code uses today\'s APIs.', homepage: 'https://github.com/upstash/context7', transport: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'], popular: true },
  { id: 'github', title: 'GitHub', category: 'dev', icon: 'GitBranch', color: '#e6edf3', description: 'Repos, issues, pull requests, actions and code search on your GitHub.', homepage: 'https://github.com/github/github-mcp-server', transport: 'http', url: 'https://api.githubcopilot.com/mcp/', keys: [{ name: 'GITHUB_TOKEN', label: 'GitHub token', help: 'github.com/settings/personal-access-tokens', header: 'Authorization', prefix: 'Bearer ' }] },
  { id: 'notion', title: 'Notion', category: 'work', icon: 'NotebookPen', color: '#ffffff', description: 'Search, read and write your Notion pages and databases.', homepage: 'https://developers.notion.com/docs/mcp', transport: 'http', url: 'https://mcp.notion.com/mcp', oauth: true },
  { id: 'firecrawl', title: 'Firecrawl', category: 'web', icon: 'Flame', color: '#ff6b2b', description: 'Scrape and crawl whole websites into clean Markdown / data, with search.', homepage: 'https://github.com/firecrawl/firecrawl-mcp-server', transport: 'stdio', command: 'npx', args: ['-y', 'firecrawl-mcp'], keys: [{ name: 'FIRECRAWL_API_KEY', label: 'Firecrawl API key', help: 'firecrawl.dev/app/api-keys' }] },
  { id: 'elevenlabs', title: 'ElevenLabs', category: 'create', icon: 'AudioLines', color: '#f5f5f5', description: 'Voice-overs, cloned voices, sound effects and transcription.', homepage: 'https://github.com/elevenlabs/elevenlabs-mcp', transport: 'stdio', command: 'uvx', args: ['elevenlabs-mcp'], keys: [{ name: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API key', help: 'elevenlabs.io/app/settings/api-keys' }], needs: 'uv installed' },
  { id: 'supabase', title: 'Supabase', category: 'data', icon: 'Database', color: '#3ecf8e', description: 'Your Supabase projects: tables, SQL, migrations, edge functions, logs.', homepage: 'https://github.com/supabase-community/supabase-mcp', transport: 'stdio', command: 'npx', args: ['-y', '@supabase/mcp-server-supabase@latest'], keys: [{ name: 'SUPABASE_ACCESS_TOKEN', label: 'Supabase access token', help: 'supabase.com/dashboard/account/tokens' }] },
  { id: 'sequential-thinking', title: 'Sequential thinking', category: 'dev', icon: 'ListTree', color: '#8b74ff', description: 'Helps the AI break big problems into steps and revise its plan.', homepage: 'https://github.com/modelcontextprotocol/servers', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'plugin';

export function listPlugins(): Plugin[] {
  return ((loadConfig() as any).plugins ?? []) as Plugin[];
}
function save(list: Plugin[]) {
  (loadConfig() as any).plugins = list;
  saveConfig();
  emit('plugins.changed', {});
}
/** What the UI sees: secrets masked. */
export function publicPlugins() {
  return listPlugins().map((p) => ({
    ...p,
    env: p.env ? Object.fromEntries(Object.keys(p.env).map((k) => [k, '••••'])) : undefined,
    headers: p.headers ? Object.fromEntries(Object.keys(p.headers).map((k) => [k, '••••'])) : undefined,
  }));
}

function uniqueName(base: string, list: Plugin[]) {
  let n = slug(base).replace(/-/g, '_');
  let i = 2;
  while (list.some((p) => p.name === n)) n = `${slug(base).replace(/-/g, '_')}_${i++}`;
  return n;
}

/** Registers a sign-in (OAuth) server with the AI apps, so they keep its login themselves. */
async function registerOauth(p: Plugin, remove = false) {
  if (!p.oauth || !p.url) return;
  const jobs: Promise<unknown>[] = [];
  if ((await detectCli('claude')).installed)
    jobs.push(runProcess('claude', remove ? ['mcp', 'remove', '--scope', 'user', p.name] : ['mcp', 'add', '--scope', 'user', '--transport', 'http', p.name, p.url], { timeoutMs: 30_000 }).catch(() => null));
  if ((await detectCli('codex')).installed)
    jobs.push(runProcess('codex', remove ? ['mcp', 'remove', p.name] : ['mcp', 'add', p.name, '--url', p.url], { timeoutMs: 30_000 }).catch(() => null));
  await Promise.all(jobs);
}

export async function installFromCatalog(id: string, keys: Record<string, string> = {}): Promise<Plugin> {
  const c = CATALOG.find((x) => x.id === id);
  if (!c) throw new Error('Unknown plugin');
  const list = listPlugins();
  const env: Record<string, string> = {};
  const headers: Record<string, string> = {};
  for (const k of c.keys ?? []) {
    const v = String(keys[k.name] ?? '').trim();
    if (!v) throw new Error(`${k.label} is needed`);
    if (k.header) headers[k.header] = (k.prefix ?? '') + v;
    else env[k.name] = v;
  }
  const p: Plugin = {
    id: randomUUID(),
    name: uniqueName(c.id, list),
    title: c.title,
    catalogId: c.id,
    transport: c.transport,
    url: c.url,
    command: c.command,
    args: c.args,
    env: Object.keys(env).length ? env : undefined,
    headers: Object.keys(headers).length ? headers : undefined,
    oauth: c.oauth,
    enabled: true,
    addedAt: new Date().toISOString(),
  };
  save([...list, p]);
  await registerOauth(p);
  warmUp(p);
  return p;
}

/**
 * Your own plugin: an https URL, a command line ("npx -y some-mcp"), or the JSON block from a README
 * ({"mcpServers": {"name": {"command": …}}} or a single server object).
 */
export async function installCustom(input: { title?: string; source: string; oauth?: boolean }): Promise<Plugin[]> {
  const src = input.source.trim();
  if (!src) throw new Error('Paste a URL, a command or the JSON from the plugin\'s README');
  const list = listPlugins();
  const made: Plugin[] = [];
  const add = (title: string, s: Partial<McpServer> & { type?: string; serverUrl?: string }) => {
    const url = s.url ?? s.serverUrl;
    const p: Plugin = {
      id: randomUUID(),
      name: uniqueName(title, [...list, ...made]),
      title,
      transport: url ? 'http' : 'stdio',
      url,
      headers: s.headers,
      command: s.command,
      args: s.args?.map(String),
      env: s.env,
      oauth: !!url && !s.headers && !!input.oauth,
      enabled: true,
      addedAt: new Date().toISOString(),
    };
    if (!p.url && !p.command) throw new Error('No URL or command found');
    if (p.url && !/^https?:\/\//i.test(p.url)) throw new Error('The URL must start with https://');
    made.push(p);
  };
  if (src.startsWith('{')) {
    let j: any;
    try { j = JSON.parse(src); } catch { throw new Error('That JSON is not valid'); }
    const servers = j.mcpServers ?? j.servers ?? (j.command || j.url ? { [input.title || 'plugin']: j } : j);
    for (const [k, v] of Object.entries(servers ?? {})) if (v && typeof v === 'object') add(k, v as any);
  } else if (/^https?:\/\//i.test(src)) {
    add(input.title || new URL(src).hostname.replace(/^(www|mcp|api)\./, '').split('.')[0], { url: src });
  } else {
    const parts = src.match(/"[^"]*"|'[^']*'|\S+/g)?.map((x) => x.replace(/^["']|["']$/g, '')) ?? [];
    const [command, ...args] = parts;
    const pkg = args.find((a) => !a.startsWith('-')) ?? command;
    add(input.title || pkg.replace(/^@[^/]+\//, '').replace(/@.*$/, '').replace(/-?mcp(-server)?$/i, '') || 'plugin', { command, args });
  }
  if (!made.length) throw new Error('No server found in that text');
  save([...list, ...made]);
  for (const p of made) { await registerOauth(p); warmUp(p); }
  return made;
}

export function setPluginEnabled(id: string, enabled: boolean) {
  const list = listPlugins();
  const p = list.find((x) => x.id === id);
  if (!p) throw new Error('Plugin not found');
  p.enabled = enabled;
  save(list);
}

export async function removePlugin(id: string) {
  const list = listPlugins();
  const p = list.find((x) => x.id === id);
  if (!p) return;
  save(list.filter((x) => x.id !== id));
  await registerOauth(p, true);
}

/** First npx/uvx run downloads the package — do it now, not in the middle of the user's first chat. */
function warmUp(p: Plugin) {
  if (p.transport !== 'stdio' || !p.command || !/^(npx|uvx)$/i.test(p.command)) return;
  const pkg = p.args?.find((a) => !a.startsWith('-'));
  if (!pkg) return;
  emit('plugins.progress', { id: p.id, stage: 'download' });
  const done = () => emit('plugins.progress', { id: p.id, stage: 'ready' });
  if (/^npx$/i.test(p.command)) runProcess('npm', ['exec', '--yes', '--package', pkg, '--', 'node', '-e', '0'], { timeoutMs: 300_000 }).then(done, done);
  else runProcess('uv', ['tool', 'install', pkg], { timeoutMs: 300_000 }).then(done, done);
}

/** The servers handed to each AI run (sign-in ones are already registered with the AI apps). */
export function pluginServers(): McpServer[] {
  return listPlugins()
    .filter((p) => p.enabled && !p.oauth)
    .map((p) => (p.transport === 'http' ? { name: p.name, url: p.url, headers: p.headers } : { name: p.name, command: p.command, args: p.args ?? [], env: p.env }));
}
/** Tool names for the allow-list (incl. sign-in plugins, which aren't in pluginServers()). */
export const pluginTools = () => listPlugins().filter((p) => p.enabled).map((p) => `mcp__${p.name}__*`);

/** A short line in the prompt so the AI knows what it can use. */
export function pluginsGuide(): string {
  const on = listPlugins().filter((p) => p.enabled);
  if (!on.length) return '';
  return `## Plugins you can use (MCP tools)\n${on.map((p) => {
    const c = CATALOG.find((x) => x.id === p.catalogId);
    return `- ${p.title} (tools mcp__${p.name}__…)${c ? `: ${c.description}` : ''}`;
  }).join('\n')}\nUse them when they fit the task; if one is not connected or fails, say so in one line and continue.`;
}
