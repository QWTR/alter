// Scenes on a seconds timeline, with enter/exit transitions.
import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { ease, mix, ramp } from './stage';

export type Move = 'fade' | 'up' | 'down' | 'left' | 'right' | 'zoom' | 'blur' | 'wipe' | 'iris' | 'none';

export interface SceneProps {
  /** Start, seconds from the start of the video (Timeline sets it for you). */
  at?: number;
  /** Length in seconds. */
  dur: number;
  enter?: Move;
  exit?: Move;
  /** Transition length, seconds. */
  tr?: number;
  children?: React.ReactNode;
}

function look(move: Move, p: number, coming: boolean): React.CSSProperties {
  // p: 0 = fully hidden, 1 = fully shown
  const q = 1 - p;
  const d = coming ? 1 : -1;
  switch (move) {
    case 'none': return {};
    case 'fade': return { opacity: p };
    case 'up': return { opacity: p, transform: `translateY(${q * 12 * d}%)` };
    case 'down': return { opacity: p, transform: `translateY(${-q * 12 * d}%)` };
    case 'left': return { transform: `translateX(${q * 100 * d}%)` };
    case 'right': return { transform: `translateX(${-q * 100 * d}%)` };
    case 'zoom': return { opacity: p, transform: `scale(${coming ? mix(1.18, 1, p) : mix(0.9, 1, p)})`, filter: q > 0.01 ? `blur(${q * 18}px)` : undefined };
    case 'blur': return { opacity: p, filter: q > 0.01 ? `blur(${q * 30}px)` : undefined };
    case 'wipe': return { clipPath: coming ? `inset(0 ${q * 100}% 0 0)` : `inset(0 0 0 ${q * 100}%)` };
    case 'iris': return { clipPath: `circle(${p * 75}% at 50% 50%)` };
  }
}

const Inner: React.FC<Required<Omit<SceneProps, 'at' | 'children'>> & { children?: React.ReactNode }> = ({ dur, enter, exit, tr, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const pin = ramp(t, 0, tr, ease.out);
  const pout = 1 - ramp(t, dur - tr, dur, ease.in);
  const a = look(enter, pin, true);
  const b = look(exit, pout, false);
  const style: React.CSSProperties = { ...a, ...b, transform: [a.transform, b.transform].filter(Boolean).join(' ') || undefined, opacity: (a.opacity as number ?? 1) * (b.opacity as number ?? 1), filter: [a.filter, b.filter].filter(Boolean).join(' ') || undefined, clipPath: pin < 1 ? a.clipPath : b.clipPath };
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

/** One shot. Everything inside counts time from the scene's start. */
export const Scene: React.FC<SceneProps> = ({ at = 0, dur, enter = 'fade', exit = 'fade', tr = 0.45, children }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={Math.round(at * fps)} durationInFrames={Math.max(1, Math.round(dur * fps))} layout="none">
      <Inner dur={dur} enter={enter} exit={exit} tr={Math.min(tr, dur / 2)}>{children}</Inner>
    </Sequence>
  );
};

/** Scenes one after another (each needs `dur`); `overlap` seconds of crossfade between them. */
export const Timeline: React.FC<{ children: React.ReactNode; overlap?: number; start?: number }> = ({ children, overlap = 0.3, start = 0 }) => {
  let at = start;
  return (
    <>
      {React.Children.toArray(children).map((child, i) => {
        if (!React.isValidElement<SceneProps>(child)) return child;
        const el = React.cloneElement(child, { at, key: i });
        at += child.props.dur - overlap;
        return el;
      })}
    </>
  );
};

/** Show children only between two times (seconds, scene-relative). */
export const Between: React.FC<{ from: number; to?: number; children: React.ReactNode }> = ({ from, to, children }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={Math.round(from * fps)} durationInFrames={to === undefined ? undefined : Math.max(1, Math.round((to - from) * fps))} layout="none">
      {children}
    </Sequence>
  );
};
