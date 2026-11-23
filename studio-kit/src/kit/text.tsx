// Type: kinetic text, titles, counters, captions, chips, lower thirds.
import React from 'react';
import { ease, font, mix, ramp, useFormat, useTheme, useTime } from './stage';

export type Place = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'bottom-left' | 'none';
export type TextAnim = 'rise' | 'pop' | 'blur' | 'fade' | 'type' | 'slide' | 'none';

/** Absolute box placed in the frame with safe margins (respects TikTok/Reels UI on tall formats). */
export function placeStyle(place: Place, u: (n: number) => number, portrait: boolean): React.CSSProperties {
  const m = u(80);
  const top = portrait ? u(260) : m;
  const bottom = portrait ? u(380) : m;
  const base: React.CSSProperties = { position: 'absolute', display: 'flex', flexDirection: 'column' };
  switch (place) {
    case 'none': return {};
    case 'center': return { ...base, inset: `${top}px ${m}px ${bottom}px`, justifyContent: 'center', alignItems: 'center', textAlign: 'center' };
    case 'top': return { ...base, left: m, right: m, top, alignItems: 'center', textAlign: 'center' };
    case 'bottom': return { ...base, left: m, right: m, bottom, alignItems: 'center', textAlign: 'center' };
    case 'left': return { ...base, inset: `${top}px ${m}px ${bottom}px`, justifyContent: 'center', alignItems: 'flex-start', textAlign: 'left' };
    case 'right': return { ...base, inset: `${top}px ${m}px ${bottom}px`, justifyContent: 'center', alignItems: 'flex-end', textAlign: 'right' };
    case 'top-left': return { ...base, left: m, right: m, top, alignItems: 'flex-start', textAlign: 'left' };
    case 'bottom-left': return { ...base, left: m, right: m, bottom, alignItems: 'flex-start', textAlign: 'left' };
  }
}

export interface TextProps {
  children?: string;
  text?: string;
  /** Start (seconds, scene time). */
  at?: number;
  /** Leave at (seconds). */
  out?: number;
  /** px on a 1080-wide frame */
  size?: number;
  weight?: number;
  color?: string;
  /** Words to paint in the accent colour (or a highlighter sweep with `marker`). */
  hl?: string[];
  marker?: boolean;
  anim?: TextAnim;
  /** seconds between words */
  stagger?: number;
  place?: Place;
  face?: 'display' | 'body' | 'mono';
  width?: number;
  style?: React.CSSProperties;
  upper?: boolean;
}

const clean = (w: string) => w.replace(/[.,!?:;"“”„()]/g, '').toLowerCase();

/** Kinetic text: words rise from a mask, pop, unblur, type on or slide in. */
export const Text: React.FC<TextProps> = ({ children, text, at = 0, out, size = 96, weight, color, hl = [], marker, anim = 'rise', stagger = 0.07, place = 'center', face = 'display', width, style, upper }) => {
  const t = useTime();
  const th = useTheme();
  const { u, portrait } = useFormat();
  const content = text ?? children ?? '';
  if (t < at) return null;
  const leave = out === undefined ? 0 : ramp(t, out, out + 0.35, ease.inOut);
  if (leave >= 1) return null;
  const fs = u(size);
  const fam = face === 'mono' ? font('JetBrains Mono') : font(face === 'display' ? th.display : th.body);
  const hlSet = new Set(hl.map(clean));
  const isUpper = upper ?? (face === 'display' && th.upper);
  const box: React.CSSProperties = {
    fontFamily: fam,
    fontSize: fs,
    fontWeight: weight ?? (face === 'display' ? 800 : 500),
    lineHeight: face === 'display' ? 1.02 : 1.3,
    letterSpacing: face === 'display' ? '-0.035em' : '-0.01em',
    color: color ?? th.ink,
    maxWidth: width ? u(width) : undefined,
    textTransform: isUpper ? 'uppercase' : undefined,
    opacity: 1 - leave,
    transform: leave ? `translateY(${-leave * 20}px)` : undefined,
    ...style,
  };
  const wrap = place === 'none' ? box : { ...placeStyle(place, u, portrait), pointerEvents: 'none' as const };

  if (anim === 'type') {
    const chars = Math.floor(Math.max(0, t - at) / 0.035);
    const shown = content.slice(0, chars);
    const caret = chars < content.length || Math.floor(t * 2) % 2 === 0;
    return (
      <div style={wrap}>
        <div style={box}>
          {shown}
          <span style={{ opacity: caret ? 1 : 0, color: th.accent }}>▍</span>
        </div>
      </div>
    );
  }

  const words = content.split(/\s+/).filter(Boolean);
  const justify = place === 'left' || place === 'top-left' || place === 'bottom-left' ? 'flex-start' : place === 'right' ? 'flex-end' : 'center';
  return (
    <div style={wrap}>
      <div style={{ ...box, display: 'flex', flexWrap: 'wrap', justifyContent: justify, columnGap: '0.26em' }}>
        {words.map((w, i) => {
          const a = at + i * stagger;
          const p = ramp(t, a, a + (anim === 'pop' ? 0.45 : 0.6), anim === 'pop' ? ease.back : ease.out);
          const isHl = hlSet.has(clean(w));
          const c = isHl && !marker ? th.accent : undefined;
          let inner: React.CSSProperties = {};
          if (anim === 'rise') inner = { transform: `translateY(${(1 - p) * 110}%)` };
          if (anim === 'pop') inner = { transform: `scale(${mix(0.3, 1, p)})`, opacity: ramp(t, a, a + 0.15) };
          if (anim === 'blur') inner = { filter: p < 1 ? `blur(${(1 - p) * 0.4 * fs * 0.1}px)` : undefined, opacity: p };
          if (anim === 'fade') inner = { opacity: p };
          if (anim === 'slide') inner = { transform: `translateX(${(1 - p) * 0.6}em)`, opacity: p };
          const mk = isHl && marker ? ramp(t, a + 0.25, a + 0.7, ease.inOut) : 0;
          return (
            <span key={i} style={{ display: 'inline-block', overflow: anim === 'rise' ? 'hidden' : 'visible', paddingBottom: '0.12em', marginBottom: '-0.12em', position: 'relative' }}>
              {isHl && marker && <span style={{ position: 'absolute', left: '-0.08em', right: '-0.08em', bottom: '0.14em', height: '0.42em', background: th.accent, opacity: 0.85, transform: `scaleX(${mk})`, transformOrigin: 'left', borderRadius: '0.08em' }} />}
              <span style={{ display: 'inline-block', position: 'relative', color: c, ...inner }}>{w}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** Kicker + big headline + sub line. */
export const Title: React.FC<{ kicker?: string; title: string; sub?: string; at?: number; out?: number; place?: Place; size?: number; hl?: string[]; anim?: TextAnim }> = ({ kicker, title, sub, at = 0, out, place = 'center', size = 120, hl, anim = 'rise' }) => {
  const { u, portrait } = useFormat();
  const t = useTime();
  const th = useTheme();
  const align = place.includes('left') ? 'flex-start' : 'center';
  return (
    <div style={{ ...placeStyle(place, u, portrait), gap: u(22) }}>
      {kicker && (
        <div style={{ opacity: ramp(t, at, at + 0.4) * (out === undefined ? 1 : 1 - ramp(t, out, out + 0.3)), transform: `translateY(${(1 - ramp(t, at, at + 0.5)) * 20}px)`, display: 'flex', alignSelf: align, alignItems: 'center', gap: u(12), fontFamily: font(th.body), fontSize: u(30), fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: th.accent }}>
          <span style={{ width: u(36) * ramp(t, at + 0.1, at + 0.7), height: u(3), background: th.accent, borderRadius: 2 }} />
          {kicker}
        </div>
      )}
      <Text text={title} at={at + (kicker ? 0.15 : 0)} out={out} size={size} hl={hl} anim={anim} place="none" style={{ justifyContent: align }} />
      {sub && <Text text={sub} at={at + 0.5} out={out} size={size * 0.32} face="body" weight={500} anim="fade" stagger={0.02} color={th.muted} place="none" style={{ justifyContent: align }} />}
    </div>
  );
};

/** Number that counts up (1 200 → "1 200 km"). */
export const Counter: React.FC<{ to: number; from?: number; at?: number; dur?: number; prefix?: string; suffix?: string; decimals?: number; size?: number; label?: string; place?: Place; color?: string }> = ({ to, from = 0, at = 0, dur = 1.6, prefix = '', suffix = '', decimals = 0, size = 220, label, place = 'center', color }) => {
  const t = useTime();
  const th = useTheme();
  const { u, portrait } = useFormat();
  if (t < at) return null;
  const v = mix(from, to, ramp(t, at, at + dur, ease.out));
  const txt = v.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const pop = ramp(t, at, at + 0.5, ease.back);
  return (
    <div style={{ ...placeStyle(place, u, portrait), gap: u(10) }}>
      <div style={{ fontFamily: font(th.display), fontSize: u(size), fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: color ?? th.ink, transform: `scale(${mix(0.7, 1, pop)})`, opacity: ramp(t, at, at + 0.2), textShadow: th.glow ? `0 0 ${u(60)}px ${th.accent}55` : undefined }}>
        {prefix}{txt}<span style={{ color: th.accent }}>{suffix}</span>
      </div>
      {label && <div style={{ fontSize: u(size * 0.17), color: th.muted, fontWeight: 500, opacity: ramp(t, at + 0.3, at + 0.8) }}>{label}</div>}
    </div>
  );
};

export interface Word { text: string; start: number; end: number }

/** Social-style captions: a few words at a time, the spoken word lit up. Pass `words` (with times) or `text` (spread over `dur`). */
export const Captions: React.FC<{ text?: string; words?: Word[]; at?: number; dur?: number; per?: number; size?: number; place?: Place; box?: boolean }> = ({ text, words, at = 0, dur = 4, per = 3, size = 72, place = 'bottom', box = false }) => {
  const t = useTime();
  const th = useTheme();
  const { u, portrait } = useFormat();
  const list: Word[] = words ?? (() => {
    const ws = (text ?? '').split(/\s+/).filter(Boolean);
    const step = dur / Math.max(1, ws.length);
    return ws.map((w, i) => ({ text: w, start: at + i * step, end: at + (i + 1) * step }));
  })();
  const idx = list.findIndex((w) => t >= w.start && t < w.end);
  if (idx < 0) return null;
  const g = Math.floor(idx / per) * per;
  const group = list.slice(g, g + per);
  const p = ramp(t, group[0].start, group[0].start + 0.18, ease.back);
  return (
    <div style={{ ...placeStyle(place, u, portrait) }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.34em', rowGap: '0.08em', fontFamily: font(th.display), fontWeight: 900, fontSize: u(size), lineHeight: 1.1, letterSpacing: '-0.02em', textTransform: 'uppercase', transform: `scale(${mix(0.85, 1, p)})`, padding: box ? `${u(14)}px ${u(26)}px` : 0, borderRadius: u(22), background: box ? 'rgba(0,0,0,.55)' : undefined, WebkitTextStroke: box ? undefined : `${u(7)}px rgba(0,0,0,.85)`, paintOrder: 'stroke fill' }}>
        {group.map((w, i) => {
          const on = g + i === idx;
          return <span key={i} style={{ color: on ? th.accent : '#fff', transform: on ? 'scale(1.08)' : undefined, display: 'inline-block' }}>{w.text}</span>;
        })}
      </div>
    </div>
  );
};

/** Glass chip: label (+ big value), floats gently. x/y in px on a 1080-wide frame. */
export const Chip: React.FC<{ label: string; value?: string; icon?: string; at?: number; out?: number; x?: number; y?: number; accent?: boolean; place?: Place }> = ({ label, value, icon, at = 0, out, x, y, accent, place = 'center' }) => {
  const t = useTime();
  const th = useTheme();
  const { u, portrait } = useFormat();
  if (t < at) return null;
  const p = ramp(t, at, at + 0.5, ease.back);
  const q = out === undefined ? 0 : ramp(t, out, out + 0.3, ease.inOut);
  if (q >= 1) return null;
  const float = Math.sin((t + (x ?? 0) / 200) * 1.4) * u(6);
  const chip = (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: u(18), padding: `${u(20)}px ${u(28)}px`, borderRadius: u(26), background: accent ? th.accent : 'rgba(22,24,32,.78)', border: accent ? 'none' : '1.5px solid rgba(255,255,255,.14)', backdropFilter: 'blur(18px)', boxShadow: `0 ${u(24)}px ${u(60)}px rgba(0,0,0,.45)`, color: accent ? th.bg : '#fff', fontFamily: font(th.body), opacity: ramp(t, at, at + 0.2) * (1 - q), transform: `translateY(${(1 - p) * u(34) + float}px) scale(${mix(0.88, 1, p)})` }}>
      {icon && <span style={{ fontSize: u(46) }}>{icon}</span>}
      <div>
        {value && <div style={{ fontSize: u(46), fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{value}</div>}
        <div style={{ fontSize: u(value ? 26 : 36), fontWeight: value ? 500 : 700, opacity: value ? 0.75 : 1, whiteSpace: 'nowrap' }}>{label}</div>
      </div>
    </div>
  );
  if (x !== undefined && y !== undefined) return <div style={{ position: 'absolute', left: u(x), top: u(y) }}>{chip}</div>;
  return <div style={placeStyle(place, u, portrait)}>{chip}</div>;
};

/** Name + role bar for interviews / talking heads. */
export const LowerThird: React.FC<{ name: string; role?: string; at?: number; out?: number }> = ({ name, role, at = 0, out }) => {
  const t = useTime();
  const th = useTheme();
  const { u, portrait } = useFormat();
  if (t < at) return null;
  const p = ramp(t, at, at + 0.6, ease.out);
  const q = out === undefined ? 0 : ramp(t, out, out + 0.4, ease.in);
  const show = p * (1 - q);
  return (
    <div style={{ position: 'absolute', left: u(70), bottom: portrait ? u(420) : u(90), display: 'flex', gap: u(18), alignItems: 'stretch', fontFamily: font(th.body) }}>
      <div style={{ width: u(8), borderRadius: u(4), background: th.accent, transform: `scaleY(${show})`, transformOrigin: 'bottom' }} />
      <div style={{ clipPath: `inset(0 ${(1 - show) * 100}% 0 0)` }}>
        <div style={{ fontSize: u(54), fontWeight: 800, letterSpacing: '-0.02em', color: th.ink }}>{name}</div>
        {role && <div style={{ fontSize: u(30), color: th.muted, marginTop: u(4) }}>{role}</div>}
      </div>
    </div>
  );
};

/** Big bold list that builds up line by line. */
export const List: React.FC<{ items: string[]; at?: number; gap?: number; size?: number; place?: Place; numbered?: boolean }> = ({ items, at = 0, gap = 0.45, size = 64, place = 'left', numbered }) => {
  const t = useTime();
  const th = useTheme();
  const { u, portrait } = useFormat();
  return (
    <div style={{ ...placeStyle(place, u, portrait), gap: u(26) }}>
      {items.map((it, i) => {
        const p = ramp(t, at + i * gap, at + i * gap + 0.55, ease.out);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: u(22), opacity: p, transform: `translateX(${(1 - p) * u(-40)}px)`, fontFamily: font(th.display), fontWeight: 700, fontSize: u(size), letterSpacing: '-0.02em' }}>
            <span style={{ display: 'grid', placeItems: 'center', minWidth: u(size * 1.1), height: u(size * 1.1), borderRadius: u(size * 0.3), background: th.accent, color: th.bg, fontSize: u(size * 0.55), fontWeight: 800 }}>{numbered ? i + 1 : '✓'}</span>
            {it}
          </div>
        );
      })}
    </div>
  );
};
