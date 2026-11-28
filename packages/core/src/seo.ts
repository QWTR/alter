// SEO audit of one page: fetches the HTML, robots.txt and sitemap and checks what search engines and
// link previews read (title, description, headings, canonical, Open Graph, structured data, images, speed).
// No AI and no account needed — the agent then explains and fixes what it finds.

export type SeoLevel = 'ok' | 'warn' | 'bad';
export interface SeoCheck { id: string; level: SeoLevel; value?: string; weight: number }
export interface SeoAudit {
  url: string; finalUrl: string; status: number; ms: number; bytes: number; score: number;
  title?: string; description?: string; checks: SeoCheck[];
}

const UA = 'Mozilla/5.0 (compatible; ALTTER-SEO/1.0)';
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, ' '));

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : undefined;
}
function meta(html: string, key: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const k = (attr(tag, 'name') ?? attr(tag, 'property') ?? '').toLowerCase();
    if (k === key) return attr(tag, 'content');
  }
  return undefined;
}

async function get(url: string, ms = 15_000) {
  const t0 = Date.now();
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  return { r, text, ms: Date.now() - t0 };
}

export function normalizeUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) addresses');
  return u.toString();
}

export async function seoAudit(input: string): Promise<SeoAudit> {
  const url = normalizeUrl(input);
  const { r, text: html, ms } = await get(url);
  const finalUrl = r.url || url;
  const origin = new URL(finalUrl).origin;
  const checks: SeoCheck[] = [];
  const add = (id: string, level: SeoLevel, value?: string, weight = 1) => checks.push({ id, level, value, weight });

  add('status', r.ok ? 'ok' : 'bad', String(r.status), 3);
  add('https', finalUrl.startsWith('https:') ? 'ok' : 'bad', undefined, 2);

  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  add('title', !title ? 'bad' : title.length < 25 || title.length > 65 ? 'warn' : 'ok', title ? `${title.length}: ${title}` : undefined, 3);
  const description = meta(html, 'description') ?? '';
  add('description', !description ? 'bad' : description.length < 70 || description.length > 165 ? 'warn' : 'ok', description ? `${description.length}: ${description}` : undefined, 2);

  const h1 = (html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) ?? []).map(strip).filter(Boolean);
  add('h1', h1.length === 1 ? 'ok' : h1.length ? 'warn' : 'bad', h1.length ? `${h1.length}: ${h1.slice(0, 3).join(' | ')}` : '0', 2);
  const h2 = (html.match(/<h2\b/gi) ?? []).length;
  add('headings', h2 ? 'ok' : 'warn', String(h2));

  const lang = attr(html.match(/<html\b[^>]*>/i)?.[0] ?? '', 'lang');
  add('lang', lang ? 'ok' : 'warn', lang);
  const viewport = meta(html, 'viewport');
  add('viewport', viewport ? 'ok' : 'bad', viewport, 2);
  const canonicalTag = (html.match(/<link\b[^>]*>/gi) ?? []).find((t) => /rel\s*=\s*["']?canonical/i.test(t));
  const canonical = canonicalTag ? attr(canonicalTag, 'href') : undefined;
  add('canonical', canonical ? 'ok' : 'warn', canonical);
  const robotsMeta = meta(html, 'robots') ?? '';
  add('indexable', /noindex/i.test(robotsMeta) || /noindex/i.test(r.headers.get('x-robots-tag') ?? '') ? 'bad' : 'ok', robotsMeta || undefined, 3);

  const og = ['og:title', 'og:description', 'og:image'].filter((k) => meta(html, k));
  add('og', og.length === 3 ? 'ok' : og.length ? 'warn' : 'bad', `${og.length}/3`);
  add('twitter', meta(html, 'twitter:card') ? 'ok' : 'warn', meta(html, 'twitter:card'));
  const ld = (html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? []).length;
  add('schema', ld ? 'ok' : 'warn', String(ld));
  const favicon = (html.match(/<link\b[^>]*>/gi) ?? []).some((t) => /rel\s*=\s*["']?[^"'>]*icon/i.test(t));
  add('favicon', favicon ? 'ok' : 'warn');

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = imgs.filter((t) => attr(t, 'alt') === undefined).length;
  add('alt', !imgs.length || !noAlt ? 'ok' : noAlt / imgs.length > 0.3 ? 'bad' : 'warn', `${imgs.length - noAlt}/${imgs.length}`, 2);

  const body = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ');
  const words = strip(body).split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
  add('words', words >= 300 ? 'ok' : words >= 120 ? 'warn' : 'bad', String(words), 2);
  const links = (html.match(/<a\b[^>]*href/gi) ?? []).length;
  add('links', links >= 5 ? 'ok' : 'warn', String(links));

  const bytes = Buffer.byteLength(html);
  add('speed', ms < 1200 ? 'ok' : ms < 3000 ? 'warn' : 'bad', `${ms} ms`, 2);
  add('size', bytes < 300_000 ? 'ok' : bytes < 1_000_000 ? 'warn' : 'bad', `${Math.round(bytes / 1024)} KB`);

  const [robots, sitemap] = await Promise.all([
    get(`${origin}/robots.txt`, 8000).catch(() => undefined),
    get(`${origin}/sitemap.xml`, 8000).catch(() => undefined),
  ]);
  const robotsOk = !!robots?.r.ok && !/<html/i.test(robots.text);
  add('robots', robotsOk ? (/^\s*disallow:\s*\/\s*$/im.test(robots!.text) && /user-agent:\s*\*/i.test(robots!.text) ? 'bad' : 'ok') : 'warn');
  const smInRobots = robotsOk && /sitemap:/i.test(robots!.text);
  add('sitemap', (sitemap?.r.ok && /<(urlset|sitemapindex)/i.test(sitemap.text)) || smInRobots ? 'ok' : 'warn');

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + c.weight * (c.level === 'ok' ? 1 : c.level === 'warn' ? 0.5 : 0), 0);
  return { url, finalUrl, status: r.status, ms, bytes, score: Math.round((got / total) * 100), title: title || undefined, description: description || undefined, checks };
}
