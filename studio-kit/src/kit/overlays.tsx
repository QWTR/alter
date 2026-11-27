// Flat overlays that go on top of a World shot (HTML, not 3D): name tags, badges, speech bubbles, a phone
// notification, a shouted word, counters and meters, a stamp, emoji, an arrow, a rating.
// All positions are px on a 1080-wide frame (1080 × 1920 for a reel). They appear at `at` and vanish at `out` (seconds).
import React from 'react';
import { ease, font, mix, ramp, useFormat, useTheme, useTime } from './stage';

const useIn = (at: number, out?: number) => {
  const t = useTime();
  if (t < at || (out !== undefined && t > out + 0.25)) return null;
  const p = ramp(t, at, at + 0.35, ease.back);
  const q = out === undefined ? 0 : ramp(t, out, out + 0.25, ease.inOut);
  return { p, q, t };
};

/** Name tag over a character (yellow text on a dark pill). */
export const Tag: React.FC<{ text: string; x: number; y: number; at?: number; out?: number; color?: string }> = ({ text, x, y, at = 0, out, color = '#ffd33d' }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  return (
    <div style={{ position: 'absolute', left: u(x), top: u(y), transform: `translate(-50%, -50%) scale(${mix(0.6, 1, s.p) * (1 - s.q * 0.3)})`, opacity: 1 - s.q, padding: `${u(10)}px ${u(22)}px`, borderRadius: u(14), background: 'rgba(28,28,30,.92)', border: `${u(3)}px solid ${color}`, color, fontFamily: font(th.display), fontWeight: 800, fontSize: u(40), whiteSpace: 'nowrap', boxShadow: `0 ${u(8)}px ${u(24)}px rgba(0,0,0,.35)` }}>{text}</div>
  );
};

/** A small white pill: emoji + text, optional ❌/✅ mark (`mark`), `dark` variant. Stack several 90 px apart. */
export const Badge: React.FC<{ text: string; icon?: string; mark?: 'x' | 'ok'; x: number; y: number; at?: number; out?: number; dark?: boolean; size?: number }> = ({ text, icon, mark, x, y, at = 0, out, dark, size = 38 }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  return (
    <div style={{ position: 'absolute', left: u(x), top: u(y), transform: `translate(-50%, -50%) scale(${mix(0.5, 1, s.p)}) rotate(${(1 - s.p) * -6}deg)`, opacity: 1 - s.q, display: 'flex', alignItems: 'center', gap: u(10), padding: `${u(10)}px ${u(20)}px`, borderRadius: u(14), background: dark ? 'rgba(20,20,22,.94)' : '#ffffff', color: dark ? '#fff' : '#151515', fontFamily: font(th.display), fontWeight: 800, fontSize: u(size), whiteSpace: 'nowrap', boxShadow: `0 ${u(10)}px ${u(26)}px rgba(0,0,0,.3)` }}>
      {icon && <span>{icon}</span>}
      <span>{text}</span>
      {mark && <span style={{ color: mark === 'x' ? '#e53935' : '#2e7d32', fontWeight: 900 }}>{mark === 'x' ? '✕' : '✓'}</span>}
    </div>
  );
};

/** A speech bubble pointing down at a character (`think` = a thought bubble). x/y = the bubble's centre; put it above the head. */
export const Say: React.FC<{ text: string; x: number; y: number; at?: number; out?: number; think?: boolean; width?: number; size?: number; tail?: 'left' | 'right' | 'center' }> = ({ text, x, y, at = 0, out, think, width = 560, size = 44, tail = 'center' }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  const tx = tail === 'left' ? '28%' : tail === 'right' ? '72%' : '50%';
  return (
    <div style={{ position: 'absolute', left: u(x), top: u(y), transform: `translate(-50%, -50%) scale(${mix(0.4, 1, s.p)})`, transformOrigin: `${tx} 120%`, opacity: 1 - s.q, maxWidth: u(width), padding: `${u(20)}px ${u(30)}px`, borderRadius: u(think ? 60 : 34), background: '#ffffff', color: '#151515', fontFamily: font(th.display), fontWeight: 800, fontSize: u(size), lineHeight: 1.15, textAlign: 'center', boxShadow: `0 ${u(12)}px ${u(30)}px rgba(0,0,0,.3)` }}>
      {text}
      {think
        ? <><div style={{ position: 'absolute', left: tx, bottom: -u(30), width: u(26), height: u(26), borderRadius: '50%', background: '#fff', transform: 'translateX(-50%)' }} /><div style={{ position: 'absolute', left: tx, bottom: -u(56), width: u(14), height: u(14), borderRadius: '50%', background: '#fff', transform: 'translateX(-90%)' }} /></>
        : <div style={{ position: 'absolute', left: tx, bottom: -u(24), width: 0, height: 0, borderLeft: `${u(18)}px solid transparent`, borderRight: `${u(18)}px solid transparent`, borderTop: `${u(28)}px solid #fff`, transform: 'translateX(-50%)' }} />}
    </div>
  );
};

/** Big speedometer number counting from → to, red when over `limit`. ONLY for scenes that are about speed. */
export const Speedo: React.FC<{ from?: number; to: number; at?: number; dur?: number; limit?: number; unit?: string; x?: number; y?: number; out?: number }> = ({ from = 0, to, at = 0, dur = 1.5, limit, unit = 'km/h', x = 70, y = 130, out }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  const v = Math.round(mix(from, to, ramp(s.t, at, at + dur, ease.out)));
  const hot = limit !== undefined && v > limit;
  const jitter = hot ? Math.sin(s.t * 60) * u(3) : 0;
  return (
    <div style={{ position: 'absolute', left: u(x) + jitter, top: u(y), opacity: 1 - s.q, fontFamily: font(th.display), color: hot ? '#ff3b30' : '#ffffff', textShadow: `0 ${u(4)}px ${u(18)}px rgba(0,0,0,.35)` }}>
      <div style={{ fontSize: u(150), fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.04em', WebkitTextStroke: `${u(3)}px rgba(0,0,0,.25)` }}>{v}</div>
      <div style={{ fontSize: u(30), fontWeight: 800, marginTop: u(6) }}>{unit}</div>
    </div>
  );
};

/**
 * A counting meter for ANY number: money, likes, calories, patience, battery, stress… A big number counts from → to
 * with a label and an optional bar (`max` draws the bar; `bad` turns it red above that value, `good` green).
 */
export const Gauge: React.FC<{ label: string; from?: number; to: number; at?: number; dur?: number; prefix?: string; suffix?: string; max?: number; bad?: number; good?: number; icon?: string; x?: number; y?: number; out?: number; decimals?: number }> = ({ label, from = 0, to, at = 0, dur = 1.4, prefix = '', suffix = '', max, bad, good, icon, x = 70, y = 130, out, decimals = 0 }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  const v = mix(from, to, ramp(s.t, at, at + dur, ease.out));
  const hot = bad !== undefined && v >= bad;
  const ok = good !== undefined && v >= good;
  const color = hot ? '#ff3b30' : ok ? '#34c759' : '#ffffff';
  return (
    <div style={{ position: 'absolute', left: u(x) + (hot ? Math.sin(s.t * 60) * u(3) : 0), top: u(y), opacity: 1 - s.q, transform: `scale(${mix(0.7, 1, s.p)})`, transformOrigin: 'left top', fontFamily: font(th.display), color, textShadow: `0 ${u(4)}px ${u(18)}px rgba(0,0,0,.4)` }}>
      <div style={{ fontSize: u(34), fontWeight: 800, color: '#fff', opacity: 0.95 }}>{icon ? icon + ' ' : ''}{label}</div>
      <div style={{ fontSize: u(120), fontWeight: 900, lineHeight: 0.95, letterSpacing: '-0.03em', WebkitTextStroke: `${u(3)}px rgba(0,0,0,.25)` }}>{prefix}{v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}{suffix}</div>
      {max !== undefined && <div style={{ marginTop: u(12), width: u(420), height: u(22), borderRadius: u(11), background: 'rgba(0,0,0,.4)', overflow: 'hidden', boxShadow: `0 ${u(4)}px ${u(12)}px rgba(0,0,0,.3)` }}><div style={{ width: `${Math.max(0, Math.min(1, v / max)) * 100}%`, height: '100%', borderRadius: u(11), background: color }} /></div>}
    </div>
  );
};

/** A phone notification / chat message card sliding down from the top. `reply` adds a green answer button. */
export const Notify: React.FC<{ title: string; text?: string; time?: string; icon?: string; reply?: string; at?: number; out?: number; y?: number }> = ({ title, text, time = 'teraz', icon = '💬', reply, at = 0, out, y = 110 }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  return (
    <div style={{ position: 'absolute', left: u(60), right: u(60), top: u(y), transform: `translateY(${(1 - s.p) * -u(160)}px)`, opacity: 1 - s.q, padding: `${u(24)}px ${u(28)}px`, borderRadius: u(30), background: 'rgba(22,22,26,.94)', color: '#fff', fontFamily: font(th.body), boxShadow: `0 ${u(20)}px ${u(50)}px rgba(0,0,0,.4)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: u(18) }}>
        <div style={{ width: u(64), height: u(64), borderRadius: '50%', background: '#2b3a67', display: 'grid', placeItems: 'center', fontSize: u(36) }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: u(36) }}>{title}</div>
          <div style={{ fontSize: u(24), opacity: 0.6 }}>{time}</div>
        </div>
      </div>
      {text && <div style={{ fontSize: u(36), fontWeight: 600, marginTop: u(18) }}>{text}</div>}
      {reply && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: u(14) }}><span style={{ background: '#2fa75a', padding: `${u(10)}px ${u(24)}px`, borderRadius: u(14), fontWeight: 800, fontSize: u(32) }}>{reply}</span></div>}
    </div>
  );
};

/** A big shouted word in a dark box (STOP!, NIE!), optional small `sub` pill under it. Shakes on entry. */
export const Shout: React.FC<{ text: string; sub?: string; at?: number; out?: number; x?: number; y?: number; color?: string }> = ({ text, sub, at = 0, out, x = 540, y = 760, color = '#ffd33d' }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  const shake = s.t - at < 0.4 ? Math.sin(s.t * 70) * u(8) * (1 - (s.t - at) / 0.4) : 0;
  return (
    <div style={{ position: 'absolute', left: u(x) + shake, top: u(y), transform: `translate(-50%, -50%) scale(${mix(1.6, 1, s.p)})`, opacity: 1 - s.q, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: u(14) }}>
      <div style={{ padding: `${u(14)}px ${u(30)}px`, borderRadius: u(18), background: 'rgba(20,20,22,.94)', color, fontFamily: font(th.display), fontWeight: 900, fontSize: u(92), letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{text}</div>
      {sub && <div style={{ padding: `${u(8)}px ${u(18)}px`, borderRadius: u(12), background: '#fff', color: '#111', fontFamily: font(th.display), fontWeight: 800, fontSize: u(34) }}>{sub}</div>}
    </div>
  );
};

/** A rubber stamp slammed on the picture (SOLD, FAIL, OK, PREMIUM), tilted. */
export const Stamp: React.FC<{ text: string; x?: number; y?: number; at?: number; out?: number; color?: string; size?: number; tilt?: number }> = ({ text, x = 540, y = 900, at = 0, out, color = '#e53935', size = 110, tilt = -12 }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  return (
    <div style={{ position: 'absolute', left: u(x), top: u(y), transform: `translate(-50%, -50%) rotate(${tilt}deg) scale(${mix(2.6, 1, s.p)})`, opacity: (1 - s.q) * Math.min(1, s.p * 2), padding: `${u(8)}px ${u(34)}px`, border: `${u(10)}px solid ${color}`, borderRadius: u(18), color, fontFamily: font(th.display), fontWeight: 900, fontSize: u(size), letterSpacing: '0.04em', whiteSpace: 'nowrap', textTransform: 'uppercase', background: 'rgba(255,255,255,.08)' }}>{text}</div>
  );
};

/** One big emoji popping in (a reaction over a head, a symbol). */
export const Emoji: React.FC<{ icon: string; x: number; y: number; at?: number; out?: number; size?: number; float?: boolean }> = ({ icon, x, y, at = 0, out, size = 120, float }) => {
  const s = useIn(at, out);
  const { u } = useFormat();
  if (!s) return null;
  return <div style={{ position: 'absolute', left: u(x), top: u(y) - (float ? (s.t - at) * u(60) : 0), transform: `translate(-50%, -50%) scale(${mix(0.2, 1, s.p)})`, opacity: 1 - s.q, fontSize: u(size), lineHeight: 1, filter: `drop-shadow(0 ${u(8)}px ${u(16)}px rgba(0,0,0,.3))` }}>{icon}</div>;
};

/** An arrow pointing at something, with an optional label at its tail. `dir`: where it points (degrees, 0 = right, 90 = down). */
export const Arrow: React.FC<{ x: number; y: number; dir?: number; text?: string; at?: number; out?: number; color?: string; length?: number }> = ({ x, y, dir = 90, text, at = 0, out, color = '#ffd33d', length = 170 }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  const bounce = Math.sin(s.t * 6) * u(8);
  const r = (dir * Math.PI) / 180;
  return (
    <div style={{ position: 'absolute', left: u(x) - Math.cos(r) * bounce, top: u(y) - Math.sin(r) * bounce, opacity: 1 - s.q, transform: `scale(${mix(0.3, 1, s.p)})` }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: u(length), height: u(16), marginTop: -u(8), transform: `rotate(${dir + 180}deg)`, transformOrigin: '0 50%' }}>
        <div style={{ position: 'absolute', left: u(26), right: 0, top: 0, bottom: 0, borderRadius: u(8), background: color, boxShadow: `0 ${u(4)}px ${u(12)}px rgba(0,0,0,.35)` }} />
        <div style={{ position: 'absolute', left: 0, top: '50%', width: 0, height: 0, marginTop: -u(26), borderTop: `${u(26)}px solid transparent`, borderBottom: `${u(26)}px solid transparent`, borderRight: `${u(42)}px solid ${color}` }} />
      </div>
      {text && <div style={{ position: 'absolute', left: -Math.cos(r) * u(length + 20), top: -Math.sin(r) * u(length + 20), transform: 'translate(-50%, -50%)', padding: `${u(8)}px ${u(18)}px`, borderRadius: u(12), background: 'rgba(20,20,22,.94)', color, fontFamily: font(th.display), fontWeight: 800, fontSize: u(36), whiteSpace: 'nowrap' }}>{text}</div>}
    </div>
  );
};

/** Stars rating filling in (reviews): `value` of `of` stars. */
export const Rating: React.FC<{ value: number; of?: number; x?: number; y?: number; at?: number; out?: number; size?: number; label?: string }> = ({ value, of = 5, x = 540, y = 400, at = 0, out, size = 80, label }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  return (
    <div style={{ position: 'absolute', left: u(x), top: u(y), transform: 'translate(-50%, -50%)', opacity: 1 - s.q, textAlign: 'center', padding: `${u(14)}px ${u(26)}px`, borderRadius: u(22), background: 'rgba(20,20,22,.9)' }}>
      <div style={{ display: 'flex', gap: u(6) }}>
        {Array.from({ length: of }, (_, i) => {
          const p = ramp(s.t, at + 0.15 + i * 0.14, at + 0.4 + i * 0.14, ease.back);
          return <span key={i} style={{ fontSize: u(size), lineHeight: 1, color: i < value ? '#ffd33d' : 'rgba(255,255,255,.22)', transform: `scale(${i < value ? mix(0.2, 1, p) : 1})`, display: 'inline-block' }}>★</span>;
        })}
      </div>
      {label && <div style={{ marginTop: u(8), color: '#fff', fontFamily: font(th.display), fontWeight: 800, fontSize: u(34) }}>{label}</div>}
    </div>
  );
};

/** A countdown / stopwatch (mm:ss) running from → to seconds. */
export const Timer: React.FC<{ from: number; to: number; at?: number; dur?: number; x?: number; y?: number; out?: number; label?: string }> = ({ from, to, at = 0, dur = 2, x = 540, y = 220, out, label }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  const v = Math.max(0, Math.round(mix(from, to, ramp(s.t, at, at + dur, ease.linear))));
  const low = to < from && v <= 5;
  return (
    <div style={{ position: 'absolute', left: u(x), top: u(y), transform: `translate(-50%, -50%) scale(${mix(0.6, 1, s.p)})`, opacity: 1 - s.q, textAlign: 'center', padding: `${u(12)}px ${u(34)}px`, borderRadius: u(22), background: 'rgba(20,20,22,.92)', fontFamily: font(th.display) }}>
      {label && <div style={{ color: 'rgba(255,255,255,.75)', fontWeight: 800, fontSize: u(28) }}>{label}</div>}
      <div style={{ color: low ? '#ff3b30' : '#ffffff', fontWeight: 900, fontSize: u(96), lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{String(Math.floor(v / 60)).padStart(2, '0')}:{String(v % 60).padStart(2, '0')}</div>
    </div>
  );
};
