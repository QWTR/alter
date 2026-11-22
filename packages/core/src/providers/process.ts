import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';

function quote(arg: string): string {
  if (/^[\w@%+=:,./*-]+$/.test(arg)) return arg;
  return isWin ? `"${arg.replace(/"/g, '\\"')}"` : `'${arg.replace(/'/g, `'\\''`)}'`;
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (isWin) spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    else process.kill(-pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}

export interface ProcessOptions {
  input?: string;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onLine?: (line: string) => void;
}

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs an installed CLI (claude, codex, gemini…) through the shell so Windows .cmd shims resolve.
 * The prompt always goes through stdin, never argv, so user text is never shell-interpreted.
 */
export function runProcess(cmd: string, args: string[], opts: ProcessOptions = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    // Don't let a parent Claude Code session leak into the child.
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const child = spawn([cmd, ...args].map(quote).join(' '), {
      shell: true,
      cwd: opts.cwd,
      env,
      windowsHide: true,
      detached: !isWin,
    });

    let stdout = '';
    let stderr = '';
    let pending = '';
    const timer = setTimeout(() => killTree(child.pid), opts.timeoutMs ?? 10 * 60_000);
    const onAbort = () => killTree(child.pid);
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (!opts.onLine) return;
      pending += chunk;
      let i: number;
      while ((i = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, i).replace(/\r$/, '');
        pending = pending.slice(i + 1);
        if (line.trim()) opts.onLine(line);
      }
    });
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.onLine && pending.trim()) opts.onLine(pending.trim());
      resolve({ code, stdout, stderr });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(opts.input ?? '', 'utf8');
  });
}

/** `<cmd> --version` → installed + version, or not installed. */
export async function detectCli(cmd: string): Promise<{ installed: boolean; version?: string }> {
  try {
    const r = await runProcess(cmd, ['--version'], { timeoutMs: 20_000 });
    if (r.code !== 0) return { installed: false };
    return { installed: true, version: r.stdout.trim().split('\n')[0] };
  } catch {
    return { installed: false };
  }
}

export function tryJson(line: string): any {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}
