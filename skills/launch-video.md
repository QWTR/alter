---
name: Launch video (brag)
description: Turns a project you just built (folder or website URL) into a short, slick, shareable launch video with share copy — in ALTTER Studio, one command's worth of work.
triggers: (\bbrag\b|launch video|(filmik|film|wideo|video|klip)\w* (promo\w*|reklamow\w*|premierow\w*|startow\w*)[^.?!]{0,40}(apk|aplikacj|projekt|stron|gr[yzę]|produkt|app)|(promo|teaser|zapowied\w*)[^.?!]{0,30}(apk|aplikacj|projekt|produkt|app)|pochwal\w* się|product ?hunt|pokaż co zbudowa\w*)
---
Idea from **brag** by Shunit Haviv Hakimi (MIT, github.com/latent-spaces/brag); here it is built with ALTTER Studio (the alter-kit renderer), not Hyperframes.

**1. Inspect.** Input = the project folder (default: the current/attached project) or a website URL.
- Project: read the main page, styles (exact colours + fonts), README, routes and key components. Find the product **in use**: entry → key action → result.
- Website: fetch the rendered page; take headline, tagline, features, CTA, colours, fonts, logo, product shots.
- Never read or show build output, lock files, `.git`, `.env*`, keys or credentials. Nothing secret, no real customer names/emails, no internal URLs in the video.
- Answer before planning: what is it (one sentence)? for whom? what sets it apart? the most impressive (or funniest) true claim? the visual hook?

**2. Plan** `brag-plan.md`: angle, hook, 2–3 highlights, punchline, tone, palette/fonts, and a storyboard with durations. Shape: Hook (2–3 s) → Reveal (2–4 s) → 2–3 highlights → Punchline + logo/CTA (2–4 s). Total 15–25 s (18–22 best). Tone presets: default · polished · cinematic · app-store · yc-parody · chaotic · deadpan — or the user's own words.
Show the plan in 5–8 lines and build right away unless the user asked to approve it first.

**3. Build** in the Studio kit (see "ALTTER Studio" instructions): `videos/<name>-launch.tsx`, real screenshots/recordings of the app inside `Device {type: browser|phone}` with `Photo`/`Clip`, typed text and simulated clicks for the key action, the project's own copy and colours (meta.brand), `Counter`/`Chip` for real numbers only. Capture screens with a headless browser at the video's aspect ratio (run the project's dev server if needed). Formats: landscape `wide` (default), `reel` for TikTok/Reels, `square`; `--sizes reel,square,wide` gives all.

**Creative laws:** short; clear to a stranger after one view (what it does, who it's for, how to get it); the first 2 s decide everything; show the real thing, not a re-creation; specific — no generic SaaS phrases ("streamline your workflow" is banned); every line readable (~0.3 s per word, fully settled); things appear one by one, clicks/typing beat static slides; humour only from the project's own absurdity; every frame postable; in 9:16 keep text between 13 % and 80 % of the height.

**4. Render & check:** `--draft` first, pull 3–4 frames (`--at`), look at them, fix, then the final. Music: quiet bed (−14 LUFS) if available; voice-over only when asked.

**5. Deliver:** the MP4 path(s), plus `share.md` with a post for X/LinkedIn (2–3 lines + link), a TikTok/Reels caption with 3–5 hashtags, and a one-line Product Hunt tagline — in the user's language.
