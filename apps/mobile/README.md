# Alter on your phone

**v0.1 — Progressive Web App (works today).** The phone runs the same UI as the desktop, served by Alter on your computer:

1. Computer: Alter → Settings → **Pair a phone**.
2. Phone (same Wi‑Fi): scan the QR code or open the address shown, enter the 6‑digit code.
3. Add it to the home screen (Safari: Share → *Add to Home Screen*; Chrome: ⋮ → *Install app*).

The phone gets its own revocable token. All AI subscriptions, memory and agents live on the computer, so anything you connect there is instantly available on the phone, and agent results show up live on both.

**Next — native app (Expo / React Native)**, tracked in the roadmap:

- push notifications for agent results and reminders
- share-sheet: send a link, photo or note to Alter from any app
- access away from home via Alter Relay (end-to-end encrypted) or your own Tailscale
- on-device context the user opts into (calendar, location-based reminders)
