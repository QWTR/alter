import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { loadConfig, saveConfig, type Device } from './config.ts';
import { emit } from './events.ts';

/**
 * Your computer is the hub: it holds the logged-in AI subscriptions, memory and agents.
 * Phones/tablets pair with a 6-digit code (or QR) and get their own revocable token,
 * so connecting a subscription once on the computer makes it available everywhere.
 */
let pending: { code: string; expiresAt: number } | null = null;
let failures: number[] = [];

export function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) urls.push(`http://${ni.address}:${port}`);
    }
  }
  return urls;
}

export function startPairing(): { code: string; expiresAt: string; urls: string[] } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  pending = { code, expiresAt: Date.now() + 5 * 60_000 };
  const { port } = loadConfig();
  return { code, expiresAt: new Date(pending.expiresAt).toISOString(), urls: lanUrls(port).map((u) => `${u}/#pair=${code}`) };
}

export function claimPairing(code: string, name: string): Device {
  const t = Date.now();
  failures = failures.filter((f) => t - f < 60_000);
  if (failures.length >= 10) throw new Error('Too many attempts, wait a minute');
  if (!pending || pending.expiresAt < t || !safeEqual(code.trim(), pending.code)) {
    failures.push(t);
    throw new Error('Invalid or expired pairing code');
  }
  pending = null;
  const cfg = loadConfig();
  const device: Device = {
    id: randomUUID(),
    name: (name || 'Phone').slice(0, 60),
    token: randomBytes(24).toString('base64url'),
    pairedAt: new Date().toISOString(),
  };
  cfg.devices.push(device);
  saveConfig();
  emit('device.paired', { id: device.id, name: device.name });
  return device;
}

export function revokeDevice(id: string): boolean {
  const cfg = loadConfig();
  const before = cfg.devices.length;
  cfg.devices = cfg.devices.filter((d) => d.id !== id);
  saveConfig();
  return cfg.devices.length < before;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Returns 'owner', the device, or null. */
export function authenticate(token: string | undefined): 'owner' | Device | null {
  if (!token) return null;
  const cfg = loadConfig();
  if (safeEqual(token, cfg.ownerToken)) return 'owner';
  const device = cfg.devices.find((d) => safeEqual(token, d.token));
  if (device) {
    const t = new Date().toISOString();
    if (!device.lastSeen || Date.parse(t) - Date.parse(device.lastSeen) > 60_000) {
      device.lastSeen = t;
      saveConfig();
    }
    return device;
  }
  return null;
}
