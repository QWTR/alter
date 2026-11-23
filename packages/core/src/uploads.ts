// Files people attach in a chat (pasted screenshots, PDFs, images, videos, documents…).
// Stored under <home>/uploads/<random id>/<name>; the unguessable id is the capability for /files/<id>/<name>.
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { HOME } from './config.ts';

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

export const MAX_UPLOAD = 300 * 1024 * 1024;
export const uploadsDir = () => join(HOME, 'uploads');

const TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.zip': 'application/zip', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Keeps the name readable but safe on every file system. */
function safeName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/^\.+/, '').trim().slice(-120);
  return clean || 'file';
}

const typeOf = (name: string, given?: string) => (given && given !== 'application/octet-stream' ? given : TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream');

/** Streams a raw request body (one file) to disk. */
export async function saveUpload(req: IncomingMessage, rawName: string, rawType?: string): Promise<Attachment> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_UPLOAD) throw Object.assign(new Error('File too large (max 300 MB)'), { status: 413 });
  const id = randomBytes(12).toString('hex');
  const name = safeName(rawName);
  const dir = join(uploadsDir(), id);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  let size = 0;
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(file);
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_UPLOAD) {
        req.destroy();
        out.destroy();
        reject(Object.assign(new Error('File too large (max 300 MB)'), { status: 413 }));
      }
    });
    req.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    req.on('error', reject);
  }).catch((e) => {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  });
  const type = typeOf(name, rawType);
  writeFileSync(join(dir, '.meta.json'), JSON.stringify({ name, type, size }));
  return { id, name, type, size, url: `/files/${id}/${encodeURIComponent(name)}` };
}

/** id → the stored file (or undefined for unknown / malformed ids). */
export function getUpload(id: string): (Attachment & { file: string }) | undefined {
  if (!/^[0-9a-f]{24}$/.test(id)) return;
  const dir = join(uploadsDir(), id);
  try {
    const meta = JSON.parse(readFileSync(join(dir, '.meta.json'), 'utf8'));
    const file = join(dir, meta.name);
    if (!existsSync(file)) return;
    return { id, name: meta.name, type: meta.type, size: meta.size, url: `/files/${id}/${encodeURIComponent(meta.name)}`, file };
  } catch {
    return;
  }
}

/** GET /files/<id>/<name> — with byte ranges, so videos can seek. */
export function serveUpload(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
  const m = pathname.match(/^\/files\/([0-9a-f]{24})\//);
  const up = m && getUpload(m[1]);
  if (!up) return false;
  const headers: Record<string, string | number> = {
    'content-type': up.type,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    // never render uploaded HTML/SVG as a page on ALTTER's origin
    // (Chrome's PDF viewer refuses sandboxed documents, and a PDF can't run ALTTER's scripts anyway)
    ...(up.type === 'application/pdf' ? {} : { 'content-security-policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox" }),
    'content-disposition': `${/^(image|video|audio)\/|^application\/pdf|^text\/plain/.test(up.type) && !/svg/.test(up.type) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(up.name)}`,
  };
  sendFileRange(req, res, up.file, headers);
  return true;
}

/** Streams a file, honouring a byte range (video seeking). */
export function sendFileRange(req: IncomingMessage, res: ServerResponse, file: string, headers: Record<string, string | number>) {
  const total = statSync(file).size;
  headers = { 'accept-ranges': 'bytes', ...headers };
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && total) {
    const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
    if (start >= total || start > end) {
      res.writeHead(416, { 'content-range': `bytes */${total}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${total}`, 'content-length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': total });
  createReadStream(file).pipe(res);
}

const kindOf = (a: Attachment) => (a.type.startsWith('image/') ? 'image' : a.type.startsWith('video/') ? 'video' : a.type.startsWith('audio/') ? 'audio' : a.type === 'application/pdf' ? 'PDF' : 'file');
const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The block the AI gets with a message: what was attached and where it is on disk. */
export function describeAttachments(list: (Attachment & { file: string })[]): string {
  if (!list.length) return '';
  const lines = list.map((a) => `- ${a.name} (${kindOf(a)}, ${fmtSize(a.size)}): ${a.file}`);
  const hasVideo = list.some((a) => a.type.startsWith('video/') || a.type.startsWith('audio/'));
  return `Attached files (open them with your file-reading tool — it can see images and read PDFs; look at every one before answering):\n${lines.join('\n')}${hasVideo ? '\nVideos/audio can not be watched directly: use their name, size and anything the user says about them, or ffmpeg/ffprobe if you may run commands.' : ''}`;
}
