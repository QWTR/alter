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

export interface ProviderHealth {
  ok: boolean;
  checkedAt: string;
  error?: string;
  latencyMs?: number;
  /** which CLI the check went through (gemini: 'agy' since 0.16.7) */
  via?: string;
}

export const LANGUAGES = ['en', 'pl', 'de', 'es', 'fr', 'uk'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface AlterConfig {
  port: number;
  host: string;
  /** Token of this computer (the hub). Never leaves the machine except into the local UI. */
  ownerToken: string;
  /** Provider used when a chat or agent says "default". */
  defaultProvider: string;
  /** Learn durable facts about the user from conversations and agent runs. */
  learning: boolean;
  /** anonymous "this install is on" pings to the repair server (default on) */
  usageStats?: boolean;
  /** UI + default reply language. */
  language: Language;
  userName: string;
  /** First-run setup finished. */
  onboarded: boolean;
  /** When a subscription hits its usage limit: ask in chat, or switch to another connected AI by itself. */
  onLimit: 'ask' | 'switch';
  /** Access a chat gets — once you pick "Full control" it stays that way for every chat (until you pick lower). */
  defaultAccess: 'chat' | 'read' | 'full';
  /** Result of the last real round-trip to each provider ("is my subscription actually connected?"). */
  providerHealth: Record<string, ProviderHealth>;
  devices: Device[];
}

export const HOME = process.env.ALTER_HOME ?? join(homedir(), '.alter');
export const CONFIG_PATH = join(HOME, 'config.json');

export function ensureHome(): void {
  for (const dir of [HOME, workspaceDir(), userSkillsDir(), projectsDir()]) mkdirSync(dir, { recursive: true });
}

/** Neutral working directory for the provider CLIs, so they don't pick up some random project's settings. */
export function workspaceDir(): string {
  return join(HOME, 'workspace');
}

/** AI images and videos made in ALTTER (Media). */
export function generatedDir(): string {
  return join(HOME, 'generated');
}

export function userSkillsDir(): string {
  return join(HOME, 'skills');
}

/** Project folders. Packaged installs put them next to the app (e.g. D:\ALTTER\projects). */
export function projectsDir(): string {
  return process.env.ALTER_PROJECTS_DIR ?? join(HOME, 'projects');
}

let cached: AlterConfig | null = null;

function detectLanguage(): Language {
  const loc = (Intl.DateTimeFormat().resolvedOptions().locale || 'en').slice(0, 2).toLowerCase();
  return (LANGUAGES as readonly string[]).includes(loc) ? (loc as Language) : 'en';
}

export function loadConfig(): AlterConfig {
  if (cached) return cached;
  ensureHome();
  const defaults: AlterConfig = {
    port: 7420,
    host: '0.0.0.0',
    ownerToken: randomBytes(24).toString('base64url'),
    defaultProvider: 'auto',
    learning: true,
    language: detectLanguage(),
    userName: '',
    onboarded: false,
    onLimit: 'ask',
    defaultAccess: 'chat',
    providerHealth: {},
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

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  pl: 'Polish',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  uk: 'Ukrainian',
};
