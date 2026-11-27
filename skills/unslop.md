---
name: Unslop (de-AI a UI)
description: Turns a vibe-coded, AI-looking interface into one that looks designed by a real designer — audit of the AI tells, then a redesign of the same page.
triggers: (unslop|wygląda jak (zrobion\w* przez )?ai|ai.?look|vibe.?cod|ai.?slop|\bslop\b|generyczn\w*|odświeżyć wygląd|popraw\w* (wygląd|design|ui)|ładniej\w*|redesign|przeprojektuj|make it look designed|looks? (ai|generic))
---
Use the bundled **unslop** skill (by heydamir, CC BY 4.0 — credit it if you publish its examples). Before you change anything, read its full instructions:

`{{SKILLS}}/vendor/unslop/SKILL.md`

Its references (`references/signs.md`, `tokens.md`, `visuals.md`, `effects.md`, `refs.md`, `rtl.md`) and scripts (`scripts/snapshot.mjs`, `scripts/story.mjs`) live next to it: wherever it says `<skill folder>`, use `{{SKILLS}}/vendor/unslop`.

Short version of the method:
1. Audit first: list the AI tells you see on the page (purple–blue gradients, glassy cards everywhere, emoji icons, centred everything, three identical feature cards, "✨" badges, fake metrics…), each with where it is.
2. Pick one real design direction (type pairing, a restrained palette with one accent, a spacing scale, a real grid) and write it down as tokens.
3. Redesign the same content — keep the user's copy and features; change hierarchy, type, colour, spacing, imagery and motion.
4. Render before/after screenshots and look at them before you say it is done.
Work on a copy when the user only gave a URL; never break the working app.
