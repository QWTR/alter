---
name: Instagram (reels, captions, growth)
description: Instagram from idea to published reel — hooks scored, scripts timed, captions linted, AI-sounding text cleaned, profile audit, weekly plan, viral research, comments, DMs, stories, carousels, repurposing, plus reel automations.
triggers: (instagram|insta\b|\big\b|reels?\b|rolk[aięy]|rolek|hook|haczyk|caption|opis (pod|do) (post|rolk|reel)|hasztag|hashtag|karuzel|carousel|story|stories|relacj[aię]|\bbio\b|profil (na )?ig|obserwuj|followers|zasięg|reach|viral|wiraln|komentarz|comments?\b|\bdm\b|wiadomoś[ćc] do|content plan|plan (treści|postów|tygodnia)|kalendarz (treści|postów)|repurpos|przerób (film|podcast|wideo) na|brzmi jak (ai|chatgpt|bot)|humaniz|de-?slop)
---
You have the full **instagram-agent-skill** toolkit (13 methods + scoring tools) built into ALTTER. Use it whenever the work is for Instagram (also TikTok/Shorts — same rules).

**Pick the method, then READ its file before you start** (it holds the method, the formulas and the quality bar — follow it, but write in the user's language):
| The user wants… | Method file (read it) |
|---|---|
| a reel / script / hook / voice-over | `{{SKILLS}}/vendor/instagram-agent-skill/skills/ig-reel/SKILL.md` (+ `hooks.json` next to it: 26 hook formulas) |
| the caption, hashtags, "what to write under it" | `…/skills/ig-caption/SKILL.md` |
| a carousel / slides | `…/skills/ig-carousel/SKILL.md` (make the 1080×1350 slides with the ALTTER Studio kit: one still per slide, format post) |
| stories for today | `…/skills/ig-story/SKILL.md` |
| plan the week / content calendar / "what should I post" | `…/skills/ig-plan/SKILL.md` |
| what's viral in my niche / find trends | `…/skills/ig-viral/SKILL.md` |
| audit my posts / why did it flop / read my insights | `…/skills/ig-audit/SKILL.md` |
| fix my bio / score my profile | `…/skills/ig-profile/SKILL.md` (+ `rubric.json`) |
| replies to comments under my reels | `…/skills/ig-reply/SKILL.md` |
| comments on other people's posts | `…/skills/ig-comment/SKILL.md` |
| DMs, outreach, collab pitch, follow-ups | `…/skills/ig-dm/SKILL.md` |
| turn a long video / podcast / article into reels | `…/skills/ig-repurpose/SKILL.md` |
| make text sound human / "sounds like AI" | `…/skills/ig-human/SKILL.md` |
(`…` = `{{SKILLS}}/vendor/instagram-agent-skill`)

**The tools — always run them, never guess the score.** Wherever a method says `python3 X.py …`, run instead (no Python needed):
`node "{{SKILLS}}/tools/ig.mjs" X …` — X = `hookscore` (hooks.txt or --hook "…"), `beats` (script.txt --target 30), `caption` (caption.txt --keywords "a,b"), `detect` (draft.txt [after.txt]), `humanize` (draft.txt --report -o clean.txt), `swipe` (captured.tsv --out …). Write the text to a file in the working folder first. The checks understand Polish too.
Where a method says `~/.claude/instagram/` use `{{DATA}}/instagram/` (voice.md = the user's on-camera voice, swipe.md, plan.md, log.md). If voice.md is missing and the work is a script/caption, build it as the method says (ask for 3 of their reels or captions once) and save it.

**Make it, not just write it (ALTTER Studio):** a reel script can become the actual video — a 3D story reel, an edit of the user's own clip, motion graphics or the "N styles" reel (STYLE ENGINE). Offer it in one line after the script ("Want me to make this reel? I'll record the voice with ElevenLabs and render it."). Voice-over: ElevenLabs connected in Settings → Plugins (or `[[altter:connect:elevenlabs]]`).

**Publishing:** never post, comment, DM or follow on the user's behalf without their explicit "yes, post it" in this chat for that exact item. With the yes: use their own signed-in browser (Claude in Chrome tools) on instagram.com → Create → Post/Reel → upload the rendered file → paste the caption → stop before "Share" and show what will be posted; press Share only after the yes. Never type passwords; if Instagram asks to log in, the user does it.

**Reel automations (propose a card, the user clicks to create it — see Automations):**
- "Weekly reel plan" — `weekly mon 09:00`, access read: run ig-plan with the last week's log and swipe file, save `{{DATA}}/instagram/plan.md`, report the 5 reel ideas with scored hooks.
- "Reel of the day" — `weekdays 08:30`, access full: take today's idea from plan.md, write the script (ig-reel: hooks scored ≥ 70, beats timed), caption (linted, READY), render the reel in ALTTER Studio if the user wants videos made, then notify: the file, the caption, "say post it to publish". Never publish by itself.
- "What's working" — `weekly fri 17:00`, access read: ig-viral in their niche (read-only browsing) → update swipe.md, 3 formulas to copy next week.
- "Comment round" — `weekdays 12:00`, access chat: drafts of 5 comments for accounts in their niche (ig-comment), for the user to post.
Fill niche, language and times from what you know about the user; say they can change them.
