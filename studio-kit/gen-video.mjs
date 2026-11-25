#!/usr/bin/env node
// AI video clips for edits: animate a still (usually a frame from the user's video edited by gen-image --from).
//   node gen-video.mjs "<what happens, the motion>" --from still.png [--last end.png] [--seconds 5] [--aspect 9:16] [--out assets/fx1.mp4]
// Needs a video AI key (set in ALTTER → Media → Keys): Google Gemini (Omni Flash video) or fal.ai (Kling).
// Without one it exits with NO_VIDEO_AI (code 3); a key whose project has no billing/credits → NO_VIDEO_BILLING.
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
  console.log('Usage: node gen-video.mjs "<motion>" --from still.png [--seconds 5] [--aspect 9:16|16:9|1:1] [--via gemini|kling] [--out file.mp4]');
  process.exit(what ? 0 : 1);
}
if (from && !existsSync(from)) { console.error(`--from: file not found (${from})`); process.exit(2); }
const aspect = ['9:16', '16:9', '1:1'].includes(opt.aspect) ? opt.aspect : '9:16';
const seconds = Math.max(3, Math.min(10, Number(opt.seconds) || 5));
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

async function kling() {
  const model = process.env.ALTER_KLING_MODEL || (img ? 'fal-ai/kling-video/v2.1/standard/image-to-video' : 'fal-ai/kling-video/v2.1/standard/text-to-video');
  const auth = { authorization: `Key ${fal}`, 'content-type': 'application/json' };
  const input = { prompt, duration: seconds > 7 ? '10' : '5', aspect_ratio: aspect };
  if (img) input.image_url = `data:${img.mime};base64,${img.b64}`;
  if (last) input.tail_image_url = `data:${last.mime};base64,${last.b64}`;
  const sub = await (await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers: auth, body: JSON.stringify(input) })).json();
  if (!sub.request_id) throw new Error(`fal: ${JSON.stringify(sub).slice(0, 200)}`);
  const statusUrl = sub.status_url ?? `https://queue.fal.run/${model}/requests/${sub.request_id}/status`;
  const resultUrl = sub.response_url ?? `https://queue.fal.run/${model}/requests/${sub.request_id}`;
  const deadline = Date.now() + 12 * 60_000;
  for (;;) {
    await sleep(5000);
    const st = await (await fetch(statusUrl, { headers: auth })).json();
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || st.error) throw new Error(`fal: ${st.error ?? 'failed'}`);
    if (Date.now() > deadline) throw new Error('fal: still not done after 12 min');
  }
  const res = await (await fetch(resultUrl, { headers: auth })).json();
  const url = res.video?.url;
  if (!url) throw new Error('fal returned no video');
  return save(Buffer.from(await (await fetch(url)).arrayBuffer()));
}

const order = [];
if (google && (!opt.via || /^(veo|omni|gemini|google)$/.test(opt.via))) order.push(['Gemini Omni', omni]);
if (fal && (!opt.via || opt.via === 'kling')) order.push(['Kling', kling]);
if (!order.length) {
  console.error('NO_VIDEO_AI: no video AI key yet. A Google Gemini key (Media → Keys; Google AI Pro/Ultra include monthly credits for it) or a fal.ai key makes the clips automatically. Never replace the clips with stills — follow the CHAOS EDIT fallback (Veo pack).');
  process.exit(3);
}
console.log(`Animating ${from ? 'the still' : 'from text'} (${seconds} s, ${aspect}) with ${order[0][0]} — takes 1–5 min…`);
for (const [name, fn] of order) {
  try { console.log(`OUTPUT ${await fn()}  (${name})`); process.exit(0); } catch (e) { console.error(`  ${name}: ${e.message}`); }
}
process.exit(1);
