import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { isNativeApp, watchConnection } from './native';

// theme: system | dark | light (per device)
const applyTheme = () => {
  let pref = 'system';
  try {
    pref = localStorage.getItem('alter.theme') ?? 'system';
  } catch {}
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // palette: violet (default) | ocean | emerald | sunset | rose | graphite | midnight
  let palette = 'violet';
  try {
    palette = localStorage.getItem('alter.palette') ?? 'violet';
  } catch {}
  if (palette && palette !== 'violet') document.documentElement.dataset.palette = palette;
  else delete document.documentElement.dataset.palette;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
};
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
(window as any).__applyTheme = applyTheme;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (isNativeApp) {
  document.documentElement.classList.add('native-app');
  watchConnection();
}
if ('serviceWorker' in navigator && isSecureContext && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
// a tapped notification (app already open) → go to the chat it points to
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'alter:navigate' && typeof e.data.hash === 'string' && e.data.hash.startsWith('#/')) location.hash = e.data.hash;
});
