#!/usr/bin/env node
// ALTTER Relay — put ALTTER on your own domain from any server (a VPS with Windows or Linux).
// Your computer dials out to this relay over a WebSocket and the relay forwards every web request to it,
// so nothing has to be opened on your computer or router. Zero dependencies, Node 20+.
//
//   ALTER_RELAY_KEY=<secret> node relay.mjs            (listens on 127.0.0.1:8787 by default)
//   env: ALTER_RELAY_PORT, ALTER_RELAY_HOST, ALTER_RELAY_KEY
// Put an https server in front (setup-vps.ps1 sets up Caddy with a free certificate).
import { createCipheriv, createECDH, createHash, createHmac, createPrivateKey, randomBytes, sign, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { connect as tcpConnect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.ALTER_RELAY_PORT || 8787);
const HOST = process.env.ALTER_RELAY_HOST || '127.0.0.1';
const KEY = process.env.ALTER_RELAY_KEY || '';
if (KEY.length < 16) {
  console.error('Set ALTER_RELAY_KEY to a secret of at least 16 characters (e.g. ' + randomBytes(24).toString('base64url') + ')');
  process.exit(1);
}
const keyOk = (k) => {
  const a = Buffer.from(String(k ?? ''));
  const b = Buffer.from(KEY);
  return a.length === b.length && timingSafeEqual(a, b);
};

// ---------- a minimal WebSocket (server side: text frames, ping/pong, close) ----------
function wsAccept(req, socket) {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 20_000);
  const peer = { socket, onmessage: () => {}, onclose: () => {}, open: true };
  let buf = Buffer.alloc(0);
  let parts = [];
  const frame = (op, payload) => {
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : (() => {
      const h = Buffer.alloc(10);
      h[0] = 0x80 | op;
      h[1] = 127;
      h.writeBigUInt64BE(BigInt(n), 2);
      return h;
    })();
    if (peer.open) socket.write(Buffer.concat([head, payload]));
  };
  peer.send = (text) => frame(1, Buffer.from(text));
  peer.close = (code = 1000) => {
    if (!peer.open) return;
    const p = Buffer.alloc(2);
    p.writeUInt16BE(code);
    frame(8, p);
    peer.open = false;
    socket.end();
  };
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80;
      const op = buf[0] & 0x0f;
      const masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      const maskAt = off;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      let data = buf.subarray(off, off + len);
      if (masked) {
        const m = buf.subarray(maskAt, maskAt + 4);
        data = Buffer.from(data);
        for (let i = 0; i < data.length; i++) data[i] ^= m[i & 3];
      }
      buf = buf.subarray(off + len);
      if (op === 8) return peer.close();
      if (op === 9) { frame(10, data); continue; }
      if (op === 10) continue;
      parts.push(data);
      if (fin) {
        const msg = Buffer.concat(parts).toString();
        parts = [];
        peer.onmessage(msg);
      }
    }
  });
  const gone = () => {
    if (peer.gone) return;
    peer.gone = true;
    peer.open = false;
    peer.onclose();
  };
  socket.on('close', gone);
  socket.on('error', gone);
  return peer;
}

// ---------- the one ALTTER connected right now ----------
let alter = null;
const waiting = new Map(); // id → { res }
let seq = 0;

function attach(peer) {
  if (alter) alter.close(4000);
  alter = peer;
  console.log(new Date().toISOString(), 'ALTTER connected');
  if (toldOffline) pushAll({ title: L('online'), body: '', url: '/', tag: 'alttter-offline', level: 'ok' });
  toldOffline = false;
  offlineSince = null;
  state.clear();
  const ping = setInterval(() => peer.send(JSON.stringify({ t: 'ping' })), 25_000);
  peer.onmessage = (text) => {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (m.t === 'watch') {
      watch = { monitors: m.monitors || [], push: m.push || null, labels: m.labels || {} };
      for (const x of watch.monitors) if (x.status && !state.has(x.id)) state.set(x.id, { status: x.status, next: 0 });
      try { writeFileSync(WATCH_FILE, JSON.stringify(watch), { mode: 0o600 }); } catch {}
      return;
    }
    const w = waiting.get(m.id);
    if (!w) return;
    if (m.t === 'head') {
      const h = { ...(m.headers || {}) };
      delete h['transfer-encoding'];
      delete h.connection;
      w.res.writeHead(m.status || 502, h);
      w.res.flushHeaders?.();
    } else if (m.t === 'data') w.res.write(Buffer.from(m.d, 'base64'));
    else if (m.t === 'end') {
      waiting.delete(m.id);
      w.res.end();
    }
  };
  peer.onclose = () => {
    clearInterval(ping);
    if (alter !== peer) return;
    alter = null;
    console.log(new Date().toISOString(), 'ALTTER disconnected');
    for (const [id, w] of waiting) {
      if (!w.res.headersSent) w.res.writeHead(502, { 'content-type': 'text/plain' });
      w.res.end();
      waiting.delete(id);
    }
  };
}

// ---------- watchdog: while the computer is off, the relay keeps an eye on what ALTTER watches ----------
// ALTTER sends its health checks + the phones' push subscriptions here (frame "watch"); when ALTTER
// has been gone for a while the relay runs the cheap checks itself and notifies the phones.
const WATCH_FILE = join(dirname(fileURLToPath(import.meta.url)), 'watch.json');
let watch = null;
try { if (existsSync(WATCH_FILE)) watch = JSON.parse(readFileSync(WATCH_FILE, 'utf8')); } catch {}
const state = new Map(); // monitor id → { status, next }
let offlineSince = null;
let toldOffline = false;
const GRACE = Number(process.env.ALTER_RELAY_GRACE_MS || 90_000);

const b64u = (b) => Buffer.from(b).toString('base64url');
const hk = (salt, ikm, info, n) => createHmac('sha256', createHmac('sha256', salt).update(ikm).digest()).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, n);
function encrypt(sub, payload) {
  const ua = Buffer.from(sub.keys.p256dh, 'base64url');
  const auth = Buffer.from(sub.keys.auth, 'base64url');
  const ecdh = createECDH('prime256v1');
  const as = ecdh.generateKeys();
  const ikm = hk(auth, ecdh.computeSecret(ua), Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32);
  const salt = randomBytes(16);
  const c = createCipheriv('aes-128-gcm', hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12));
  const body = Buffer.concat([c.update(Buffer.concat([payload, Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(4096, 16);
  head[20] = as.length;
  return Buffer.concat([head, as, body]);
}
function vapidHeader(endpoint, v) {
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const p = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 43200, sub: 'https://github.com/QWTR/alter' }));
  const pub = Buffer.from(v.publicKey, 'base64url');
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  return `vapid t=${h}.${p}.${b64u(sign('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }))}, k=${v.publicKey}`;
}
async function pushAll(msg) {
  if (!watch?.push?.vapid || !watch.push.subs?.length) return;
  const payload = Buffer.from(JSON.stringify({ ...msg, ts: Date.now() }));
  await Promise.all(watch.push.subs.map((sub) => fetch(sub.endpoint, {
    method: 'POST',
    headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: msg.level === 'error' ? 'high' : 'normal', authorization: vapidHeader(sub.endpoint, watch.push.vapid) },
    body: encrypt(sub, payload),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null)));
}
async function check(m) {
  const t0 = Date.now();
  try {
    if (m.type === 'tcp') {
      const [, host, port] = m.target.match(/^(.+):(\d+)$/) || [];
      if (!host) return { ok: false, message: 'Use host:port' };
      await new Promise((res, rej) => { const s = tcpConnect({ host, port: Number(port) }); s.setTimeout(10000); s.once('connect', () => { s.destroy(); res(); }); s.once('timeout', () => { s.destroy(); rej(new Error('timeout')); }); s.once('error', rej); });
      return { ok: true, message: `Port ${port} open` };
    }
    const url = /^https?:\/\//i.test(m.target) ? m.target : `https://${m.target}`;
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    return { ok: r.status < 400, message: `HTTP ${r.status} ${r.statusText}`.trim() + ` · ${Date.now() - t0} ms` };
  } catch (e) {
    return { ok: false, message: e.cause?.code || e.message };
  }
}
const L = (k, name) => (watch?.labels?.[k] || k).replace('{name}', name || '');
setInterval(async () => {
  if (!watch) return;
  if (alter) { offlineSince = null; return; }
  offlineSince ??= Date.now();
  const away = Date.now() - offlineSince;
  if (away < GRACE) return;
  if (!toldOffline) {
    toldOffline = true;
    pushAll({ title: L('offline'), body: L('offlineBody'), url: '/', tag: 'alttter-offline', level: 'warn' });
  }
  for (const m of watch.monitors || []) {
    const st = state.get(m.id) || { status: m.status || 'unknown', next: 0 };
    if (Date.now() < st.next) continue;
    st.next = Date.now() + Math.max(1, m.everyMinutes || 5) * 60_000;
    state.set(m.id, st);
    const r = await check(m);
    const status = r.ok ? 'ok' : 'fail';
    if (status !== st.status && st.status !== 'unknown' || (status === 'fail' && st.status === 'unknown')) {
      pushAll({ title: L(status === 'fail' ? 'fail' : 'ok', m.name), body: `${r.message}\n${L('fromRelay')}`, url: m.url || '/', tag: `alert-${m.id}`, level: status === 'fail' ? 'error' : 'ok' });
      console.log(new Date().toISOString(), 'watchdog', m.name, status, r.message);
    }
    st.status = status;
  }
}, Math.min(20_000, GRACE));

const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ALTTER</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0a12;color:#efeef6;font:16px system-ui,sans-serif}
div{text-align:center;padding:24px}b{font-size:22px}p{opacity:.65}i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#ff6b6b;margin-right:8px}</style>
<div><b><i></i>ALTTER is offline</b><p>The computer running ALTTER is off or not connected right now.<br>This page refreshes by itself.</p></div>
<script>if(/ALTTER-App//.test(navigator.userAgent))location.replace('https://localhost/?offline=1');else setTimeout(()=>location.reload(),8000)</script>`;

const server = createServer((req, res) => {
  if (req.url === '/_alter/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ ok: true, connected: !!alter, watching: watch?.monitors?.length ?? 0, phones: watch?.push?.subs?.length ?? 0 }));
  }
  if (!alter) {
    const html = (req.headers.accept || '').includes('text/html');
    res.writeHead(503, { 'content-type': html ? 'text/html; charset=utf-8' : 'application/json', 'retry-after': '8' });
    return res.end(html ? OFFLINE : JSON.stringify({ error: 'ALTTER is offline' }));
  }
  const id = (++seq).toString(36);
  const peer = alter;
  waiting.set(id, { res });
  const headers = { ...req.headers };
  delete headers.connection;
  delete headers['keep-alive'];
  const hasBody = !['GET', 'HEAD'].includes(req.method || 'GET');
  peer.send(JSON.stringify({ t: 'req', id, method: req.method, path: req.url, headers, body: hasBody }));
  if (hasBody) {
    req.on('data', (c) => peer.send(JSON.stringify({ t: 'body', id, d: c.toString('base64') })));
    req.on('end', () => peer.send(JSON.stringify({ t: 'bend', id })));
  }
  // the browser went away (closed tab, SSE stream dropped) → stop the request on the computer too
  res.on('close', () => {
    if (waiting.delete(id)) peer.send(JSON.stringify({ t: 'abort', id }));
  });
});

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://relay');
  if (url.pathname !== '/_alter/connect' || req.headers.upgrade?.toLowerCase() !== 'websocket') return socket.destroy();
  const peer = wsAccept(req, socket);
  if (!keyOk(url.searchParams.get('key'))) {
    console.log(new Date().toISOString(), 'rejected a connection with a wrong key from', req.headers['x-forwarded-for'] || socket.remoteAddress);
    return peer.close(4001);
  }
  attach(peer);
});

server.requestTimeout = 0; // long-lived event streams
server.headersTimeout = 30_000;
server.listen(PORT, HOST, () => console.log(`ALTTER Relay on http://${HOST}:${PORT} — waiting for ALTTER to connect`));
