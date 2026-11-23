// Live preview of web pages the AI builds: a folder is exposed under /preview/<random id>/…
// (the unguessable id is the capability; nothing else on the disk is reachable).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';

const roots = new Map<string, string>(); // id -> folder
const ids = new Map<string, string>(); // folder -> id

export interface Preview {
  url: string;
  /** The file that changed (absolute). */
  file: string;
  root: string;
}

/** A page / stylesheet while the AI is still writing it. */
export interface Draft {
  id: string;
  kind: 'html' | 'css';
  url: string;
  file: string;
  /** Full text of the file as far as it has been written. */
  content: string;
  done: boolean;
}

const PAGE = /\.html?$/i;
const WEB_FILE = /\.(html?|css|js|mjs|json|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|mp4|webm)$/i;

function idFor(dir: string): string {
  let id = ids.get(dir);
  if (!id) {
    id = randomBytes(12).toString('hex');
    ids.set(dir, id);
    roots.set(id, dir);
  }
  return id;
}

const abs = (path: string, cwd?: string) => normalize(isAbsolute(path) ? path : resolve(cwd ?? process.cwd(), path));

/** The page to show for a file: the file itself if it is a page, else the nearest index.html above it. */
function pageFor(file: string): Preview | undefined {
  let dir = dirname(file);
  let entry = PAGE.test(file) ? basename(file) : '';
  for (let i = 0; !entry && i < 3; i++) {
    if (existsSync(join(dir, 'index.html'))) entry = 'index.html';
    else {
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  if (!entry) return;
  return { url: `/preview/${idFor(dir)}/${encodeURIComponent(entry)}`, file, root: dir };
}

/** Finds the page to show for a changed file (which must exist). */
export function previewFor(path: string, cwd?: string): Preview | undefined {
  const file = abs(path, cwd);
  if (!WEB_FILE.test(file) || !existsSync(file) || !statSync(file).isFile()) return;
  return pageFor(file);
}

/** /preview/<id>/<path> → file on disk. A page that does not exist yet is still "found" (it is being written). */
export function resolvePreview(pathname: string): { file: string; exists: boolean } | undefined {
  const m = pathname.match(/^\/preview\/([0-9a-f]{24})\/(.*)$/);
  const root = m && roots.get(m[1]);
  if (!root) return;
  const rel = decodeURIComponent(m![2] || 'index.html');
  let file = normalize(join(root, rel));
  if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep)) return;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  const exists = existsSync(file) && statSync(file).isFile();
  return exists || PAGE.test(file) ? { file, exists } : undefined;
}

/** .html paths mentioned in an answer ("Done: D:\site\index.html", "landing/index.html"); resolved later. */
export function pagesIn(text: string): string[] {
  return [...new Set(text.match(/(?:[A-Za-z]:[\\/])?[^\s`'"<>|*?()[\]]+\.html?\b/g) ?? [])];
}

export const previewMime = (file: string) => extname(file).toLowerCase();

/** A string field of JSON that may still be streaming in. `complete` once its closing quote arrived. */
export function partialField(json: string, key: string): { value: string; complete: boolean } | undefined {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(json);
  if (!m) return;
  let out = '';
  let i = m.index + m[0].length;
  const ESC: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };
  while (i < json.length) {
    const c = json[i];
    if (c === '"') return { value: out, complete: true };
    if (c === '\\') {
      const n = json[i + 1];
      if (n === undefined) break;
      if (n === 'u') {
        const h = json.slice(i + 2, i + 6);
        if (h.length < 4) break;
        out += String.fromCharCode(parseInt(h, 16));
        i += 6;
        continue;
      }
      out += ESC[n] ?? n;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return { value: out, complete: false };
}

/**
 * Turns a streaming Write/Edit call into the file's text so far.
 * Write: the content as it is typed. Edit: the file on disk with the replacement as it is typed.
 */
export function draftFrom(d: { id: string; tool: string; json: string; done: boolean }, cwd: string, cache: Map<string, string>): Draft | undefined {
  const path = partialField(d.json, 'file_path');
  if (!path?.complete) return;
  const file = abs(path.value, cwd);
  const kind = PAGE.test(file) ? 'html' : /\.css$/i.test(file) ? 'css' : undefined;
  if (!kind) return;
  let content: string | undefined;
  if (d.tool === 'Write') content = partialField(d.json, 'content')?.value;
  else if (d.tool === 'Edit') {
    const oldS = partialField(d.json, 'old_string');
    const newS = partialField(d.json, 'new_string');
    if (!oldS?.complete || !newS) return;
    let base = cache.get(d.id);
    if (base === undefined) {
      try {
        base = readFileSync(file, 'utf8');
      } catch {
        return;
      }
      cache.set(d.id, base);
    }
    const at = base.indexOf(oldS.value);
    if (at < 0) return;
    content = base.slice(0, at) + newS.value + base.slice(at + oldS.value.length);
  }
  if (content === undefined) return;
  const page = kind === 'html' ? { url: `/preview/${idFor(dirname(file))}/${encodeURIComponent(basename(file))}` } : pageFor(file);
  if (!page) return;
  return { id: d.id, kind, url: page.url, file, content, done: d.done };
}
