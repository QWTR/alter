/**
 * Human-readable schedules:
 *   manual | every 30m | every 2h | every 1d | daily 08:00 | weekdays 09:00 | weekly mon 10:00
 */
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function isValidSchedule(s: string): boolean {
  return s.trim().toLowerCase() === 'manual' || nextRun(s, new Date()) !== null;
}

export function nextRun(schedule: string, from: Date): Date | null {
  const s = schedule.trim().toLowerCase();
  if (s === 'manual' || !s) return null;

  const every = s.match(/^every\s+(\d+)\s*(m|min|minutes?|h|hours?|d|days?)$/);
  if (every) {
    const n = Number(every[1]);
    if (n <= 0) return null;
    const unit = every[2][0];
    const ms = unit === 'm' ? 60_000 : unit === 'h' ? 3600_000 : 86_400_000;
    return new Date(from.getTime() + Math.max(n * ms, 5 * 60_000));
  }

  const at = s.match(/^(daily|weekdays|weekly\s+(sun|mon|tue|wed|thu|fri|sat))\s+(\d{1,2}):(\d{2})$/);
  if (at) {
    const [hh, mm] = [Number(at[3]), Number(at[4])];
    if (hh > 23 || mm > 59) return null;
    const allowed = (d: Date) => {
      if (at[1] === 'daily') return true;
      if (at[1] === 'weekdays') return d.getDay() >= 1 && d.getDay() <= 5;
      return d.getDay() === DAYS.indexOf(at[2]);
    };
    const c = new Date(from);
    c.setSeconds(0, 0);
    c.setHours(hh, mm);
    if (c <= from) c.setDate(c.getDate() + 1);
    for (let i = 0; i < 8 && !allowed(c); i++) c.setDate(c.getDate() + 1);
    return c;
  }
  return null;
}
