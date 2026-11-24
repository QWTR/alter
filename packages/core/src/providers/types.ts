/**
 * How much of the computer the AI may touch:
 *  - chat: talk + web search only
 *  - read: also read files in the working folder
 *  - full: run commands, edit files, use the network — for automations that diagnose and fix things
 */
export type Access = 'chat' | 'read' | 'full';
export const ACCESS_LEVELS: Access[] = ['chat', 'read', 'full'];

export interface RunOptions {
  prompt: string;
  /** Streamed text as it arrives. */
  onDelta?: (text: string) => void;
  /** Tool activity ("Running: ping 10.0.0.1") for live status in the UI. */
  onActivity?: (text: string) => void;
  /** Prefer a cheaper/faster model (used for background learning and connection tests). */
  fast?: boolean;
  access?: Access;
  /** Extra tools the provider may use without asking (Claude Code names, incl. MCP: `mcp__gmail__*`). */
  tools?: string[];
  /** Built-in tools this run must not use (e.g. Claude's own sub-agents when a crew works on the screen). */
  blockTools?: string[];
  /** Working folder (a project's folder). */
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Model alias / id for this run ('' = the CLI's default). */
  model?: string;
  /** How hard the model thinks: low … max (only where the CLI supports it). */
  effort?: string;
  /** A file write as it streams in (tool input arrives token by token) — drives the live build preview. */
  onDraft?: (d: ToolDraft) => void;
  /** Files attached to the message (absolute paths). */
  files?: string[];
  /** Folders outside the working folder the AI may read (where attachments live). */
  fileDirs?: string[];
  /** Extra MCP servers (streamable HTTP) for this run, e.g. ALTTER's own "hands" (mouse/keyboard/screen). */
  mcp?: { name: string; url?: string; headers?: Record<string, string>; command?: string; args?: string[]; env?: Record<string, string> }[];
  /** Messages the user sends while this answer is still running ("and also…", "how is it going?"). */
  inbox?: Inbox;
}

/** Follow-up messages for a running answer. `listen` returns a function that stops listening. */
export interface Inbox {
  listen(cb: (text: string) => void): () => void;
}

/** A follow-up that reached the AI mid-answer, and where in the answer text it arrived. */
export interface FollowUp { text: string; at: number }

export interface ToolDraft {
  /** Stream block id (one per tool call). */
  id: string;
  tool: string;
  /** The raw (possibly incomplete) JSON input so far. */
  json: string;
  done: boolean;
}

export interface Usage { input: number; output: number; cached?: number; costUsd?: number }

export interface RunResult {
  text: string;
  /** Tokens as reported by the CLI (estimated when it does not report them). */
  usage?: Usage;
  /** Follow-ups the AI took in while answering (only providers that can: `steerable`). */
  followUps?: FollowUp[];
}

/**
 * A provider is an AI subscription reached through the vendor's own official CLI,
 * logged in with the user's account — no API keys, no token handling inside ALTTER.
 */
export interface Provider {
  id: string;
  name: string;
  vendor: string;
  subscription: string;
  /** Shell command that installs the CLI. */
  installCmd: string;
  /** Shell command that starts the vendor's own login flow. */
  loginCmd: string;
  /** Args for a sign-in that only opens the browser (no terminal window). */
  loginArgs?: string[];
  /** Cheap check whether the CLI is signed in (no AI call). undefined = can't tell. */
  authStatus?(): Promise<boolean | undefined>;
  models?: { id: string; label: string }[];
  efforts?: string[];
  detect(): Promise<{ installed: boolean; version?: string }>;
  /** Takes follow-up messages while it is answering (RunOptions.inbox). */
  steerable?: boolean;
  run(opts: RunOptions): Promise<RunResult>;
}

export interface ProviderStatus {
  id: string;
  name: string;
  vendor: string;
  subscription: string;
  installed: boolean;
  version?: string;
  installCmd: string;
  loginCmd: string;
  isDefault: boolean;
  models: { id: string; label: string }[];
  efforts: string[];
  /** installed + last real test succeeded */
  connected: boolean;
  health?: { ok: boolean; checkedAt: string; error?: string; latencyMs?: number };
}
