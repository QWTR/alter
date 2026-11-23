// Animated robot heads — every agent is a little character. Eyes blink and look around, the antenna
// glows; while the agent works the eyes scan and the mouth "talks". Pure SVG + Motion, no assets.
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import type { Avatar } from '../api';
import { ICONS, paletteSolid } from './ui';

export const EYES = ['round', 'visor', 'happy', 'square', 'cyclops', 'sleepy'] as const;
export const ANTENNAS = ['bulb', 'double', 'none', 'dish', 'bolt'] as const;
export const MOUTHS = ['smile', 'grill', 'line', 'o', 'none'] as const;
export type Eyes = (typeof EYES)[number];
export type Antenna = (typeof ANTENNAS)[number];
export type Mouth = (typeof MOUTHS)[number];

const GRADS: Record<string, [string, string]> = {
  violet: ['#b6a2ff', '#5b3ff0'], ocean: ['#86ecff', '#2c6ff0'], sunset: ['#ffc47a', '#ef4f6a'], mint: ['#a8f7d6', '#13a083'],
  rose: ['#ffc0da', '#d93a82'], amber: ['#ffe28f', '#e27a14'], slate: ['#d4d9ea', '#59628a'], lime: ['#eaff9a', '#3ea83f'],
};

/** Stable features for avatars created before robots existed. */
function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
export function robotOf(a?: Avatar | null): { eyes: Eyes; antenna: Antenna; mouth: Mouth } {
  const h = hash(`${a?.palette}${a?.icon}`);
  return {
    eyes: (a?.eyes as Eyes) ?? EYES[h % EYES.length],
    antenna: (a?.antenna as Antenna) ?? ANTENNAS[(h >> 3) % ANTENNAS.length],
    mouth: (a?.mouth as Mouth) ?? MOUTHS[(h >> 6) % 4],
  };
}

export function Robot({ avatar, size = 48, running = false, still = false, mood }: { avatar?: Avatar | null; size?: number; running?: boolean; still?: boolean; mood?: 'happy' | 'alert' }) {
  const id = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const animate = !still && !reduce;
  const { eyes, antenna, mouth } = robotOf(avatar);
  const [g1, g2] = GRADS[avatar?.palette ?? 'violet'] ?? GRADS.violet;
  const accent = paletteSolid[avatar?.palette ?? 'violet'] ?? '#8b74ff';
  const Emblem = ICONS[avatar?.icon ?? 'sparkles'] ?? ICONS.sparkles;

  // eyes wander now and then (or scan quickly while working)
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (!animate) return;
    let alive = true;
    const wander = () => {
      if (!alive) return;
      setLook(running ? { x: look.x > 0 ? -3.2 : 3.2, y: 0 } : { x: Math.round((Math.random() - 0.5) * 6), y: Math.round((Math.random() - 0.5) * 3) });
      t1 = setTimeout(wander, running ? 650 : 1800 + Math.random() * 2600);
    };
    const doBlink = () => {
      if (!alive) return;
      setBlink(true);
      setTimeout(() => alive && setBlink(false), 130);
      t2 = setTimeout(doBlink, 2600 + Math.random() * 3800);
    };
    let t1 = setTimeout(wander, 900 + Math.random() * 1500);
    let t2 = setTimeout(doBlink, 1200 + Math.random() * 3000);
    return () => {
      alive = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, running]);

  const eyeT = { type: 'spring', stiffness: 260, damping: 18 } as const;
  const pupil = (cx: number, cy: number, r: number) => (
    <motion.g animate={{ x: look.x, y: look.y }} transition={eyeT}>
      <motion.circle cx={cx} cy={cy} r={r} fill="#0d0b1c" style={{ transformBox: 'fill-box', originX: 0.5, originY: 0.5 } as any} animate={{ scaleY: blink ? 0.1 : 1 }} transition={{ duration: 0.08 }} />
      <circle cx={cx + r * 0.35} cy={cy - r * 0.35} r={r * 0.32} fill="#fff" opacity={blink ? 0 : 0.95} />
    </motion.g>
  );

  const face = () => {
    switch (eyes) {
      case 'visor':
        return (
          <>
            <rect x="26" y="40" width="48" height="16" rx="8" fill="#0d0b1c" />
            <motion.rect y="44" width="14" height="8" rx="4" fill={`url(#v${id})`} animate={{ x: 43 + look.x * 2.4, opacity: blink ? 0.2 : 1 }} transition={eyeT} />
          </>
        );
      case 'happy':
        return (
          <motion.g animate={{ y: look.y * 0.5 }} transition={eyeT}>
            <path d="M31 50 Q38 41 45 50" stroke="#0d0b1c" strokeWidth="4.5" fill="none" strokeLinecap="round" />
            <path d="M55 50 Q62 41 69 50" stroke="#0d0b1c" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          </motion.g>
        );
      case 'square':
        return (
          <>
            <rect x="29" y="39" width="17" height="17" rx="5" fill="#fff" />
            <rect x="54" y="39" width="17" height="17" rx="5" fill="#fff" />
            {pupil(37.5, 47.5, 4.6)}
            {pupil(62.5, 47.5, 4.6)}
          </>
        );
      case 'cyclops':
        return (
          <>
            <circle cx="50" cy="47" r="13" fill="#fff" />
            <circle cx="50" cy="47" r="13" fill="none" stroke={accent} strokeWidth="2.5" opacity=".6" />
            {pupil(50, 47, 6.5)}
          </>
        );
      case 'sleepy':
        return (
          <>
            <ellipse cx="38" cy="48" rx="8" ry="8" fill="#fff" />
            <ellipse cx="62" cy="48" rx="8" ry="8" fill="#fff" />
            {pupil(38, 49, 4)}
            {pupil(62, 49, 4)}
            <rect x="29" y="38" width="18" height="9" rx="3" fill={g2} />
            <rect x="53" y="38" width="18" height="9" rx="3" fill={g2} />
          </>
        );
      default:
        return (
          <>
            <circle cx="38" cy="47" r="9" fill="#fff" />
            <circle cx="62" cy="47" r="9" fill="#fff" />
            {pupil(38, 47, 4.8)}
            {pupil(62, 47, 4.8)}
          </>
        );
    }
  };

  const mouthEl = () => {
    const talk = running && animate ? { scaleY: [1, 0.35, 1.1, 0.5, 1] } : { scaleY: 1 };
    const tr = running && animate ? { duration: 0.9, repeat: Infinity } : undefined;
    const wrap = (el: React.ReactNode) => (
      <motion.g style={{ transformBox: 'fill-box', originX: 0.5, originY: 0.5 } as any} animate={talk} transition={tr}>{el}</motion.g>
    );
    switch (mood === 'happy' ? 'smile' : mouth) {
      case 'smile':
        return wrap(<path d="M41 64 Q50 72 59 64" stroke="#0d0b1c" strokeWidth="3.6" fill="none" strokeLinecap="round" />);
      case 'grill':
        return wrap(
          <g>
            <rect x="38" y="61" width="24" height="9" rx="3" fill="#0d0b1c" />
            {[44, 50, 56].map((x) => <rect key={x} x={x - 0.8} y="61" width="1.6" height="9" fill={accent} opacity=".8" />)}
          </g>,
        );
      case 'o':
        return wrap(<ellipse cx="50" cy="66" rx="4.5" ry="4" fill="#0d0b1c" />);
      case 'line':
        return wrap(<rect x="42" y="64" width="16" height="3.6" rx="1.8" fill="#0d0b1c" />);
      default:
        return null;
    }
  };

  const antennaEl = () => {
    const glow = (
      <motion.circle
        r="5"
        fill={accent}
        animate={animate ? { opacity: running ? [1, 0.3, 1] : [0.85, 1, 0.85], scale: running ? [1, 1.35, 1] : 1 } : undefined}
        transition={{ duration: running ? 0.7 : 2.4, repeat: Infinity }}
        style={{ transformBox: 'fill-box', originX: 0.5, originY: 0.5 } as any}
      />
    );
    switch (antenna) {
      case 'bulb':
        return (
          <g>
            <rect x="48.5" y="10" width="3" height="14" rx="1.5" fill={g2} />
            <g transform="translate(50 10)">{glow}</g>
          </g>
        );
      case 'double':
        return (
          <g>
            <path d="M36 24 L30 11" stroke={g2} strokeWidth="3" strokeLinecap="round" />
            <path d="M64 24 L70 11" stroke={g2} strokeWidth="3" strokeLinecap="round" />
            <g transform="translate(30 10)">{glow}</g>
            <g transform="translate(70 10)">{glow}</g>
          </g>
        );
      case 'dish':
        return (
          <motion.g animate={animate ? { rotate: [-8, 8, -8] } : undefined} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} style={{ transformBox: 'fill-box', originX: 0.5, originY: 1 } as any}>
            <rect x="48.5" y="14" width="3" height="10" fill={g2} />
            <path d="M38 14 Q50 4 62 14 Z" fill={g1} stroke={g2} strokeWidth="2" />
          </motion.g>
        );
      case 'bolt':
        return <motion.path d="M52 4 L44 17 L50 17 L47 26 L57 12 L51 12 Z" fill={accent} animate={animate ? { opacity: [1, 0.55, 1] } : undefined} transition={{ duration: 1.8, repeat: Infinity }} />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      className={`robot${running ? ' running' : ''}`}
      style={{ width: size, height: size }}
      animate={animate ? { y: running ? [0, -2, 0] : [0, -1.2, 0] } : undefined}
      transition={{ duration: running ? 0.8 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <linearGradient id={`h${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={g1} />
            <stop offset="1" stopColor={g2} />
          </linearGradient>
          <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`v${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7ff3ff" />
            <stop offset="1" stopColor={accent} />
          </linearGradient>
        </defs>
        {antennaEl()}
        {/* ears */}
        <rect x="10" y="40" width="10" height="20" rx="4" fill={g2} />
        <rect x="80" y="40" width="10" height="20" rx="4" fill={g2} />
        {/* head */}
        <rect x="17" y="23" width="66" height="60" rx="22" fill={`url(#h${id})`} />
        <rect x="23" y="26" width="54" height="20" rx="10" fill={`url(#s${id})`} opacity=".5" />
        {/* face plate */}
        <rect x="24" y="35" width="52" height="40" rx="15" fill="#fff" opacity=".22" />
        {face()}
        {mouthEl()}
        {/* emblem */}
        <g transform="translate(70 66)">
          <circle r="9.5" fill="#0d0b1c" opacity=".85" />
          <foreignObject x="-6" y="-6" width="12" height="12">
            <div style={{ color: '#fff', display: 'grid', placeItems: 'center', width: 12, height: 12 }}>
              <Emblem size={10} strokeWidth={2.6} />
            </div>
          </foreignObject>
        </g>
      </svg>
    </motion.div>
  );
}
