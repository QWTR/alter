# ALTTER for Android

A native app (Capacitor) that connects the phone to **ALTTER on your computer**. Everything — chats, memory, agents,
files — stays on the computer; the app only shows it. The computer is reached:

- through your relay (default `https://altter.v-room.app`, the VPS only forwards — it stores nothing), or
- straight on the same Wi‑Fi (`http://192.168.x.x:7420`).

When the computer is off the app shows a waiting screen and opens ALTTER by itself as soon as it is back.

## Build
Needs Android Studio (its JDK) and the Android SDK — nothing else to set up.

```
npm install
npm run apk          # → android/app/build/outputs/apk/debug/app-debug.apk
```

`shell/` is the app's own start page (finds the computer, server address form, offline screen).
`scripts/icons.ps1` regenerates the launcher icons and splash from `apps/web/public/icon-512.png`.

## Pairing
Computer: ALTTER → Settings → Devices → Connect a phone. Phone: open the app → "Scan the QR code" (or type the 6‑digit
code). The QR also carries the server address, so one scan sets up a fresh install. Done once; the app remembers it.
`shell/vendor/jsQR.js` (Apache-2.0) is the QR fallback for WebViews without BarcodeDetector.

## Not yet
- push notifications while the app is closed (needs Firebase Cloud Messaging)
- share sheet ("send to ALTTER" from other apps)
