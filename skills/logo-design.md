---
name: Logo design & brand kit
description: Real logo design — brief, concepts checked against 1,400+ existing logos, SVG craft, testing at small sizes, and a full brand kit (colours, type, mockups).
triggers: (\blogo\w*|logotyp\w*|sygnet\w*|znak firmow\w*|identyfikacj\w* wizualn\w*|brand ?kit|branding|brand book|księg\w* znaku|favicon|app icon|ikon\w* aplikacji|wordmark|monogram)
---
Use the bundled **logo-design** skill (by kaankiziltug, MIT). Read its instructions first and follow its phases:

`{{SKILLS}}/vendor/logo-design/SKILL.md`

Wherever it says `<skill-dir>`, `${CLAUDE_SKILL_DIR}` or `scripts/…`, use `{{SKILLS}}/vendor/logo-design`. The reference library is in `assets/library/` (catalog.json, classifications.json, 1,400+ SVGs) — use it to check that a concept is not a near-copy of an existing logo, and say which real logos you compared against.

Its helper scripts are Python 3 (`scripts/svg_audit.py`, `scripts/export_variants.py`…). If `python`/`python3` is not installed, do those checks by reading the SVG yourself and export variants with the ALTTER Studio kit (a still with `--format png`) instead — do not ask the user to install Python.

Deliver: 3 distinct concepts as clean SVG (not AI pictures), each with the idea in one line; the chosen one in colour / mono / inverted, a favicon and app icon, the palette and fonts; then a brand board (mug, bag, T-shirt, business card) as a Studio still. AI image tools (generate_image, gen-image.mjs `--style logo`) are only for mood and mockup backgrounds, never for the final mark.
