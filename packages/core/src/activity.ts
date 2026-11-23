import { all, now, run } from './db.ts';

export interface Activity {
  id: number;
  kind: string;
  summary: string;
  ref: string | null;
  created_at: string;
}

/** Everything that happens in ALTTER lands here; agents read it to learn what the user's day looks like. */
export function logActivity(kind: string, summary: string, ref?: string): void {
  run('INSERT INTO activity (kind, summary, ref, created_at) VALUES (?, ?, ?, ?)', kind, summary.slice(0, 500), ref ?? null, now());
}

export function recentActivity(hours = 24, limit = 40): Activity[] {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  return all<Activity>('SELECT * FROM activity WHERE created_at >= ? ORDER BY id DESC LIMIT ?', since, limit).reverse();
}

export function activityDigest(hours = 24, limit = 40): string {
  const items = recentActivity(hours, limit);
  if (!items.length) return '(no recorded activity yet)';
  return items
    .map((a) => `- ${new Date(a.created_at).toLocaleString()} [${a.kind}] ${a.summary}`)
    .join('\n');
}
