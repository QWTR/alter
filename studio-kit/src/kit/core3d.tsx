// Shared 3D building blocks for the World kit: motion along paths, materials, and the two pieces every model is
// made of — Part (one shape) and Model (a placed, animated group of Parts).
//
// Units: 1 = about a metre. y is up, the ground is y = 0. Things face +z; `face` turns them (degrees).
// Moving things take `path`: [[t, x, z], …] (t in seconds inside the Scene).
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ease, mix, ramp, useTime } from './stage';

export type V3 = [number, number, number];
/** [t, ...values] */
export type Key = number[];

// ---------- motion helpers ----------

/** Values at time t from keyframes [[t, a, b, …], …]. */
export function track(keys: Key[], t: number, e: (x: number) => number = ease.inOut): number[] {
  if (!keys.length) return [];
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) {
      const p = e(Math.min(1, Math.max(0, (t - a[0]) / Math.max(1e-6, b[0] - a[0]))));
      return a.slice(1).map((v, j) => mix(v, b[j + 1] ?? v, p));
    }
  }
  return keys[keys.length - 1].slice(1);
}
/** Ground position [x, z] on a path at time t (constant speed between keys). */
export const at2 = (path: Key[], t: number) => track(path, t, ease.linear) as [number, number];
/** Heading (radians) the path is moving in at t; holds the last direction when standing still. */
export function heading(path: Key[], t: number, fallback = 0): number {
  if (path.length < 2) return fallback;
  let i = path.findIndex((k, j) => j < path.length - 1 && t <= path[j + 1][0]);
  if (i < 0) i = path.length - 2;
  for (let j = i; j >= 0; j--) {
    const dx = path[j + 1][1] - path[j][1], dz = path[j + 1][2] - path[j][2];
    if (Math.abs(dx) + Math.abs(dz) > 1e-3) return Math.atan2(dx, dz);
  }
  return fallback;
}
/** Distance travelled along a path by t (wheels, walk cycles). */
export function travelled(path: Key[], t: number): number {
  let d = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const seg = Math.hypot(b[1] - a[1], b[2] - a[2]);
    if (t >= b[0]) d += seg;
    else { if (t > a[0]) d += seg * ((t - a[0]) / Math.max(1e-6, b[0] - a[0])); break; }
  }
  return d;
}
export const deg = (d: number) => (d * Math.PI) / 180;

export interface Placed { pos?: V3; path?: Key[]; face?: number; scale?: number; at?: number }
/** Position + rotation for something placed or moving. */
export function usePlace({ pos = [0, 0, 0], path, face }: Placed) {
  const t = useTime();
  if (!path?.length) return { p: pos, r: deg(face ?? 0), d: 0, moving: false, t };
  const [x, z] = at2(path, t);
  const moving = t > path[0][0] && t < path[path.length - 1][0];
  return { p: [x, pos[1], z] as V3, r: face !== undefined && !moving ? deg(face) : heading(path, t, deg(face ?? 0)), d: travelled(path, t), moving, t };
}

/** Pops in with a little bounce at `at` (seconds). */
export const popIn = (t: number, at = 0) => (t < at ? 0 : ramp(t, at, at + 0.35, ease.back));

// ---------- warnings the renderer prints (render.mjs shows them as "WARN …") ----------

const warned = new Set<string>();
/** A mistake in the scene file that still renders: said once, shown by render.mjs after the render. */
export function kitWarn(msg: string) {
  if (warned.has(msg)) return;
  warned.add(msg);
  // eslint-disable-next-line no-console
  console.warn('ALTTER-WARN ' + msg);
}
/** Picks a known kind, or warns and falls back (so a typo never crashes a render). */
export function pick<T extends string>(what: string, kind: string | undefined, known: readonly T[], fallback: T): T {
  if (kind === undefined) return fallback;
  if ((known as readonly string[]).includes(kind)) return kind as T;
  kitWarn(`${what} kind "${kind}" does not exist (available: ${known.join(', ')}). Used "${fallback}". For anything else build it from <Model> + <Part>.`);
  return fallback;
}

// ---------- materials ----------

export const Mat: React.FC<{ c: string; e?: string; ei?: number; o?: number; smooth?: boolean; rough?: number; metal?: number }> = ({ c, e, ei = 0, o, smooth, rough = 0.82, metal = 0 }) => (
  <meshStandardMaterial color={c} flatShading={!smooth} roughness={rough} metalness={metal} emissive={e ?? '#000000'} emissiveIntensity={ei} transparent={o !== undefined} opacity={o ?? 1} />
);
/** A plain box (kept for old scenes; new models use Part). */
export const BoxM: React.FC<{ s: V3; p?: V3; r?: V3; c: string; e?: string; ei?: number; o?: number }> = ({ s, p = [0, 0, 0], r, c, e, ei, o }) => (
  <mesh position={p} rotation={r} castShadow={o === undefined} receiveShadow>
    <boxGeometry args={s} />
    <Mat c={c} e={e} ei={ei} o={o} />
  </mesh>
);
/** Soft contact shadow on the ground (real shadows come from the sun; this keeps things grounded in any light). */
export const Blob: React.FC<{ r?: number; sx?: number; sz?: number; o?: number }> = ({ r = 1, sx = 1, sz = 1, o = 0.16 }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} scale={[sx, sz, 1]}>
    <circleGeometry args={[r, 24]} />
    <meshBasicMaterial color="#000" transparent opacity={o} depthWrite={false} />
  </mesh>
);

export function useTextTexture(text: string, w = 256, h = 64, bg = '#ffffff', fg = '#111111', bar?: string) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (bar) { g.fillStyle = bar; g.fillRect(0, 0, h * 0.28, h); }
    g.fillStyle = fg;
    let size = Math.round(h * 0.62);
    const room = (w - (bar ? h * 0.28 : 0)) * 0.9;
    g.font = `800 ${size}px Arial, sans-serif`;
    while (size > 8 && g.measureText(text).width > room) { size -= 2; g.font = `800 ${size}px Arial, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2 + (bar ? h * 0.14 : 0), h / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [text, w, h, bg, fg, bar]);
}

// ---------- Part: one shape ----------

export type Shape = 'box' | 'round' | 'ball' | 'cyl' | 'cone' | 'capsule' | 'torus' | 'dome' | 'disc' | 'wedge' | 'prism';

const geoCache = new Map<string, THREE.BufferGeometry>();
const cached = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function geometry(shape: Shape, s: V3, radius?: number): { geo: THREE.BufferGeometry; scale: V3 } {
  const [w, h, d] = s;
  switch (shape) {
    case 'box': return { geo: cached('box', () => new THREE.BoxGeometry(1, 1, 1)), scale: s };
    case 'round': {
      const r = Math.min(radius ?? Math.min(w, h, d) * 0.22, Math.min(w, h, d) / 2 - 0.001);
      return { geo: cached(`round ${r3(w)} ${r3(h)} ${r3(d)} ${r3(r)}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.max(0.001, r))), scale: [1, 1, 1] };
    }
    case 'ball': return { geo: cached('ball', () => new THREE.SphereGeometry(0.5, 20, 14)), scale: s };
    case 'dome': return { geo: cached('dome', () => new THREE.SphereGeometry(0.5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2)), scale: [w, h * 2, d] };
    case 'cyl': return { geo: cached('cyl', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20)), scale: s };
    case 'disc': return { geo: cached('disc', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 28)), scale: s };
    case 'cone': return { geo: cached('cone', () => new THREE.ConeGeometry(0.5, 1, 18)), scale: s };
    case 'capsule': {
      const rad = Math.min(w, h) / 2;
      const len = Math.max(0.001, h - rad * 2);
      return { geo: cached(`cap ${r3(rad)} ${r3(len)}`, () => new THREE.CapsuleGeometry(rad, len, 6, 14)), scale: [1, 1, d / w] };
    }
    case 'torus': return { geo: cached(`tor ${r3(w)} ${r3(h)}`, () => new THREE.TorusGeometry(Math.max(0.001, w / 2 - h / 2), h / 2, 10, 28)), scale: [1, 1, 1] };
    case 'prism': return { geo: cached('prism', () => {
      // a roof / tent: a triangle profile with its ridge along x
      const sh = new THREE.Shape();
      sh.moveTo(-0.5, -0.5); sh.lineTo(0.5, -0.5); sh.lineTo(0, 0.5); sh.lineTo(-0.5, -0.5);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      g.rotateY(Math.PI / 2);
      return g;
    }), scale: s };
    case 'wedge': return { geo: cached('wedge', () => {
      // a ramp: full height at the back (−z), zero at the front (+z)
      const sh = new THREE.Shape();
      sh.moveTo(-0.5, -0.5); sh.lineTo(0.5, -0.5); sh.lineTo(-0.5, 0.5); sh.lineTo(-0.5, -0.5);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      g.rotateY(-Math.PI / 2);
      return g;
    }), scale: s };
  }
}

export interface PartProps {
  /** box | round (soft-edged box) | ball | cyl | cone | capsule | torus | dome | disc | wedge (a ramp, high at the back) | prism (a roof: ridge along x, size [length, height, width]) */
  shape?: Shape;
  /** [width, height, depth] in metres (ball: 3 diameters; torus: [diameter, tube thickness, –]); one number = a cube / sphere */
  size?: V3 | number;
  pos?: V3;
  /** rotation in DEGREES [x, y, z] */
  rot?: V3;
  color?: string;
  /** glows in its own colour (lamps, screens, fire): 0–3, or a colour string */
  glow?: number | string;
  opacity?: number;
  /** 0 matte … 1 glossy */
  shine?: number;
  /** 0–1 metallic */
  metal?: number;
  /** flat low-poly facets instead of smooth shading */
  flat?: boolean;
  /** corner radius for shape="round" */
  radius?: number;
  /** no shadow from this part (glass, glows) */
  noShadow?: boolean;
}
/** One shape. Every kit model is a handful of these; use it (inside a Model) to build anything the kit has no model for. */
export const Part: React.FC<PartProps> = ({ shape = 'round', size = 1, pos = [0, 0, 0], rot, color = '#cccccc', glow, opacity, shine = 0.2, metal = 0, flat, radius, noShadow }) => {
  const s: V3 = typeof size === 'number' ? [size, size, size] : size;
  const { geo, scale } = geometry(shape, [Math.max(0.001, s[0]), Math.max(0.001, s[1]), Math.max(0.001, s[2] ?? s[0])], radius);
  const g = glow === undefined || glow === 0 ? null : typeof glow === 'string' ? { c: glow, i: 1.6 } : { c: color, i: glow };
  const see = opacity !== undefined && opacity < 1;
  return (
    <mesh geometry={geo} position={pos} rotation={rot ? [deg(rot[0]), deg(rot[1]), deg(rot[2])] : undefined} scale={scale} castShadow={!see && !noShadow && !g} receiveShadow={!g}>
      <meshStandardMaterial color={color} flatShading={flat ?? shape === 'box'} roughness={1 - shine * 0.85} metalness={metal} emissive={g ? g.c : '#000000'} emissiveIntensity={g ? g.i : 0} transparent={see} opacity={opacity ?? 1} depthWrite={!see} />
    </mesh>
  );
};

// ---------- Model: a placed group of Parts ----------

export interface ModelProps extends Placed {
  children?: React.ReactNode;
  /** turns round by itself: degrees per second */
  spin?: number;
  /** floats up and down: metres */
  bob?: number;
  /** hops on the spot (true, or how high in metres) */
  hop?: boolean | number;
  /** rocks side to side: degrees */
  sway?: number;
  /** leans sideways: degrees */
  tilt?: number;
  /** squashes and stretches a little, like breathing: 0–1 */
  pulse?: number;
  /** radius of the soft shadow under it (0 = none) */
  shadow?: number;
}
/**
 * A custom model: put Parts inside. `pos` or `path` places / moves it (it turns to where it goes), `face` turns it,
 * `scale` sizes it, `at` pops it in at that second. Build it standing on y = 0, centred on x/z, facing +z.
 */
export const Model: React.FC<ModelProps> = (props) => {
  const { children, spin = 0, bob = 0, hop, sway = 0, tilt = 0, pulse = 0, shadow = 0.6, scale = 1, at } = props;
  const { p, r, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const hopH = hop ? Math.abs(Math.sin(t * 6)) * (typeof hop === 'number' ? hop : 0.5) : 0;
  const y = p[1] + hopH + (bob ? Math.sin(t * 2.4) * bob : 0);
  const pu = pulse ? Math.sin(t * 3) * 0.04 * pulse : 0;
  return (
    <group position={[p[0], p[1], p[2]]}>
      {shadow > 0 && p[1] < 0.5 && <Blob r={shadow * scale * k} />}
      <group position={[0, y - p[1], 0]} rotation={[0, r + deg(spin * t), deg(tilt + (sway ? Math.sin(t * 3) * sway : 0))]} scale={[scale * k * (1 - pu), scale * k * (1 + pu), scale * k * (1 - pu)]}>
        {children}
      </group>
    </group>
  );
};

/** Short alias used inside the kit's own models. */
export const P = Part;
