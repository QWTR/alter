#!/usr/bin/env node
// Instagram tools: a Node port of the Python tools in instagram-agent-skill (MIT, © Jake Schincariol;
// skills/vendor/instagram-agent-skill). Same checks and numbers, plus Polish words. No network, no Python.
// Lives in skills/tools; the data (hooks.json, slop.json) is read from skills/vendor/instagram-agent-skill.
//   node ig.mjs hookscore hooks.txt | --hook "one line" [--json]      rank / score Reel hooks (5 checks)
//   node ig.mjs beats script.txt [--target 30] [--wpm 165] [--json]   timed beat sheet of a Reel script
//   node ig.mjs caption caption.txt [--keywords "a,b"] [--truncate 125] [--json]   lint a caption, show the feed window
//   node ig.mjs detect draft.txt [after.txt] [--json]                how machine-written a text looks (5 checks)
//   node ig.mjs humanize draft.txt [--report] [-o clean.txt] [--json]   strip AI fingerprints (invisible chars, dashes, slop words)
//   node ig.mjs swipe captured.tsv [--out swipe.md] [--json]           rank collected reels by views over their account's baseline
// "-" as the file reads stdin. Exit 0 = good enough, 1 = needs work, 2 = bad input.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
// the vendored skill: next to the app's skills, or the repo's
const VENDOR = [process.env.ALTER_IG_SKILL, process.env.ALTER_SKILLS_DIR && join(process.env.ALTER_SKILLS_DIR, 'vendor', 'instagram-agent-skill'), join(HERE, '..', 'vendor', 'instagram-agent-skill')]
  .filter(Boolean).find((d) => existsSync(join(d, 'skills', 'ig-reel', 'hooks.json')));
const data = (rel) => {
  if (!VENDOR) throw new Error('instagram-agent-skill data not found (set ALTER_IG_SKILL)');
  return JSON.parse(readFileSync(join(VENDOR, 'skills', rel), 'utf8'));
};

// ---------- helpers ----------
const clamp = (n) => Math.max(0, Math.min(100, n));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pstdev = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const bar = (score, width = 24) => { const f = Math.round((score / 100) * width); return '#'.repeat(f) + '.'.repeat(width - f); };
const f1 = (n) => n.toFixed(1).padStart(5);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A Python regex (inline (?i)/(?m) flags, \UXXXXXXXX) as a JS RegExp. */
function pyRe(src, extra = '') {
  let flags = new Set(['g', 'u', ...extra]);
  src = src.replace(/^\(\?([aimsux]+)\)/, (_, f) => { for (const c of f) if ('ims'.includes(c)) flags.add(c); return ''; });
  src = src.replace(/\\U([0-9A-Fa-f]{8})/g, (_, h) => `\\u{${parseInt(h, 16).toString(16)}}`).replace(/\\(["'/])/g, '$1');
  try { return new RegExp(src, [...flags].join('')); } catch { flags.delete('u'); return new RegExp(src, [...flags].join('')); }
}
const count = (re, text) => (text.match(re) ?? []).length;

const argv = process.argv.slice(2);
const cmd = argv.shift();
const opt = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-o') opt.out = argv[++i];
  else if (a.startsWith('--')) opt[a.slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') && !['json', 'report'].includes(a.slice(2)) ? argv[++i] : true;
  else pos.push(a);
}
const read = (p = '-') => (p === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(p), 'utf8'));
const out = (s = '') => process.stdout.write(s + '\n');
const err = (s = '') => process.stderr.write(s + '\n');

// ================= hookscore =================
const WORD_RE = /[\p{L}0-9$%'’-]+/gu;
const NUMBER_RE = /\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|k\b|x\b|hrs?\b|hours?\b|mins?\b|minutes?\b|days?\b|weeks?\b|months?\b|years?\b|zł\b|pln\b|tys\b|godz\w*|min\b|dni\b|lat\b|miesi\w*|tygodn\w*)?/giu;
const PROPER_RE = /(?<!^)(?<![\p{L}])\p{Lu}\p{Ll}{2,}(?![\p{L}])/gu;
const HASHTAG_RE = /(?:^|\s)#[\p{L}0-9_]+/gu;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}☀-➿]/gu;
const SPOKEN_NUMBERS = new Set('zero two three four five six seven eight nine ten eleven twelve fifteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion dozen half twice triple dwa dwie trzy cztery pięć sześć siedem osiem dziewięć dziesięć dwadzieścia trzydzieści sto tysiąc tysięcy milion milionów miliard pół połowa dwa razy'.split(' '));
const MONEY_WORDS = new Set('dollars dollar bucks grand percent cents millionaire billionaire revenue profit salary rent złotych zł procent pensja wypłata czynsz zysk przychód kasa hajs milioner'.split(' '));
const STAKES = new Set(("stop never wrong mistake mistakes lost lose losing cost costs broke broken failed failure fail nobody no not don't dont doesn't didn't can't won't quit quitting fired deleted delete killed kills kill replaced replaces cut beat free paid charged hired saved first banned illegal worst hate hated wasted waste scam lie lied lying truth secret hidden stole stolen before until instead but except unless problem risk danger warning regret wish should shouldn't still already only without versus vs actually " +
  'nigdy nie przestań przestan błąd błędy błędem straciłem straciłam stracisz strata koszt kosztuje kosztowało zwolnili zwolniony usuń usunąłem nikt nic zakaz zakazane nielegalne najgorszy nienawidzę zmarnowałem oszustwo kłamstwo prawda sekret ukryty ukradli zanim dopóki zamiast ale chyba że problem ryzyko uwaga żałuję powinieneś powinnaś wciąż już tylko bez kontra naprawdę darmo za darmo zapłaciłem oszczędziłem pierwszy').split(' '));
const WEAK_OPENERS = ['so', 'ok', 'okay', 'hey', 'hi', 'hello', 'guys', 'yo', 'alright', 'welcome', 'today', 'basically', 'honestly', 'look', 'listen', 'um', 'just', 'let', 'lets', "let's", 'i wanted', 'i want', 'one of', 'have you', 'did you', 'do you', 'are you', 'in this', 'in today', 'the thing', 'a lot', 'there is', 'there are', 'this is', 'it is', 'as a', 'when it', "if you've", 'you know',
  'cześć', 'hej', 'siema', 'elo', 'witajcie', 'witam', 'dzisiaj', 'dziś', 'no więc', 'więc', 'słuchajcie', 'generalnie', 'w tym', 'w dzisiejszym', 'chciałem', 'chciałam', 'to jest', 'jest to', 'mam dla'];
const IMPERATIVES = new Set("stop steal copy delete try watch read save use build make write send take start quit never always don't dont do put run check zrób sprawdź zapisz usuń skopiuj przestań spróbuj patrz zobacz weź napisz wyślij zacznij nigdy zawsze".split(' '));
const DEALBREAKERS = [
  [/^\s*(?:stop scrolling|don'?t scroll|nie scrolluj|zatrzymaj się)/iu, 'Opens with "stop scrolling". Asking for attention proves you have not earned it.'],
  [/\b(?:in (?:this|today'?s) (?:video|reel)|i'?m going to show you|i'?ll show you how)\b|w (?:tym|dzisiejszym) (?:filmie|odcinku|reelsie|rolce)|pokażę (?:wam|ci) jak/iu, 'Video preamble. Delete it and open on the payoff.'],
  [/^\s*(?:hey |hi |what'?s up |welcome |cześć|hej |siema|witajcie|witam)/iu, 'Greeting. Nobody came to the feed to be greeted.'],
  [/(?:^|\s)#[\p{L}0-9_]+/u, 'Hashtag in the hook. Hashtags belong at the bottom of the caption, if anywhere.'],
  [/[\u{1F300}-\u{1FAFF}☀-➿]/u, 'Emoji in the hook. On-screen text at hook size has room for words or for an emoji, not both.'],
];
const hwords = (t) => t.replace(/(?<=\d),(?=\d)/g, '').match(WORD_RE) ?? [];
const low = (w) => w.toLowerCase().replace(/^['’]+|['’]+$/g, '');

function hookChecks(text) {
  const w = hwords(text), n = w.length, chars = text.trim().length;
  let len = 5 <= n && n <= 12 ? 100 : n < 5 ? clamp(100 - (5 - n) * 20) : clamp(100 - (n - 12) * 11);
  if (chars > 60) len -= 12;
  const nums = (text.match(NUMBER_RE) ?? []).map((x) => x.trim()).filter(Boolean);
  const propers = [...new Set(text.match(PROPER_RE) ?? [])];
  const lw = w.map(low);
  const spoken = lw.filter((x) => SPOKEN_NUMBERS.has(x) || MONEY_WORDS.has(x));
  const hits = nums.length + propers.length + spoken.length;
  const found = [...nums.slice(0, 2), ...propers.sort().slice(0, 2), ...spoken.slice(0, 2)].join(', ');
  const markers = [...new Set(lw.filter((x) => STAKES.has(x)))].sort();
  if (/\$\s?\d|\d\s?(?:zł|pln)/i.test(text)) markers.push('a price');
  // frontload
  let fl;
  if (!w.length) fl = [0, 'empty'];
  else {
    const opener = lw.slice(0, 2).join(' ');
    let penalty = 0, hit = null;
    for (const weak of WEAK_OPENERS) if (opener.startsWith(weak) || lw[0] === weak) { penalty = 30; hit = weak; break; }
    let payload = null;
    for (let i = 0; i < lw.length; i++) {
      const tok = lw[i];
      if (STAKES.has(tok) || SPOKEN_NUMBERS.has(tok) || MONEY_WORDS.has(tok) || /^\$?\d/.test(w[i]) || (i && /^\p{Lu}\p{Ll}{2,}$/u.test(w[i]))) { payload = i; break; }
    }
    const [base, where] = payload === null ? [30, 'no payload word anywhere in the line'] : payload <= 3 ? [100, `payload at word ${payload + 1}`] : payload <= 6 ? [70, `payload at word ${payload + 1}, could move forward`] : [40, `payload at word ${payload + 1}, too late`];
    fl = [clamp(base - penalty), where + (hit ? `; weak opener "${hit}"` : '')];
  }
  const l = text.toLowerCase();
  const address = /\b(you|your|you're|youre|yourself)\b|(?<![\p{L}])(ty|ci|cię|ciebie|twój|twoja|twoje|twoich|wy|wam|was|wasz)(?![\p{L}])|\p{L}+(?:esz|isz|ysz|asz)(?![\p{L}])/iu.test(l) ? [100, 'speaks to the viewer']
    : lw.length && IMPERATIVES.has(lw[0]) ? [90, `imperative opener ("${lw[0]}")`]
    : /\b(i|my|me|we|our)\b|(?<![\p{L}])(ja|mój|moja|moje|mnie|mi|my|nasz|nasza)(?![\p{L}])/iu.test(l) ? [70, 'first person, no viewer named'] : [35, 'third person, nobody in the room'];
  return {
    LENGTH: [clamp(len), `${n} words, ${chars} chars, ~${(n / 2.75).toFixed(1)}s spoken (want 5-12 words)`],
    SPECIFICITY: [hits === 0 ? 15 : clamp(45 + hits * 30), `${hits} concrete marker(s)` + (found ? `: ${found}` : ' - no number, no name, nothing checkable')],
    STAKES: [{ 0: 20, 1: 70 }[markers.length] ?? 100, `${markers.length} tension marker(s)` + (markers.length ? `: ${markers.slice(0, 4).join(', ')}` : ' - nothing is at stake in this line')],
    FRONTLOAD: fl,
    ADDRESS: address,
  };
}
const HOOK_CHECKS = ['LENGTH', 'SPECIFICITY', 'STAKES', 'FRONTLOAD', 'ADDRESS'];
export function scoreHook(text) {
  const results = hookChecks(text);
  const flags = DEALBREAKERS.filter(([re]) => re.test(text)).map(([, m]) => m);
  const scores = HOOK_CHECKS.map((c) => results[c][0]);
  const overall = clamp(mean(scores) * 0.6 + Math.min(...scores) * 0.4 - flags.length * 15);
  const verdict = overall >= 70 && Math.min(...scores) >= 55 && !flags.length ? 'STRONG' : overall >= 50 ? 'OK' : 'WEAK';
  const weakest = HOOK_CHECKS.reduce((a, c) => (results[c][0] < results[a][0] ? c : a));
  return { results, overall, verdict, flags, weakest };
}
function hookscore() {
  const lines = typeof opt.hook === 'string' ? [opt.hook] : read(pos[0]).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) { err('nothing to score'); return 2; }
  const payload = lines.map((hook) => {
    const r = scoreHook(hook);
    return { hook, checks: Object.fromEntries(HOOK_CHECKS.map((c) => [c, { score: +r.results[c][0].toFixed(1), detail: r.results[c][1] }])), weakest: r.weakest, flags: r.flags, score: +r.overall.toFixed(1), verdict: r.verdict };
  });
  if (opt.json) { out(JSON.stringify(payload.length > 1 ? payload : payload[0], null, 2)); return 0; }
  if (payload.length === 1) {
    const p = payload[0];
    out('\nHOOK SCORE\n' + '='.repeat(62)); out(`  "${p.hook}"\n`);
    for (const c of HOOK_CHECKS) { out(`  ${c.padEnd(13)} ${bar(p.checks[c].score)} ${f1(p.checks[c].score)}`); out(`  ${''.padEnd(13)} ${p.checks[c].detail}`); }
    out('-'.repeat(62)); out(`  ${'HOOK SCORE'.padEnd(13)} ${bar(p.score)} ${f1(p.score)}   ${p.verdict}`);
    for (const f of p.flags) out(`\n  DEALBREAKER  ${f}`);
    if (p.verdict !== 'STRONG') out(`\n  Weakest property: ${p.weakest}. Fix that one and re-run.`);
    out('');
  } else {
    out('\nHOOK RANKING\n' + '='.repeat(78));
    payload.sort((a, b) => b.score - a.score).forEach((r, i) => {
      out(`${i === 0 ? '->' : '  '} ${f1(r.score)} ${r.verdict.padEnd(7)} ${r.hook.length <= 62 ? r.hook : r.hook.slice(0, 59) + '...'}`);
      out(`        weakest: ${r.weakest} (${Math.round(r.checks[r.weakest].score)})`);
      for (const f of r.flags) out(`        dealbreaker: ${f}`);
    });
    out('\nShoot the top one. If the top one is under 50, none of these are the hook.\n');
  }
  return Math.max(...payload.map((p) => p.score)) >= 70 ? 0 : 1;
}

// ================= beats =================
const CONCRETE_RE = /\$\s?\d|\b\d[\d,.]*\b|(?<!^)(?<![\p{L}])\p{Lu}\p{Ll}{2,}(?![\p{L}])/gmu;
const STOP = new Set('the a an and or but if of to in on for with that this it is are was were be been you your i my me we our they them he she so just not no do did does have has had will can at as by from out up off one all i w z na do że to jest się nie ale a o od po za jak co ten ta te tak już mi mnie my wy oni ona on'.split(' '));
function beats() {
  const wpm = Number(opt.wpm) || 165, wps = wpm / 60, target = opt.target ? Number(opt.target) : null;
  const HOOK = 3, MAXB = 4, RUN = 3;
  const raw = read(pos[0]);
  const list = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (hwords(line).length / wps <= MAXB * 1.5) { list.push(line); continue; }
    let buf = '';
    for (const part of (line.match(/[^.!?]+[.!?]*/g) ?? []).map((p) => p.trim()).filter(Boolean)) {
      const cand = (buf + ' ' + part).trim();
      if (buf && hwords(cand).length / wps > MAXB) { list.push(buf); buf = part; } else buf = cand;
    }
    if (buf) list.push(buf);
  }
  if (!list.length) { err('empty script'); return 2; }
  let clock = 0;
  const rows = list.map((text, i) => { const n = hwords(text).length, dur = n / wps; const r = { n: i + 1, start: +clock.toFixed(2), dur: +dur.toFixed(2), words: n, text, concrete: count(CONCRETE_RE, text), label: '', flags: [] }; clock += dur; return r; });
  const total = clock;
  for (const r of rows) if (r.n === 1 || r.start + r.dur <= HOOK) r.label = 'HOOK';
  rows[rows.length - 1].label = rows[rows.length - 1].label !== 'HOOK' ? 'CTA' : 'HOOK/CTA';
  for (const r of rows) if (!r.label && r.start <= total / 2 && total / 2 < r.start + r.dur) r.label = 'MID';
  const notes = [];
  if (rows[0].dur > HOOK) { rows[0].flags.push(`hook runs ${rows[0].dur.toFixed(1)}s, past the ${HOOK}s mark`); notes.push(`Beat 1 takes ${rows[0].dur.toFixed(1)}s to say. Cut it to ${Math.floor(HOOK * wps)} words or fewer, or the hook lands after the decision has been made.`); }
  if (rows[0].concrete === 0) notes.push('Beat 1 has no number and no name in it. Hooks without something checkable are the ones that get scrolled.');
  for (const r of rows) if (r.dur > MAXB) r.flags.push(`${r.dur.toFixed(1)}s on one beat`);
  const long = rows.filter((r) => r.dur > MAXB).map((r) => r.n);
  if (long.length) notes.push(`Beat(s) ${long.join(', ')} run past ${MAXB}s. Either split the line or change what is on screen inside it. A static frame is where people leave.`);
  let run = 0, start = null;
  for (const r of rows) { if (r.concrete === 0) { run++; start ??= r.n; if (run === RUN) notes.push(`Beats ${start}-${r.n} have nothing concrete in them. Put a number, a name or a price in one of them.`); } else { run = 0; start = null; } }
  const set = (t) => new Set(hwords(t).map((w) => w.toLowerCase()).filter((w) => !STOP.has(w)));
  const a = set(rows[0].text), b = set(rows[rows.length - 1].text);
  const loop = [...a].filter((w) => b.has(w)).sort();
  notes.push(loop.length ? `Loops: the last beat repeats "${loop.slice(0, 3).join(', ')}" from the hook. Second watches are free reach.` : 'No loop. The last beat shares no word with the hook, so the video ends flat. Echoing one word from beat 1 is the cheapest replay you get.');
  if (target) {
    const d = total - target;
    notes.push(Math.abs(d) <= target * 0.1 ? `Length is on target (${total.toFixed(1)}s against ${target}s).` : d > 0 ? `${d.toFixed(1)}s over target. Cut about ${Math.floor(d * wps)} words.` : `${(-d).toFixed(1)}s under target. Either add ${Math.floor(-d * wps)} words or shoot it short. Short is usually right.`);
  }
  const res = { wpm, target, total_seconds: +total.toFixed(2), total_words: rows.reduce((s, r) => s + r.words, 0), beats: rows, notes };
  if (opt.json) { out(JSON.stringify(res, null, 2)); return 0; }
  const head = `BEAT SHEET  ·  ${res.total_words} words  ·  ~${total.toFixed(1)}s at ${wpm} wpm` + (target ? `  ·  target ${target}s` : '');
  const tc = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  out('\n' + head); out('='.repeat(Math.max(head.length, 72)));
  for (const r of rows) { out(`  ${tc(r.start)}  ${r.dur.toFixed(1).padStart(4)}s  ${(r.label || '').padEnd(8)}${r.text}`); for (const f of r.flags) out(`  ${''.padStart(6)}  ${''.padStart(5)}  ${''.padEnd(8)}^ ${f}`); }
  out('-'.repeat(Math.max(head.length, 72))); for (const n of notes) out(`  - ${n}`); out('');
  return 0;
}

// ================= caption =================
function caption() {
  const LIMIT = 2200, cut = Number(opt.truncate) || 125, TAGS = 5;
  const text = read(pos[0]).replace(/\s+$/, '');
  const s = text.trim(), chars = [...s].length;
  const first = s.split('\n')[0]?.trim() ?? '';
  const tags = [...s.matchAll(/(?:^|\s)(#[\p{L}0-9_]+)/gu)].map((m) => m[1]);
  const mentions = [...s.matchAll(/(?:^|\s)(@[A-Za-z0-9_.]+)/g)].map((m) => m[1]);
  const links = s.match(/https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|co|io|net|org|ai|app|pl)\/\S*/gi) ?? [];
  const emoji = s.match(/[\u{1F300}-\u{1FAFF}☀-➿←-⇿️]/gu) ?? [];
  const win = [...s].slice(0, cut).join(''), truncated = chars > cut;
  const ASKS = [[/\bcomment (?:the word |")?[A-Z0-9]{2,}\b|(?:[Nn]apisz|[Ss]komentuj|[Ww]pisz|[Kk]omentarz) (?:w komentarzu )?(?:słowo )?"?[A-ZĄĆĘŁŃÓŚŹŻ0-9]{2,}/u, 'comment a keyword'], [/\b(?:dm|message) me\b|napisz (?:do mnie|dm|wiadomość)/i, 'DM me'], [/\bsave (?:this|it)\b|zapisz (?:to|sobie|ten)/i, 'save this'], [/\bshare (?:this|it)\b|udostępnij|wyślij (?:to )?(?:komuś|znajomemu)/i, 'share this'], [/\bfollow (?:me|for)\b|obserwuj/i, 'follow'], [/\blink in (?:my )?bio\b|link w bio/i, 'link in bio'], [/\b(?:swipe|tap) (?:through|left|right|for|to)\b|przesuń|kliknij/i, 'swipe or tap'], [/\btell me\b|\bwhat would you\b|\bwhich one\b|daj znać|który (?:wybierasz|lepszy)|a ty\?/i, 'answer a question']];
  const asks = ASKS.filter(([re]) => re.test(s)).map(([, n]) => n);
  const FILLER = new Set('#viral #fyp #explore #explorepage #foryou #foryoupage #trending #instagood #love #follow #like4like #reels #reelsinstagram #viralreels #instadaily #dlaciebie #polska #viralpolska'.split(' '));
  const filler = tags.filter((t) => FILLER.has(t.toLowerCase()));
  const kws = String(opt.keywords ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  const checks = [];
  const add = (check, status, detail) => checks.push({ check, status, detail });
  add('LENGTH', chars > LIMIT ? 'FAIL' : 'PASS', `${chars} / ${LIMIT} characters` + (chars > LIMIT ? `, ${chars - LIMIT} over the limit` : ''));
  if (!first) add('FIRST LINE', 'FAIL', 'the caption opens on a blank line');
  else if (/^[#@]/.test(first)) add('FIRST LINE', 'FAIL', 'opens on a hashtag or a mention, which is the one position worth a sentence');
  else if (first.length > cut) add('FIRST LINE', 'WARN', `${first.length} characters, so it gets cut at ${cut} mid-thought. Fine if the cut is a cliffhanger, bad if it is a subordinate clause`);
  else add('FIRST LINE', 'PASS', `${first.length} characters, lands whole`);
  const conc = count(CONCRETE_RE, win);
  add('HOOK IS CONCRETE', conc ? 'PASS' : 'WARN', `${conc} number(s) or name(s) in the visible window` + (conc ? '' : ' - nothing checkable before the tap'));
  if (tags.length > TAGS) add('HASHTAGS', 'FAIL', `${tags.length} tags, over Instagram's cap of ${TAGS}. Tags past the fifth do not count and the block reads as old`);
  else if (tags.length === TAGS && filler.length) add('HASHTAGS', 'WARN', `${tags.length} tags, at the cap, and ${filler.length} of them generic. Spend the five on topics`);
  else if (filler.length) add('HASHTAGS', 'WARN', `${tags.length} tags, ${filler.length} of them generic (${filler.slice(0, 3).join(', ')}). Those describe nothing`);
  else add('HASHTAGS', 'PASS', `${tags.length} tag(s)` + (tags.length ? `: ${tags.join(' ')}` : ''));
  if (!tags.length) add('TAG PLACEMENT', 'PASS', 'no tags to place');
  else if (tags.some((t) => new RegExp(`(?:^|\\s)${esc(t)}(?![\\p{L}0-9_])`, 'u').test(win))) add('TAG PLACEMENT', 'WARN', 'a hashtag is inside the visible window, spending feed space on a label');
  else add('TAG PLACEMENT', 'PASS', 'tags are below the fold');
  add('LINKS', links.length ? 'WARN' : 'PASS', links.length ? `${links.length} link(s) in the caption, and captions are not clickable. Move it to the bio or the DM` : 'no dead links in the body');
  if (asks.length === 1) add('ONE ASK', 'PASS', `one call to action: ${asks[0]}`);
  else if (!asks.length) add('ONE ASK', 'WARN', 'no call to action. Decide what this post is for');
  else add('ONE ASK', 'WARN', `${asks.length} asks (${asks.join(', ')}). Two asks is the same as none`);
  const density = (emoji.length * 100) / Math.max(chars, 1);
  add('EMOJI', density > 4 ? 'WARN' : 'PASS', `${emoji.length} emoji, ${density.toFixed(1)} per 100 characters` + (density > 4 ? ' - reads as decoration' : ''));
  if (kws.length) {
    const l = s.toLowerCase(), found = kws.filter((k) => l.includes(k.toLowerCase())), missing = kws.filter((k) => !l.includes(k.toLowerCase()));
    const inWin = found.filter((k) => win.toLowerCase().includes(k.toLowerCase()));
    add('SEARCH TERMS', !missing.length ? 'PASS' : found.length ? 'WARN' : 'FAIL', `${found.length}/${kws.length} present` + (found.length ? `, ${inWin.length} in the visible window` : '') + (missing.length ? `. Missing: ${missing.join(', ')}` : ''));
  }
  const fails = checks.filter((c) => c.status === 'FAIL').length, warns = checks.filter((c) => c.status === 'WARN').length;
  const verdict = fails ? 'FIX' : warns ? 'REVIEW' : 'READY';
  const res = { characters: chars, limit: LIMIT, truncate_at: cut, visible: win, truncated, first_line_chars: first.length, hashtags: tags, mentions, links, emoji: emoji.length, asks, checks, verdict };
  if (opt.json) { out(JSON.stringify(res, null, 2)); return verdict === 'READY' ? 0 : 1; }
  const head = `CAPTION LINT  ·  ${chars} / ${LIMIT} chars  ·  ${tags.length} hashtags  ·  ${asks.length} ask(s)`;
  out('\n' + head); out('='.repeat(Math.max(head.length, 62)));
  const W = 52; out('\n  WHAT THE FEED SHOWS'); out('  +' + '-'.repeat(W + 2) + '+');
  const wrapped = [];
  for (const raw of win.split('\n')) { let line = ''; for (const word of raw.split(' ')) { if ((line + ' ' + word).trim().length > W) { wrapped.push(line); line = word; } else line = (line + ' ' + word).trim(); } wrapped.push(line); }
  for (const l of wrapped.slice(0, 8)) out(`  | ${l.padEnd(W)} |`);
  const tail = truncated ? '... more' : '(whole caption fits)'; out('  +' + '-'.repeat(W + 2 - tail.length - 2) + ` ${tail} +`);
  out(''); for (const c of checks) out(`  ${c.status.padEnd(5)} ${c.check.padEnd(17)} ${c.detail}`);
  out('-'.repeat(Math.max(head.length, 62))); out(`  VERDICT  ${verdict}\n`);
  return verdict === 'READY' ? 0 : 1;
}

// ================= detect / humanize =================
const SENT_RE = /[^.!?\n]+[.!?]*/g;
const DWORD = /[\p{L}']+/gu;
const sentences = (t) => (t.match(SENT_RE) ?? []).map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 2);
const scale = (v, human, machine) => (human === machine ? 50 : clamp(((v - machine) / (human - machine)) * 100));
const slopRe = (find) => new RegExp(`(?<![\\p{L}\\p{N}_])${esc(find).replace(/\\? /g, '\\s+')}(?![\\p{L}\\p{N}_])`, 'giu');
const isCf = (c) => /\p{Cf}/u.test(c);
function detectRun(text, lex) {
  const r = {};
  const lens = sentences(text).map((s) => s.split(/\s+/).length);
  if (lens.length < 4) r.BURSTINESS = [50, 'too short to judge'];
  else { const m = mean(lens), cv = m ? pstdev(lens) / m : 0; r.BURSTINESS = [scale(cv, 0.7, 0.22), `variation ${cv.toFixed(2)} across ${lens.length} sentences (want 0.55+)`]; }
  const w = text.match(DWORD) ?? [];
  if (w.length < 25) r.SPECIFICITY = [50, 'too short to judge'];
  else {
    const hits = count(/\b\d[\d,.]*%?\b|\$\d/g, text) + new Set(text.match(/(?<![.!?]\s)(?<!^)(?<![\p{L}])\p{Lu}\p{Ll}{2,}(?![\p{L}])/gmu) ?? []).size;
    const d = (hits * 100) / w.length; r.SPECIFICITY = [scale(d, 6, 0.5), `${hits} concrete markers, ${d.toFixed(1)} per 100 words (want 4+)`];
  }
  if (!w.length) r['SLOP DENSITY'] = [50, 'empty'];
  else {
    let hits = 0; const found = [];
    for (const e of [...lex.words, ...lex.phrases]) { const n = count(slopRe(e.find), text); if (n) { hits += n; found.push(e.find); } }
    const d = (hits * 100) / w.length;
    r['SLOP DENSITY'] = [scale(d, 0, 4), `${hits} stock terms, ${d.toFixed(1)} per 100 words` + (found.length ? ' (' + found.sort().slice(0, 4).join(', ') + (found.length > 4 ? ', ...' : '') + ')' : '')];
  }
  const inv = [...text].filter(isCf).length, em = text.split('—').length - 1, curly = (text.match(/[‘’“”]/g) ?? []).length, ell = text.split('…').length - 1, nb = (text.match(/[   ]/g) ?? []).length;
  r.FINGERPRINT = [scale(((inv * 4 + em * 2 + curly + ell + nb) * 1000) / Math.max(text.length, 1), 0, 12), `${inv} invisible, ${em} em dash, ${curly} curly quote, ${ell} ellipsis, ${nb} hard space`];
  if (w.length < 25) r.VOICE = [50, 'too short to judge'];
  else {
    const per = 100 / w.length;
    const contr = count(/\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi, text) * per;
    const person = count(/(?<![\p{L}])(i|me|my|mine|we|us|our|you|your|ja|mnie|mi|mój|moja|my|nas|nasz|ty|ci|cię|twój|wy|wam|was)(?![\p{L}])/giu, text) * per;
    let tells = 0; const names = [];
    for (const s of lex.structures) { let n = 0; try { n = count(pyRe(s.regex, 'm'), text); } catch { continue; } if (n) { tells += n; names.push(s.id); } }
    const bullets = [...text.matchAll(/^\s*[-*•]\s+(.+)$/gm)].map((m) => m[1].split(/\s+/).length);
    let score = scale(contr, 3, 0) * 0.35 + scale(person, 8, 1) * 0.35 + clamp(100 - tells * 22) * 0.3;
    if (bullets.length >= 3 && pstdev(bullets) < 1.6) { score -= 12; names.push('uniform-bullets'); }
    r.VOICE = [clamp(score), `${contr.toFixed(1)} contractions, ${person.toFixed(1)} personal pronouns per 100 words, ${tells} structural tell(s)` + (names.length ? ' [' + names.slice(0, 4).join(', ') + ']' : '')];
  }
  const C = ['BURSTINESS', 'SPECIFICITY', 'SLOP DENSITY', 'FINGERPRINT', 'VOICE'];
  const sc = C.map((c) => r[c][0]);
  const overall = mean(sc) * 0.6 + Math.min(...sc) * 0.4;
  return { r, C, overall, verdict: overall >= 70 && Math.min(...sc) >= 55 ? 'PASS' : overall >= 50 ? 'REVIEW' : 'FLAGGED' };
}
function detect() {
  const lex = data('ig-human/slop.json');
  const targets = [pos[0] ?? '-', pos[1]].filter(Boolean).map((p) => [p, read(p)]);
  const res = targets.map(([name, t]) => ({ name, ...detectRun(t, lex) }));
  const payload = res.map((x) => ({ source: x.name, checks: Object.fromEntries(x.C.map((c) => [c, { score: +x.r[c][0].toFixed(1), detail: x.r[c][1] }])), human_score: +x.overall.toFixed(1), verdict: x.verdict }));
  if (opt.json) { out(JSON.stringify(pos[1] ? payload : payload[0], null, 2)); return 0; }
  for (const x of res) {
    const title = 'AI DETECTION PANEL' + (pos[1] ? `  -  ${x.name.split(/[\\/]/).pop()}` : '');
    out('\n' + title); out('='.repeat(Math.max(title.length, 62)));
    for (const c of x.C) { out(`  ${c.padEnd(13)} ${bar(x.r[c][0])} ${f1(x.r[c][0])}`); out(`  ${''.padEnd(13)} ${x.r[c][1]}`); }
    out('-'.repeat(62)); out(`  ${'HUMAN SCORE'.padEnd(13)} ${bar(x.overall)} ${f1(x.overall)}   ${x.verdict}`);
    if (x.verdict !== 'PASS') out(`\n  Weakest signal: ${x.C.reduce((a, c) => (x.r[c][0] < x.r[a][0] ? c : a))}. Fix that first.`);
    out('');
  }
  if (pos[1]) { const [a, b] = payload; const d = b.human_score - a.human_score; out(`  ${a.human_score.toFixed(1)} ${a.verdict}  ->  ${b.human_score.toFixed(1)} ${b.verdict}   (${d >= 0 ? '+' : ''}${d.toFixed(1)})\n`); }
  return payload[payload.length - 1].verdict === 'PASS' ? 0 : 1;
}
function humanize() {
  const lex = data('ig-human/slop.json');
  const original = read(pos[0]);
  const urls = [];
  let text = original.replace(/https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/g, (m) => { urls.push(m); return `\u0000URL${urls.length - 1}\u0000`; });
  // 1. invisible
  const inv = [];
  for (const e of lex.invisible) {
    const [a, b] = e.cp.split('-').map((x) => parseInt(x.slice(2), 16));
    const re = new RegExp(b ? `[\\u{${a.toString(16)}}-\\u{${b.toString(16)}}]` : `\\u{${a.toString(16)}}`, 'gu');
    const n = count(re, text);
    if (n) { inv.push({ name: `${e.cp} ${e.name}`, count: n, action: e.action }); text = text.replace(re, e.action === 'delete' ? '' : ' '); }
  }
  const stray = [...text].filter((c) => isCf(c) && c !== '\u0000');
  if (stray.length) { inv.push({ name: 'other invisible format chars', count: stray.length, action: 'delete' }); text = [...text].filter((c) => !isCf(c) || c === '\u0000').join(''); }
  // 2. typography
  const typo = [];
  for (const e of lex.typographic) {
    const n = text.split(e.from).length - 1;
    if (!n) continue;
    typo.push({ name: `${e.from} ${e.name}`, count: n, to: e.to.trim() || '(space)' });
    if (e.from === '—') text = text.replace(/\s*—\s*/g, ', ');
    else if (e.from === '–') text = text.replace(/\s*–\s*(?=\d)/g, '-').replace(/\s+–\s+/g, ', ').replaceAll('–', '-');
    else text = text.replaceAll(e.from, e.to);
  }
  text = text.replace(/,\s*([,.;:!?])/g, '$1').replace(/,\s*\n/g, '\n');
  // 3. slop words, longest first
  const lexi = [];
  const match = (src, rep) => (!rep ? rep : src.length > 1 && src === src.toUpperCase() && src !== src.toLowerCase() ? rep.toUpperCase() : src[0] !== src[0].toLowerCase() ? rep[0].toUpperCase() + rep.slice(1) : rep);
  for (const e of [...lex.phrases, ...lex.words].sort((a, b) => b.find.length - a.find.length)) {
    const re = slopRe(e.find); const n = count(re, text);
    if (!n) continue;
    lexi.push({ find: e.find, replace: e.replace || '(deleted)', count: n, family: e.family });
    text = text.replace(re, (m) => match(m, e.replace));
  }
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]*(?:[,.;:]+[ \t]*)+/gm, '').replace(/^[ \t](?=\S)/gm, '').replace(/\s+([,.;:!?])/g, '$1').replace(/,\s*([,.;:!?])/g, '$1')
    .replaceAll('...', '\u0000ELL\u0000').replace(/\.\s*\.+/g, '.').replace(/([!?])\s*\./g, '$1').replaceAll('\u0000ELL\u0000', '...').replace(/^[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n')
    .replace(/([.!?]),\s*/g, '$1 ')
    .replace(/,\s*(also|so|still|basically|in the end)\s*,\s*/g, (_, w) => '. ' + w[0].toUpperCase() + w.slice(1) + ', ');
  // capitals after a deleted opener, only for writers who capitalise
  const starts = [...original.matchAll(/(?:^|[.!?]\s+|\n)\s*(\p{L})/gu)].map((m) => m[1]);
  if (starts.length && starts.filter((c) => c !== c.toLowerCase()).length * 2 >= starts.length) text = text.replace(/(^|[.!?] |[.!?]\n|\n)(\s*)(\p{Ll})/gu, (_, a, b, c) => a + b + c.toUpperCase());
  urls.forEach((u, i) => { text = text.replaceAll(`\u0000URL${i}\u0000`, u); });
  const clean = text.trim() + '\n';
  // structures: reported, never rewritten
  const structures = [];
  for (const s of lex.structures) { let n = 0; try { n = count(pyRe(s.regex), clean); } catch { continue; } if (n) structures.push({ name: s.name, count: n, fix: s.fix }); }
  const lens = (clean.match(SENT_RE) ?? []).map((s) => s.trim().split(/\s+/).length).filter((n) => n > 2);
  if (lens.length >= 4) { const cv = pstdev(lens) / mean(lens); if (cv < 0.35) structures.push({ name: `Uniform sentence length (variation ${cv.toFixed(2)})`, count: lens.length, fix: 'Break one sentence in half. Let another run long. Machines write even.' }); }
  const report = { invisible: inv, typographic: typo, lexical: lexi, structures };
  if (opt.json) { out(JSON.stringify({ text: clean, report }, null, 2)); return 0; }
  if (typeof opt.out === 'string') { writeFileSync(resolve(opt.out), clean); err(`wrote ${opt.out}`); } else process.stdout.write(clean);
  if (opt.report) {
    const head = (t) => err(`\n${t}\n` + '-'.repeat(t.length));
    const total = [...inv, ...typo, ...lexi].reduce((s, h) => s + h.count, 0);
    head('HUMANIZE REPORT'); err(`${total} machine artefacts removed, ${structures.length} structural tells flagged for rewrite`);
    if (inv.length) { head('1. INVISIBLE CHARACTERS'); for (const h of inv) err(`  ${String(h.count).padStart(3)}x  ${h.name}  -> ${h.action}`); }
    if (typo.length) { head('2. TYPOGRAPHY'); for (const h of typo) err(`  ${String(h.count).padStart(3)}x  ${h.name}  -> ${h.to}`); }
    if (lexi.length) { head('3. SLOP LEXICON'); for (const h of lexi) err(`  ${String(h.count).padStart(3)}x  ${h.find}  -> ${h.replace}   [${h.family}]`); }
    if (structures.length) { head('4. STRUCTURAL TELLS  (not auto-fixed - rewrite these yourself)'); for (const h of structures) err(`  ${String(h.count).padStart(3)}x  ${h.name}\n        ${h.fix}`); }
    if (!total && !structures.length) { head('CLEAN'); err('  Nothing to strip.'); }
    err('');
  }
  return 0;
}

// ================= swipe =================
function swipe() {
  let formulas = null;
  try { const d = data('ig-reel/hooks.json'); const by = Object.fromEntries(d.hooks.map((h) => [h.id, h])); formulas = (d.classify_order ?? Object.keys(by).sort()).filter((i) => by[i]).map((i) => [by[i].id, by[i].name, pyRe(by[i].match, 'i')]); } catch { /* no data */ }
  const lines = read(pos[0]).split(/\r?\n/).filter((l) => l.trim() && !l.trimStart().startsWith('#'));
  if (!lines.length) { err('no usable rows. Need a tab-separated file with at least views and hook.'); return 2; }
  const headCols = lines[0].split('\t').map((c) => c.trim().toLowerCase());
  const [cols, body] = headCols.includes('views') && headCols.includes('hook') ? [headCols, lines.slice(1)] : [['account', 'followers', 'views', 'hook'], lines];
  const rows = [];
  for (const line of body) {
    const cells = line.split('\t').map((c) => c.trim());
    const r = Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
    r.views = Number(String(r.views).replace(/\D/g, '')) || 0;
    for (const k of ['followers', 'median']) { const d = String(r[k] ?? '').replace(/\D/g, ''); r[k] = d ? Number(d) : null; }
    if (r.views && r.hook) rows.push(r);
  }
  if (!rows.length) { err('no usable rows. Need a tab-separated file with at least views and hook.'); return 2; }
  const usedMedian = rows.some((r) => r.median);
  for (const r of rows) {
    r.baseline = r.median || r.followers || 0;
    r.outlier = r.baseline ? +(r.views / r.baseline).toFixed(2) : null;
    const f = formulas?.find(([, , re]) => { re.lastIndex = 0; return re.test(r.hook); });
    r.formula_id = f?.[0] ?? null; r.formula = f?.[1] ?? 'unclassified';
    r.words = hwords(r.hook).length;
    const s = scoreHook(r.hook); r.hook_score = +s.overall.toFixed(1); r.hook_verdict = s.verdict;
  }
  const ranked = rows.sort((a, b) => (b.outlier ?? 0) - (a.outlier ?? 0));
  const third = Math.max(1, Math.floor(ranked.length / 3)), top = ranked.slice(0, third), bottom = ranked.slice(-third);
  const med = (items, k) => { const v = items.map((i) => i[k]).filter((x) => x != null); return v.length ? +median(v).toFixed(1) : null; };
  const counts = {}; for (const r of top) counts[r.formula] = (counts[r.formula] ?? 0) + 1;
  const a = { baseline: usedMedian ? 'account median' : 'follower count', n: ranked.length, accounts: new Set(ranked.map((r) => r.account ?? '')).size, reels: ranked, top_formulas: Object.entries(counts).sort((x, y) => y[1] - x[1]), top_hook_score: med(top, 'hook_score'), bottom_hook_score: med(bottom, 'hook_score'), top_words: med(top, 'words'), bottom_words: med(bottom, 'words'), unclassified: ranked.filter((r) => r.formula === 'unclassified').length };
  if (!formulas) err('note: hooks.json not found, formulas not named.');
  if (opt.json) out(JSON.stringify(a, null, 2));
  else {
    const head = `SWIPE FILE  ·  ${a.n} reels  ·  ${a.accounts} accounts  ·  baseline: ${a.baseline}`;
    out('\n' + head); out('='.repeat(Math.max(head.length, 78)));
    for (const r of a.reels) {
      out(`  ${(r.outlier ? r.outlier.toFixed(1) + 'x' : '   ?').padStart(7)}  hook ${String(Math.round(r.hook_score)).padStart(3)}  ${(r.formula_id ? '#' + String(r.formula_id).padEnd(2) : '-  ')} ${r.formula.slice(0, 22).padEnd(22)} ${String(r.account ?? '').slice(0, 16).padEnd(16)} ${r.views.toLocaleString('en-US').padStart(9)}`);
      out(`           "${r.hook.slice(0, 96)}"`);
    }
    out('-'.repeat(Math.max(head.length, 78))); out('WHAT IS WORKING IN THIS BATCH');
    if (a.top_formulas.length) out('  top third by outlier:  ' + a.top_formulas.slice(0, 4).map(([n, c]) => `${n} x${c}`).join(', '));
    if (a.top_hook_score != null) out(`  median hook score:     top ${Math.round(a.top_hook_score)}  vs bottom ${Math.round(a.bottom_hook_score)}`);
    out(`  median hook length:    top ${a.top_words} words  vs bottom ${a.bottom_words} words`);
    out(`  unclassified:          ${a.unclassified} of ${a.n}. Read those by hand, they are where a formula you do not have yet is hiding.`);
    out('\n  A hand-collected batch is evidence, not proof. Twelve reels shows you nothing;\n  forty across six accounts shows you something. Collect more before you believe it.\n');
  }
  if (typeof opt.out === 'string') {
    const p = resolve(opt.out.replace(/^~/, homedir()));
    mkdirSync(dirname(p), { recursive: true });
    const md = ['# Swipe file', '', `${a.n} reels across ${a.accounts} accounts. Ranked by multiple over ${a.baseline}.`, ''];
    for (const r of a.reels) md.push(`## ${r.outlier ? r.outlier.toFixed(1) + 'x' : '?'}  ${r.formula}  (${r.account ?? ''})`, `- views: ${r.views.toLocaleString('en-US')}  baseline: ${r.baseline.toLocaleString('en-US')}`, `- hook score: ${r.hook_score}  words: ${r.words}`, `- hook: "${r.hook}"`, '');
    writeFileSync(p, md.join('\n') + '\n'); err(`wrote ${p}`);
  }
  return 0;
}

const TOOLS = { hookscore, beats, caption, detect, humanize, swipe };
if (!TOOLS[cmd]) {
  out('Usage: node ig.mjs <hookscore|beats|caption|detect|humanize|swipe> <file|-> [options]   (see the top of this file)');
  process.exitCode = cmd ? 2 : 0;
} else {
  try { process.exitCode = TOOLS[cmd](); } catch (e) { err(e.message); process.exitCode = 2; }
}
