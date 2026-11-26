import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { HOME, ensureHome } from './config.ts';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  ensureHome();
  db = new DatabaseSync(process.env.ALTER_DB ?? join(HOME, 'alter.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      provider TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      provider TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_conv ON messages(conversation_id, id);

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      importance INTEGER NOT NULL DEFAULT 3,
      source TEXT,
      uses INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      ref TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activity_time ON activity(created_at);

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      provider TEXT,
      output TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS runs_agent ON runs(agent_id, started_at);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  // v0.2 migrations: projects + access levels
  addColumn('conversations', 'project_id', 'TEXT');
  addColumn('conversations', 'access', "TEXT NOT NULL DEFAULT 'chat'");
  addColumn('memories', 'project_id', 'TEXT');
  addColumn('runs', 'detail', 'TEXT');
  addColumn('runs', 'task', 'TEXT');
  addColumn('runs', 'author', 'TEXT');
  addColumn('runs', 'attachments', 'TEXT');
  addColumn('conversations', 'agent_id', 'TEXT');
  // v0.6: attachments + who wrote a message (online sessions)
  addColumn('messages', 'attachments', 'TEXT');
  addColumn('messages', 'author', 'TEXT');
  // v0.12: crews — a helper's chat sits under the lead's chat
  addColumn('conversations', 'parent_id', 'TEXT');
  addColumn('conversations', 'crew', 'TEXT');
  // v0.14: images/videos the AI made during an answer (absolute paths, JSON)
  addColumn('messages', 'media', 'TEXT');
  return db;
}

function addColumn(table: string, column: string, type: string): void {
  const cols = db!.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db!.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export const now = (): string => new Date().toISOString();

// node:sqlite returns loosely typed rows; these helpers keep the casts in one place.
type Param = string | number | null;

export function all<T>(sql: string, ...params: Param[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: Param[]): { changes: number | bigint; lastInsertRowid: number | bigint } {
  return getDb().prepare(sql).run(...params);
}
