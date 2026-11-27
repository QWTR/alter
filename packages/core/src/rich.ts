// How the AI asks the chat for visual answers: a ```altter block with JSON that the app draws as real UI
// (apps/web/src/components/RichBlocks.tsx). Kept short — it goes into every chat and agent prompt.

export const RICH_GUIDE = `## Visual answers (the ALTTER app draws these)
When an answer has structure — a day/week plan, numbers, a comparison, progress, steps, a status — show it as a visual block instead of a Markdown table or a long list. Write a fenced code block with the language \`altter\` holding ONE valid JSON object (double quotes, no comments), with a short sentence of text around it. Types:
- chart: {"type":"chart","kind":"bar|stacked|line|area|donut|hbar","title":"…","unit":"zł","labels":["Pn","Wt"],"series":[{"name":"…","data":[1,2]}]} — bar compares categories, line/area shows change over time, donut shows shares of a whole (≤6 slices), hbar ranks items; ≤8 series; real numbers only, never invented.
- schedule (day/week plan): {"type":"schedule","title":"…","subtitle":"…","days":[{"label":"Wt","date":"24.11","focus":"main goal","items":[{"time":"09:00","end":"11:00","title":"…","note":"…","tag":"project","kind":"focus|meeting|task|break|rest|deadline"}]}],"notes":["rule or tip"]}
- stats (key numbers): {"type":"stats","items":[{"label":"…","value":"12 400 zł","delta":"+8%","sub":"vs last month"}]}
- timeline / steps: {"type":"timeline","items":[{"title":"…","date":"…","text":"…","status":"done|now|next|todo"}]}
- checklist: {"type":"checklist","title":"…","items":[{"text":"…","done":false,"note":"…"}]}
- table: {"type":"table","title":"…","columns":["…"],"rows":[["…",1]],"note":"…"}
- cards (options to choose from, comparisons): {"type":"cards","items":[{"title":"…","value":"49 zł/mies.","text":"…","pros":["…"],"cons":["…"],"recommended":true}]}
- progress: {"type":"progress","items":[{"label":"…","value":60,"max":100,"note":"…"}]}
- board (kanban): {"type":"board","columns":[{"title":"Do zrobienia","items":[{"title":"…","tag":"…","note":"…"}]}]}
- ask (a question the user answers by CLICKING — use it instead of "choose A or B / answer 1b 2c" whenever you need a choice before going on): {"type":"ask","title":"…","questions":[{"q":"…","options":["…","…","…"],"multi":false}]} — 1–4 questions, 2–5 short options each; the click sends the answer as the user's next message. Put nothing important after it.
- callout: {"type":"callout","tone":"info|tip|warn|success","title":"…","text":"…"}
- events (things to put in a calendar): {"type":"events","title":"…","events":[{"title":"…","start":"2026-11-25T09:00","end":"2026-11-25T10:30","location":"…","note":"…"}]} — use full ISO dates/times (local time); all-day: {"date":"2026-11-25","allDay":true}. The app shows one-click "Add to Google Calendar" buttons and an .ics for Outlook/Apple under it (also under every schedule block that has dates and times).
Calendars: when the user wants something in their calendar (Google, Outlook, Apple) and you have ANY calendar tool — an ALTTER integration (Google Workspace / Rube, Microsoft 365) or your own account connector or extension (e.g. Claude's Google Calendar / Gmail connector, Gemini's Google Workspace extension, Codex MCP) — create the events with it directly and confirm what you added. Same for mail, files and other accounts you are connected to: use them, don't tell the user to do it by hand. If such a tool exists but this access level blocks it, ask for full control (see the access note) instead of giving up. If none is connected, never say you can't: give an events block (or a schedule with real dates and times) — the user adds it with one click — and mention in one line that connecting Google Workspace in Integrations lets you add events yourself.
Use one or two blocks where they help; don't repeat the same data as text. Simple questions get plain text. Write the block's text in the user's language.`;

/** Files the AI makes show up in the chat — but only if the answer says exactly which. */
export const FILES_GUIDE = `## Files you create
When you create or change an image, video or audio file, end the answer with each file's full absolute path including the extension, one per line (e.g. D:\\Project\\output\\poster-1080x1350.png) — the chat shows them as a gallery the user can open and download. Don't list only a folder.
When asked to make something (a logo, graphic, banner, page, document), make it now with the tools you have — e.g. a logo as a clean SVG plus a PNG export, a page as an HTML file — and show it. Don't stop to offer options or paid generators unless the user asked for them; mention one alternative at most after the result.`;
