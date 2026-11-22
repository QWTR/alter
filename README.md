<div align="center">

# ◆ Alter

**Your personal AI — on the subscriptions you already pay for.**

Plug in Claude, ChatGPT or Gemini *with your normal account* (no API keys), and get one assistant on your computer **and** your phone that remembers you, learns how your day works, and runs agents for you in the background.

[Polski ↓](#-po-polsku) · [Quick start](#quick-start) · [How it works](#how-it-works) · [Roadmap](#roadmap)

</div>

---

## Why

You already pay for an AI subscription. But every chat starts from zero, nothing happens unless you type, and your phone and computer don't share anything.

Alter fixes that:

- **No API keys, no extra bills.** Alter drives the vendors' own official CLIs — Claude Code, OpenAI Codex, Gemini CLI — logged in with your account. Your subscription, your limits.
- **One brain, every device.** Connect a subscription once on your computer; your phone pairs with a code and gets everything instantly. Agent results show up live on both.
- **Memory that actually builds up.** After each chat and agent run, Alter extracts durable facts — who you are, your projects, people, preferences, routines — and uses them every time. You don't explain things twice. You can see, edit and delete every memory.
- **Agents that work while you don't.** Morning brief, evening review, inbox triage, a content producer for your reels… on a schedule, building on their own previous runs and on what you did today.
- **Skills (overlays).** Reusable Markdown instruction packs ("how I triage e-mail", "my reel format") that any agent can wear.
- **Local-first & open source.** Everything lives in a SQLite file on your machine (`~/.alter`).

## Quick start

Requirements: **Node.js 24+** and at least one AI CLI signed in with your account:

| Subscription | Install | Sign in |
|---|---|---|
| Claude Pro / Max | `npm i -g @anthropic-ai/claude-code` | run `claude`, then `/login` |
| ChatGPT Plus / Pro | `npm i -g @openai/codex` | `codex login` → *Sign in with ChatGPT* |
| Google AI Pro / free Google account | `npm i -g @google/gemini-cli` | run `gemini` → *Login with Google* |

(Or skip this — Alter can open the install/sign-in terminal for you from **Settings → AI subscriptions**.)

**Windows app:** download `Alter-Setup-x.y.z.exe` from [Releases](https://github.com/QWTR/alter/releases) and run it. Alter installs per-user (no admin), starts with Windows in the tray and keeps your agents running in the background. Node.js is not needed for the app itself. The installer is not code-signed yet, so SmartScreen may show "More info → Run anyway".

**From source:**

```bash
git clone https://github.com/QWTR/alter.git
cd alter
npm install
npm start            # web UI on http://localhost:7420
npm run desktop      # or: the desktop app (window + tray, keeps agents running)
npm run dist -w @alter/desktop   # build the Windows installer → apps/desktop/release/
```

**Phone:** Settings → *Pair a phone* → scan the QR code on the same Wi‑Fi → *Add to Home Screen*.

CLI: `node packages/core/src/cli.ts status | pair | start [--port N] [--local]`

## How it works

```
 ┌──────────── your computer (the hub) ─────────────┐         ┌──── phone ────┐
 │  Desktop shell (Electron)  ──┐                   │  pair   │  Alter PWA    │
 │                              ▼                   │◀──────▶ │  (same UI)    │
 │  Alter core  ── HTTP + SSE API, device tokens    │  LAN /  └───────────────┘
 │   ├─ providers ─▶ claude -p │ codex exec │ gemini│  relay
 │   ├─ memory (SQLite) ◀─ learning pass after each │
 │   │                      chat / agent run        │
 │   ├─ agents + scheduler ─▶ Feed                  │
 │   ├─ skills (Markdown overlays)                  │
 │   └─ activity log ("what my day looks like")     │
 └──────────────────────────────────────────────────┘
```

- **Providers** (`packages/core/src/providers`) spawn the official CLI, pass the prompt on stdin and stream the answer back. Alter never sees or stores your credentials — the CLI keeps its own login.
- **Prompting**: every request is built from Alter's persona + relevant memories + the recent activity log + conversation history, so you can switch providers mid-conversation.
- **Learning** (`learning.ts`) runs a small background pass on the fast model and stores new memories, merging near-duplicates.
- **Agents** (`agents.ts`) have instructions, a schedule (`manual`, `every 30m`, `daily 08:00`, `weekdays 09:00`, `weekly mon 10:00`), skills, and optional unattended tools — with Claude this includes any MCP connector you've added to Claude Code (e.g. Gmail → `mcp__gmail__*`).
- **Sync**: the computer is the source of truth; devices pair with a one-time 6‑digit code and get their own revocable token. Live events (agent finished, new memory, new device) are pushed to every device over Server-Sent Events.

### A note on terms of service

Alter only automates the official CLIs on *your own machine, for you* — the same thing you'd do by typing in a terminal. It never extracts tokens, proxies your subscription to other people, or offers a "log in with Claude/ChatGPT" of its own. Keep it that way in contributions; respect each vendor's usage limits and terms.

## Project layout

```
packages/core   the daemon: providers, memory, learning, agents, scheduler, API (TypeScript, runs on Node 24 directly)
apps/web        the UI (vanilla JS PWA) — used by desktop and phone
apps/desktop    Electron shell: window + tray, keeps core running
apps/mobile     phone app notes (PWA today, native Expo app next)
skills/         built-in skills (overlays)
```

## Roadmap

- [x] Claude / ChatGPT / Gemini via official CLIs, streaming chat
- [x] Long-term memory with automatic learning, editable
- [x] Agents with schedules, history, skills, unattended tools
- [x] Phone pairing (PWA), live sync between devices
- [x] Windows installer with bundled runtime, tray, start with Windows
- [ ] macOS / Linux packages, code signing, auto-update
- [ ] Native phone app (Expo): push notifications, share sheet, voice
- [ ] **Alter Relay** — reach your computer from anywhere, end-to-end encrypted
- [ ] Connectors out of the box: Gmail, Google Calendar, Notion, Slack (via MCP)
- [ ] Desktop context (opt-in): active app / calendar → a real picture of your day
- [ ] Reminders & proposals as notifications, approve/act in one tap
- [ ] Agent & skill marketplace
- [ ] Semantic memory search (local embeddings)

## Business model (open core)

The app stays free and open source (AGPL-3.0). Planned paid extras, for those who want them:

- **Alter Cloud Relay** — phone access away from home, encrypted backup & multi-computer sync.
- **Pro packs** — premium agents and skills (sales, content creators, agencies).
- **Teams** — shared agents, shared memory spaces, admin controls.

## Contributing

PRs welcome. `npm run typecheck` and `npm test` should pass. New providers implement the `Provider` interface in `packages/core/src/providers/types.ts`.

---

## 🇵🇱 Po polsku

**Alter** to Twoje osobiste AI na subskrypcjach, które już masz. Podłączasz Claude, ChatGPT albo Gemini **zwykłym logowaniem do konta (bez API)** — Alter korzysta z oficjalnych narzędzi tych firm (Claude Code, Codex, Gemini CLI).

- Podłączasz raz na komputerze → telefon paruje się kodem i od razu ma to samo.
- Alter **uczy się Ciebie**: z każdej rozmowy i pracy agentów wyciąga trwałe fakty (kim jesteś, projekty, ludzie, nawyki, styl dnia) i pamięta je — nie trzeba tłumaczyć dwa razy.
- **Agenci** działają w tle według harmonogramu: poranny brief, wieczorne podsumowanie, maile, pomysły na rolki… budują na swoich poprzednich wynikach.
- **Nakładki (skills)** — paczki instrukcji w Markdown, które możesz założyć dowolnemu agentowi.
- Wszystko lokalnie, open source (AGPL-3.0).

Start: `npm install` → `npm start` → http://localhost:7420 → Ustawienia → *Pair a phone*.

## License

[AGPL-3.0](LICENSE) © Alter contributors
