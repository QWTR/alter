// Prompt library: your saved prompts plus a starter set, with {{variables}} filled in when used.
// Categories: image, video, writing, code, business, life. Our own starter texts.
import { randomBytes } from 'node:crypto';
import { all, get, getDb, now, run } from './db.ts';
import { emit } from './events.ts';

export interface PromptRow {
  id: string; title: string; body: string; category: string; kind: 'text' | 'image' | 'video';
  favorite: number; uses: number; builtin: number; created_at: string; updated_at: string; last_used: string | null;
}
export const CATEGORIES = ['image', 'video', 'writing', 'code', 'business', 'life'] as const;

const STARTERS: Omit<PromptRow, 'id' | 'favorite' | 'uses' | 'builtin' | 'created_at' | 'updated_at' | 'last_used'>[] = [
  // images
  { title: 'Product shot', category: 'image', kind: 'image', body: 'Studio product photo of {{product}}, centered on a seamless {{background colour}} backdrop, soft key light from the left, subtle reflection on the floor, 85mm lens, shallow depth of field, crisp detail, commercial catalogue style' },
  { title: 'Cinematic portrait', category: 'image', kind: 'image', body: 'Cinematic portrait of {{who}}, {{mood}} expression, golden hour rim light, film grain, 50mm lens at f/1.8, muted teal and orange grade, background softly blurred {{place}}' },
  { title: 'YouTube thumbnail background', category: 'image', kind: 'image', body: 'Bold, high-contrast background for a YouTube thumbnail about {{topic}}, one clear focal object on the right, empty space on the left for big text, saturated colours, dramatic lighting, no text' },
  { title: 'Flat illustration', category: 'image', kind: 'image', body: 'Flat vector illustration of {{scene}}, limited palette of {{colours}}, clean geometric shapes, soft grain texture, friendly modern editorial style, plenty of negative space' },
  { title: 'Logo idea', category: 'image', kind: 'image', body: 'Minimal logo mark for "{{brand name}}", a {{industry}} brand, simple geometric symbol, one or two colours, works small, centered on white, no mockup, no extra text' },
  { title: 'Interior / architecture', category: 'image', kind: 'image', body: 'Photorealistic interior of a {{room}} in {{style}} style, natural daylight through large windows, warm materials, wide-angle 24mm, architectural photography, calm and uncluttered' },
  // video
  { title: 'Product reveal clip', category: 'video', kind: 'video', body: 'Slow orbiting camera around {{product}} on a dark reflective surface, light sweeps reveal its shape, particles in the air, premium commercial look, ends on a centered hero shot' },
  { title: 'Drone establishing shot', category: 'video', kind: 'video', body: 'Smooth drone fly-over of {{place}} at {{time of day}}, slowly rising and tilting down, volumetric light, cinematic colour grade, calm pace' },
  { title: 'Reel hook (9:16)', category: 'video', kind: 'video', body: 'Vertical 9:16 clip: fast push-in on {{subject}} doing {{action}}, energetic handheld feel, bold colours, motion blur, made to stop the scroll in the first second' },
  // writing
  { title: 'Reply to a client', category: 'writing', kind: 'text', body: 'Write a short, friendly and professional reply to this client message. Goal: {{goal}}. Keep it under 120 words, no fluff, end with a clear next step.\n\nMessage:\n{{message}}' },
  { title: 'Social post', category: 'writing', kind: 'text', body: 'Write a {{platform}} post about {{topic}} for {{audience}}. Strong first line, 3–5 short lines, one concrete example, a call to action. Give 3 versions with different hooks.' },
  { title: 'Summarise for me', category: 'writing', kind: 'text', body: 'Summarise this in 5 bullet points, then list decisions, open questions and deadlines separately:\n\n{{text}}' },
  // code
  { title: 'Explain and fix a bug', category: 'code', kind: 'text', body: 'In {{project or file}}: {{what goes wrong}}. Find the cause first (show where), then fix it with the smallest change, and tell me how you checked it.' },
  { title: 'Landing page', category: 'code', kind: 'text', body: 'Build a one-page website for {{business}}: hero with one clear promise, 3 benefits, how it works, testimonials, FAQ, contact. Style: {{style}}. Mobile first, fast, accessible.' },
  // business
  { title: 'Offer / quote', category: 'business', kind: 'text', body: 'Prepare a clear offer for {{client}} for {{service}}: scope (what is in / out), timeline, price {{price}}, payment terms, next steps. Polish, professional, one page.' },
  { title: 'Idea check', category: 'business', kind: 'text', body: 'Be honest about this idea: {{idea}}. Who exactly needs it, what they use today, biggest risks, the cheapest test I can run this week, and what result would prove it works.' },
  // life
  { title: 'Plan my week', category: 'life', kind: 'text', body: 'Plan my week. Fixed things: {{fixed}}. Goals: {{goals}}. Give a realistic day-by-day plan with focus blocks, breaks and one buffer slot per day.' },
  { title: 'Trip plan', category: 'life', kind: 'text', body: 'Plan a {{days}}-day trip to {{place}} for {{who}}, budget {{budget}}. Day by day: what to see, where to eat, how to get around, and one rainy-day option.' },
];

let ready = false;
function ensure() {
  if (ready) return;
  getDb().exec(`CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text',
    favorite INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0, builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_used TEXT)`);
  if (!get<{ n: number }>('SELECT COUNT(*) AS n FROM prompts')?.n) {
    const t = now();
    for (const p of STARTERS) run('INSERT INTO prompts (id, title, body, category, kind, builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)', randomBytes(6).toString('hex'), p.title, p.body, p.category, p.kind, t, t);
  }
  ready = true;
}

/** {{name}} placeholders in a prompt, in order, without repeats. */
export const promptVars = (body: string) => [...new Set([...body.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]))];

export function listPrompts() {
  ensure();
  return all<PromptRow>('SELECT * FROM prompts ORDER BY favorite DESC, (last_used IS NULL), last_used DESC, uses DESC, created_at DESC').map((p) => ({ ...p, vars: promptVars(p.body) }));
}

export function savePrompt(p: Partial<PromptRow>) {
  ensure();
  const title = String(p.title ?? '').trim().slice(0, 120);
  const body = String(p.body ?? '').trim().slice(0, 8000);
  const category = CATEGORIES.includes(p.category as any) ? p.category! : 'writing';
  const kind = p.kind === 'image' || p.kind === 'video' ? p.kind : category === 'image' ? 'image' : category === 'video' ? 'video' : 'text';
  const t = now();
  if (p.id && get('SELECT id FROM prompts WHERE id = ?', p.id)) {
    const cur = get<PromptRow>('SELECT * FROM prompts WHERE id = ?', p.id)!;
    run('UPDATE prompts SET title = ?, body = ?, category = ?, kind = ?, favorite = ?, updated_at = ? WHERE id = ?',
      title || cur.title, body || cur.body, p.category ? category : cur.category, p.kind || p.category ? kind : cur.kind, p.favorite === undefined ? cur.favorite : p.favorite ? 1 : 0, t, p.id);
  } else {
    if (!body) throw new Error('The prompt is empty');
    p.id = randomBytes(6).toString('hex');
    run('INSERT INTO prompts (id, title, body, category, kind, favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      p.id, title || body.slice(0, 50), body, category, kind, p.favorite ? 1 : 0, t, t);
  }
  emit('prompts.changed', { id: p.id });
  const row = get<PromptRow>('SELECT * FROM prompts WHERE id = ?', p.id)!;
  return { ...row, vars: promptVars(row.body) };
}

export function deletePrompt(id: string) {
  ensure();
  const ok = !!run('DELETE FROM prompts WHERE id = ?', id).changes;
  if (ok) emit('prompts.changed', { id, deleted: true });
  return ok;
}

export function usePrompt(id: string) {
  ensure();
  run('UPDATE prompts SET uses = uses + 1, last_used = ? WHERE id = ?', now(), id);
  return { ok: true };
}
