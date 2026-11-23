// "ALTTER on your server, 24/7": one PowerShell file that carries a whole headless ALTTER
// (server bundle + web app + skills + relay) as a base64 .tar.gz and installs it on a Windows VPS.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { domainFor } from './remote.ts';

const here = import.meta.dirname;
const first = (...p: (string | undefined)[]) => p.find((x) => x && existsSync(x));

function sources() {
  const bundle = first(process.env.ALTER_SERVER_BUNDLE, join(here, 'altter-server.mjs'), join(here, '../../../apps/desktop/dist/altter-server.mjs'));
  const web = first(process.env.ALTER_WEB_DIR, join(here, '../../../apps/web/dist'));
  const skills = first(process.env.ALTER_SKILLS_DIR, join(here, '../../../skills'));
  const relay = first(process.env.ALTER_RELAY_DIR, join(here, '../../../apps/relay'));
  return { bundle, web, skills, relay };
}

export function serverPackageReady(): boolean {
  const s = sources();
  return !!(s.bundle && s.web && s.relay);
}

// ---------- a tiny ustar writer ----------
function header(name: string, size: number, dir: boolean): Buffer {
  const h = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', 154);
    prefix = name.slice(0, cut);
    name = name.slice(cut + 1);
  }
  h.write(name, 0, 100, 'utf8');
  h.write(dir ? '0000755\0' : '0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136);
  h.write('        ', 148);
  h.write(dir ? '5' : '0', 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

function tar(entries: { name: string; data?: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    const dir = !e.data;
    parts.push(header(dir ? e.name.replace(/\/?$/, '/') : e.name, e.data?.length ?? 0, dir));
    if (e.data) {
      parts.push(e.data);
      const pad = (512 - (e.data.length % 512)) % 512;
      if (pad) parts.push(Buffer.alloc(pad));
    }
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

function walk(root: string, base: string, out: { name: string; data?: Buffer }[], skip = (_: string) => false) {
  for (const f of readdirSync(root)) {
    const p = join(root, f);
    const name = (base + '/' + relative(root, p)).replace(/\\/g, '/');
    if (skip(name)) continue;
    if (statSync(p).isDirectory()) {
      out.push({ name });
      walk(p, name, out, skip);
    } else out.push({ name, data: readFileSync(p) });
  }
}

/** The installer script, address filled in (or found on the server when host is empty). */
export function serverSetupScript(host: string): { domain: string; script: string } {
  const s = sources();
  if (!s.bundle || !s.web || !s.relay) throw new Error('This ALTTER build has no server package');
  const entries: { name: string; data?: Buffer }[] = [{ name: 'altter-server.mjs', data: readFileSync(s.bundle) }];
  entries.push({ name: 'web' });
  walk(s.web, 'web', entries);
  entries.push({ name: 'skills' });
  if (s.skills) walk(s.skills, 'skills', entries);
  entries.push({ name: 'relay' });
  walk(s.relay, 'relay', entries, (n) => /watch\.json$|connection\.txt$/.test(n));
  const tgz = gzipSync(tar(entries), { level: 9 });
  const v = domainFor(host);
  const domain = v ? (/sslip\.io$/.test(v) ? 'server.' + v : v) : '';
  const ps = readFileSync(join(s.relay, 'setup-server.ps1'), 'utf8');
  const script = '﻿' + ps
    .replace("'__DOMAIN__'", `'${(domain || '__DOMAIN__').replace(/'/g, '')}'`)
    .replace("'__BUNDLE_B64__'", `'${tgz.toString('base64')}'`);
  return { domain, script };
}
