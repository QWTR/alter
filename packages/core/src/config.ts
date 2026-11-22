import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

export interface Device {
  id: string;
  name: string;
  token: string;
  pairedAt: string;
  lastSeen?: string;
}

export interface AlterConfig {
  port: number;
  host: string;
  /** Token of this computer (the hub). Never leaves the machine except into the local UI. */
  ownerToken: string;
  /** Provider used when a chat or agent says "default". */
  defaultProvider: string;
  /** Learn durable facts about the user from conversations and agent runs. */
  learning: boolean;
  devices: Device[];
}

export const HOME = process.env.ALTER_HOME ?? join(homedir(), '.alter');
export const CONFIG_PATH = join(HOME, 'config.json');

export function ensureHome(): void {
  for (const dir of [HOME, workspaceDir(), userSkillsDir()]) mkdirSync(dir, { recursive: true });
}

/** Neutral working directory for the provider CLIs, so they don't pick up some random project's settings. */
export function workspaceDir(): string {
  return join(HOME, 'workspace');
}

export function userSkillsDir(): string {
  return join(HOME, 'skills');
}

let cached: AlterConfig | null = null;

export function loadConfig(): AlterConfig {
  if (cached) return cached;
  ensureHome();
  const defaults: AlterConfig = {
    port: 7420,
    host: '0.0.0.0',
    ownerToken: randomBytes(24).toString('base64url'),
    defaultProvider: 'auto',
    learning: true,
    devices: [],
  };
  let cfg = defaults;
  if (existsSync(CONFIG_PATH)) {
    cfg = { ...defaults, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) };
  }
  cached = cfg;
  saveConfig();
  return cfg;
}

export function saveConfig(): void {
  if (!cached) return;
  writeFileSync(CONFIG_PATH, JSON.stringify(cached, null, 2), { mode: 0o600 });
}

export function updateConfig(patch: Partial<AlterConfig>): AlterConfig {
  const cfg = loadConfig();
  Object.assign(cfg, patch);
  saveConfig();
  return cfg;
}
