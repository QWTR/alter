#!/usr/bin/env node
// AI video clips for edits: animate a still (usually a frame from the user's video edited by gen-image --from).
//   node gen-video.mjs "<what happens, the motion>" --from still.png [--last end.png] [--seconds 5] [--aspect 9:16] [--out assets/fx1.mp4]
// Video AIs (first that is connected): Higgsfield API (Seedance 2.0 / Kling 3), fal.ai (Seedance 2.0, Kling 3, Veo 3.1),
// Google Gemini key (Omni Flash). Keys: Settings → Plugins (Higgsfield, fal.ai) or Media → Keys (Gemini, fal).
// --via higgsfield|seedance|kling|veo|gemini picks one; --model kling with --via higgsfield uses Kling 3.
// Without any: NO_VIDEO_AI (code 3); an empty balance: NO_VIDEO_BILLING.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { request as httpsRequest } from 'node:https';

const argv = process.argv.slice(2);
const opt = {};
const words = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  else words.push(argv[i]);
}
const what = words.join(' ').trim();
const from = typeof opt.from === 'string' ? resolve(opt.from) : null;
if (!what || opt.help) {
  console.log('Usage: node gen-video.mjs "<motion>" --from still.png [--seconds 5] [--aspect 9:16|16:9|1:1] [--via higgsfield|seedance|kling|veo|gemini] [--model kling] [--out file.mp4]');
  process.exit(what ? 0 : 1);
}
if (from && !existsSync(from)) { console.error(`--from: file not found (${from})`); process.exit(2); }
const FORMAT_ASPECT = { reel: '9:16', story: '9:16', wide: '16:9', thumb: '16:9', square: '1:1', post: '1:1' };
const aspect = ['9:16', '16:9', '1:1'].includes(opt.aspect) ? opt.aspect : FORMAT_ASPECT[opt.format] ?? '9:16';
const seconds = Math.max(3, Math.min(15, Number(opt.seconds) || 5));
const out = resolve(typeof opt.out === 'string' ? opt.out : `assets/clip-${Date.now()}.mp4`);
const prompt = `${what}. Keep the same people, place and camera as the starting image; realistic physics and motion, cinematic VFX, no text.`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastPath = typeof opt.last === 'string' ? resolve(opt.last) : null;
const last = lastPath && existsSync(lastPath) ? { b64: readFileSync(lastPath).toString('base64'), mime: /\.png$/i.test(lastPath) ? 'image/png' : 'image/jpeg' } : null;
const img = from ? { b64: readFileSync(from).toString('base64'), mime: /\.png$/i.test(from) ? 'image/png' : 'image/jpeg' } : null;
const save = (buf) => { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, buf); return out; };

const google = process.env.ALTER_GOOGLE_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const fal = process.env.ALTER_FAL_KEY || process.env.FAL_KEY;

// Google's video model in the Gemini API (Veo was retired there on 2026-10-22; Omni Flash replaced it).
// One synchronous call to /v1beta/interactions; the finished MP4 comes back in the response.
function postLong(url, headers, body) {
  return new Promise((res, rej) => {
    const req = httpsRequest(url, { method: 'POST', headers: { ...headers, 'content-length': Buffer.byteLength(body) } }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => res({ status: r.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
      r.on('error', rej);
    });
    req.setTimeout(15 * 60_000, () => req.destroy(new Error('Gemini: no answer after 15 min')));
    req.on('error', rej);
    req.end(body);
  });
}

async function omni() {
  const model = process.env.ALTER_GOOGLE_VIDEO_MODEL || 'gemini-omni-1.2-flash';
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const input = [];
  if (img) input.push({ type: 'image', data: img.b64, mime_type: img.mime });
  if (img && last) input.push({ type: 'image', data: last.b64, mime_type: last.mime });
  const how = img && last ? 'The first image is the exact FIRST frame and the second image is the exact LAST frame of the video. '
    : img ? 'The image is the exact FIRST frame of the video: start from it unchanged, then: ' : '';
  input.push({ type: 'text', text: how + prompt });
  const dur = img && last ? Math.min(seconds, 10) : seconds;
  const body = JSON.stringify({
    model, input, store: false, stream: false, background: false,
    response_format: { type: 'video', aspect_ratio: aspect === '16:9' ? '16:9' : '9:16', resolution: '720p', duration: `${dur}s` },
    ...(img ? { generation_config: { video_config: { task: 'image_to_video' } } } : {}),
  });
  const r = await postLong(`${base}/interactions`, { 'content-type': 'application/json', 'x-goog-api-key': google }, body);
  let j = {};
  try { j = JSON.parse(r.text); } catch {}
  if (Array.isArray(j)) j = j[0] ?? {};
  if (r.status >= 400 || j.error) {
    const msg = j.error?.message ?? `HTTP ${r.status}`;
    if (/billing|quota|exceeded|FAILED_PRECONDITION|free tier|RESOURCE_EXHAUSTED/i.test(msg + (j.error?.status ?? '')))
      throw new Error(`NO_VIDEO_BILLING: ${msg.slice(0, 200)} — the key's Google Cloud project needs billing (Google AI Pro/Ultra include monthly credits for it: developers.google.com/profile → benefits)`);
    throw new Error(`Gemini video: ${msg.slice(0, 300)}`);
  }
  const parts = (j.steps ?? []).filter((s) => s.type === 'model_output').flatMap((s) => s.content ?? []);
  const vid = parts.find((p) => p.type === 'video') ?? j.output_video;
  if (vid?.data) return save(Buffer.from(vid.data, 'base64'));
  const uri = vid?.uri;
  if (uri) {
    const v = await fetch(uri, { headers: { 'x-goog-api-key': google } });
    if (!v.ok) throw new Error(`Gemini video download ${v.status}`);
    return save(Buffer.from(await v.arrayBuffer()));
  }
  const said = parts.filter((p) => p.type === 'text').map((p) => p.text).join(' ').slice(0, 200);
  throw new Error(`Gemini returned no video${said ? ` ("${said}")` : ' (maybe blocked by its safety filter — soften the prompt)'}`);
}

// ---------- Higgsfield API (Settings → Plugins → Higgsfield: Key ID + Secret) ----------
const higgs = process.env.ALTER_HIGGSFIELD_KEY; // "<id>:<secret>"
const HF = 'https://api.higgsfield.ai';
const hfAuth = () => ({ authorization: `Key ${higgs}`, 'content-type': 'application/json' });
const billing = (msg) => /balance|credit|insufficient|payment|402|quota/i.test(msg);

async function hfUpload(file, mime) {
  const r = await fetch(`${HF}/files/generate-upload-url`, { method: 'POST', headers: hfAuth(), body: JSON.stringify({ content_type: mime }) });
  if (!r.ok) throw new Error(`Higgsfield upload: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  const u = await r.json();
  const put = await fetch(u.upload_url, { method: 'PUT', headers: u.upload_headers ?? { 'content-type': mime }, body: readFileSync(file) });
  if (!put.ok) throw new Error(`Higgsfield upload PUT: HTTP ${put.status}`);
  return u.public_url;
}

async function higgsfield() {
  const kling3 = /kling/i.test(String(opt.model ?? ''));
  const dur = Math.max(kling3 ? 3 : 4, Math.min(15, Math.round(seconds)));
  let path, input;
  if (from) {
    const url = await hfUpload(from, img.mime);
    const end = lastPath && last ? await hfUpload(lastPath, last.mime) : undefined;
    path = kling3 ? '/kling-video/v3.0/std/image-to-video' : '/bytedance/seedance-2.0/image-to-video';
    input = kling3
      ? { prompt, image_url: url, ...(end ? { last_image_url: end } : {}), duration: dur, sound: 'on' }
      : { prompt, image_url: url, ...(end ? { end_image_url: end } : {}), duration: dur, resolution: '720p', generate_audio: true };
  } else {
    path = '/bytedance/seedance-2.0/text-to-video';
    input = { prompt, duration: dur, resolution: '720p', aspect_ratio: aspect, generate_audio: true };
  }
  const sub = await fetch(`${HF}${path}`, { method: 'POST', headers: { ...hfAuth(), 'idempotency-key': `altter-${Date.now()}-${Math.random().toString(36).slice(2)}` }, body: JSON.stringify(input) });
  const subText = await sub.text();
  if (!sub.ok) {
    if (sub.status === 402 || billing(subText)) throw new Error(`NO_VIDEO_BILLING: Higgsfield API balance is empty — add credits at console.higgsfield.ai (Billing). ${subText.slice(0, 160)}`);
    throw new Error(`Higgsfield: HTTP ${sub.status} ${subText.slice(0, 200)}`);
  }
  const job = JSON.parse(subText);
  const statusUrl = job.status_url ?? `${HF}/requests/${job.request_id}/status`;
  const deadline = Date.now() + 15 * 60_000;
  let wait = 2000;
  for (;;) {
    await sleep(wait + Math.random() * 500);
    wait = Math.min(10_000, wait * 1.5);
    const r = await fetch(statusUrl, { headers: hfAuth() });
    if (r.status >= 500) continue;
    const st = await r.json();
    if (st.status === 'completed') {
      const url = st.video?.url ?? st.output?.video?.url;
      if (!url) throw new Error('Higgsfield returned no video');
      return save(Buffer.from(await (await fetch(url)).arrayBuffer()));
    }
    if (st.status === 'nsfw') throw new Error('Higgsfield moderation refused this clip — soften the prompt (no injuries, weapons, real people in danger)');
    if (st.status === 'failed' || st.status === 'canceled') throw new Error(`Higgsfield: ${st.error ?? st.status}`);
    if (Date.now() > deadline) throw new Error('Higgsfield: still not done after 15 min');
  }
}

// ---------- fal.ai models (Settings → Plugins → fal.ai, or Media → Keys) ----------
async function falUpload(file, mime) {
  try {
    const r = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', { method: 'POST', headers: { authorization: `Key ${fal}`, 'content-type': 'application/json' }, body: JSON.stringify({ content_type: mime, file_name: file.split(/[\\/]/).pop() }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const u = await r.json();
    const put = await fetch(u.upload_url, { method: 'PUT', headers: { 'content-type': mime }, body: readFileSync(file) });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
    return u.file_url;
  } catch {
    return `data:${mime};base64,${readFileSync(file).toString('base64')}`; // most fal models accept data URIs too
  }
}

const FAL_MODELS = {
  seedance: { i2v: 'bytedance/seedance-2.0/image-to-video', t2v: 'bytedance/seedance-2.0/text-to-video', img: 'image_url', end: 'end_image_url', dur: (s) => String(Math.max(4, Math.min(15, Math.round(s)))), extra: () => ({ resolution: '720p', aspect_ratio: aspect, generate_audio: true }) },
  kling: { i2v: 'fal-ai/kling-video/v3/pro/image-to-video', t2v: 'fal-ai/kling-video/v3/pro/text-to-video', img: 'start_image_url', end: 'end_image_url', dur: (s) => String(Math.max(3, Math.min(15, Math.round(s)))), extra: () => ({ generate_audio: true }) },
  veo: { i2v: 'fal-ai/veo3.1/fast/image-to-video', t2v: 'fal-ai/veo3.1/fast', img: 'image_url', end: null, dur: (s) => (s <= 5 ? '4s' : s <= 7 ? '6s' : '8s'), extra: () => ({ aspect_ratio: aspect === '1:1' ? '9:16' : aspect, resolution: '720p', generate_audio: true }) },
};

function falModel(name) {
  return async () => {
    const m = FAL_MODELS[name];
    const model = from ? m.i2v : m.t2v;
    const auth = { authorization: `Key ${fal}`, 'content-type': 'application/json' };
    const input = { prompt, duration: m.dur(seconds), ...m.extra() };
    if (from) input[m.img] = await falUpload(from, img.mime);
    if (from && last && m.end) input[m.end] = await falUpload(lastPath, last.mime);
    const r = await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers: auth, body: JSON.stringify(input) });
    const text = await r.text();
    if (!r.ok) {
      if (r.status === 402 || r.status === 403 || billing(text)) throw new Error(`NO_VIDEO_BILLING: fal.ai balance is empty — add credits at fal.ai/dashboard/billing. ${text.slice(0, 160)}`);
      throw new Error(`fal ${name}: HTTP ${r.status} ${text.slice(0, 200)}`);
    }
    const sub = JSON.parse(text);
    const statusUrl = sub.status_url ?? `https://queue.fal.run/${model}/requests/${sub.request_id}/status`;
    const resultUrl = sub.response_url ?? `https://queue.fal.run/${model}/requests/${sub.request_id}`;
    const deadline = Date.now() + 15 * 60_000;
    for (;;) {
      await sleep(5000);
      const st = await (await fetch(statusUrl, { headers: auth })).json();
      if (st.status === 'COMPLETED') { if (st.error) throw new Error(`fal ${name}: ${st.error}`); break; }
      if (st.status === 'FAILED' || st.error) throw new Error(`fal ${name}: ${st.error ?? 'failed'}`);
      if (Date.now() > deadline) throw new Error(`fal ${name}: still not done after 15 min`);
    }
    const res = await (await fetch(resultUrl, { headers: auth })).json();
    const url = res.video?.url;
    if (!url) throw new Error(`fal ${name} returned no video${res.detail ? `: ${JSON.stringify(res.detail).slice(0, 200)}` : ''}`);
    return save(Buffer.from(await (await fetch(url)).arrayBuffer()));
  };
}

// --via picks one; without it: Higgsfield → fal Seedance 2.0 → Gemini Omni → fal Kling
const via = typeof opt.via === 'string' ? opt.via.toLowerCase() : '';
const order = [];
if (higgs && (!via || via === 'higgsfield')) order.push([`Higgsfield ${/kling/i.test(String(opt.model ?? '')) ? 'Kling 3' : 'Seedance 2.0'}`, higgsfield]);
if (fal && (!via || via === 'seedance' || via === 'fal')) order.push(['Seedance 2.0 (fal)', falModel('seedance')]);
if (google && (!via || /^(omni|gemini|google)$/.test(via))) order.push(['Gemini Omni', omni]);
if (fal && (via === 'kling' || (!via && !order.length))) order.push(['Kling 3 (fal)', falModel('kling')]);
if (fal && via === 'veo') order.push(['Veo 3.1 Fast (fal)', falModel('veo')]);
if (!order.length) {
  console.error(via
    ? `NO_VIDEO_AI: "${via}" needs its key — Higgsfield or fal.ai in Settings → Plugins (put [[altter:connect:${via === 'higgsfield' ? 'higgsfield' : 'fal'}]] in your answer), Gemini in Media → Keys.`
    : 'NO_VIDEO_AI: no video AI connected. Options for the user: [[altter:connect:higgsfield]] (Seedance 2.0, Kling 3) or [[altter:connect:fal]] (Seedance 2.0, Kling 3, Veo 3.1) — or their own Gemini in the browser (CHAOS EDIT step 3A). Never replace the clips with stills.');
  process.exit(3);
}
console.log(`Animating ${from ? 'the still' : 'from text'} (${seconds} s, ${aspect}) with ${order[0][0]} — takes 1–5 min…`);
// no process.exit after network calls: on Windows it can abort while sockets close (exit 127)
let billingErr = null, done = false;
for (const [name, fn] of order) {
  try { console.log(`OUTPUT ${await fn()}  (${name})`); done = true; break; } catch (e) { console.error(`  ${name}: ${e.message}`); if (/NO_VIDEO_BILLING/.test(e.message)) billingErr = e.message; }
}
if (!done && billingErr) console.error(billingErr.slice(0, 300));
process.exitCode = done ? 0 : 1;
