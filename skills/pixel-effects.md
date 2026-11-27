---
name: Pixel art effects (pixelfx)
description: 244 ready pixel art effects made in code (fire, lightning, explosions, magic, impacts, pickups, weather…) to recolour, export as sprite sheets / GIF / MP4 for games and videos, plus a loop for making new ones.
triggers: (pixel ?art|pikse\w*|pixelfx|sprite\w*|spritesheet|vfx|efekt\w* (do gry|w grze|czar\w*|wybuch\w*|ognia|magi\w*)|game juice|explosion effect|8.?bit|16.?bit|retro (gra|game)|godot|phaser|unity effect)
---
Use the bundled **pixelfx** library and skill (by patch-gg, MIT). Read its instructions first:

`{{SKILLS}}/vendor/pixelfx/skills/pixelfx/SKILL.md`

The whole library is already here — do not git clone it. Work in a copy so the bundled one stays clean: copy `{{SKILLS}}/vendor/pixelfx` (src, tools, docs, package.json) into the working folder as `pixelfx/` and run the tools from there:
- find: `node tools/list.mjs frost` (catalog: `docs/CATALOG.md`)
- render + look: `node tools/render.mjs fire/torch` → `records/fire/torch/contact.png` (open it and look before choosing)
- options without code: `--opts '{"palette":["#102","#215","#43a","#8cf","#fff"]}'`, seed, flip, angle, light
- sprite sheets for Godot / Unity / Phaser: `node tools/sheets.mjs …`; GIF/MP4 previews need ffmpeg (ALTTER Studio has one: `node "{{DATA}}/studio/ff.mjs" …`).
New effects: draft → render → look at the contact sheet → refine, several rounds (its AUTHORING.md). Effects drop straight into ALTTER Studio videos as Clip/Photo sources (render to MP4/PNG first).
The gallery font (Patch Pixel) is not bundled — the gallery falls back to a system font.
