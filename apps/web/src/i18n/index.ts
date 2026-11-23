import { useSyncExternalStore } from 'react';
import en, { type Key } from './en';
import pl from './pl';
import de from './de';
import es from './es';
import fr from './fr';
import uk from './uk';

export const LANGS = [
  { id: 'en', native: 'English', english: 'English', locale: 'en-GB' },
  { id: 'pl', native: 'Polski', english: 'Polish', locale: 'pl-PL' },
  { id: 'de', native: 'Deutsch', english: 'German', locale: 'de-DE' },
  { id: 'es', native: 'Español', english: 'Spanish', locale: 'es-ES' },
  { id: 'fr', native: 'Français', english: 'French', locale: 'fr-FR' },
  { id: 'uk', native: 'Українська', english: 'Ukrainian', locale: 'uk-UA' },
] as const;
export type Lang = (typeof LANGS)[number]['id'];

const dicts: Record<Lang, Record<Key, string>> = { en, pl, de, es, fr, uk };

const guess = (): Lang => {
  try {
    const saved = localStorage.getItem('alter.lang');
    if (saved && saved in dicts) return saved as Lang;
  } catch {}
  const nav = (navigator.language || 'en').slice(0, 2);
  return (nav in dicts ? nav : 'en') as Lang;
};

let current: Lang = guess();
const listeners = new Set<() => void>();

export function setLang(lang: string) {
  if (!(lang in dicts) || lang === current) return;
  current = lang as Lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem('alter.lang', lang);
  } catch {}
  listeners.forEach((l) => l());
}

export const getLang = () => current;
export const locale = () => LANGS.find((l) => l.id === current)!.locale;

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Re-render on language change; returns `t` for convenience. */
export function useT() {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  return t;
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return t('common.never');
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (Math.abs(s) < 45) return t('time.justNow');
  const f = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const abs = Math.abs(s);
  const sign = s > 0 ? -1 : 1;
  if (abs < 3600) return f.format(sign * Math.round(abs / 60), 'minute');
  if (abs < 86400) return f.format(sign * Math.round(abs / 3600), 'hour');
  return f.format(sign * Math.round(abs / 86400), 'day');
}

export function formatTime(iso: string | null | undefined, withDate = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale(), withDate ? { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit' }).format(d);
}

export type { Key };
