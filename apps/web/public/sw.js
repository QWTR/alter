// Minimal service worker: makes ALTTER installable on phones (HTTPS only) and caches the shell.
const SHELL = 'alter-shell-v4';
self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/_alter/') || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/'))),
  );
});

// ---------- phone notifications (alerts from ALTTER) ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'ALTTER', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(
    self.registration.showNotification(d.title || 'ALTTER', {
      body: d.body || '',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      icon: '/icon-192.png',
      badge: '/badge.png',
      vibrate: d.level === 'error' ? [120, 60, 120, 60, 240] : [80],
      requireInteraction: d.level === 'error',
      data: { url: d.url || '/' },
      actions: (d.actions || []).slice(0, 2),
    }),
  );
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const route = (e.notification.data && e.notification.data.url) || '/';
  const hash = '#' + route + (e.action === 'fix' ? (route.includes('?') ? '&' : '?') + 'do=fix' : '');
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) {
        open.postMessage({ type: 'alter:navigate', hash });
        return open.focus();
      }
      return self.clients.openWindow('/' + hash);
    }),
  );
});
