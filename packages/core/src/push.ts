// Phone notifications (Web Push) without any service of our own: VAPID keys live in the config,
// each phone that turns notifications on leaves its push subscription here, and messages are
// encrypted per RFC 8291 (aes128gcm) and posted straight to the phone's push service.
import { createCipheriv, createECDH, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { loadConfig, saveConfig } from './config.ts';
import { emit } from './events.ts';

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  deviceId?: string | null;
  label?: string;
  createdAt: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Hash route the notification opens, e.g. "/agents/<id>/<conv>". */
  url?: string;
  /** Same tag replaces the previous notification (one per monitor). */
  tag?: string;
  /** Buttons on the notification: "fix" sends "fix it" in the linked chat. */
  actions?: { action: string; title: string }[];
  level?: 'info' | 'warn' | 'error' | 'ok';
}

const b64u = (b: Buffer) => b.toString('base64url');
const unb64u = (s: string) => Buffer.from(s, 'base64url');

interface Vapid { publicKey: string; privateKey: string }

/** VAPID key pair (P-256), created once. publicKey = raw uncompressed point, privateKey = JWK d. */
export function vapid(): Vapid {
  const cfg = loadConfig() as any;
  if (cfg.push?.vapid?.publicKey) return cfg.push.vapid;
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' }) as { d: string };
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-65);
  cfg.push = { ...(cfg.push ?? {}), vapid: { publicKey: b64u(raw), privateKey: jwk.d }, subs: cfg.push?.subs ?? [] };
  saveConfig();
  return cfg.push.vapid;
}

export const pushSubs = (): PushSub[] => ((loadConfig() as any).push?.subs ?? []) as PushSub[];

export function addPushSub(sub: PushSub) {
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('Invalid push subscription');
  vapid();
  const cfg = loadConfig() as any;
  cfg.push.subs = [...(cfg.push.subs ?? []).filter((s: PushSub) => s.endpoint !== sub.endpoint), { ...sub, createdAt: new Date().toISOString() }].slice(-20);
  saveConfig();
  emit('push.changed', { count: cfg.push.subs.length });
}

export function removePushSub(endpoint: string) {
  const cfg = loadConfig() as any;
  if (!cfg.push?.subs) return;
  cfg.push.subs = cfg.push.subs.filter((s: PushSub) => s.endpoint !== endpoint);
  saveConfig();
  emit('push.changed', { count: cfg.push.subs.length });
}

/** Phones paired with a device id lose their push subscription when the device is removed. */
export function removePushForDevice(deviceId: string) {
  const cfg = loadConfig() as any;
  if (!cfg.push?.subs) return;
  cfg.push.subs = cfg.push.subs.filter((s: PushSub) => s.deviceId !== deviceId);
  saveConfig();
}

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, len: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  return createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);
}

/** RFC 8291 / 8188 body for one subscription. */
export function encryptPush(sub: Pick<PushSub, 'keys'>, payload: Buffer): Buffer {
  const uaPublic = unb64u(sub.keys.p256dh);
  const authSecret = unb64u(sub.keys.auth);
  const ecdh = createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const secret = ecdh.computeSecret(uaPublic);
  const ikm = hkdf(authSecret, secret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const salt = randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

function vapidAuth(endpoint: string, v: Vapid): string {
  const aud = new URL(endpoint).origin;
  const head = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  // a generic contact: push services want one, the user's own address is never sent
  const body = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://github.com/QWTR/alter' })));
  const pub = unb64u(v.publicKey);
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.publicKey}`;
}

/** Sends to every phone that turned notifications on. Dead subscriptions (404/410) are dropped. */
export async function notifyPhones(msg: PushMessage): Promise<{ sent: number; failed: number }> {
  const subs = pushSubs();
  emit('notify', msg); // the desktop app shows the same as a system notification
  if (!subs.length) return { sent: 0, failed: 0 };
  const v = vapid();
  const payload = Buffer.from(JSON.stringify({ ...msg, title: msg.title.slice(0, 120), body: msg.body.slice(0, 400), ts: Date.now() }));
  let sent = 0;
  let failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      const res = await fetch(s.endpoint, {
        method: 'POST',
        headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: msg.level === 'error' ? 'high' : 'normal', authorization: vapidAuth(s.endpoint, v) },
        body: new Uint8Array(encryptPush(s, payload)),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404 || res.status === 410) removePushSub(s.endpoint);
      if (res.ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }));
  return { sent, failed };
}

// keep a public-key check close to the generator: a corrupted config should not silently break push
export function vapidOk(): boolean {
  try {
    const v = vapid();
    createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(unb64u(v.publicKey).subarray(1, 33)), y: b64u(unb64u(v.publicKey).subarray(33, 65)) }, format: 'jwk' });
    return true;
  } catch {
    return false;
  }
}
