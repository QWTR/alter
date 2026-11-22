export interface RunOptions {
  prompt: string;
  /** Streamed text as it arrives. */
  onDelta?: (text: string) => void;
  /** Prefer a cheaper/faster model (used for background learning). */
  fast?: boolean;
  /** Tools the provider may use without asking (Claude Code tool names, incl. MCP: `mcp__gmail__*`). */
  tools?: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RunResult {
  text: string;
}

/**
 * A provider is an AI subscription reached through the vendor's own official CLI,
 * logged in with the user's account — no API keys, no token handling inside Alter.
 */
export interface Provider {
  id: string;
  name: string;
  subscription: string;
  /** Shell command that installs the CLI. */
  installCmd: string;
  /** Shell command that starts the vendor's own login flow. */
  loginCmd: string;
  loginHint: string;
  detect(): Promise<{ installed: boolean; version?: string }>;
  run(opts: RunOptions): Promise<RunResult>;
}

export interface ProviderStatus {
  id: string;
  name: string;
  subscription: string;
  installed: boolean;
  version?: string;
  installCmd: string;
  loginCmd: string;
  loginHint: string;
  isDefault: boolean;
}
