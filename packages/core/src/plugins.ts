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
  category: 'office' | 'tasks' | 'meet' | 'sales' | 'finance' | 'commerce' | 'hr' | 'auto' | 'create' | 'design' | 'web' | 'dev' | 'data';
  icon: string; // lucide icon name used by the UI
  color: string;
  /** Short, in English; the UI shows a translated line when it has one. */
  description: string;
  homepage: string;
  transport: 'http' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  /** Fixed env vars for a local server. */
  env?: Record<string, string>;
  /** A local server that signs in with its own command (device code): these args are added to it and run in a window. */
  login?: string[];
  /** One line for the AI about using it. */
  guide?: string;
  oauth?: boolean;
  /** Keys the user pastes once (stored locally, passed as env vars / headers). */
  keys?: { name: string; label: string; help?: string; header?: string; prefix?: string }[];
  /** Something that must exist first (an app, an add-on). */
  needs?: string;
  popular?: boolean;
}

/** Curated, well-known servers (official ones first). */
export const CATALOG: CatalogEntry[] = [
  // ---- office: mail, calendar, files ----
  { id: 'microsoft-365', title: 'Microsoft 365 / Outlook', category: 'office', icon: 'Mail', color: '#0a78d4', description: 'Outlook mail, calendar and contacts, OneDrive, Excel, OneNote and To Do: read, search, write drafts, add events. For personal Microsoft accounts (outlook.com, hotmail, live).', homepage: 'https://github.com/Softeria/ms-365-mcp-server', transport: 'stdio', command: 'npx', args: ['-y', '@softeria/ms-365-mcp-server'], env: { MS365_MCP_TENANT_ID: 'consumers' }, login: ['--login'], guide: 'If a Microsoft tool says you are not signed in, call its login tool and show the user the link and code from it.', popular: true },
  { id: 'microsoft-365-work', title: 'Microsoft 365 for work', category: 'office', icon: 'Briefcase', color: '#5b5fc7', description: 'Work or school Microsoft account: Outlook, calendar, Teams chats and channels, SharePoint, OneDrive, Excel, Planner. Your organisation may need to approve the app once.', homepage: 'https://github.com/Softeria/ms-365-mcp-server', transport: 'stdio', command: 'npx', args: ['-y', '@softeria/ms-365-mcp-server', '--org-mode'], login: ['--login'], guide: 'If a Microsoft tool says you are not signed in, call its login tool and show the user the link and code from it.', popular: true },
  { id: 'google-rube', title: 'Google Workspace', category: 'office', icon: 'Calendar', color: '#4285f4', description: 'Gmail, Google Calendar, Drive, Docs, Sheets and Meet, plus 500 other apps, through Rube (by Composio): sign in once, then connect each Google app when the AI first needs it.', homepage: 'https://rube.app', transport: 'http', url: 'https://rube.app/mcp', oauth: true, popular: true },
  { id: 'dropbox', title: 'Dropbox', category: 'office', icon: 'FolderOpen', color: '#0061fe', description: 'Find, read and organise files in your Dropbox.', homepage: 'https://www.dropbox.com', transport: 'http', url: 'https://mcp.dropbox.com/mcp', oauth: true },
  { id: 'box', title: 'Box', category: 'office', icon: 'HardDrive', color: '#0061d5', description: 'Search and read documents stored in Box, ask questions about them.', homepage: 'https://developer.box.com/guides/box-mcp/', transport: 'http', url: 'https://mcp.box.com', oauth: true },
  { id: 'egnyte', title: 'Egnyte', category: 'office', icon: 'HardDrive', color: '#00a3e0', description: 'Company files in Egnyte: search, read, summarise.', homepage: 'https://www.egnyte.com', transport: 'http', url: 'https://mcp-server.egnyte.com/mcp', oauth: true },
  { id: 'calendly', title: 'Calendly', category: 'office', icon: 'Calendar', color: '#006bff', description: 'Your booking links, scheduled meetings and availability.', homepage: 'https://calendly.com', transport: 'http', url: 'https://mcp.calendly.com', oauth: true },
  // ---- tasks & projects ----
  { id: 'notion', title: 'Notion', category: 'tasks', icon: 'NotebookPen', color: '#ffffff', description: 'Search, read and write your Notion pages and databases.', homepage: 'https://developers.notion.com/docs/mcp', transport: 'http', url: 'https://mcp.notion.com/mcp', oauth: true, popular: true },
  { id: 'asana', title: 'Asana', category: 'tasks', icon: 'ListChecks', color: '#f06a6a', description: 'Tasks, projects and goals in Asana: create, update, report.', homepage: 'https://developers.asana.com/docs/using-asanas-mcp-server', transport: 'http', url: 'https://mcp.asana.com/v2/mcp', oauth: true },
  { id: 'atlassian', title: 'Jira & Confluence', category: 'tasks', icon: 'Kanban', color: '#0c66e4', description: 'Jira issues and sprints, Confluence pages: search, create, update (Atlassian Cloud).', homepage: 'https://www.atlassian.com/platform/remote-mcp-server', transport: 'http', url: 'https://mcp.atlassian.com/v1/mcp', oauth: true, popular: true },
  { id: 'trello', title: 'Trello', category: 'tasks', icon: 'Kanban', color: '#0079bf', description: 'Boards, lists and cards in Trello.', homepage: 'https://trello.com', transport: 'http', url: 'https://mcp.trello.com/v1', oauth: true },
  { id: 'monday', title: 'monday.com', category: 'tasks', icon: 'LayoutGrid', color: '#ff3d57', description: 'Boards, items, updates and dashboards in monday.com.', homepage: 'https://monday.com', transport: 'http', url: 'https://mcp.monday.com/mcp', oauth: true },
  { id: 'clickup', title: 'ClickUp', category: 'tasks', icon: 'ListChecks', color: '#7b68ee', description: 'Tasks, docs, time tracking and chat in ClickUp.', homepage: 'https://clickup.com', transport: 'http', url: 'https://mcp.clickup.com/mcp', oauth: true },
  { id: 'linear', title: 'Linear', category: 'tasks', icon: 'ListChecks', color: '#5e6ad2', description: 'Issues, projects and cycles in Linear.', homepage: 'https://linear.app/docs/mcp', transport: 'http', url: 'https://mcp.linear.app/mcp', oauth: true },
  { id: 'todoist', title: 'Todoist', category: 'tasks', icon: 'ListChecks', color: '#e44332', description: 'Your to-do lists: add, plan and close tasks.', homepage: 'https://todoist.com', transport: 'http', url: 'https://ai.todoist.net/mcp', oauth: true },
  { id: 'ticktick', title: 'TickTick', category: 'tasks', icon: 'ListChecks', color: '#4772fa', description: 'Tasks, lists and habits in TickTick.', homepage: 'https://ticktick.com', transport: 'http', url: 'https://mcp.ticktick.com', oauth: true },
  { id: 'akiflow', title: 'Akiflow', category: 'tasks', icon: 'Calendar', color: '#a26bfa', description: 'Inbox, tasks and time-blocking across your calendars.', homepage: 'https://akiflow.com', transport: 'http', url: 'https://mcp.akiflow.com/mcp', oauth: true },
  { id: 'teamwork', title: 'Teamwork.com', category: 'tasks', icon: 'Users', color: '#4461d7', description: 'Client projects, tasks and time in Teamwork.com.', homepage: 'https://teamwork.com', transport: 'http', url: 'https://mcp.ai.teamwork.com', oauth: true },
  { id: 'meistertask', title: 'MeisterTask', category: 'tasks', icon: 'Kanban', color: '#36b37e', description: 'Projects and tasks in MeisterTask.', homepage: 'https://www.meistertask.com', transport: 'http', url: 'https://mcp.meistertask.com/mcp', oauth: true },
  { id: 'airtable', title: 'Airtable', category: 'tasks', icon: 'Table', color: '#fcb400', description: 'Bases, tables and records in Airtable.', homepage: 'https://airtable.com', transport: 'http', url: 'https://mcp.airtable.com/mcp', oauth: true },
  { id: 'coda', title: 'Coda', category: 'tasks', icon: 'FileText', color: '#f46a54', description: 'Docs, tables and automations in Coda.', homepage: 'https://coda.io', transport: 'http', url: 'https://coda.io/apis/mcp', oauth: true },
  // ---- chat & meetings ----
  { id: 'slack', title: 'Slack', category: 'meet', icon: 'MessagesSquare', color: '#e01e5a', description: 'Search channels and threads, read and send messages, summarise what you missed.', homepage: 'https://slack.com', transport: 'http', url: 'https://mcp.slack.com/mcp', oauth: true, popular: true },
  { id: 'zoom', title: 'Zoom', category: 'meet', icon: 'Video', color: '#0b5cff', description: 'Meetings, recordings and AI summaries from Zoom.', homepage: 'https://zoom.us', transport: 'http', url: 'https://mcp.zoom.us/mcp/zoom/streamable', oauth: true },
  { id: 'fireflies', title: 'Fireflies.ai', category: 'meet', icon: 'Mic', color: '#7a2ff2', description: 'Meeting transcripts, notes and action items.', homepage: 'https://fireflies.ai', transport: 'http', url: 'https://api.fireflies.ai/mcp', oauth: true },
  { id: 'granola', title: 'Granola', category: 'meet', icon: 'Mic', color: '#8bc34a', description: 'Your meeting notes from Granola.', homepage: 'https://granola.ai', transport: 'http', url: 'https://mcp.granola.ai/mcp', oauth: true },
  { id: 'fathom', title: 'Fathom', category: 'meet', icon: 'Mic', color: '#00c389', description: 'Recorded calls, summaries and highlights from Fathom.', homepage: 'https://fathom.video', transport: 'http', url: 'https://api.fathom.ai/mcp', oauth: true },
  { id: 'otter', title: 'Otter.ai', category: 'meet', icon: 'Mic', color: '#3a7ff6', description: 'Meeting transcripts and summaries from Otter.', homepage: 'https://otter.ai', transport: 'http', url: 'https://mcp.otter.ai/mcp', oauth: true },
  { id: 'readai', title: 'Read AI', category: 'meet', icon: 'Mic', color: '#2f6bff', description: 'Meeting reports, transcripts and action items from Read AI.', homepage: 'https://read.ai', transport: 'http', url: 'https://api.read.ai/mcp', oauth: true },
  { id: 'tldv', title: 'tl;dv', category: 'meet', icon: 'Video', color: '#6c5ce7', description: 'Recorded Meet / Zoom / Teams calls and their notes.', homepage: 'https://tldv.io', transport: 'http', url: 'https://mcp.tldv.io/mcp', oauth: true },
  { id: 'intercom', title: 'Intercom', category: 'meet', icon: 'Headphones', color: '#1f8ded', description: 'Customer conversations and support tickets in Intercom.', homepage: 'https://www.intercom.com', transport: 'http', url: 'https://mcp.intercom.com/sse', oauth: true },
  // ---- sales, marketing & finance ----
  { id: 'hubspot', title: 'HubSpot', category: 'sales', icon: 'Users', color: '#ff7a59', description: 'Contacts, companies, deals and tickets in HubSpot CRM.', homepage: 'https://developers.hubspot.com/mcp', transport: 'http', url: 'https://mcp.hubspot.com', oauth: true, popular: true },
  { id: 'pipedrive', title: 'Pipedrive', category: 'sales', icon: 'Users', color: '#3c8c5a', description: 'Deals, pipeline and activities in Pipedrive.', homepage: 'https://www.pipedrive.com', transport: 'http', url: 'https://mcp.pipedrive.ai/mcp', oauth: true },
  { id: 'attio', title: 'Attio', category: 'sales', icon: 'Users', color: '#7c8cff', description: 'Records, lists and notes in the Attio CRM.', homepage: 'https://attio.com', transport: 'http', url: 'https://mcp.attio.com/mcp', oauth: true },
  { id: 'klaviyo', title: 'Klaviyo', category: 'sales', icon: 'Megaphone', color: '#9fe870', description: 'Email and SMS campaigns, flows and their results.', homepage: 'https://www.klaviyo.com', transport: 'http', url: 'https://mcp.klaviyo.com/mcp', oauth: true },
  { id: 'pandadoc', title: 'PandaDoc', category: 'sales', icon: 'FileText', color: '#25b67d', description: 'Proposals, quotes and contracts to e-sign.', homepage: 'https://www.pandadoc.com', transport: 'http', url: 'https://mcp.pandadoc.com/v1/mcp', oauth: true },
  { id: 'stripe', title: 'Stripe', category: 'sales', icon: 'CreditCard', color: '#635bff', description: 'Payments, customers, invoices and subscriptions in Stripe.', homepage: 'https://docs.stripe.com/mcp', transport: 'http', url: 'https://mcp.stripe.com', oauth: true },
  { id: 'paypal', title: 'PayPal', category: 'sales', icon: 'CreditCard', color: '#2c7be5', description: 'Invoices, orders and transactions in PayPal.', homepage: 'https://developer.paypal.com', transport: 'http', url: 'https://mcp.paypal.com', oauth: true },
  { id: 'square', title: 'Square', category: 'sales', icon: 'Store', color: '#b8b8b8', description: 'Sales, catalog, orders and customers in Square.', homepage: 'https://developer.squareup.com', transport: 'http', url: 'https://mcp.squareup.com/sse', oauth: true },
  // ---- automation hubs ----
  { id: 'zapier', title: 'Zapier', category: 'auto', icon: 'Zap', color: '#ff4f00', description: '8 000+ apps through Zapier actions: choose which actions the AI may use in your Zapier MCP settings.', homepage: 'https://zapier.com/mcp', transport: 'http', url: 'https://mcp.zapier.com/api/mcp/mcp', oauth: true, popular: true },
  { id: 'make', title: 'Make', category: 'auto', icon: 'Workflow', color: '#a35cff', description: 'Run your Make scenarios as tools.', homepage: 'https://www.make.com', transport: 'http', url: 'https://mcp.make.com', oauth: true },
  { id: 'composio', title: 'Composio', category: 'auto', icon: 'Workflow', color: '#9b8cff', description: 'Hundreds of apps (Google, Microsoft, Salesforce…) behind one connection.', homepage: 'https://composio.dev', transport: 'http', url: 'https://connect.composio.dev/mcp', oauth: true },
  // ---- design & content ----
  { id: 'canva', title: 'Canva', category: 'design', icon: 'Palette', color: '#00c4cc', description: 'Create and edit Canva designs, search your designs, export them.', homepage: 'https://www.canva.dev/docs/connect/canva-mcp-server-setup/', transport: 'http', url: 'https://mcp.canva.com/mcp', oauth: true, popular: true },
  { id: 'gamma', title: 'Gamma', category: 'design', icon: 'Presentation', color: '#7b3fe4', description: 'Presentations, documents and web pages generated in Gamma.', homepage: 'https://gamma.app', transport: 'http', url: 'https://mcp.gamma.app/mcp', oauth: true },
  { id: 'miro', title: 'Miro', category: 'design', icon: 'Shapes', color: '#ffd02f', description: 'Read and build Miro boards: stickies, diagrams, frames.', homepage: 'https://miro.com', transport: 'http', url: 'https://mcp.miro.com/', oauth: true },
  { id: 'lucid', title: 'Lucid', category: 'design', icon: 'Shapes', color: '#f96b13', description: 'Diagrams and whiteboards in Lucidchart and Lucidspark.', homepage: 'https://lucid.co', transport: 'http', url: 'https://mcp.lucid.app/mcp', oauth: true },
  { id: 'whimsical', title: 'Whimsical', category: 'design', icon: 'Shapes', color: '#7b61ff', description: 'Flowcharts, wireframes and mind maps in Whimsical.', homepage: 'https://whimsical.com', transport: 'http', url: 'https://mcp.whimsical.com/mcp', oauth: true },
  { id: 'webflow', title: 'Webflow', category: 'web', icon: 'Globe', color: '#146ef5', description: 'Pages, CMS collections and publishing on your Webflow sites.', homepage: 'https://developers.webflow.com/mcp', transport: 'http', url: 'https://mcp.webflow.com/mcp', oauth: true },
  { id: 'wix', title: 'Wix', category: 'web', icon: 'Globe', color: '#116dff', description: 'Your Wix sites: pages, store, bookings, blog.', homepage: 'https://www.wix.com', transport: 'http', url: 'https://mcp.wix.com/mcp', oauth: true },
  // ---- dev & data extras ----
  { id: 'sentry', title: 'Sentry', category: 'dev', icon: 'Bug', color: '#7553ff', description: 'Errors, issues and performance from Sentry.', homepage: 'https://docs.sentry.io/product/sentry-mcp/', transport: 'http', url: 'https://mcp.sentry.dev/sse', oauth: true },
  { id: 'vercel', title: 'Vercel', category: 'dev', icon: 'Server', color: '#ededed', description: 'Deployments, logs and projects on Vercel.', homepage: 'https://vercel.com/docs/mcp', transport: 'http', url: 'https://mcp.vercel.com', oauth: true },
  { id: 'neon', title: 'Neon Postgres', category: 'data', icon: 'Database', color: '#00e599', description: 'Neon Postgres projects, branches and SQL.', homepage: 'https://neon.tech/docs/ai/neon-mcp-server', transport: 'http', url: 'https://mcp.neon.tech/mcp', oauth: true },
  { id: 'higgsfield', title: 'Higgsfield', category: 'create', icon: 'Clapperboard', color: '#c6ff3d', description: 'Cinematic AI video and images (Higgsfield models, Kling, Veo, Seedance…) right from the chat. Uses your Higgsfield credits.', homepage: 'https://higgsfield.ai/mcp', transport: 'http', url: 'https://mcp.higgsfield.ai/mcp', oauth: true, popular: true },
  { id: 'figma', title: 'Figma', category: 'design', icon: 'PenTool', color: '#a259ff', description: 'Reads your selected Figma frames (layout, styles, variables) so the AI builds them pixel-perfect. Turn on "Dev Mode MCP server" in the Figma desktop app.', homepage: 'https://help.figma.com/hc/en-us/articles/32132100833559', transport: 'http', url: 'http://127.0.0.1:3845/mcp', needs: 'Figma desktop app → Preferences → Enable Dev Mode MCP server', popular: true },
  { id: 'blender', title: 'Blender', category: 'create', icon: 'Box', color: '#ff7a1a', description: 'Builds and edits 3D scenes in Blender: objects, materials, Poly Haven assets, renders.', homepage: 'https://github.com/ahujasid/blender-mcp', transport: 'stdio', command: 'uvx', args: ['blender-mcp'], needs: 'Blender + the blender-mcp add-on (addon.py) turned on, and uv installed', popular: true },
  { id: 'playwright', title: 'Playwright browser', category: 'web', icon: 'Globe', color: '#2ead33', description: 'A real browser the AI can drive: open pages, click, fill forms, test your sites, take screenshots.', homepage: 'https://github.com/microsoft/playwright-mcp', transport: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'], popular: true },
  { id: 'chrome-devtools', title: 'Chrome DevTools', category: 'web', icon: 'Bug', color: '#4285f4', description: 'Debug pages like a front-end engineer: console, network, performance traces, Lighthouse-style checks.', homepage: 'https://github.com/ChromeDevTools/chrome-devtools-mcp', transport: 'stdio', command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] },
  { id: 'context7', title: 'Context7 docs', category: 'dev', icon: 'BookOpen', color: '#10b981', description: 'Up-to-date docs and code examples for any library, so code uses today\'s APIs.', homepage: 'https://github.com/upstash/context7', transport: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'], popular: true },
  { id: 'github', title: 'GitHub', category: 'dev', icon: 'GitBranch', color: '#e6edf3', description: 'Repos, issues, pull requests, actions and code search on your GitHub.', homepage: 'https://github.com/github/github-mcp-server', transport: 'http', url: 'https://api.githubcopilot.com/mcp/', keys: [{ name: 'GITHUB_TOKEN', label: 'GitHub token', help: 'github.com/settings/personal-access-tokens', header: 'Authorization', prefix: 'Bearer ' }] },
  { id: 'firecrawl', title: 'Firecrawl', category: 'web', icon: 'Flame', color: '#ff6b2b', description: 'Scrape and crawl whole websites into clean Markdown / data, with search.', homepage: 'https://github.com/firecrawl/firecrawl-mcp-server', transport: 'stdio', command: 'npx', args: ['-y', 'firecrawl-mcp'], keys: [{ name: 'FIRECRAWL_API_KEY', label: 'Firecrawl API key', help: 'firecrawl.dev/app/api-keys' }] },
  { id: 'elevenlabs', title: 'ElevenLabs', category: 'create', icon: 'AudioLines', color: '#f5f5f5', description: 'Voice-overs, cloned voices, sound effects and transcription.', homepage: 'https://github.com/elevenlabs/elevenlabs-mcp', transport: 'stdio', command: 'uvx', args: ['elevenlabs-mcp'], keys: [{ name: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API key', help: 'elevenlabs.io/app/settings/api-keys' }], needs: 'uv installed' },
  { id: 'supabase', title: 'Supabase', category: 'data', icon: 'Database', color: '#3ecf8e', description: 'Your Supabase projects: tables, SQL, migrations, edge functions, logs.', homepage: 'https://github.com/supabase-community/supabase-mcp', transport: 'stdio', command: 'npx', args: ['-y', '@supabase/mcp-server-supabase@latest'], keys: [{ name: 'SUPABASE_ACCESS_TOKEN', label: 'Supabase access token', help: 'supabase.com/dashboard/account/tokens' }] },
  { id: 'sequential-thinking', title: 'Sequential thinking', category: 'dev', icon: 'ListTree', color: '#8b74ff', description: 'Helps the AI break big problems into steps and revise its plan.', homepage: 'https://github.com/modelcontextprotocol/servers', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
  // business: invoicing, shops, couriers, support, HR, messaging, data
  { id: 'infakt', title: 'inFakt', category: 'finance', icon: 'Receipt', color: '#1bb46e', description: 'Invoices, costs and accounting in inFakt: read them and (with your consent) issue and send sales invoices.', homepage: 'https://www.infakt.pl', transport: 'http', url: 'https://api.infakt.pl/mcp', oauth: true, popular: true },
  { id: 'ifirma', title: 'iFirma', category: 'finance', icon: 'Receipt', color: '#e30613', description: 'Issue and send invoices (also through KSeF), record expenses, manage contractors and payments in iFirma.', homepage: 'https://github.com/adriandmitroca/ifirma-mcp-server', transport: 'stdio', command: 'npx', args: ['-y', 'ifirma-mcp-server'], keys: [{ name: 'IFIRMA_USERNAME', label: 'iFirma login (e-mail)' }, { name: 'IFIRMA_API_KEY_INVOICE', label: 'Invoice API key', help: 'ifirma.pl → Settings → API → "Faktura" key' }, { name: 'IFIRMA_API_KEY_EXPENSE', label: 'Expense API key (optional)', help: 'ifirma.pl → Settings → API → "Wydatek" key' }] },
  { id: 'wfirma', title: 'wFirma', category: 'finance', icon: 'Receipt', color: '#0072bc', description: 'Read invoices, contractors, payments and reports from wFirma.', homepage: 'https://www.npmjs.com/package/wfirma-mcp', transport: 'stdio', command: 'npx', args: ['-y', 'wfirma-mcp'], keys: [{ name: 'WFIRMA_ACCESS_KEY', label: 'Access key', help: 'wFirma → Settings → Security → Apps → API keys' }, { name: 'WFIRMA_SECRET_KEY', label: 'Secret key' }, { name: 'WFIRMA_APP_KEY', label: 'App key', help: 'Ask wFirma API support for an app key' }] },
  { id: 'ksef', title: 'KSeF (e-faktury)', category: 'finance', icon: 'FileCheck', color: '#d4213d', description: 'Fetch, validate and send KSeF 2.0 e-invoices and match them with bank statements.', homepage: 'https://github.com/CodeFormers-it/ksefnik', transport: 'stdio', command: 'npx', args: ['-y', '@ksefnik/cli', 'mcp'], keys: [{ name: 'KSEF_NIP', label: 'Company tax ID (NIP)' }, { name: 'KSEF_TOKEN', label: 'KSeF token', help: 'ksef.mf.gov.pl → Tokens → generate' }, { name: 'KSEF_ENVIRONMENT', label: 'Environment', help: 'prod, demo or test' }] },
  { id: 'xero', title: 'Xero', category: 'finance', icon: 'Calculator', color: '#13b5ea', description: 'Contacts, invoices, accounts and payments in Xero, plus P&L and balance sheet reports.', homepage: 'https://github.com/XeroAPI/xero-mcp-server', transport: 'stdio', command: 'npx', args: ['-y', '@xeroapi/xero-mcp-server@latest'], keys: [{ name: 'XERO_CLIENT_ID', label: 'Client ID', help: 'developer.xero.com → My Apps → Custom Connection' }, { name: 'XERO_CLIENT_SECRET', label: 'Client secret' }] },
  { id: 'freshbooks', title: 'FreshBooks', category: 'finance', icon: 'Calculator', color: '#0075dd', description: 'Clients, invoices, expenses and estimates in FreshBooks, plus financial reports.', homepage: 'https://www.freshbooks.com', transport: 'http', url: 'https://mcp.freshbooks.com/v1', oauth: true },
  { id: 'woocommerce', title: 'WooCommerce', category: 'commerce', icon: 'ShoppingCart', color: '#7f54b3', description: 'Products, orders and customers of your WooCommerce shop.', homepage: 'https://developer.woocommerce.com/docs/features/mcp/', transport: 'stdio', command: 'npx', args: ['-y', '@automattic/mcp-wordpress-remote@latest'], needs: 'The "MCP Adapter" plugin in WordPress 6.9+', keys: [{ name: 'WP_API_URL', label: 'Shop MCP address', help: 'https://yourshop.com/wp-json/mcp/mcp-adapter-default-server' }, { name: 'WP_API_USERNAME', label: 'WordPress user' }, { name: 'WP_API_PASSWORD', label: 'Application password', help: 'WP Admin → Users → Profile → Application passwords' }] },
  { id: 'allegro', title: 'Allegro', category: 'commerce', icon: 'Store', color: '#ff5a00', description: 'Your Allegro offers: list them, plan and apply price and stock changes safely.', homepage: 'https://github.com/noxlabs-ai/allegro-merchant-mcp', transport: 'stdio', command: 'npx', args: ['-y', 'allegro-mcp'], keys: [{ name: 'ALLEGRO_CLIENT_ID', label: 'Client ID', help: 'apps.developer.allegro.pl → register an app' }, { name: 'ALLEGRO_CLIENT_SECRET', label: 'Client secret' }], popular: true },
  { id: 'ebay', title: 'eBay', category: 'commerce', icon: 'Store', color: '#e53238', description: 'eBay listings, inventory, orders and shipping.', homepage: 'https://www.npmjs.com/package/ebay-mcp', transport: 'stdio', command: 'npx', args: ['-y', 'ebay-mcp'], keys: [{ name: 'EBAY_CLIENT_ID', label: 'App ID', help: 'developer.ebay.com → Application Keys' }, { name: 'EBAY_CLIENT_SECRET', label: 'Cert ID' }, { name: 'EBAY_ENVIRONMENT', label: 'Environment', help: 'production or sandbox' }] },
  { id: 'prestashop', title: 'PrestaShop', category: 'commerce', icon: 'ShoppingCart', color: '#df0067', description: 'Products, orders, customers and stock in PrestaShop.', homepage: 'https://www.npmjs.com/package/prestashop-mcp-server', transport: 'stdio', command: 'npx', args: ['-y', 'prestashop-mcp-server'], keys: [{ name: 'PRESTASHOP_API_URL', label: 'Shop API address', help: 'https://yourshop.com/api' }, { name: 'PRESTASHOP_API_KEY', label: 'Webservice key', help: 'Back office → Advanced parameters → Webservice' }] },
  { id: 'furgonetka', title: 'Furgonetka', category: 'commerce', icon: 'Truck', color: '#f5b800', description: 'Price, order and track courier parcels (InPost, DPD, DHL, UPS, Poczta Polska…).', homepage: 'https://furgonetka.pl', transport: 'http', url: 'https://api.furgonetka.pl/mcp', oauth: true, popular: true },
  { id: 'globkurier', title: 'GlobKurier', category: 'commerce', icon: 'Truck', color: '#0a5eb0', description: 'Compare courier offers and track parcels across DPD, InPost, DHL, GLS and more. No account needed.', homepage: 'https://www.globkurier.pl', transport: 'http', url: 'https://mcp.globkurier.pl/mcp' },
  { id: 'smsapi', title: 'SMSAPI', category: 'sales', icon: 'MessageCircle', color: '#00b2e3', description: 'Send SMS, manage contacts, check delivery and balance.', homepage: 'https://www.smsapi.com/docs/mcp', transport: 'http', url: 'https://mcp.smsapi.io/', oauth: true },
  { id: 'helpscout', title: 'Help Scout', category: 'sales', icon: 'Headphones', color: '#1292ee', description: 'Search customer conversations and pull support reports.', homepage: 'https://www.helpscout.com', transport: 'http', url: 'https://mcp.helpscout.net/mcp', oauth: true },
  { id: 'freshdesk', title: 'Freshdesk', category: 'sales', icon: 'Headphones', color: '#25c16f', description: 'List, create, update and reply to support tickets.', homepage: 'https://www.npmjs.com/package/freshdesk-mcp', transport: 'stdio', command: 'npx', args: ['-y', 'freshdesk-mcp'], keys: [{ name: 'FRESHDESK_DOMAIN', label: 'Domain', help: 'e.g. acme.freshdesk.com' }, { name: 'FRESHDESK_API_KEY', label: 'API key', help: 'Profile settings → View API key' }] },
  { id: 'brevo', title: 'Brevo', category: 'sales', icon: 'Mail', color: '#0b996e', description: 'Contacts, lists and e-mail/SMS campaigns, with campaign stats.', homepage: 'https://developers.brevo.com/docs/mcp-protocol', transport: 'http', url: 'https://mcp.brevo.com/v1/brevo/mcp', oauth: true },
  { id: 'infobip', title: 'Infobip', category: 'sales', icon: 'MessageCircle', color: '#fc6423', description: 'Send SMS, RCS and Viber messages and check delivery.', homepage: 'https://www.infobip.com/docs/mcp', transport: 'http', url: 'https://mcp.infobip.com/message', oauth: true },
  { id: 'personio', title: 'Personio', category: 'hr', icon: 'UserCheck', color: '#1d1d1b', description: 'Employees, time off, attendance, documents and recruiting in Personio.', homepage: 'https://www.npmjs.com/package/personio-mcp', transport: 'stdio', command: 'npx', args: ['-y', 'personio-mcp@latest'], keys: [{ name: 'PERSONIO_CLIENT_ID', label: 'Client ID', help: 'Personio → Settings → Integrations → API credentials' }, { name: 'PERSONIO_CLIENT_SECRET', label: 'Client secret' }] },
  { id: 'telegram', title: 'Telegram', category: 'office', icon: 'Send', color: '#26a5e4', description: 'Send and read messages, photos and files through your Telegram bot.', homepage: 'https://github.com/siavashdelkhosh81/telegram-bot-mcp-server', transport: 'stdio', command: 'npx', args: ['-y', 'telegram-bot-mcp-server'], keys: [{ name: 'TELEGRAM_BOT_API_TOKEN', label: 'Bot token', help: 'Telegram → @BotFather → /newbot' }] },
  { id: 'discord', title: 'Discord', category: 'office', icon: 'MessageCircle', color: '#5865f2', description: 'Read and send messages, manage channels, roles and events.', homepage: 'https://github.com/PaSympa/discord-mcp', transport: 'stdio', command: 'npx', args: ['-y', '@pasympa/discord-mcp'], keys: [{ name: 'DISCORD_TOKEN', label: 'Bot token', help: 'discord.com/developers → Applications → Bot → Reset Token' }] },
  { id: 'whatsapp-business', title: 'WhatsApp Business', category: 'office', icon: 'MessageCircle', color: '#25d366', description: 'Send WhatsApp Business messages and manage templates via the official Cloud API.', homepage: 'https://github.com/Gonzalez8/whatsapp-business-mcp', transport: 'stdio', command: 'npx', args: ['-y', 'whatsapp-business-mcp-server'], keys: [{ name: 'WHATSAPP_TOKEN', label: 'Access token', help: 'developers.facebook.com → WhatsApp → System user token' }] },
  { id: 'postgres', title: 'PostgreSQL', category: 'data', icon: 'Database', color: '#336791', description: 'Inspect schemas and run queries in a PostgreSQL database.', homepage: 'https://github.com/HenkDz/postgresql-mcp-server', transport: 'stdio', command: 'npx', args: ['-y', '@henkey/postgres-mcp-server'], keys: [{ name: 'POSTGRES_CONNECTION_STRING', label: 'Connection string', help: 'postgresql://user:pass@host:5432/db' }] },
  { id: 'mysql', title: 'MySQL', category: 'data', icon: 'Database', color: '#00758f', description: 'Query MySQL databases (changes are off by default).', homepage: 'https://github.com/benborla/mcp-server-mysql', transport: 'stdio', command: 'npx', args: ['-y', '@benborla29/mcp-server-mysql'], keys: [{ name: 'MYSQL_HOST', label: 'Host' }, { name: 'MYSQL_USER', label: 'User' }, { name: 'MYSQL_PASS', label: 'Password' }, { name: 'MYSQL_DB', label: 'Database' }] },
  { id: 'planetscale', title: 'PlanetScale', category: 'data', icon: 'Database', color: '#111111', description: 'Browse PlanetScale databases, branches and schemas and run read queries.', homepage: 'https://planetscale.com/docs/connect/mcp', transport: 'http', url: 'https://mcp.pscale.dev/mcp/planetscale', oauth: true },
  { id: 'excel', title: 'Excel files', category: 'data', icon: 'Table', color: '#217346', description: 'Read and write cells, formulas and sheets in .xlsx files on this computer.', homepage: 'https://github.com/negokaz/excel-mcp-server', transport: 'stdio', command: 'npx', args: ['-y', '@negokaz/excel-mcp-server'], popular: true },
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
  const env: Record<string, string> = { ...(c.env ?? {}) };
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
    return `- ${p.title} (tools mcp__${p.name}__…)${c ? `: ${c.description}${c.guide ? ' ' + c.guide : ''}` : ''}`;
  }).join('\n')}\nUse them when they fit the task; if one is not connected or fails, say so in one line and continue.`;
}
