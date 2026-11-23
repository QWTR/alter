import { connect } from 'node:net';
import { runProcess } from './providers/process.ts';

/**
 * Cheap health checks ALTTER runs itself (no AI, no subscription usage).
 * Only when a check fails does the automation's agent wake up to diagnose and fix.
 */
export type MonitorType = 'http' | 'tcp' | 'ping' | 'command';

export interface MonitorSpec {
  type: MonitorType;
  /** URL, host:port, host, or a shell command (exit code 0 = healthy). */
  target: string;
  everyMinutes: number;
  /** Let the agent try to fix the problem (needs full access), or only report it. */
  autoFix: boolean;
}

export interface MonitorState {
  status: 'ok' | 'fail' | 'unknown';
  message: string;
  lastCheck: string | null;
  since: string | null;
  latencyMs?: number;
}

export interface CheckResult {
  ok: boolean;
  message: string;
  latencyMs: number;
}

export const MONITOR_TYPES: MonitorType[] = ['http', 'tcp', 'ping', 'command'];

export async function runCheck(spec: Pick<MonitorSpec, 'type' | 'target'>): Promise<CheckResult> {
  const t = Date.now();
  const done = (ok: boolean, message: string): CheckResult => ({ ok, message, latencyMs: Date.now() - t });
  const target = spec.target.trim();
  if (!target) return done(false, 'No target configured');

  try {
    switch (spec.type) {
      case 'http': {
        const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
        const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15_000) });
        return done(res.status < 400, `HTTP ${res.status} ${res.statusText}`.trim());
      }
      case 'tcp': {
        const m = target.match(/^(.+):(\d+)$/);
        if (!m) return done(false, 'Use host:port');
        await new Promise<void>((resolve, reject) => {
          const sock = connect({ host: m[1], port: Number(m[2]) });
          sock.setTimeout(10_000);
          sock.once('connect', () => {
            sock.destroy();
            resolve();
          });
          sock.once('timeout', () => {
            sock.destroy();
            reject(new Error('timeout'));
          });
          sock.once('error', reject);
        });
        return done(true, `Port ${m[2]} open`);
      }
      case 'ping': {
        const args = process.platform === 'win32' ? ['-n', '2', '-w', '3000', target] : ['-c', '2', '-W', '3', target];
        const r = await runProcess('ping', args, { timeoutMs: 20_000 });
        const out = r.stdout.trim().split('\n').filter(Boolean).pop() ?? '';
        // Windows ping exits 0 even for "Destination host unreachable"; a real echo reply always carries TTL
        const ok = r.code === 0 && /ttl=/i.test(r.stdout);
        return done(ok, out.slice(0, 200) || `exit ${r.code}`);
      }
      case 'command': {
        const r = await runProcess(target, [], { timeoutMs: 60_000, raw: true });
        const out = (r.stdout + r.stderr).trim().split('\n').slice(-3).join(' ').slice(0, 300);
        return done(r.code === 0, out || `exit ${r.code}`);
      }
    }
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    return done(false, e.cause?.code ?? e.message);
  }
  return done(false, 'Unknown check type');
}
