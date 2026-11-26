// AI images and videos, made from a prompt — in the app (Media gallery) and by the AI itself (the "alter_media" MCP tools).
// Our own implementation; the providers are plain HTTP APIs:
//   chatgpt      — the user's ChatGPT account, through the Codex app (no key)  image  ← default when signed in
//   pollinations — free, no key (Flux and friends)          image
//   openai       — your own API key (gpt-image-1)           image
//   google       — your own Gemini API key                  image
//   fal          — your own fal.ai key (Flux, Kling, Veo…)  image + video
// Files land in <ALTER_HOME>/generated, so a chat answer that names one shows it as a picture / player.
import { spawn, spawnSync } from 'node:child_process';
import { nativeKey } from './plugins.ts';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { all, get, getDb, now, run } from './db.ts';
import { generatedDir, loadConfig, saveConfig } from './config.ts';
import { emit } from './events.ts';
import { mediaFor } from './studio.ts';

export type MediaKind = 'image' | 'video';
export type Aspect = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
export const ASPECTS: Aspect[] = ['1:1', '16:9', '9:16', '4:3', '3:4'];

export interface ModelInfo { id: string; label: string; kind: MediaKind; note?: string }
export interface ProviderInfo { id: string; label: string; free: boolean; needsKey: boolean; hasKey: boolean; keyUrl?: string; models: ModelInfo[] }

const MODELS: Record<string, ModelInfo[]> = {
  chatgpt: [{ id: 'gpt-image', label: 'ChatGPT (your account)', kind: 'image' }],
  pollinations: [
    { id: 'flux', label: 'Flux (free)', kind: 'image' },
    { id: 'turbo', label: 'Turbo (free, fastest)', kind: 'image' },
  ],
  openai: [{ id: 'gpt-image-1', label: 'GPT Image 1', kind: 'image' }],
  google: [{ id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image', kind: 'image' }],
  fal: [
    { id: 'fal-ai/flux/schnell', label: 'Flux Schnell', kind: 'image', note: 'fast, cheap' },
    { id: 'fal-ai/flux-pro/v1.1', label: 'Flux Pro 1.1', kind: 'image' },
    { id: 'fal-ai/kling-video/v2.6/pro/text-to-video', label: 'Kling 2.6 Pro', kind: 'video' },
    { id: 'fal-ai/kling-video/v3/turbo/standard/text-to-video', label: 'Kling 3 Turbo (720p, audio)', kind: 'video' },
    { id: 'fal-ai/veo3.1/lite', label: 'Veo 3.1 Lite (audio)', kind: 'video' },
  ],
};
const KEY_URL: Record<string, string> = {
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/apikey',
  fal: 'https://fal.ai/dashboard/keys',
  pollinations: 'https://enter.pollinations.ai',
};

// ---------- keys (config "media"; fal also reuses the 3D key from Settings → hands) ----------
type Keys = { fal?: string; openai?: string; google?: string; pollinations?: string };
function keys(): Keys {
  const c = loadConfig() as any;
  return { ...(c.media ?? {}), fal: c.media?.fal || c.hands?.falKey || undefined };
}
export function setMediaKeys(patch: Keys) {
  const c = loadConfig() as any;
  const next: Keys = { ...(c.media ?? {}) };
  for (const k of ['fal', 'openai', 'google', 'pollinations'] as const) {
    if (patch[k] === undefined) continue;
    const v = String(patch[k] ?? '').trim();
    if (v) next[k] = v;
    else delete next[k];
  }
  c.media = next;
  saveConfig();
  return mediaOptions();
}

let codexAt = 0;
let codexOk = false;
export function chatgptReady(): boolean {
  if (Date.now() - codexAt < 5 * 60_000) return codexOk;
  codexAt = Date.now();
  try {
    const r = spawnSync('codex login status', { encoding: 'utf8', shell: true, timeout: 20_000, windowsHide: true });
    codexOk = /logged in using chatgpt/i.test(`${r.stdout ?? ''}${r.stderr ?? ''}`);
  } catch { codexOk = false; }
  return codexOk;
}

export function mediaOptions(): { providers: ProviderInfo[]; aspects: Aspect[] } {
  const k = keys();
  const providers = (['chatgpt', 'pollinations', 'fal', 'openai', 'google'] as const).map((id) => ({
    id,
    label: { chatgpt: 'ChatGPT', pollinations: 'Pollinations', fal: 'fal.ai', openai: 'OpenAI', google: 'Google Gemini' }[id],
    free: id === 'pollinations',
    needsKey: id !== 'pollinations' && id !== 'chatgpt',
    hasKey: id === 'chatgpt' ? chatgptReady() : !!k[id],
    keyUrl: KEY_URL[id],
    models: MODELS[id],
  }));
  return { providers, aspects: ASPECTS };
}

// ---------- store ----------
export interface MediaRow {
  id: string; kind: MediaKind; prompt: string; provider: string; model: string; aspect: string;
  status: 'running' | 'done' | 'error'; error: string | null; file: string | null; created_at: string; done_at: string | null;
  conversation_id: string | null; source: string;
}
let ready = false;
function ensure() {
  if (ready) return;
  getDb().exec(`CREATE TABLE IF NOT EXISTS media_items (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, prompt TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, aspect TEXT NOT NULL,
    status TEXT NOT NULL, error TEXT, file TEXT, created_at TEXT NOT NULL, done_at TEXT, conversation_id TEXT, source TEXT NOT NULL DEFAULT 'app')`);
  // anything "running" from before a restart will never finish
  run(`UPDATE media_items SET status = 'error', error = 'ALTTER was restarted while this was being made' WHERE status = 'running'`);
  ready = true;
}

/** A row as the app sees it (with a playable URL). */
export function mediaView(r: MediaRow) {
  const m = r.file ? mediaFor(r.file) : null;
  return { ...r, file: undefined, url: m?.url ?? null, size: m?.size ?? null };
}
export function listMedia(limit = 200) {
  ensure();
  return all<MediaRow>('SELECT * FROM media_items ORDER BY created_at DESC LIMIT ?', limit).map(mediaView);
}
export function deleteMedia(id: string): boolean {
  ensure();
  const r = get<MediaRow>('SELECT * FROM media_items WHERE id = ?', id);
  if (!r) return false;
  if (r.file) rmSync(r.file, { force: true });
  run('DELETE FROM media_items WHERE id = ?', id);
  emit('media.updated', { id, deleted: true });
  return true;
}

// ---------- generation ----------
export interface GenerateRequest { kind?: MediaKind; prompt: string; provider?: string; model?: string; aspect?: Aspect; conversationId?: string | null; source?: string }

const sizeFor = (a: Aspect, base = 1024) => {
  const [w, h] = a.split(':').map(Number);
  const s = Math.sqrt((base * base) / (w * h));
  const r8 = (n: number) => Math.round((n * s) / 16) * 16;
  return { width: r8(w), height: r8(h) };
};

/** Picks a provider/model that can do this kind: ChatGPT (signed in) → Gemini / OpenAI keys → free Pollinations. */
function pick(kind: MediaKind, provider?: string, model?: string): { provider: string; model: string } {
  const k = keys();
  if (provider && MODELS[provider]) {
    if (provider === 'chatgpt' && !chatgptReady()) throw new Error('ChatGPT is not signed in on this computer (the Codex app). Sign in, or pick another provider.');
    if (provider !== 'pollinations' && provider !== 'chatgpt' && !k[provider as keyof Keys]) throw new Error(`No ${provider} API key yet — add it in Media → Keys.`);
    const m = model && MODELS[provider].some((x) => x.id === model) ? model : model && provider === 'fal' ? model : MODELS[provider].find((x) => x.kind === kind)?.id;
    if (!m) throw new Error(`${provider} cannot make ${kind === 'video' ? 'videos' : 'images'}.`);
    return { provider, model: m };
  }
  if (kind === 'video') {
    if (!k.fal) throw new Error('Videos need a fal.ai key (Kling, Veo…) — add it in Media → Keys. Images are free without a key.');
    return { provider: 'fal', model: MODELS.fal.find((x) => x.kind === 'video')!.id };
  }
  if (chatgptReady()) return { provider: 'chatgpt', model: 'gpt-image' };
  if (k.google) return { provider: 'google', model: MODELS.google[0].id };
  if (k.openai) return { provider: 'openai', model: MODELS.openai[0].id };
  return { provider: 'pollinations', model: 'flux' };
}

async function fetchOk(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init.timeoutMs ?? 120_000);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) {
      const body = (await r.text().catch(() => '')).slice(0, 400);
      let msg = body;
      try { const j = JSON.parse(body); msg = j.error?.message ?? j.detail?.[0]?.msg ?? j.detail ?? j.message ?? body; } catch {}
      throw new Error(`${r.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`.slice(0, 400));
    }
    return r;
  } finally {
    clearTimeout(t);
  }
}
const download = async (url: string) => Buffer.from(await (await fetchOk(url, { timeoutMs: 300_000 })).arrayBuffer());
const extOf = (ct: string | null, fallback: string) => (/png/.test(ct ?? '') ? '.png' : /webp/.test(ct ?? '') ? '.webp' : /jpe?g/.test(ct ?? '') ? '.jpg' : /mp4/.test(ct ?? '') ? '.mp4' : /webm/.test(ct ?? '') ? '.webm' : fallback);

async function makePollinations(prompt: string, model: string, aspect: Aspect): Promise<{ data: Buffer; ext: string }> {
  const { width, height } = sizeFor(aspect);
  const seed = Math.floor(Math.random() * 1e9);
  const q = `width=${width}&height=${height}&model=${encodeURIComponent(model)}&seed=${seed}&nologo=true&private=true`;
  const key = keys().pollinations;
  // with a key: the gateway (no limit, no watermark); without: the classic free endpoint (the gateway wants a key)
  const urls = key
    ? [`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${q}&key=${encodeURIComponent(key)}`, `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`]
    : [`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q.replace('&nologo=true', '')}`];
  let last: Error | null = null;
  // free use is about one picture per ~45 s per computer: when that limit answers, wait it out once and try again
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const u of urls) {
      try {
        const r = await fetchOk(u, { timeoutMs: 150_000 });
        const ct = r.headers.get('content-type');
        if (!/^image\//.test(ct ?? '')) throw new Error('Pollinations did not return a picture');
        return { data: Buffer.from(await r.arrayBuffer()), ext: extOf(ct, '.jpg') };
      } catch (e) {
        last = e as Error;
        if (/FREE_LIMIT|Free limit|402|429/i.test(last.message)) break;
      }
    }
    const wait = Number(last?.message.match(/after (\d+)\s*s/i)?.[1] ?? 45);
    if (attempt === 0 && last && /FREE_LIMIT|Free limit|402|429/i.test(last.message) && wait <= 60) {
      await new Promise((r) => setTimeout(r, (wait + 2) * 1000));
      continue;
    }
    break;
  }
  if (last && /FREE_LIMIT|Free limit|402/i.test(last.message)) throw new Error('Free Pollinations allows about 1 picture per 45 s — try again in a moment, or add a Pollinations key (Media → Keys) for no limit and no watermark.');
  throw last ?? new Error('Pollinations failed');
}

async function makeOpenAI(prompt: string, model: string, aspect: Aspect) {
  const size = aspect === '1:1' ? '1024x1024' : aspect === '16:9' || aspect === '4:3' ? '1536x1024' : '1024x1536';
  const r = await fetchOk('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${keys().openai}` },
    body: JSON.stringify({ model, prompt, size, n: 1 }),
    timeoutMs: 240_000,
  });
  const j: any = await r.json();
  const d = j.data?.[0];
  if (d?.b64_json) return { data: Buffer.from(d.b64_json, 'base64'), ext: '.png' };
  if (d?.url) return { data: await download(d.url), ext: '.png' };
  throw new Error('OpenAI returned no image');
}

async function makeGoogle(prompt: string, model: string, aspect: Aspect) {
  const r = await fetchOk(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': keys().google! },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } }),
    timeoutMs: 180_000,
  });
  const j: any = await r.json();
  const part = (j.candidates?.[0]?.content?.parts ?? []).find((p: any) => p.inlineData?.data);
  if (!part) throw new Error(j.candidates?.[0]?.finishReason ? `Gemini: ${j.candidates[0].finishReason}` : 'Gemini returned no image');
  return { data: Buffer.from(part.inlineData.data, 'base64'), ext: extOf(part.inlineData.mimeType, '.png') };
}

/** ChatGPT through the Codex app: it draws with its image tool and saves the file (about 30–60 s). */
async function makeChatGPT(prompt: string, aspect: Aspect): Promise<{ data: Buffer; ext: string }> {
  const work = mkdtempSync(join(tmpdir(), 'alter-img-'));
  const started = Date.now();
  const orient = aspect === '1:1' ? 'square 1:1' : `${['9:16', '3:4'].includes(aspect) ? 'vertical' : 'horizontal'} ${aspect}`;
  const task = `Use your image generation tool to create exactly one image: ${prompt}. Composition: ${orient}.\nThen copy the generated image file into the current directory as image.png. Reply only with the file path.`;
  try {
    await new Promise<void>((res, rej) => {
      const child = spawn(`codex exec --skip-git-repo-check --ephemeral -s workspace-write -C "${work}" -`, { shell: true, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
      let err = '';
      child.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
      const timer = setTimeout(() => child.kill(), 6 * 60_000);
      child.stdin.end(task);
      child.on('error', rej);
      child.on('close', (code) => { clearTimeout(timer); code ? rej(new Error(`ChatGPT: ${err.trim().split('\n').pop() || 'exit ' + code}`)) : res(); });
    });
    let src: string | undefined = join(work, 'image.png');
    if (!existsSync(src)) {
      let best: { p: string; m: number } | null = null;
      const walk = (d: string) => { try { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(png|jpe?g|webp)$/i.test(e.name)) { const m = statSync(p).mtimeMs; if (m >= started && (!best || m > best.m)) best = { p, m }; } } } catch {} };
      walk(join(homedir(), '.codex', 'generated_images'));
      src = (best as { p: string } | null)?.p;
    }
    if (!src) throw new Error('ChatGPT did not make an image');
    return { data: readFileSync(src), ext: extOf(null, '.' + (src.split('.').pop() ?? 'png').toLowerCase()) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** fal.ai queue: submit, wait, read the result (image or video URL), download it. */
async function makeFal(prompt: string, model: string, aspect: Aspect, kind: MediaKind, onWait?: () => void) {
  const auth = { authorization: `Key ${keys().fal}`, 'content-type': 'application/json' };
  const input: Record<string, unknown> = { prompt };
  if (kind === 'video') input.aspect_ratio = aspect === '4:3' ? '16:9' : aspect === '3:4' ? '9:16' : aspect;
  else input.image_size = { width: sizeFor(aspect).width, height: sizeFor(aspect).height };
  const sub: any = await (await fetchOk(`https://queue.fal.run/${model}`, { method: 'POST', headers: auth, body: JSON.stringify(input), timeoutMs: 60_000 })).json();
  const statusUrl: string = sub.status_url ?? `https://queue.fal.run/${model}/requests/${sub.request_id}/status`;
  const resultUrl: string = sub.response_url ?? `https://queue.fal.run/${model}/requests/${sub.request_id}`;
  const deadline = Date.now() + (kind === 'video' ? 20 : 5) * 60_000;
  for (;;) {
    await new Promise((r) => setTimeout(r, kind === 'video' ? 5000 : 1500));
    const st: any = await (await fetchOk(statusUrl, { headers: auth, timeoutMs: 30_000 })).json();
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || st.error) throw new Error(`fal: ${st.error ?? 'failed'}`);
    if (Date.now() > deadline) throw new Error('fal: still not done — try again later');
    onWait?.();
  }
  const out: any = await (await fetchOk(resultUrl, { headers: auth, timeoutMs: 60_000 })).json();
  const url: string | undefined = out.video?.url ?? out.images?.[0]?.url ?? out.image?.url ?? out.output?.[0]?.url;
  if (!url) throw new Error('fal returned no file');
  const r = await fetchOk(url, { timeoutMs: 300_000 });
  return { data: Buffer.from(await r.arrayBuffer()), ext: extOf(r.headers.get('content-type'), kind === 'video' ? '.mp4' : '.png') };
}

/** Free Pollinations: one picture at a time (its free limit is per computer). */
let line: Promise<unknown> = Promise.resolve();
function inLine<T>(f: () => Promise<T>): Promise<T> {
  if (keys().pollinations) return f();
  const p = line.then(f, f);
  line = p.catch(() => {});
  return p;
}

const waiters = new Map<string, ((r: MediaRow) => void)[]>();

/** Starts a generation; returns the row at once (status "running"); `media.updated` events follow. */
export function startMedia(req: GenerateRequest): MediaRow {
  ensure();
  const prompt = String(req.prompt ?? '').trim();
  if (!prompt) throw new Error('Write what to make (the prompt).');
  const kind: MediaKind = req.kind === 'video' ? 'video' : 'image';
  const aspect: Aspect = ASPECTS.includes(req.aspect as Aspect) ? (req.aspect as Aspect) : kind === 'video' ? '16:9' : '1:1';
  const { provider, model } = pick(kind, req.provider, req.model);
  const row: MediaRow = {
    id: randomBytes(8).toString('hex'), kind, prompt: prompt.slice(0, 4000), provider, model, aspect, status: 'running', error: null, file: null,
    created_at: now(), done_at: null, conversation_id: req.conversationId ?? null, source: req.source ?? 'app',
  };
  run('INSERT INTO media_items (id, kind, prompt, provider, model, aspect, status, created_at, conversation_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    row.id, kind, row.prompt, provider, model, aspect, 'running', row.created_at, row.conversation_id, row.source);
  emit('media.updated', mediaView(row));
  void (async () => {
    let done: MediaRow;
    try {
      const out =
        provider === 'chatgpt' ? await makeChatGPT(row.prompt, aspect)
        : provider === 'pollinations' ? await inLine(() => makePollinations(row.prompt, model, aspect))
        : provider === 'openai' ? await makeOpenAI(row.prompt, model, aspect)
        : provider === 'google' ? await makeGoogle(row.prompt, model, aspect)
        : await makeFal(row.prompt, model, aspect, kind);
      mkdirSync(generatedDir(), { recursive: true });
      const slug = row.prompt.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().split(/\s+/).slice(0, 5).join('-').slice(0, 40) || kind;
      const file = join(generatedDir(), `${slug}-${row.id}${out.ext}`);
      writeFileSync(file, out.data);
      run(`UPDATE media_items SET status = 'done', file = ?, done_at = ? WHERE id = ?`, file, now(), row.id);
      done = { ...row, status: 'done', file, done_at: now() };
    } catch (e) {
      const msg = (e as Error).name === 'AbortError' ? 'Timed out' : (e as Error).message;
      run(`UPDATE media_items SET status = 'error', error = ?, done_at = ? WHERE id = ?`, msg, now(), row.id);
      done = { ...row, status: 'error', error: msg, done_at: now() };
    }
    emit('media.updated', mediaView(done));
    for (const w of waiters.get(row.id) ?? []) w(done);
    waiters.delete(row.id);
  })();
  return row;
}

/** Waits (up to `ms`) for a generation to finish. */
export function waitMedia(id: string, ms: number): Promise<MediaRow> {
  ensure();
  const r = get<MediaRow>('SELECT * FROM media_items WHERE id = ?', id);
  if (!r) return Promise.reject(new Error('No such media'));
  if (r.status !== 'running') return Promise.resolve(r);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(get<MediaRow>('SELECT * FROM media_items WHERE id = ?', id)!), ms);
    waiters.set(id, [...(waiters.get(id) ?? []), (x) => { clearTimeout(t); resolve(x); }]);
  });
}

// ---------- the AI's tools (MCP over HTTP, only from this computer) ----------
const tokens = new Map<string, { conversationId: string | null; until: number }>();
export function openMediaTools(conversationId: string | null): string {
  const t = randomBytes(16).toString('hex');
  tokens.set(t, { conversationId, until: Date.now() + 4 * 3_600_000 });
  for (const [k, v] of tokens) if (v.until < Date.now()) tokens.delete(k);
  return t;
}
export const closeMediaTools = (t: string) => tokens.delete(t);
export const mediaMcpUrl = (port: number, token: string) => `http://127.0.0.1:${port}/mcp/media/${token}`;

const MEDIA_TOOLS = [
  {
    name: 'generate_image',
    description: 'Make an AI image from a prompt and save it on this computer. Drawn by ChatGPT (the user’s account) when signed in, else Gemini/OpenAI keys, else free Pollinations (low quality). Takes 30–60 s. Write the prompt in English, concrete: subject, style, light, composition, colours. Returns the file path — put that path in your answer so the user sees the picture.',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, aspect: { type: 'string', enum: ASPECTS }, provider: { type: 'string', enum: ['chatgpt', 'pollinations', 'fal', 'openai', 'google'] }, model: { type: 'string' } }, required: ['prompt'] },
  },
  {
    name: 'generate_video',
    description: 'Make a short AI video clip (about 5–8 s) from a prompt (needs the user’s fal.ai key: Kling / Veo). Takes 1–5 minutes: it returns an id at once — then call media_status with it. Write the prompt in English: subject, action, camera move, style, light.',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] }, model: { type: 'string' } }, required: ['prompt'] },
  },
  { name: 'media_status', description: 'Wait up to ~50 s for an image/video being made and get its file path (or error).', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'media_options', description: 'Which providers and models are available right now (and which have keys).', inputSchema: { type: 'object', properties: {} } },
];

function describe(r: MediaRow): string {
  if (r.status === 'done') return `Done (${r.provider}/${r.model}). File: ${r.file}\nPut this path in your answer so the user sees it.`;
  if (r.status === 'error') return `Failed: ${r.error}`;
  return `Still being made (id ${r.id}). Call media_status again.`;
}

export async function handleMediaMcp(req: IncomingMessage, res: ServerResponse, token: string) {
  const s = tokens.get(token);
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  if (!s || s.until < Date.now()) return reply(404, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Session ended' } });
  if (req.method !== 'POST') return reply(req.method === 'DELETE' ? 200 : 405, {});
  const raw = await new Promise<string>((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return reply(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) });
  const call = async (name: string, a: any) => {
    if (name === 'media_options') {
      const o = mediaOptions();
      return text(o.providers.map((p) => `${p.id}${p.free ? ' (free)' : p.hasKey ? ' (key added)' : ' (no key — not available)'}: ${p.models.map((m) => `${m.id} [${m.kind}]`).join(', ')}`).join('\n'));
    }
    if (name === 'media_status') return text(describe(await waitMedia(String(a.id ?? ''), 50_000)));
    if (name === 'generate_image' || name === 'generate_video') {
      const kind: MediaKind = name === 'generate_video' ? 'video' : 'image';
      const row = startMedia({ kind, prompt: a.prompt, aspect: a.aspect, provider: a.provider, model: a.model, conversationId: s.conversationId, source: 'agent' });
      if (kind === 'video') return text(`Started the video (id ${row.id}, ${row.provider}/${row.model}). Call media_status with this id until it is done.`);
      return text(describe(await waitMedia(row.id, 110_000)));
    }
    return text(`Unknown tool ${name}`, true);
  };
  const handle = async (m: any) => {
    if (m.id === undefined) return null;
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
    switch (m.method) {
      case 'initialize':
        return ok({ protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'alter-media', version: '1.0.0' } });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: MEDIA_TOOLS });
      case 'tools/call':
        try {
          return ok(await call(m.params?.name, m.params?.arguments ?? {}));
        } catch (e) {
          return ok(text(`Error: ${(e as Error).message}`, true));
        }
      default:
        return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Unknown method ${m.method}` } };
    }
  };
  const out = Array.isArray(msg) ? (await Promise.all(msg.map(handle))).filter(Boolean) : await handle(msg);
  if (out === null || (Array.isArray(out) && !out.length)) return reply(202, undefined);
  reply(200, out);
}

const MEDIA_RE = /(obraz\w*|zdj[eę]ci\w*|grafik\w*|ilustracj\w*|obrazek|obrazk\w*|fotk\w*|wygeneruj|wygenerowa\w*|generuj\w*|narysuj|namaluj|plakat\w*|tapet\w*|logo\b|ikon\w*|miniaturk\w*|thumbnail|image|picture|photo|illustration|poster|wallpaper|draw\b|paint\b|render\b|klip\w*|filmik\w*|wideo|video|ai video|kling|veo\b|flux|midjourney|dall.?e|stable diffusion)/i;
export const wantsMedia = (msg: string) => MEDIA_RE.test(msg);

export const MEDIA_GUIDE = `## AI images and videos — tools from the "alter_media" MCP server
You can MAKE pictures and short video clips: generate_image (free by default, ~10–30 s) and generate_video (needs the user's fal.ai key; start it, then media_status). Use them when the user wants a picture, illustration, poster, thumbnail, logo idea, background, product shot or clip — not for diagrams or UI (build those). Write the prompt in English and concrete (subject, style, light, lens/composition, colours, mood); pick the aspect for the use (9:16 reels/stories, 16:9 thumbnails/banners, 1:1 posts). Make 1 image unless asked for more (then at most 4, varied). Always put the returned file path in your answer — the chat shows it. Every result is also kept in ALTTER → Media. If a provider has no key, say in one line where to add it (Media → Keys) and use the free one meanwhile.`;

export const mediaFileExists = (id: string) => {
  ensure();
  const r = get<MediaRow>('SELECT file FROM media_items WHERE id = ?', id);
  return !!r?.file && existsSync(r.file);
};

/** The studio scripts (gen-image / gen-video) run in the AI's shell: hand them the user's media keys. */
export function shareMediaKeys() {
  const k = keys();
  const set = (name: string, v?: string) => { if (v) process.env[name] = v; else delete process.env[name]; };
  // built-in plugins (Settings → Plugins): ElevenLabs voice-overs, Higgsfield and fal video
  const hf = [nativeKey('higgsfield', 'HF_API_KEY_ID'), nativeKey('higgsfield', 'HF_API_KEY_SECRET')];
  set('ALTER_FAL_KEY', k.fal || nativeKey('fal', 'FAL_KEY'));
  set('ALTER_ELEVENLABS_KEY', nativeKey('elevenlabs', 'ELEVENLABS_API_KEY'));
  set('ALTER_HIGGSFIELD_KEY', hf[0] && hf[1] ? hf.join(':') : undefined);
  set('ALTER_GOOGLE_KEY', k.google);
  set('ALTER_OPENAI_KEY', k.openai);
}
