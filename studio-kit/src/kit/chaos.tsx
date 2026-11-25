// Chaos edit tools: punch-in zooms, shakes, flashes, glitches, and VFX overlays (vortex, explosion, fire, sparks, smoke, debris)
// for "deadpan tutorial → absurd VFX" reels cut from the user's own footage.
//
//   <Punch at={[3.2, 7.9]} to={1.3}><Clip src="in.mp4" from={12} /></Punch>      zoom in hard on the punchlines
//   <Shake at={4} dur={1.2} amount={1}>…</Shake>                                  camera shake (explosions, engines)
//   <Insert src="assets/fx1.png" dur={2.4} fx="vortex" />                          an AI-edited frame (or AI clip) as a VFX shot
//   <Fx kind="explode" at={0.2} x={540} y={900} />  <Flash at={0} />  <Glitch at={2.9} />
import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence } from 'remotion';
import { Captions as CaptionsLazy } from './text';
import { ease, media, mix, ramp, rand, useFormat, useTime } from './stage';

type Times = number | number[];
const list = (t: Times) => (Array.isArray(t) ? t : [t]);

/** Hard zoom-ins at the given times (seconds), held `hold` s, eased back. `x`/`y` = focus point in % (default the centre). */
export const Punch: React.FC<{ at: Times; to?: number; hold?: number; x?: number; y?: number; children: React.ReactNode }> = ({ at, to = 1.28, hold = 0.7, x = 50, y = 42, children }) => {
  const t = useTime();
  let s = 1;
  for (const a of list(at)) {
    if (t < a) continue;
    const inP = ramp(t, a, a + 0.08, ease.out);
    const outP = ramp(t, a + hold, a + hold + 0.25, ease.inOut);
    s = Math.max(s, mix(1, to, inP * (1 - outP)));
  }
  return <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: `${x}% ${y}%` }}>{children}</AbsoluteFill>;
};

/** Camera shake for `dur` seconds from `at` (amount 0.3 = engine rumble, 1 = explosion), decaying. */
export const Shake: React.FC<{ at?: Times; dur?: number; amount?: number; children: React.ReactNode }> = ({ at = 0, dur = 0.8, amount = 1, children }) => {
  const t = useTime();
  const { u } = useFormat();
  let dx = 0, dy = 0, r = 0;
  for (const a of list(at)) {
    if (t < a || t > a + dur) continue;
    const k = amount * (1 - (t - a) / dur);
    dx += Math.sin(t * 91) * u(26) * k + Math.sin(t * 37) * u(12) * k;
    dy += Math.cos(t * 83) * u(22) * k;
    r += Math.sin(t * 61) * 1.2 * k;
  }
  return <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) rotate(${r}deg) scale(${1 + Math.min(0.08, Math.abs(r) * 0.03)})` }}>{children}</AbsoluteFill>;
};

/** A white (or coloured) flash frame. */
export const Flash: React.FC<{ at?: Times; color?: string; dur?: number }> = ({ at = 0, color = '#ffffff', dur = 0.25 }) => {
  const t = useTime();
  let o = 0;
  for (const a of list(at)) if (t >= a && t < a + dur) o = Math.max(o, 1 - (t - a) / dur);
  if (!o) return null;
  return <AbsoluteFill style={{ background: color, opacity: o, mixBlendMode: color === '#ffffff' ? 'screen' : 'normal' }} />;
};

/** Digital glitch: displaced colour bars and noise for a moment (good on the cut into a VFX shot). */
export const Glitch: React.FC<{ at?: Times; dur?: number }> = ({ at = 0, dur = 0.3 }) => {
  const t = useTime();
  const a = list(at).find((x) => t >= x && t < x + dur);
  if (a === undefined) return null;
  const f = Math.floor(t * 30);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 9 }, (_, i) => {
        const y = rand(`gy${f}${i}`) * 100;
        const h = 1 + rand(`gh${f}${i}`) * 7;
        const c = ['rgba(255,0,80,.55)', 'rgba(0,255,230,.5)', 'rgba(255,255,255,.6)', 'rgba(0,0,0,.6)'][i % 4];
        return <div key={i} style={{ position: 'absolute', left: `${(rand(`gx${f}${i}`) - 0.5) * 30}%`, top: `${y}%`, width: '100%', height: `${h}%`, background: c, mixBlendMode: i % 4 === 3 ? 'multiply' : 'screen' }} />;
      })}
    </AbsoluteFill>
  );
};

export type FxKind = 'vortex' | 'explode' | 'fire' | 'sparks' | 'smoke' | 'debris' | 'speed' | 'confetti' | 'money' | 'rain';

/**
 * VFX particles on top of the picture. x/y = the centre in px on a 1080×1920 frame (where it sucks in / blows up / burns).
 * `items`: emoji or short texts flying around (e.g. ['🧲','🧻','🍎','🪑']) for vortex / explode / debris.
 */
export const Fx: React.FC<{ kind: FxKind; at?: number; dur?: number; x?: number; y?: number; count?: number; items?: string[]; size?: number; color?: string }> = ({ kind, at = 0, dur = 3, x = 540, y = 900, count, items, size = 1, color }) => {
  const t = useTime() - at;
  const { u, w, h } = useFormat();
  const n = count ?? { vortex: 26, explode: 34, fire: 40, sparks: 46, smoke: 18, debris: 24, speed: 30, confetti: 60, money: 30, rain: 60 }[kind];
  const seeds = useMemo(() => Array.from({ length: n }, (_, i) => ({ a: rand(`${kind}a${i}`), b: rand(`${kind}b${i}`), c: rand(`${kind}c${i}`), d: rand(`${kind}d${i}`) })), [kind, n]);
  if (t < 0 || t > dur + 1) return null;
  const fade = 1 - ramp(t, dur, dur + 0.6);
  const cx = u(x), cy = u(y);
  const emoji = (i: number) => (items?.length ? items[i % items.length] : null);
  const node = (i: number, style: React.CSSProperties, fallback: React.ReactNode) => {
    const e = emoji(i);
    return <div key={i} style={{ position: 'absolute', left: 0, top: 0, ...style }}>{e ? <span style={{ fontSize: u(70 * size), filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.4))' }}>{e}</span> : fallback}</div>;
  };
  const out: React.ReactNode[] = [];
  seeds.forEach((s, i) => {
    if (kind === 'vortex') {
      // things fly in a spiral into the centre, then respawn
      const life = 1.1 + s.a * 0.9;
      const p = ((t + s.b * life) % life) / life;
      const r = mix(u(900) * (0.6 + s.c * 0.6), u(20), ease.in(p));
      const ang = s.d * Math.PI * 2 + p * 5.5;
      const sc = mix(1.1, 0.15, p);
      out.push(node(i, { transform: `translate(${cx + Math.cos(ang) * r}px, ${cy + Math.sin(ang) * r * 0.8}px) rotate(${p * 720 * (s.a > 0.5 ? 1 : -1)}deg) scale(${sc})`, opacity: Math.min(1, p * 6) },
        <div style={{ width: u(34 + s.c * 50), height: u(14 + s.a * 30), background: color ?? ['#d9d9d9', '#8d8d8d', '#f2f2f2', '#b5a58f'][i % 4], borderRadius: u(4), boxShadow: '0 4px 10px rgba(0,0,0,.35)' }} />));
    } else if (kind === 'explode' || kind === 'debris') {
      const ang = s.a * Math.PI * 2;
      const sp = u(900 + s.b * 1400) * (kind === 'debris' ? 0.6 : 1);
      const tt = Math.min(t, 2.5);
      const px = cx + Math.cos(ang) * sp * tt;
      const py = cy + Math.sin(ang) * sp * tt * 0.8 + u(1600) * tt * tt * (kind === 'debris' ? 1 : 0.5);
      out.push(node(i, { transform: `translate(${px}px, ${py}px) rotate(${t * 600 * (s.c - 0.5)}deg)`, opacity: fade },
        <div style={{ width: u(18 + s.c * 46), height: u(10 + s.d * 30), background: kind === 'debris' ? ['#4a4a4a', '#6b5b4b', '#8c8c8c'][i % 3] : ['#ffcf5a', '#ff7a1a', '#2b2b2b', '#ffd98c'][i % 4], borderRadius: u(3), boxShadow: kind === 'explode' ? '0 0 18px rgba(255,140,0,.8)' : undefined }} />));
    } else if (kind === 'fire') {
      const life = 0.7 + s.a * 0.6;
      const p = ((t + s.b * life) % life) / life;
      const spread = u(380) * size;
      const px = cx + (s.c - 0.5) * spread * 2 + Math.sin(t * 7 + i) * u(14);
      const py = cy - p * u(520) * size;
      const r = u(110 + s.d * 120) * size * (1 - p * 0.6);
      out.push(<div key={i} style={{ position: 'absolute', left: px - r / 2, top: py - r / 2, width: r, height: r * 1.3, borderRadius: '50% 50% 45% 45%', background: `radial-gradient(circle at 50% 60%, rgba(255,245,180,${0.95 - p * 0.6}) 0%, rgba(255,150,30,${0.85 - p * 0.6}) 35%, rgba(230,50,10,${0.5 - p * 0.4}) 60%, transparent 72%)`, mixBlendMode: 'screen', filter: `blur(${u(6)}px)` }} />);
    } else if (kind === 'sparks') {
      const life = 0.5 + s.a * 0.5;
      const p = ((t + s.b * life) % life) / life;
      const ang = -Math.PI / 2 + (s.c - 0.5) * 2.6;
      const d = u(700 * size) * p;
      const px = cx + Math.cos(ang) * d, py = cy + Math.sin(ang) * d + u(900) * p * p;
      out.push(<div key={i} style={{ position: 'absolute', left: px, top: py, width: u(6), height: u(40), background: 'linear-gradient(#fff8c0, #ffae00)', borderRadius: u(3), transform: `rotate(${(ang * 180) / Math.PI + 90}deg)`, opacity: (1 - p) * fade, boxShadow: '0 0 10px #ffb000' }} />);
    } else if (kind === 'smoke') {
      const life = 2.2 + s.a;
      const p = ((t + s.b * life) % life) / life;
      const r = u(260 + s.c * 260) * size * (0.5 + p);
      out.push(<div key={i} style={{ position: 'absolute', left: cx + (s.d - 0.5) * u(500) - r / 2, top: cy - p * u(700) - r / 2, width: r, height: r, borderRadius: '50%', background: `radial-gradient(circle, rgba(${color ? '80,80,80' : '200,200,205'},${0.55 * (1 - p)}) 0%, transparent 70%)`, filter: `blur(${u(10)}px)`, opacity: fade }} />);
    } else if (kind === 'speed') {
      const p = ((t * 3 + s.a) % 1);
      const ang = s.b * Math.PI * 2;
      const d0 = u(200) + p * Math.max(w, h);
      out.push(<div key={i} style={{ position: 'absolute', left: cx + Math.cos(ang) * d0, top: cy + Math.sin(ang) * d0, width: u(260), height: u(5), background: 'rgba(255,255,255,.8)', transform: `rotate(${(ang * 180) / Math.PI}deg)`, transformOrigin: '0 50%', opacity: (1 - p) * fade }} />);
    } else if (kind === 'confetti' || kind === 'money' || kind === 'rain') {
      const fall = kind === 'rain' ? 2600 : 600;
      const py = ((s.a * h + t * u(fall) * (0.7 + s.b * 0.6)) % (h + u(200))) - u(100);
      const px = s.c * w + Math.sin(t * 3 + i) * u(kind === 'rain' ? 0 : 40);
      out.push(node(i, { transform: `translate(${px}px, ${py}px) rotate(${kind === 'rain' ? 12 : t * 300 * (s.d - 0.5)}deg)`, opacity: fade },
        kind === 'money' ? <span style={{ fontSize: u(80 * size) }}>💸</span>
          : kind === 'rain' ? <div style={{ width: u(4), height: u(60), background: 'rgba(200,220,255,.6)' }} />
          : <div style={{ width: u(22), height: u(12), background: ['#ff3b6b', '#ffd23f', '#3bceac', '#5d5cff', '#fff'][i % 5] }} />));
    }
  });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {kind === 'explode' && t < 0.6 && <div style={{ position: 'absolute', left: cx - u(700) * size, top: cy - u(700) * size, width: u(1400) * size, height: u(1400) * size, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,250,220,1) 0%, rgba(255,170,40,.9) 25%, rgba(255,80,0,.5) 45%, transparent 65%)', transform: `scale(${mix(0.2, 1.3, ramp(t, 0, 0.35))})`, opacity: 1 - ramp(t, 0.25, 0.6), mixBlendMode: 'screen' }} />}
      {kind === 'vortex' && <div style={{ position: 'absolute', left: cx - u(260), top: cy - u(260), width: u(520), height: u(520), borderRadius: '50%', background: 'conic-gradient(from 0deg, transparent, rgba(255,255,255,.35), transparent 40%, rgba(255,255,255,.25), transparent 75%)', transform: `rotate(${t * 900}deg)`, filter: `blur(${u(8)}px)`, opacity: fade }} />}
      {out}
    </AbsoluteFill>
  );
};

/**
 * A VFX shot. A VIDEO (an AI clip that starts from the real frame) plays as it is: a hard cut in, its own sound under the voice,
 * a hard cut out — exactly like the viral edits. A still image is only a fallback (slow push-in, no gimmicks).
 * `fx`/`flash`/`shake` are off unless asked for.
 */
export const Insert: React.FC<{ src: string; dur?: number; fx?: FxKind; items?: string[]; x?: number; y?: number; shake?: number; push?: number; flash?: boolean; volume?: number; from?: number }> = ({ src, dur = 2.5, fx, items, x = 540, y = 900, shake = 0, push = 0.08, flash = false, volume = 0.7, from = 0 }) => {
  const t = useTime();
  const { fps } = useFormat();
  const isVideo = /\.(mp4|mov|webm|m4v)$/i.test(src);
  if (isVideo)
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        <OffthreadVideo src={media(src)} startFrom={Math.round(from * fps)} muted={volume === 0} volume={volume} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {fx && <Fx kind={fx} items={items} x={x} y={y} dur={dur} />}
        {flash && <Flash at={0} dur={0.12} />}
      </AbsoluteFill>
    );
  const s1 = 1.02 + push * ramp(t, 0, dur, ease.out);
  const k = shake * (0.6 + 0.4 * Math.sin(t * 3));
  const dx = Math.sin(t * 71) * 9 * k, dy = Math.cos(t * 63) * 8 * k;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) scale(${s1})`, transformOrigin: `${(x / 1080) * 100}% ${(y / 1920) * 100}%` }}>
        <Img src={media(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      {fx && <Fx kind={fx} items={items} x={x} y={y} dur={dur} />}
      {flash && <Flash at={0} dur={0.12} />}
    </AbsoluteFill>
  );
};

// ---------- Footage: the user's video, trimmed, with VFX inserts, punch-ins and captions — all in SOURCE time ----------

export interface Hit {
  /** source time (s) in the original video where the insert goes in */
  at: number;
  /** how long the insert plays (s) */
  dur?: number;
  /** the AI clip (.mp4) — or an AI frame (.png/.jpg) as a fallback */
  src: string;
  /**
   * 'splice' (default for a video): the user's video PAUSES at `at`, the clip plays with its own sound, then the video
   * goes on from exactly that moment — nothing overlaps, no word is lost.
   * 'over': the insert only covers the picture while the user's video (and voice) keeps running underneath.
   */
  mode?: 'splice' | 'over';
  fx?: FxKind;
  items?: string[];
  x?: number;
  y?: number;
  shake?: number;
  /** sound effect file(s) played when it starts (sfx.mjs output) */
  sfx?: string | string[];
  sfxVolume?: number;
  /** the AI clip's own sound (0–1; default 1 when spliced, 0.7 over the voice) */
  volume?: number;
  /** start this many seconds into the AI clip */
  from?: number;
}
type Seg = [number, number];
const isSplice = (h: Hit) => (h.mode ?? (/\.(mp4|mov|webm|m4v)$/i.test(h.src) ? 'splice' : 'over')) === 'splice';
const hitDur = (h: Hit) => h.dur ?? (isSplice(h) ? 3 : 2.4);

/** Output length (s): the kept parts + every spliced insert. Use it for meta.seconds: footageLength(KEEP, HITS). */
export const footageLength = (keep: Seg[], hits: Hit[] = []) =>
  plan(keep, hits).total;

type Piece = { kind: 'src'; a: number; b: number; start: number } | { kind: 'clip'; h: Hit; start: number; dur: number };

/** The cut timeline: kept parts of the source with the spliced clips placed between them. */
function plan(keep: Seg[], hits: Hit[]) {
  const splices = hits.filter(isSplice).sort((x, y) => x.at - y.at);
  const pieces: Piece[] = [];
  let out = 0;
  for (const [a, b] of keep) {
    let cur = a;
    for (const h of splices) {
      if (h.at < a || h.at >= b || h.at < cur) continue;
      if (h.at > cur) { pieces.push({ kind: 'src', a: cur, b: h.at, start: out }); out += h.at - cur; }
      const d = hitDur(h);
      pieces.push({ kind: 'clip', h, start: out, dur: d });
      out += d;
      cur = h.at;
    }
    if (b > cur) { pieces.push({ kind: 'src', a: cur, b, start: out }); out += b - cur; }
  }
  const srcs = pieces.filter((p): p is Extract<Piece, { kind: 'src' }> => p.kind === 'src');
  /** source time → output time (null when that moment was cut) */
  const map = (t: number): number | null => {
    const p = srcs.find((s) => t >= s.a && t < s.b) ?? srcs.find((s) => t >= s.a && t <= s.b);
    return p ? p.start + (t - p.a) : null;
  };
  return { pieces, total: out, map };
}

/**
 * The user's own clip as the base of the edit. Everything is given in the ORIGINAL video's time, Footage does the maths:
 *   keep   — parts to keep [[from, to], …] (cut pauses, false starts); default the whole clip (pass `length`)
 *   words  — word timings from voice-times.mjs (source time) → captions on the cut timeline
 *   hits   — AI clips spliced in at a source moment (the video pauses, the clip plays with its own sound, the video resumes)
 *   punch  — source times to zoom in hard (punchlines, reactions)
 */
export const Footage: React.FC<{ src: string; keep?: Seg[]; length?: number; words?: { text: string; start: number; end: number }[]; hits?: Hit[]; punch?: number[]; captions?: false | { per?: number; size?: number; y?: number; upper?: boolean }; volume?: number; children?: React.ReactNode }> = ({ src, keep, length = 60, words = [], hits = [], punch = [], captions = {}, volume = 1, children }) => {
  const { fps } = useFormat();
  const t = useTime();
  const segs: Seg[] = keep?.length ? keep : [[0, length]];
  const { pieces, map } = useMemo(() => plan(segs, hits), [JSON.stringify(segs), JSON.stringify(hits)]); // eslint-disable-line react-hooks/exhaustive-deps
  const punchOut = punch.map(map).filter((x): x is number => x !== null);
  const outWords = words.map((w) => { const s = map(w.start); return s === null ? null : { text: w.text, start: s, end: s + Math.max(0.08, w.end - w.start) }; }).filter((w): w is { text: string; start: number; end: number } => !!w);
  const over = hits.filter((h) => !isSplice(h)).map((h) => ({ h, o: map(h.at) })).filter((x): x is { h: Hit; o: number } => x.o !== null);
  const overNow = over.find(({ h, o }) => t >= o && t < o + hitDur(h));
  const sfxAt = [...over, ...pieces.filter((p): p is Extract<Piece, { kind: 'clip' }> => p.kind === 'clip').map((p) => ({ h: p.h, o: p.start }))];
  const inClip = pieces.some((p) => p.kind === 'clip' && t >= p.start && t < p.start + p.dur);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Punch at={punchOut.length ? punchOut : [-99]}>
        {/* one video element per kept part keeps the sound in sync */}
        {pieces.map((p, i) =>
          p.kind === 'src' ? (
            <Sequence key={i} from={Math.round(p.start * fps)} durationInFrames={Math.max(1, Math.round((p.b - p.a) * fps))} layout="none">
              <OffthreadVideo src={media(src)} startFrom={Math.round(p.a * fps)} volume={volume} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            </Sequence>
          ) : null,
        )}
      </Punch>
      {pieces.map((p, i) =>
        p.kind === 'clip' ? (
          <Sequence key={`c${i}`} from={Math.round(p.start * fps)} durationInFrames={Math.max(1, Math.round(p.dur * fps))} layout="none">
            <AbsoluteFill>
              <Insert src={p.h.src} dur={p.dur} fx={p.h.fx} items={p.h.items} x={p.h.x} y={p.h.y} shake={p.h.shake ?? 0} volume={p.h.volume ?? 1} from={p.h.from ?? 0} />
            </AbsoluteFill>
          </Sequence>
        ) : null,
      )}
      {overNow && (
        <AbsoluteFill>
          <InsertAt hit={overNow.h} from={overNow.o} />
        </AbsoluteFill>
      )}
      {sfxAt.flatMap(({ h, o }) => (h.sfx ? (Array.isArray(h.sfx) ? h.sfx : [h.sfx]) : []).map((f, k) => <SfxAt key={`${o}-${k}`} src={f} at={o} volume={h.sfxVolume ?? 0.9} />))}
      {captions !== false && outWords.length > 0 && !inClip && <CaptionsLazy words={outWords} {...captions} />}
      {children}
    </AbsoluteFill>
  );
};

/** An 'over' insert rendered with its own clock (starts at 0 when the hit starts). */
const InsertAt: React.FC<{ hit: Hit; from: number }> = ({ hit, from }) => {
  const { fps } = useFormat();
  return (
    <Sequence from={Math.round(from * fps)} durationInFrames={Math.max(1, Math.round(hitDur(hit) * fps))} layout="none">
      <Insert src={hit.src} dur={hitDur(hit)} fx={hit.fx} items={hit.items} x={hit.x} y={hit.y} shake={hit.shake ?? 0} volume={hit.volume ?? 0.7} from={hit.from ?? 0} />
    </Sequence>
  );
};
const SfxAt: React.FC<{ src: string; at: number; volume: number }> = ({ src, at, volume }) => {
  const { fps } = useFormat();
  return (
    <Sequence from={Math.round(at * fps)} layout="none">
      <Audio src={media(src)} volume={volume} />
    </Sequence>
  );
};
