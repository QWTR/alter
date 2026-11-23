import { useSyncExternalStore } from 'react';

export interface Route {
  path: string;
  section: string;
  parts: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { path, section: parts[0] ?? 'home', parts, query: new URLSearchParams(qs ?? '') };
}

let route = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  route = parse();
  listeners.forEach((l) => l());
});

export function navigate(to: string, replace = false) {
  const url = `#${to}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  route = parse();
  listeners.forEach((l) => l());
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => route,
  );
}
