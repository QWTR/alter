// Backgrounds, particles, media (photos, clips, devices, logo), charts and sound.
import React from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, useVideoConfig } from 'remotion';
import { ease, font, media, mix, ramp, rand, useFormat, useTheme, useTime } from './stage';

/* ---------- backgrounds ---------- */

export type BgVariant = 'glow' | 'aurora' | 'grid' | 'dots' | 'gradient' | 'spotlight' | 'solid';

/** Moving background in the theme's colours. */
export const Bg: React.FC<{ variant?: BgVariant; color?: string; color2?: string; intensity?: number }> = ({ variant = 'glow', color, color2, intensity = 1 }) => {
  const t = useTime();
  const th = useTheme();
  const { u } = useFormat();
  const a = color ?? th.accent;
  const b = color2 ?? th.accent2;
  const k = intensity * (th.glow || 0.35);
  const hex = (c: string, alpha: number) => `color-mix(in srgb, ${c} ${Math.round(alpha * 100)}%, transparent)`;
  const d = Math.sin(t * 0.6) * 4;
  const d2 = Math.cos(t * 0.45) * 5;
  switch (variant) {
    case 'solid':
      return <AbsoluteFill style={{ background: color ?? th.bg }} />;
    case 'gradient':
      return <AbsoluteFill style={{ background: `linear-gradient(${160 + d * 3}deg, ${th.bg2} 0%, ${th.bg} 55%, ${hex(a, 0.35 * k)} 130%)` }} />;
    case 'spotlight':
      return <AbsoluteFill style={{ background: `radial-gradient(ellipse 55% 45% at ${50 + d}% 38%, ${hex(th.ink, 0.13 * k + 0.04)} 0%, transparent 70%), ${th.bg}` }} />;
    case 'aurora':
      return (
        <AbsoluteFill style={{ background: th.bg }}>
          <AbsoluteFill style={{ filter: `blur(${u(90)}px)`, opacity: 0.9 * k + 0.1 }}>
            <div style={{ position: 'absolute', width: '75%', height: '55%', left: `${-10 + d2 * 2}%`, top: `${10 + d}%`, borderRadius: '50%', background: a, opacity: 0.55 }} />
            <div style={{ position: 'absolute', width: '70%', height: '50%', right: `${-15 + d * 2}%`, bottom: `${5 + d2}%`, borderRadius: '50%', background: b, opacity: 0.45 }} />
            <div style={{ position: 'absolute', width: '50%', height: '40%', left: '30%', top: `${40 + d2 * 1.5}%`, borderRadius: '50%', background: th.bg2, opacity: 0.8 }} />
          </AbsoluteFill>
        </AbsoluteFill>
      );
    case 'grid':
    case 'dots': {
      const s = u(variant === 'grid' ? 90 : 54);
      const off = (t * u(22)) % s;
      const pattern = variant === 'grid'
        ? `linear-gradient(${hex(th.ink, 0.07)} 1px, transparent 1px), linear-gradient(90deg, ${hex(th.ink, 0.07)} 1px, transparent 1px)`
        : `radial-gradient(${hex(th.ink, 0.16)} ${u(2.2)}px, transparent ${u(2.6)}px)`;
      return (
        <AbsoluteFill style={{ background: th.bg }}>
          <AbsoluteFill style={{ backgroundImage: pattern, backgroundSize: `${s}px ${s}px`, backgroundPosition: `${off}px ${off}px`, maskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, #000 30%, transparent 80%)' }} />
          <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 40% at ${50 + d}% 60%, ${hex(a, 0.22 * k)} 0%, transparent 75%)` }} />
        </AbsoluteFill>
      );
    }
    default:
      return (
        <AbsoluteFill style={{ background: th.bg }}>
          <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 42% at ${50 + d}% 62%, ${hex(a, 0.26 * k)} 0%, ${hex(a, 0.08 * k)} 50%, transparent 78%)` }} />
          <AbsoluteFill style={{ background: `radial-gradient(ellipse 50% 30% at ${30 + d2}% 18%, ${hex(b, 0.12 * k)} 0%, transparent 70%)` }} />
        </AbsoluteFill>
      );
  }
};

/** Drifting light specks / bokeh / confetti. */
export const Particles: React.FC<{ count?: number; kind?: 'specks' | 'bokeh' | 'confetti' | 'snow'; color?: string; speed?: number; at?: number }> = ({ count = 40, kind = 'specks', color, speed = 1, at = 0 }) => {
  const t = useTime() - at;
  const th = useTheme();
  const { w, h, u } = useFormat();
  if (t < 0) return null;
  const palette = [color ?? th.accent, th.accent2, th.ink];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: count }, (_, i) => {
        const r = (k: string) => rand(`${kind}${i}${k}`);
        const size = kind === 'bokeh' ? u(30 + r('s') * 110) : kind === 'confetti' ? u(10 + r('s') * 14) : u(2 + r('s') * 5);
        const vy = (kind === 'snow' || kind === 'confetti' ? 1 : -1) * (30 + r('v') * 90) * speed;
        const x = r('x') * w + Math.sin(t * (0.5 + r('w')) + i) * u(30);
        const y0 = r('y') * h;
        const y = (((y0 + vy * u(1) * t) % h) + h) % h;
        const c = palette[Math.floor(r('c') * (kind === 'confetti' ? 3 : 1))];
        const op = kind === 'bokeh' ? 0.08 + r('o') * 0.18 : 0.35 + r('o') * 0.6;
        const fade = Math.min(1, t * 2);
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: size, height: kind === 'confetti' ? size * 0.5 : size, borderRadius: kind === 'confetti' ? 2 : '50%', background: c, opacity: op * fade, filter: kind === 'bokeh' ? `blur(${size * 0.12}px)` : undefined, transform: kind === 'confetti' ? `rotate(${t * 220 * (r('r') - 0.5) + r('a') * 360}deg)` : undefined, boxShadow: kind === 'specks' ? `0 0 ${size * 3}px ${c}` : undefined }} />
        );
      })}
    </AbsoluteFill>
  );
};

/* ---------- media ---------- */

type Box = { x?: number; y?: number; w?: number; h?: number; radius?: number };
const boxStyle = (b: Box, u: (n: number) => number): React.CSSProperties =>
  b.w !== undefined || b.x !== undefined
    ? { position: 'absolute', left: u(b.x ?? 0), top: u(b.y ?? 0), width: b.w !== undefined ? u(b.w) : '100%', height: b.h !== undefined ? u(b.h) : '100%', borderRadius: u(b.radius ?? 0), overflow: 'hidden' }
    : { position: 'absolute', inset: 0, borderRadius: u(b.radius ?? 0), overflow: 'hidden' };

/** Colour grade for photos and clips: a preset name or exact values. */
export type Look = 'none' | 'warm' | 'cool' | 'film' | 'bw' | 'noir' | 'vivid' | 'fade' | 'teal-orange' | { brightness?: number; contrast?: number; saturate?: number; warmth?: number; hue?: number; blur?: number; vignette?: number; sharpen?: boolean };
const LOOKS: Record<string, Exclude<Look, string>> = {
  none: {},
  warm: { warmth: 0.35, saturate: 1.1, contrast: 1.04 },
  cool: { warmth: -0.35, saturate: 1.05, contrast: 1.05 },
  film: { contrast: 1.08, saturate: 0.85, warmth: 0.18, vignette: 0.35 },
  bw: { saturate: 0, contrast: 1.12 },
  noir: { saturate: 0, contrast: 1.35, brightness: 0.92, vignette: 0.55 },
  vivid: { saturate: 1.4, contrast: 1.1, brightness: 1.03 },
  fade: { contrast: 0.86, brightness: 1.06, saturate: 0.8 },
  'teal-orange': { warmth: 0.2, saturate: 1.15, contrast: 1.12, hue: -6, vignette: 0.25 },
};
function grade(look: Look | undefined) {
  const l = typeof look === 'string' ? LOOKS[look] ?? {} : look ?? {};
  const filter = [
    l.brightness !== undefined && `brightness(${l.brightness})`,
    l.contrast !== undefined && `contrast(${l.contrast})`,
    l.saturate !== undefined && `saturate(${l.saturate})`,
    l.hue && `hue-rotate(${l.hue}deg)`,
    l.blur && `blur(${l.blur}px)`,
  ].filter(Boolean).join(' ');
  const w = l.warmth ?? 0;
  const overlay = w ? (w > 0 ? `rgba(255,140,40,${Math.min(0.35, w * 0.4)})` : `rgba(40,120,255,${Math.min(0.35, -w * 0.4)})`) : null;
  return { filter: filter || undefined, overlay, vignette: l.vignette ?? 0 };
}
const Grade: React.FC<{ g: ReturnType<typeof grade>; dim: number }> = ({ g, dim }) => (
  <>
    {g.overlay && <AbsoluteFill style={{ background: g.overlay, mixBlendMode: 'soft-light' }} />}
    {g.vignette > 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 70% at 50% 50%, transparent 45%, rgba(0,0,0,${g.vignette}) 100%)` }} />}
    {dim > 0 && <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})` }} />}
  </>
);

/** Photo with a slow Ken Burns move and an optional colour `look`. `src`: URL or a file path on disk. `focus`: object-position ("50% 30%") for crops. */
export const Photo: React.FC<Box & { src: string; at?: number; dur?: number; move?: 'in' | 'out' | 'left' | 'right' | 'none'; fit?: 'cover' | 'contain'; dim?: number; look?: Look; focus?: string; zoom?: number }> = ({ src, at = 0, dur = 6, move = 'in', fit = 'cover', dim = 0, look, focus, zoom = 1, ...b }) => {
  const t = useTime();
  const { u } = useFormat();
  const p = ramp(t, at, at + dur, ease.linear);
  const s = (move === 'in' ? mix(1.0, 1.14, p) : move === 'out' ? mix(1.14, 1.0, p) : move === 'none' ? 1 : 1.12) * zoom;
  const x = move === 'left' ? mix(3, -3, p) : move === 'right' ? mix(-3, 3, p) : 0;
  const g = grade(look);
  return (
    <div style={boxStyle(b, u)}>
      <Img src={media(src)} style={{ width: '100%', height: '100%', objectFit: fit, objectPosition: focus, transform: `scale(${s}) translateX(${x}%)`, filter: g.filter }} />
      <Grade g={g} dim={dim} />
    </div>
  );
};

/** Video clip. `from` = second of the source to start at; `rate` = speed (0.5 slow-mo, 2 = fast); `look` = colour grade. */
export const Clip: React.FC<Box & { src: string; from?: number; rate?: number; muted?: boolean; volume?: number; fit?: 'cover' | 'contain'; dim?: number; look?: Look; focus?: string }> = ({ src, from = 0, rate = 1, muted = true, volume = 1, fit = 'cover', dim = 0, look, focus, ...b }) => {
  const { u, fps } = useFormat();
  const g = grade(look);
  return (
    <div style={boxStyle(b, u)}>
      <OffthreadVideo src={media(src)} trimBefore={Math.round(from * fps)} playbackRate={rate} muted={muted} volume={volume} style={{ width: '100%', height: '100%', objectFit: fit, objectPosition: focus, filter: g.filter }} />
      <Grade g={g} dim={dim} />
    </div>
  );
};

/** Phone / browser / laptop frame with anything inside (Photo, Clip, a screenshot…). Floats and tilts in. */
export const Device: React.FC<{ type?: 'phone' | 'browser' | 'laptop'; at?: number; scale?: number; tilt?: number; x?: number; y?: number; url?: string; children?: React.ReactNode }> = ({ type = 'phone', at = 0, scale = 1, tilt = 8, x, y, url = 'alter.app', children }) => {
  const t = useTime();
  const th = useTheme();
  const { u, w, h } = useFormat();
  const p = ramp(t, at, at + 0.9, ease.out);
  const float = Math.sin(t * 1.1) * u(10);
  const W = type === 'phone' ? u(600 * scale) : u(1500 * scale);
  const H = type === 'phone' ? W * 2.05 : W * 0.62;
  const left = x !== undefined ? u(x) : (w - W) / 2;
  const top = y !== undefined ? u(y) : (h - H) / 2;
  const frame: React.CSSProperties = {
    position: 'absolute', left, top, width: W, height: H,
    transform: `perspective(${u(2400)}px) translateY(${(1 - p) * u(220) + float}px) rotateX(${(1 - p) * 22}deg) rotateY(${mix(-tilt * 2, -tilt, p) * 0.5}deg) rotateZ(${(1 - p) * -4}deg)`,
    opacity: ramp(t, at, at + 0.3),
    boxShadow: `0 ${u(60)}px ${u(140)}px rgba(0,0,0,.6), 0 0 ${u(120)}px ${th.accent}${th.glow ? '33' : '00'}`,
  };
  if (type === 'phone')
    return (
      <div style={{ ...frame, borderRadius: W * 0.14, background: '#0c0d10', padding: W * 0.035, border: `${u(3)}px solid #2a2c33` }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: W * 0.11, overflow: 'hidden', background: '#000' }}>
          {children}
          <div style={{ position: 'absolute', top: W * 0.03, left: '50%', width: W * 0.3, height: W * 0.08, marginLeft: -W * 0.15, borderRadius: W, background: '#000' }} />
        </div>
      </div>
    );
  return (
    <div style={{ ...frame, borderRadius: u(22), background: '#16171c', overflow: 'hidden', border: `${u(2)}px solid #2b2d35` }}>
      <div style={{ height: u(52), display: 'flex', alignItems: 'center', gap: u(10), padding: `0 ${u(20)}px`, background: '#1d1f26' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: u(14), height: u(14), borderRadius: '50%', background: c }} />)}
        <div style={{ marginLeft: u(20), flex: 1, height: u(30), borderRadius: u(8), background: '#2a2c35', color: '#9aa0b4', fontSize: u(18), display: 'flex', alignItems: 'center', padding: `0 ${u(14)}px`, fontFamily: font(th.body) }}>{url}</div>
      </div>
      <div style={{ position: 'relative', height: `calc(100% - ${u(52)}px)` }}>{children}</div>
    </div>
  );
};

/** Logo (image or text) reveal: scale + light sweep + glow. */
export const Logo: React.FC<{ src?: string; text?: string; at?: number; size?: number; sub?: string }> = ({ src, text, at = 0, size = 360, sub }) => {
  const t = useTime();
  const th = useTheme();
  const { u } = useFormat();
  if (t < at) return null;
  const p = ramp(t, at, at + 1, ease.back);
  const sweep = ramp(t, at + 0.5, at + 1.4, ease.inOut);
  const sheen = `linear-gradient(105deg, transparent ${mix(-30, 100, sweep)}%, rgba(255,255,255,.75) ${mix(-20, 110, sweep)}%, transparent ${mix(-10, 120, sweep)}%)`;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: u(30) }}>
      <div style={{ position: 'relative', transform: `scale(${mix(0.6, 1, p)})`, opacity: ramp(t, at, at + 0.3), filter: th.glow ? `drop-shadow(0 0 ${u(50)}px ${th.accent}88)` : undefined }}>
        {src ? <Img src={media(src)} style={{ width: u(size), height: 'auto', display: 'block' }} /> : <div style={{ fontFamily: font(th.display), fontWeight: 900, fontSize: u(size * 0.42), letterSpacing: '-0.05em', color: th.ink }}>{text}</div>}
        {/* light sweep, clipped to the logo's own shape */}
        {src ? (
          <div style={{ position: 'absolute', inset: 0, background: sheen, WebkitMaskImage: `url(${media(src)})`,WebkitMaskSize: '100% 100%', mixBlendMode: 'overlay' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, fontFamily: font(th.display), fontWeight: 900, fontSize: u(size * 0.42), letterSpacing: '-0.05em', background: sheen, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{text}</div>
        )}
      </div>
      {sub && <div style={{ fontFamily: font(th.body), fontSize: u(34), color: th.muted, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: ramp(t, at + 0.8, at + 1.3) }}>{sub}</div>}
    </AbsoluteFill>
  );
};

/* ---------- charts ---------- */

/** Animated bar chart. */
export const Bars: React.FC<{ data: { label: string; value: number }[]; at?: number; suffix?: string; place?: 'center' | 'bottom' }> = ({ data, at = 0, suffix = '' }) => {
  const t = useTime();
  const th = useTheme();
  const { u, w, h, portrait } = useFormat();
  const max = Math.max(...data.map((d) => d.value), 1);
  const H = portrait ? h * 0.38 : h * 0.5;
  const W = Math.min(w - u(160), u(1500));
  const bw = W / data.length;
  return (
    <div style={{ position: 'absolute', left: (w - W) / 2, top: (h - H) / 2, width: W, height: H, display: 'flex', alignItems: 'flex-end' }}>
      {data.map((d, i) => {
        const p = ramp(t, at + i * 0.12, at + i * 0.12 + 1, ease.out);
        return (
          <div key={i} style={{ width: bw, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: u(14), fontFamily: font(th.body) }}>
            <div style={{ fontSize: u(34), fontWeight: 800, color: th.ink, opacity: p }}>{Math.round(d.value * p).toLocaleString('pl-PL')}{suffix}</div>
            <div style={{ width: bw * 0.62, height: (H - u(110)) * (d.value / max) * p, borderRadius: u(16), background: i === data.length - 1 ? th.accent : `color-mix(in srgb, ${th.ink} 18%, transparent)`, boxShadow: i === data.length - 1 && th.glow ? `0 0 ${u(60)}px ${th.accent}66` : undefined }} />
            <div style={{ fontSize: u(26), color: th.muted, whiteSpace: 'nowrap' }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
};

/** Progress ring (value 0..1) with a number in the middle. */
export const Ring: React.FC<{ value: number; at?: number; size?: number; label?: string; dur?: number }> = ({ value, at = 0, size = 520, label, dur = 1.4 }) => {
  const t = useTime();
  const th = useTheme();
  const { u } = useFormat();
  const p = ramp(t, at, at + dur, ease.out) * value;
  const S = u(size);
  const r = S / 2 - u(26);
  const c = 2 * Math.PI * r;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <svg width={S} height={S} style={{ transform: 'rotate(-90deg)', overflow: 'visible', filter: th.glow ? `drop-shadow(0 0 ${u(30)}px ${th.accent}77)` : undefined }}>
        <circle cx={S / 2} cy={S / 2} r={r} fill="none" stroke={`color-mix(in srgb, ${th.ink} 12%, transparent)`} strokeWidth={u(26)} />
        <circle cx={S / 2} cy={S / 2} r={r} fill="none" stroke={th.accent} strokeWidth={u(26)} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center', fontFamily: font(th.display) }}>
        <div style={{ fontSize: u(size * 0.26), fontWeight: 800, letterSpacing: '-0.04em' }}>{Math.round(p * 100)}%</div>
        {label && <div style={{ fontSize: u(30), color: th.muted, fontFamily: font(th.body) }}>{label}</div>}
      </div>
    </AbsoluteFill>
  );
};

/* ---------- sound ---------- */

/** Background music with fades (seconds). */
export const Music: React.FC<{ src: string; volume?: number; fadeIn?: number; fadeOut?: number; from?: number }> = ({ src, volume = 0.8, fadeIn = 1, fadeOut = 1.5, from = 0 }) => {
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <Audio
      src={media(src)}
      trimBefore={Math.round(from * fps)}
      volume={(f) => volume * Math.min(interpolate(f, [0, fadeIn * fps], [0, 1], { extrapolateRight: 'clamp' }), interpolate(f, [durationInFrames - fadeOut * fps, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' }))}
    />
  );
};

/** A sound effect at a time (seconds, scene time). */
export const Sfx: React.FC<{ src: string; at?: number; volume?: number }> = ({ src, at = 0, volume = 1 }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={Math.round(at * fps)} layout="none">
      <Audio src={media(src)} volume={volume} />
    </Sequence>
  );
};
