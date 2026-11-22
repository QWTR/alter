import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { recentActivity } from './activity.ts';
import {
  TEMPLATES, createAgent, createFromTemplate, deleteAgent, getAgent, isRunning, listAgents, listRuns, runAgent, updateAgent,
} from './agents.ts';
import { chat, deleteConversation, getConversation, getMessages, listConversations } from './chat.ts';
import { loadConfig, updateConfig } from './config.ts';
import { bus, emit, type AlterEvent } from './events.ts';
import { addMemory, deleteMemory, listMemories, updateMemory } from './memory.ts';
import { authenticate, claimPairing, lanUrls, revokeDevice, startPairing } from './pairing.ts';
import { openLoginTerminal, providerStatuses } from './providers/index.ts';
import { listSkills } from './skills.ts';
import { VERSION } from './version.ts';

const WEB_DIR = process.env.ALTER_WEB_DIR ?? resolve(import.meta.dirname, '../../../apps/web');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Ctx = { req: IncomingMessage; res: ServerResponse; params: string[]; url: URL; body: any; auth: ReturnType<typeof authenticate> };
type Handler = (ctx: Ctx) => unknown | Promise<unknown>;
const routes: { method: string; re: RegExp; handler: Handler; open?: boolean }[] = [];
const route = (method: string, path: string, handler: Handler, open = false) =>
  routes.push({ method, re: new RegExp(`^${path.replace(/:\w+/g, '([^/]+)')}$`), handler, open });

const isLoopback = (req: IncomingMessage) => {
  const a = req.socket.remoteAddress ?? '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
};

// ---------- status & settings ----------
route('GET', '/api/health', () => ({ ok: true, name: 'alter', version: VERSION }), true);

route('GET', '/api/status', async ({ auth }) => {
  const cfg = loadConfig();
  return {
    version: VERSION,
    you: auth === 'owner' ? { kind: 'computer' } : { kind: 'device', name: (auth as any)?.name },
    providers: await providerStatuses(),
    counts: { agents: listAgents().length, memories: listMemories().length, conversations: listConversations(1000).length },
    settings: { defaultProvider: cfg.defaultProvider, learning: cfg.learning },
    lanUrls: lanUrls(cfg.port),
  };
});

route('PUT', '/api/settings', ({ body }) => {
  const patch: Record<string, unknown> = {};
  if (typeof body.defaultProvider === 'string') patch.defaultProvider = body.defaultProvider;
  if (typeof body.learning === 'boolean') patch.learning = body.learning;
  const cfg = updateConfig(patch);
  emit('settings.changed', { defaultProvider: cfg.defaultProvider, learning: cfg.learning });
  return { defaultProvider: cfg.defaultProvider, learning: cfg.learning };
});

// ---------- providers ----------
route('GET', '/api/providers', ({ url }) => providerStatuses(url.searchParams.has('refresh')));
route('POST', '/api/providers/:id/connect', ({ params }) => openLoginTerminal(params[0]));

// ---------- chat ----------
route('GET', '/api/conversations', () => listConversations());
route('GET', '/api/conversations/:id', ({ params }) => {
  const c = getConversation(params[0]);
  if (!c) throw new HttpError(404, 'Conversation not found');
  return { ...c, messages: getMessages(c.id) };
});
route('DELETE', '/api/conversations/:id', ({ params }) => ({ ok: deleteConversation(params[0]) }));

route('POST', '/api/chat', async ({ req, res, body }) => {
  const sse = openSse(res);
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });
  try {
    const result = await chat({
      conversationId: body.conversationId,
      message: String(body.message ?? ''),
      provider: body.provider,
      signal: abort.signal,
      onMeta: (m) => sse('meta', m),
      onDelta: (text) => sse('delta', { text }),
    });
    sse('done', result);
  } catch (err) {
    sse('error', { message: (err as Error).message });
  }
  res.end();
  void req;
  return SSE_HANDLED;
});

// ---------- memory ----------
route('GET', '/api/memories', ({ url }) =>
  listMemories({ q: url.searchParams.get('q') ?? undefined, kind: url.searchParams.get('kind') ?? undefined }),
);
route('POST', '/api/memories', ({ body }) => addMemory({ ...body, source: 'manual' }));
route('PUT', '/api/memories/:id', ({ params, body }) => updateMemory(params[0], body) ?? notFound());
route('DELETE', '/api/memories/:id', ({ params }) => ({ ok: deleteMemory(params[0]) }));

// ---------- agents ----------
route('GET', '/api/agents', () => listAgents().map((a) => ({ ...a, running: isRunning(a.id) })));
route('GET', '/api/agents/templates', () => TEMPLATES);
route('POST', '/api/agents', ({ body }) => (body.templateId ? createFromTemplate(body.templateId) : createAgent(body)));
route('GET', '/api/agents/:id', ({ params }) => getAgent(params[0]) ?? notFound());
route('PUT', '/api/agents/:id', ({ params, body }) => updateAgent(params[0], body) ?? notFound());
route('DELETE', '/api/agents/:id', ({ params }) => ({ ok: deleteAgent(params[0]) }));
route('POST', '/api/agents/:id/run', ({ params }) => {
  if (!getAgent(params[0])) notFound();
  runAgent(params[0], 'manual').catch(() => {});
  return { started: true };
});
route('GET', '/api/runs', ({ url }) => listRuns(url.searchParams.get('agentId') ?? undefined));
route('GET', '/api/skills', () => listSkills().map(({ body, ...s }) => ({ ...s, preview: body.slice(0, 200) })));
route('GET', '/api/activity', () => recentActivity(72, 200).reverse());

// ---------- devices / pairing ----------
route('POST', '/api/pair/start', ({ auth }) => {
  if (auth !== 'owner') throw new HttpError(403, 'Only the computer running Alter can start pairing');
  return startPairing();
});
route('POST', '/api/pair/claim', ({ body }) => {
  try {
    const d = claimPairing(String(body.code ?? ''), String(body.name ?? 'Phone'));
    return { token: d.token, device: { id: d.id, name: d.name } };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}, true);
route('GET', '/api/devices', () => loadConfig().devices.map(({ token, ...d }) => d));
route('DELETE', '/api/devices/:id', ({ auth, params }) => {
  if (auth !== 'owner') throw new HttpError(403, 'Only the computer can revoke devices');
  return { ok: revokeDevice(params[0]) };
});

// ---------- live events (keeps desktop and phone in sync) ----------
route('GET', '/api/events', ({ res }) => {
  const sse = openSse(res);
  sse('hello', { at: new Date().toISOString() });
  const onEvent = (e: AlterEvent) => sse(e.type, e.data);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  bus.on('event', onEvent);
  res.on('close', () => {
    clearInterval(ping);
    bus.off('event', onEvent);
  });
  return SSE_HANDLED;
});

// ---------- plumbing ----------
const SSE_HANDLED = Symbol('sse');

function notFound(): never {
  throw new HttpError(404, 'Not found');
}

function openSse(res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  return (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function readBody(req: IncomingMessage): Promise<any> {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new HttpError(413, 'Body too large');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^﻿/, ''));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  let file = normalize(join(WEB_DIR, rel));
  if (!file.startsWith(normalize(WEB_DIR))) return send(res, 403, { error: 'Forbidden' });
  if (!existsSync(file) || !statSync(file).isFile()) file = join(WEB_DIR, 'index.html'); // SPA fallback
  let body: string | Buffer = readFileSync(file);
  if (file.endsWith('index.html')) {
    // The computer's own browser/desktop shell is trusted with the owner token; other devices must pair.
    const host = (req.headers.host ?? '').split(':')[0];
    const localHost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    const inject = isLoopback(req) && localHost ? `<script>window.ALTER_TOKEN=${JSON.stringify(loadConfig().ownerToken)}</script>` : '';
    body = body.toString('utf8').replace('<!--ALTER_BOOT-->', inject);
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(body);
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

export function startServer(port = loadConfig().port, host = loadConfig().host) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://alter.local');
    try {
      if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) return send(res, 404, { error: 'Not found' });
      const header = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const auth = authenticate(header ?? url.searchParams.get('token') ?? undefined);
      if (!r.open && !auth) return send(res, 401, { error: 'Unauthorized — pair this device first' });

      const params = (url.pathname.match(r.re) ?? []).slice(1).map(decodeURIComponent);
      const body = await readBody(req);
      const out = await r.handler({ req, res, params, url, body, auth });
      if (out !== SSE_HANDLED) send(res, 200, out ?? { ok: true });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('[alter]', err);
      if (!res.headersSent) send(res, status, { error: (err as Error).message });
      else res.end();
    }
  });
  return new Promise<typeof server>((resolveP, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolveP(server));
  });
}
