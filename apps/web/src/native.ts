// ALTTER inside the Android app (apps/mobile): the app's own start page finds the computer and opens this web app.
// Here we only notice when the computer goes away (it is shut down, ALTTER closed, no internet) and hand the
// phone back to that start page, which waits and reopens ALTTER by itself when the computer is back.

/** True inside the ALTTER Android app (its WebView adds "ALTTER-App/<version>" to the user agent). */
export const isNativeApp = typeof navigator !== 'undefined' && /\bALTTER-App\//.test(navigator.userAgent);

/** The app's start page (bundled in the app, served by the WebView itself). */
const START = 'https://localhost/';

/** Back to the app's start page: "offline" shows the waiting screen, "pick" opens the server address form. */
export function toStartPage(why: 'offline' | 'pick') {
  if (!isNativeApp) return;
  location.replace(`${START}?${why}=1`);
}

let started = false;
/** Keeps an eye on the relay while the app is in front: the computer gone → the waiting screen. */
export function watchConnection() {
  if (!isNativeApp || started) return;
  started = true;
  let misses = 0;
  let viaRelay: boolean | null = null; // the relay answers /_alter/health; ALTTER reached straight on Wi‑Fi does not
  const check = async () => {
    if (document.hidden) return;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch('/_alter/health', { cache: 'no-store', signal: ctl.signal, headers: { accept: 'application/json' } }).finally(() => clearTimeout(t));
      const j = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
      if (viaRelay === null) viaRelay = !!(j && j.ok === true && 'connected' in j);
      if (viaRelay && j && j.connected === false) return toStartPage('offline');
      misses = 0;
    } catch {
      // no answer at all (no internet, server down, ALTTER on the Wi‑Fi switched off): a few misses in a row → wait screen
      if (navigator.onLine !== false && ++misses >= 3) toStartPage('offline');
    }
  };
  setInterval(check, 10_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  void check();
}

/** An API answer that means "the computer is gone" (the relay answers for it with 503 "ALTTER is offline"). */
export function computerGone(status: number, error?: string) {
  if (isNativeApp && status === 503 && /offline/i.test(error ?? '')) toStartPage('offline');
}
