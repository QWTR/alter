// Reaching ALTTER from the internet under a real https address.
//  - quick:      Cloudflare quick tunnel (free, no account, random *.trycloudflare.com address). cloudflared is fetched by itself.
//  - relay:      your own server (a VPS) running apps/relay — a fixed domain, e.g. https://1-2-3-4.sslip.io or your own.
//                ALTTER dials out to it over a WebSocket, so nothing has to be opened on this computer or the router.
//  - cloudflare: a named Cloudflare tunnel (your domain on Cloudflare) — paste the tunnel token and the hostname.
// Every request that comes in this way is marked, so it never counts as "this computer" (the owner token stays here).
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HOME, loadConfig, saveConfig } from './config.ts';
import { bus } from './events.ts';
import { all } from './db.ts';

// ---------- what the relay watches while this computer is off ----------
const WATCH_LABELS: Record<string, Record<string, string>> = {
  en: { fail: '⚠️ {name} is down', ok: '✅ {name} works again', offline: '💤 Your ALTTER computer is offline', offlineBody: 'I keep watching your sites from the server and will tell you if one breaks.', online: '✅ ALTTER is back online', fromRelay: '(checked by your server — the computer is off)' },
  pl: { fail: '⚠️ {name} nie działa', ok: '✅ {name} znowu działa', offline: '💤 Komputer z ALTTER jest offline', offlineBody: 'Dalej pilnuję Twoich stron z serwera i dam znać, jeśli coś padnie.', online: '✅ ALTTER znowu online', fromRelay: '(sprawdzone przez Twój serwer — komputer jest wyłączony)' },
  de: { fail: '⚠️ {name} ist ausgefallen', ok: '✅ {name} läuft wieder', offline: '💤 Dein ALTTER-Computer ist offline', offlineBody: 'Ich prüfe deine Seiten weiter vom Server aus.', online: '✅ ALTTER ist wieder online', fromRelay: '(vom Server geprüft — der Computer ist aus)' },
  es: { fail: '⚠️ {name} no funciona', ok: '✅ {name} vuelve a funcionar', offline: '💤 Tu equipo con ALTTER está desconectado', offlineBody: 'Sigo vigilando tus webs desde el servidor.', online: '✅ ALTTER vuelve a estar en línea', fromRelay: '(revisado por tu servidor: el equipo está apagado)' },
  fr: { fail: '⚠️ {name} est en panne', ok: '✅ {name} remarche', offline: '💤 L’ordinateur ALTTER est hors ligne', offlineBody: 'Je continue à surveiller vos sites depuis le serveur.', online: '✅ ALTTER est de retour', fromRelay: '(vérifié par votre serveur — l’ordinateur est éteint)' },
  uk: { fail: '⚠️ {name} не працює', ok: '✅ {name} знову працює', offline: '💤 Комп’ютер з ALTTER офлайн', offlineBody: 'Я далі стежу за сайтами з сервера.', online: '✅ ALTTER знову онлайн', fromRelay: '(перевірено сервером — комп’ютер вимкнено)' },
};
function watchFrame() {
  const cfg = loadConfig() as any;
  const monitors = all<{ id: string; data: string }>('SELECT id, data FROM agents')
    .map((r) => ({ id: r.id, ...JSON.parse(r.data) }))
    .filter((a) => a.enabled !== false && a.monitor && (a.monitor.type === 'http' || a.monitor.type === 'tcp'))
    .map((a) => ({ id: a.id, name: a.name, type: a.monitor.type, target: a.monitor.target, everyMinutes: a.monitor.everyMinutes, status: a.monitorState?.status, url: `/agents/${a.id}` }));
  return { t: 'watch', monitors, push: cfg.push?.vapid ? { vapid: cfg.push.vapid, subs: cfg.push.subs ?? [] } : null, labels: WATCH_LABELS[cfg.language] ?? WATCH_LABELS.en };
}

export type RemoteMode = 'quick' | 'relay' | 'cloudflare';
export interface RemoteSettings {
  mode: RemoteMode;
  /** Open the link by itself when ALTTER starts. */
  auto: boolean;
  relayUrl?: string;
  relayKey?: string;
  cfToken?: string;
  cfHostname?: string;
}

export const RELAY_HEADER = 'x-alter-relay';

export function remoteSettings(): RemoteSettings {
  const c = loadConfig() as any;
  return { mode: 'quick', auto: false, ...(c.remote ?? {}) };
}

export function setRemoteSettings(patch: Partial<RemoteSettings>): RemoteSettings {
  const c = loadConfig() as any;
  const next = { ...remoteSettings(), ...patch };
  if (next.relayUrl) next.relayUrl = next.relayUrl.trim().replace(/\/+$/, '');
  if (next.relayUrl && !/^https?:\/\//.test(next.relayUrl)) next.relayUrl = 'https://' + next.relayUrl;
  if (next.cfHostname) next.cfHostname = next.cfHostname.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  c.remote = next;
  saveConfig();
  return next;
}

/** What the UI may see (no secrets). */
export const publicRemoteSettings = () => {
  const r = remoteSettings();
  return { mode: r.mode, auto: r.auto, relayUrl: r.relayUrl ?? '', cfHostname: r.cfHostname ?? '', hasRelayKey: !!r.relayKey, hasCfToken: !!r.cfToken };
};

// ---------- cloudflared (fetched once, ~40 MB, from Cloudflare's GitHub releases) ----------
const binDir = () => join(HOME, 'bin');
const exe = process.platform === 'win32' ? '.exe' : '';

function cloudflaredOnDisk(): string | null {
  const own = join(binDir(), 'cloudflared' + exe);
  if (existsSync(own)) return own;
  if (process.platform !== 'win32') return null;
  const env = process.env;
  const spots = [
    join(env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
    join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'cloudflared', 'cloudflared.exe'),
    join(env.ProgramFiles ?? 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
  ];
  return spots.find((p) => existsSync(p)) ?? null;
}

function cloudflaredAsset(): string | null {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : null;
  if (!arch) return null;
  if (process.platform === 'win32') return `cloudflared-windows-${arch}.exe`;
  if (process.platform === 'linux') return `cloudflared-linux-${arch}`;
  return null; // macOS ships as .tgz — use brew install cloudflared
}

let fetching: Promise<string> | null = null;
async function ensureCloudflared(onStep?: (s: string) => void): Promise<string> {
  const have = cloudflaredOnDisk();
  if (have) return have;
  if (process.platform !== 'win32' && process.platform !== 'linux') return 'cloudflared';
  return (fetching ??= (async () => {
    const asset = cloudflaredAsset();
    if (!asset) throw new Error('missing');
    onStep?.('download');
    mkdirSync(binDir(), { recursive: true });
    const dest = join(binDir(), 'cloudflared' + exe);
    const part = dest + '.part';
    const r = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`, { redirect: 'follow' });
    if (!r.ok || !r.body) throw new Error(`download ${r.status}`);
    await pipeline(Readable.fromWeb(r.body as any), createWriteStream(part, { mode: 0o755 }));
    renameSync(part, dest);
    return dest;
  })().catch((e) => {
    fetching = null;
    rmSync(join(binDir(), 'cloudflared' + exe + '.part'), { force: true });
    throw e;
  }));
}

// ---------- state ----------
interface Link {
  mode: RemoteMode;
  url: string | null;
  error?: string;
  stage?: string;
  stop: () => void;
}
let link: Link | null = null;
let starting: Promise<{ url: string | null; error?: string }> | null = null;

export function tunnelStatus() {
  return link ? { running: true, mode: link.mode, url: link.url, error: link.error, stage: link.stage } : { running: false, mode: remoteSettings().mode, url: null };
}

/** The address guests and phones reach this ALTTER at from anywhere, if one is open. */
export const publicUrl = () => link?.url ?? null;

export function stopTunnel() {
  link?.stop();
  link = null;
}

export function startTunnel(port: number): Promise<{ url: string | null; error?: string }> {
  if (link?.url) return Promise.resolve({ url: link.url });
  if (starting) return starting;
  stopTunnel();
  const s = remoteSettings();
  starting = (s.mode === 'relay' ? startRelay(port, s) : startCloudflared(port, s)).finally(() => (starting = null));
  return starting;
}

// ---------- cloudflared: quick tunnel or a named one ----------
async function startCloudflared(port: number, s: RemoteSettings): Promise<{ url: string | null; error?: string }> {
  const named = s.mode === 'cloudflare';
  if (named && (!s.cfToken || !s.cfHostname)) return { url: null, error: 'config' };
  const l: Link = { mode: s.mode, url: null, stage: 'start', stop: () => {} };
  link = l;
  let bin: string;
  try {
    bin = await ensureCloudflared((st) => (l.stage = st));
  } catch (e) {
    link = null;
    return { url: null, error: (e as Error).message === 'missing' ? 'missing' : 'download' };
  }
  if (link !== l) return { url: null, error: 'stopped' };
  l.stage = 'connect';
  const args = named
    ? ['tunnel', '--no-autoupdate', 'run', '--url', `http://localhost:${port}`, '--token', s.cfToken!]
    : ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`];
  let proc: ChildProcess;
  try {
    proc = spawn(bin, args, { windowsHide: true });
  } catch {
    link = null;
    return { url: null, error: 'missing' };
  }
  l.stop = () => proc.kill();
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: { url: string | null; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!r.url && link === l) link = null;
      resolve(r);
    };
    const timer = setTimeout(() => done({ url: null, error: 'timeout' }), 45_000);
    const onData = (b: Buffer) => {
      const out = b.toString();
      const m = named ? (/Registered tunnel connection|Connection [a-f0-9-]+ registered/i.test(out) ? `https://${s.cfHostname}` : null) : out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
      if (m && !l.url) {
        l.url = m;
        l.stage = undefined;
        done({ url: m });
      }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('error', () => done({ url: null, error: 'missing' }));
    proc.on('exit', (code) => {
      if (link === l) link = null;
      done({ url: null, error: `exit ${code}` });
    });
  });
}

// ---------- your own relay server ----------
// Protocol (JSON text frames):
//   relay → alter  {t:'req', id, method, path, headers}  {t:'body', id, d:<b64>}  {t:'bend', id}  {t:'abort', id}
//   alter → relay  {t:'head', id, status, headers}       {t:'data', id, d:<b64>}  {t:'end', id}   {t:'hello', version}
function startRelay(port: number, s: RemoteSettings): Promise<{ url: string | null; error?: string }> {
  if (!s.relayUrl || !s.relayKey) return Promise.resolve({ url: null, error: 'config' });
  const base = s.relayUrl;
  const wsUrl = base.replace(/^http/, 'ws') + '/_alter/connect?key=' + encodeURIComponent(s.relayKey);
  let stopped = false;
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let backoff = 1000;
  const l: Link = {
    mode: 'relay',
    url: null,
    stage: 'connect',
    stop: () => {
      stopped = true;
      clearTimeout(retry);
      try { ws?.close(); } catch {}
    },
  };
  link = l;

  return new Promise((resolve) => {
    let first = true;
    const answer = (r: { url: string | null; error?: string }) => {
      if (!first) return;
      first = false;
      resolve(r);
    };
    const connect = () => {
      if (stopped) return;
      const pending = new Map<string, ReturnType<typeof request>>();
      const sock = (ws = new WebSocket(wsUrl));
      const send = (m: unknown) => sock.readyState === 1 && sock.send(JSON.stringify(m));
      const timer = setTimeout(() => {
        if (sock.readyState !== 1) sock.close();
      }, 15_000);
      sock.onopen = () => {
        clearTimeout(timer);
        backoff = 1000;
        l.url = base;
        l.error = undefined;
        l.stage = undefined;
        send({ t: 'hello' });
        send(watchFrame());
        let tm: ReturnType<typeof setTimeout> | undefined;
        const onEv = (e: { type: string }) => {
          if (!['agent.changed', 'push.changed', 'monitor.changed', 'settings.changed'].includes(e.type)) return;
          clearTimeout(tm);
          tm = setTimeout(() => send(watchFrame()), 3000);
        };
        bus.on('event', onEv);
        sock.addEventListener('close', () => { bus.off('event', onEv); clearTimeout(tm); });
        answer({ url: base });
      };
      sock.onmessage = (ev) => {
        let m: any;
        try { m = JSON.parse(String(ev.data)); } catch { return; }
        if (m.t === 'req') {
          const headers = { ...(m.headers ?? {}), [RELAY_HEADER]: '1' };
          const req = request({ host: '127.0.0.1', port, method: m.method, path: m.path, headers }, (res) => {
            send({ t: 'head', id: m.id, status: res.statusCode, headers: res.headers });
            res.on('data', (c: Buffer) => send({ t: 'data', id: m.id, d: c.toString('base64') }));
            res.on('end', () => {
              pending.delete(m.id);
              send({ t: 'end', id: m.id });
            });
          });
          req.on('error', () => {
            pending.delete(m.id);
            send({ t: 'head', id: m.id, status: 502, headers: { 'content-type': 'text/plain' } });
            send({ t: 'end', id: m.id });
          });
          pending.set(m.id, req);
          if (!m.body) req.end();
        } else if (m.t === 'body') pending.get(m.id)?.write(Buffer.from(m.d, 'base64'));
        else if (m.t === 'bend') pending.get(m.id)?.end();
        else if (m.t === 'abort') {
          pending.get(m.id)?.destroy();
          pending.delete(m.id);
        } else if (m.t === 'ping') send({ t: 'pong' });
      };
      sock.onclose = (ev) => {
        clearTimeout(timer);
        for (const r of pending.values()) r.destroy();
        if (stopped) return;
        const bad = ev.code === 4001;
        l.url = null;
        l.error = bad ? 'key' : 'offline';
        l.stage = 'connect';
        if (bad) {
          answer({ url: null, error: 'key' });
          if (link === l) link = null;
          return;
        }
        answer({ url: null, error: 'offline' });
        retry = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      };
      sock.onerror = () => {};
    };
    connect();
  });
}

/** Opens the link by itself on start, when the user turned that on. */
export function autoStartRemote(port: number) {
  const s = remoteSettings();
  if (s.auto) startTunnel(port).catch(() => {});
}

// ---------- one-click VPS setup script (domain + key baked in) ----------
const relayDir = () => process.env.ALTER_RELAY_DIR ?? join(import.meta.dirname, '../../../apps/relay');

/** A fresh secret for the relay (kept in config; the UI never sees it again). */
export function ensureRelayKey(): string {
  const s = remoteSettings();
  if (s.relayKey) return s.relayKey;
  const key = randomBytes(24).toString('base64url');
  setRemoteSettings({ relayKey: key });
  return key;
}

/** "1.2.3.4" → "1-2-3-4.sslip.io" (a free domain that points at that IP, good for an https certificate). */
export function domainFor(input: string): string {
  const v = input.trim().replace(/^https?:\/\//, '').replace(/[/:].*$/, '');
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(v) ? v.replace(/\./g, '-') + '.sslip.io' : v.toLowerCase();
}

export function vpsSetupScript(domain: string): string {
  const key = ensureRelayKey();
  const relay = readFileSync(join(relayDir(), 'relay.mjs'));
  const ps = readFileSync(join(relayDir(), 'setup-vps.ps1'), 'utf8');
  return '﻿' + ps.replace("'__DOMAIN__'", `'${domain.replace(/'/g, '')}'`).replace("'__KEY__'", `'${key}'`).replace("'__RELAY_B64__'", `'${relay.toString('base64')}'`);
}
