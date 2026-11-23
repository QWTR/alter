// Stage: format, theme, fonts and timing shared by every kit component.
import React, { createContext, useContext } from 'react';
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadSpace } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as loadBebas } from '@remotion/google-fonts/BebasNeue';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';

export const FORMATS = {
  reel: [1080, 1920],
  story: [1080, 1920],
  square: [1080, 1080],
  post: [1080, 1350],
  wide: [1920, 1080],
  thumb: [1280, 720],
  banner: [1500, 500],
} as const;
export type Format = keyof typeof FORMATS;

export interface Theme {
  bg: string;
  bg2: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  display: string;
  body: string;
  /** 0 = flat, 1 = glossy (glows, gradients) */
  glow: number;
  /** headline letter case */
  upper?: boolean;
}

const T = (t: Partial<Theme> & Pick<Theme, 'bg' | 'bg2' | 'ink' | 'accent' | 'accent2'>): Theme => ({ muted: 'rgba(255,255,255,.64)', display: 'Inter', body: 'Inter', glow: 1, ...t });

export const THEMES: Record<string, Theme> = {
  midnight: T({ bg: '#07080d', bg2: '#151a2c', ink: '#ffffff', accent: '#7c5cff', accent2: '#2ee6ff' }),
  neon: T({ bg: '#06010f', bg2: '#1d0638', ink: '#ffffff', accent: '#ff2bd6', accent2: '#00f0ff', display: 'Space Grotesk' }),
  sunset: T({ bg: '#170910', bg2: '#3d1322', ink: '#fff4ea', muted: 'rgba(255,244,234,.66)', accent: '#ff6a3d', accent2: '#ffc24b', display: 'Syne' }),
  racing: T({ bg: '#08090c', bg2: '#1b1d24', ink: '#ffffff', accent: '#e53935', accent2: '#ffffff' }),
  luxury: T({ bg: '#0b0a08', bg2: '#1e1a13', ink: '#f3eadb', muted: 'rgba(243,234,219,.6)', accent: '#d4af6a', accent2: '#8c6b3f', display: 'Playfair Display', glow: 0.5 }),
  mono: T({ bg: '#0a0a0a', bg2: '#1c1c1c', ink: '#f5f5f5', accent: '#ffffff', accent2: '#8a8a8a', glow: 0.3 }),
  paper: T({ bg: '#f3efe6', bg2: '#e4dccb', ink: '#121212', muted: 'rgba(0,0,0,.58)', accent: '#e4402f', accent2: '#1f4fff', display: 'Playfair Display', glow: 0 }),
  fresh: T({ bg: '#ecfff6', bg2: '#c6f5df', ink: '#06281c', muted: 'rgba(6,40,28,.62)', accent: '#00b86b', accent2: '#0a6cff', display: 'Space Grotesk', glow: 0.2 }),
  bold: T({ bg: '#111111', bg2: '#262626', ink: '#ffffff', accent: '#ffe600', accent2: '#ff3d00', display: 'Bebas Neue', upper: true, glow: 0.4 }),
};

const FONT_LOADERS: Record<string, () => { fontFamily: string }> = {
  Inter: () => loadInter('normal', { subsets: ['latin', 'latin-ext'] }),
  'Space Grotesk': () => loadSpace('normal', { subsets: ['latin', 'latin-ext'] }),
  'Playfair Display': () => loadPlayfair('normal', { subsets: ['latin', 'latin-ext'] }),
  'Bebas Neue': () => loadBebas('normal', { subsets: ['latin', 'latin-ext'] }),
  'JetBrains Mono': () => loadMono('normal', { subsets: ['latin', 'latin-ext'] }),
  Syne: () => loadSyne('normal', { subsets: ['latin', 'latin-ext'] }),
};
/** Any Google Font: render.mjs registers the ones a video names (so only those are bundled). */
export function registerFont(name: string, load: () => { fontFamily: string }) {
  FONT_LOADERS[name] = load;
}
const fontFile = (name: string) => /.(ttf|otf|woff2?)$/i.test(name);
/** Your own font file (brand font): loaded from the copied file, render waits for it. */
function loadFile(name: string): string {
  const family = 'AlterFont' + Math.abs([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36);
  if (typeof document !== 'undefined' && typeof FontFace !== 'undefined') {
    const handle = delayRender(`font ${name}`);
    const face = new FontFace(family, `url(${media(name)})`);
    face.load().then((f) => { document.fonts.add(f); continueRender(handle); }).catch(() => continueRender(handle));
  }
  return family;
}
const loaded = new Map<string, string>();
export function font(name: string): string {
  if (!loaded.has(name)) {
    if (fontFile(name)) {
      loaded.set(name, `"${loadFile(name)}", system-ui, sans-serif`);
      return loaded.get(name)!;
    }
    const load = FONT_LOADERS[name];
    loaded.set(name, load ? `"${load().fontFamily}", system-ui, sans-serif` : `"${name}", system-ui, sans-serif`);
  }
  return loaded.get(name)!;
}

export interface Meta {
  format?: Format;
  width?: number;
  height?: number;
  seconds?: number;
  fps?: number;
  theme?: keyof typeof THEMES | string;
  /** Overrides on top of the theme: brand colours / fonts. */
  brand?: Partial<Theme>;
  /** A single image (poster, thumbnail, post) instead of a video. */
  still?: boolean;
  grain?: boolean;
}

export const sizeOf = (m: Meta): [number, number] => (m.width && m.height ? [m.width, m.height] : [...(FORMATS[m.format ?? 'reel'] ?? FORMATS.reel)] as [number, number]);

const ThemeCtx = createContext<Theme>(THEMES.midnight);
export const useTheme = () => useContext(ThemeCtx);

/** Size helpers that keep layouts right in every format. `u(40)` = 40 px on a 1080-wide frame. */
export function useFormat() {
  const { width: w, height: h, fps } = useVideoConfig();
  const s = Math.min(w, h) / 1080;
  return { w, h, fps, s, u: (n: number) => n * s, portrait: h > w * 1.1, landscape: w > h * 1.1 };
}

/** Time in seconds (inside a Scene: since the scene started). */
export function useTime() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return f / fps;
}

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  back: Easing.bezier(0.34, 1.56, 0.64, 1),
  linear: (x: number) => x,
};

/** 0→1 between two times (seconds), eased and clamped. */
export const ramp = (t: number, a: number, b: number, e: (x: number) => number = ease.out) =>
  b <= a ? (t >= a ? 1 : 0) : interpolate(t, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e });
export const mix = (a: number, b: number, p: number) => a + (b - a) * p;
export const rand = (seed: string | number) => random(String(seed));

/** A file for the video: URL, or a path on disk (render.mjs copies it in). */
export function media(src: string): string {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  return staticFile('ext/' + src.replace(/[^a-zA-Z0-9.-]+/g, '_').slice(-140));
}

export const Stage: React.FC<{ meta: Meta; children: React.ReactNode }> = ({ meta, children }) => {
  const base = THEMES[meta.theme ?? 'midnight'] ?? THEMES.midnight;
  const theme = { ...base, ...meta.brand };
  return (
    <ThemeCtx.Provider value={theme}>
      <AbsoluteFill style={{ background: theme.bg, color: theme.ink, fontFamily: font(theme.body), overflow: 'hidden' }}>
        {children}
        {meta.grain !== false && <Grain />}
      </AbsoluteFill>
    </ThemeCtx.Provider>
  );
};

/** Film grain + soft vignette: makes flat digital colour look filmed. */
export const Grain: React.FC<{ amount?: number }> = ({ amount = 0.06 }) => {
  const f = useCurrentFrame();
  const seed = Math.floor(f / 2) % 8;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: amount, mixBlendMode: 'overlay' }}>
        <filter id={`g${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${seed})`} />
      </svg>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 50%, transparent 55%, rgba(0,0,0,.35) 100%)' }} />
    </AbsoluteFill>
  );
};
