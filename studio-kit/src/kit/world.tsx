// A toy-like low-poly 3D world for story reels (built from code, not generated images):
// blocky people, cars, houses, trees, roads, birds, flames, smoke, a moving camera,
// plus the flat UI overlays that go on top (name tags, badges, a speedometer, a phone notification, a shout).
//
//   <Scene dur={3.2}>
//     <World sky="day" cam={[{ t: 0, pos: [6, 3, 8], look: [0, 1, 0] }, { t: 3, pos: [3, 2, 5], look: [0, 1.2, 0] }]}>
//       <Ground /><House pos={[0, 0, -4]} /><Person pos={[-1, 0, 0]} shirt="#c0392b" cry />
//       <Car path={[[0, 4, -2], [3, 4, 6]]} color="#c9ccd1" plate="WGM 2137" />
//     </World>
//     <Tag text="Klaus, Dortmund" x={540} y={260} />
//   </Scene>
//
// Units: 1 = about a metre. y is up, the ground is y = 0. Things face +z; `face` turns them (degrees).
// Moving things take `path`: [[t, x, z], …] (t in seconds inside the Scene). Cameras take keyframes.
import React, { useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ease, font, mix, ramp, rand, useFormat, useTheme, useTime } from './stage';

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
const at2 = (path: Key[], t: number) => track(path, t, ease.linear) as [number, number];
/** Heading (radians) the path is moving in at t; holds the last direction when standing still. */
function heading(path: Key[], t: number, fallback = 0): number {
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
function travelled(path: Key[], t: number): number {
  let d = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const seg = Math.hypot(b[1] - a[1], b[2] - a[2]);
    if (t >= b[0]) d += seg;
    else { if (t > a[0]) d += seg * ((t - a[0]) / Math.max(1e-6, b[0] - a[0])); break; }
  }
  return d;
}
const deg = (d: number) => (d * Math.PI) / 180;

interface Placed { pos?: V3; path?: Key[]; face?: number; scale?: number; at?: number }
/** Position + rotation for something placed or moving. */
function usePlace({ pos = [0, 0, 0], path, face }: Placed) {
  const t = useTime();
  if (!path?.length) return { p: pos, r: deg(face ?? 0), d: 0, moving: false, t };
  const [x, z] = at2(path, t);
  const moving = t > path[0][0] && t < path[path.length - 1][0];
  return { p: [x, pos[1], z] as V3, r: face !== undefined && !moving ? deg(face) : heading(path, t, deg(face ?? 0)), d: travelled(path, t), moving, t };
}

/** Pops in with a little bounce at `at` (seconds). */
const popIn = (t: number, at = 0) => (t < at ? 0 : ramp(t, at, at + 0.35, ease.back));

// ---------- materials ----------

const Mat: React.FC<{ c: string; e?: string; ei?: number; o?: number }> = ({ c, e, ei = 0, o }) => (
  <meshStandardMaterial color={c} flatShading roughness={0.85} metalness={0} emissive={e ?? '#000000'} emissiveIntensity={ei} transparent={o !== undefined} opacity={o ?? 1} />
);
const BoxM: React.FC<{ s: V3; p?: V3; r?: V3; c: string; e?: string; ei?: number; o?: number }> = ({ s, p = [0, 0, 0], r, c, e, ei, o }) => (
  <mesh position={p} rotation={r}>
    <boxGeometry args={s} />
    <Mat c={c} e={e} ei={ei} o={o} />
  </mesh>
);
/** Soft round shadow on the ground (cheap and always looks right). */
const Blob: React.FC<{ r?: number; sx?: number; sz?: number; o?: number }> = ({ r = 1, sx = 1, sz = 1, o = 0.22 }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} scale={[sx, sz, 1]}>
    <circleGeometry args={[r, 24]} />
    <meshBasicMaterial color="#000" transparent opacity={o} depthWrite={false} />
  </mesh>
);

function useTextTexture(text: string, w = 256, h = 64, bg = '#ffffff', fg = '#111111', bar?: string) {
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

// ---------- the world ----------

const SKIES = {
  day: { top: '#7fb8ec', bottom: '#e6f1fa', sun: 2.4, amb: 1.1, ground: '#8fd16a' },
  dusk: { top: '#3b3f6b', bottom: '#f2a174', sun: 1.4, amb: 0.7, ground: '#6c9a4f' },
  night: { top: '#070a18', bottom: '#1c2340', sun: 0.35, amb: 0.35, ground: '#2b4a2a' },
  overcast: { top: '#9aa3ad', bottom: '#d9dde1', sun: 1.2, amb: 1.2, ground: '#86b56a' },
  studio: { top: '#e9e4f5', bottom: '#ffffff', sun: 2, amb: 1.2, ground: '#efeaf7' },
} as const;
export type Sky = keyof typeof SKIES;

export interface CamKey { t: number; pos: V3; look: V3; fov?: number }
export interface Follow { path: Key[]; offset?: V3; look?: V3; y?: number }

const Rig: React.FC<{ pos: V3; look: V3; fov: number }> = ({ pos, look, fov }) => {
  const { camera } = useThree();
  camera.position.set(...pos);
  const cam = camera as THREE.PerspectiveCamera;
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  camera.lookAt(...look);
  return null;
};

/**
 * A 3D shot. `cam`: one {pos, look} or keyframes [{t, pos, look, fov?}] (eased), or `follow` a path
 * (a chase cam: `offset` from the target, `look` ahead of it). `shake` (0–1) for impacts and speed.
 * `sky`: day | dusk | night | overcast | studio, or [top, bottom] colours. `tint` washes the whole shot (e.g. red for rage).
 */
export const World: React.FC<{ children?: React.ReactNode; cam?: CamKey | CamKey[]; follow?: Follow; fov?: number; sky?: Sky | [string, string]; shake?: number; tint?: string; fog?: [number, number] }> = ({ children, cam, follow, fov = 50, sky = 'day', shake = 0, tint, fog = [30, 140] }) => {
  const { w, h } = useFormat();
  const t = useTime();
  const s = Array.isArray(sky) ? { top: sky[0], bottom: sky[1], sun: 2, amb: 1, ground: '#8fd16a' } : SKIES[sky];
  let pos: V3 = [0, 3, 10], look: V3 = [0, 1, 0], f = fov;
  if (follow) {
    const [x, z] = at2(follow.path, t);
    const o = follow.offset ?? [0, 3.2, -8];
    const l = follow.look ?? [0, 1, 6];
    pos = [x + o[0], (follow.y ?? 0) + o[1], z + o[2]];
    look = [x + l[0], (follow.y ?? 0) + l[1], z + l[2]];
  } else if (cam) {
    const keys = Array.isArray(cam) ? cam : [{ ...cam, t: 0 }];
    const v = track(keys.map((k) => [k.t, ...k.pos, ...k.look, k.fov ?? fov]), t);
    pos = [v[0], v[1], v[2]]; look = [v[3], v[4], v[5]]; f = v[6];
  }
  if (shake > 0) {
    const k = shake * 0.12;
    pos = [pos[0] + Math.sin(t * 47) * k, pos[1] + Math.sin(t * 59 + 1) * k, pos[2] + Math.cos(t * 53) * k];
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${s.top} 0%, ${s.bottom} 62%)` }}>
      <ThreeCanvas width={w} height={h} camera={{ fov: f, near: 0.1, far: 600, position: pos }} style={{ position: 'absolute', inset: 0 }}>
        <Rig pos={pos} look={look} fov={f} />
        <fog attach="fog" args={[s.bottom, fog[0], fog[1]]} />
        <hemisphereLight args={[s.top, s.ground, s.amb]} />
        <directionalLight position={[8, 14, 6]} intensity={s.sun} />
        <directionalLight position={[-6, 5, -8]} intensity={s.sun * 0.25} />
        {children}
      </ThreeCanvas>
      {tint && <div style={{ position: 'absolute', inset: 0, background: tint, mixBlendMode: 'multiply', opacity: 0.55 }} />}
    </div>
  );
};

/** Grass to the horizon. */
export const Ground: React.FC<{ color?: string; size?: number }> = ({ color = '#7cc85a', size = 1200 }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
    <planeGeometry args={[size, size]} />
    <meshStandardMaterial color={color} roughness={1} />
  </mesh>
);

/**
 * A straight road along z (from `from` to `to`), centred on x. `lanes` 2 or 4 (motorway: barrier in the middle).
 * Rotate the whole thing with `face`.
 */
export const Road: React.FC<{ x?: number; from?: number; to?: number; width?: number; lanes?: 2 | 4; face?: number; color?: string; barrier?: boolean }> = ({ x = 0, from = -60, to = 300, width = 8, lanes = 2, face = 0, color = '#3d4148', barrier }) => {
  const len = to - from;
  const mid = (from + to) / 2;
  const dashes = Math.floor(len / 6);
  const laneXs = lanes === 4 ? [-width / 4, width / 4] : [0];
  return (
    <group position={[x, 0, 0]} rotation={[0, deg(face), 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, mid]}>
        <planeGeometry args={[width, len]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {[-1, 1].map((sd) => <BoxM key={sd} s={[0.18, 0.02, len]} p={[sd * (width / 2 - 0.3), 0.02, mid]} c="#f4f4f4" />)}
      {laneXs.map((lx) => Array.from({ length: dashes }, (_, i) => <BoxM key={`${lx}-${i}`} s={[0.16, 0.02, 2.2]} p={[lx, 0.02, from + i * 6 + 3]} c="#f4f4f4" />))}
      {(barrier || lanes === 4) && <BoxM s={[0.35, 0.7, len]} p={[lanes === 4 ? 0 : width / 2 + 0.5, 0.35, mid]} c="#c9ced6" />}
    </group>
  );
};

/** A low-poly tree (`kind` pine | round). */
export const Tree: React.FC<Placed & { kind?: 'pine' | 'round'; color?: string }> = ({ pos = [0, 0, 0], scale = 1, kind = 'pine', color, at }) => {
  const t = useTime();
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  return (
    <group position={pos} scale={scale * k}>
      <BoxM s={[0.35, 1.2, 0.35]} p={[0, 0.6, 0]} c="#8a5a35" />
      {kind === 'pine' ? (
        <>
          <mesh position={[0, 1.9, 0]}><coneGeometry args={[1.2, 1.8, 7]} /><Mat c={color ?? '#3f9a45'} /></mesh>
          <mesh position={[0, 2.9, 0]}><coneGeometry args={[0.85, 1.5, 7]} /><Mat c={color ?? '#4cae4f'} /></mesh>
        </>
      ) : (
        <mesh position={[0, 2.2, 0]}><icosahedronGeometry args={[1.2, 0]} /><Mat c={color ?? '#4cae4f'} /></mesh>
      )}
      <Blob r={1.1} />
    </group>
  );
};

/** Rows of trees and bushes on both sides of a road (z from → to), seeded so every frame matches. */
export const Trees: React.FC<{ from?: number; to?: number; gap?: number; side?: number; spread?: number; seed?: string; bushes?: boolean }> = ({ from = -40, to = 260, gap = 9, side = 7, spread = 18, seed = 'trees', bushes = true }) => {
  const items = useMemo(() => {
    const out: { x: number; z: number; s: number; kind: 'pine' | 'round' | 'bush' }[] = [];
    for (let z = from, i = 0; z < to; z += gap, i++)
      for (const sd of [-1, 1]) {
        const r = rand(`${seed}${i}${sd}`);
        out.push({ x: sd * (side + rand(`${seed}x${i}${sd}`) * spread), z: z + (r - 0.5) * gap, s: 0.8 + r * 0.7, kind: bushes && r < 0.3 ? 'bush' : r < 0.75 ? 'pine' : 'round' });
      }
    return out;
  }, [from, to, gap, side, spread, seed, bushes]);
  return (
    <>
      {items.map((it, i) => it.kind === 'bush'
        ? <mesh key={i} position={[it.x, 0.45 * it.s, it.z]} scale={it.s}><icosahedronGeometry args={[0.7, 0]} /><Mat c="#3e9a48" /></mesh>
        : <Tree key={i} pos={[it.x, 0, it.z]} scale={it.s} kind={it.kind} />)}
    </>
  );
};

/** A simple house: walls with windows, a door, a gable roof. */
export const House: React.FC<Placed & { w?: number; d?: number; floors?: number; wall?: string; roof?: string; win?: string }> = ({ pos = [0, 0, 0], face = 0, scale = 1, w = 7, d = 6, floors = 2, wall = '#eeeae4', roof = '#c8423a', win = '#5b9bd5' }) => {
  const h = floors * 2.8;
  const roofGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 - 0.4, 0); s.lineTo(w / 2 + 0.4, 0); s.lineTo(0, w * 0.38); s.lineTo(-w / 2 - 0.4, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: d + 0.6, bevelEnabled: false });
    g.translate(0, 0, -(d + 0.6) / 2);
    return g;
  }, [w, d]);
  const wins: V3[] = [];
  for (let f = 0; f < floors; f++) for (const x of [-w / 3, w / 3]) wins.push([x, 1.6 + f * 2.8, d / 2 + 0.03]);
  if (floors > 1) wins.push([0, 1.6 + 2.8, d / 2 + 0.03]);
  return (
    <group position={pos} rotation={[0, deg(face), 0]} scale={scale}>
      <BoxM s={[w, h, d]} p={[0, h / 2, 0]} c={wall} />
      <mesh geometry={roofGeo} position={[0, h, 0]}><Mat c={roof} /></mesh>
      {wins.map((p, i) => <BoxM key={i} s={[1.1, 1.1, 0.06]} p={p} c={win} />)}
      <BoxM s={[1.2, 2.1, 0.08]} p={[0, 1.05, d / 2 + 0.04]} c="#5a3b2a" />
      <Blob r={w * 0.62} sz={d / w} o={0.18} />
    </group>
  );
};

/** A block of flats (grey slab, rows of windows). */
export const Block: React.FC<Placed & { w?: number; d?: number; floors?: number; wall?: string }> = ({ pos = [0, 0, 0], face = 0, w = 14, d = 8, floors = 6, wall = '#cfd3d8' }) => {
  const h = floors * 2.7;
  const wins: V3[] = [];
  for (let f = 0; f < floors; f++) for (let i = 0; i < Math.floor(w / 2.4); i++) wins.push([-w / 2 + 1.4 + i * 2.4, 1.5 + f * 2.7, d / 2 + 0.03]);
  return (
    <group position={pos} rotation={[0, deg(face), 0]}>
      <BoxM s={[w, h, d]} p={[0, h / 2, 0]} c={wall} />
      {wins.map((p, i) => <BoxM key={i} s={[1.2, 1.2, 0.06]} p={p} c={rand(`bw${i}`) > 0.8 ? '#f3d27a' : '#6d8fb5'} />)}
      <Blob r={w * 0.6} sz={d / w} o={0.15} />
    </group>
  );
};

/**
 * A boxy car. `path` drives it (wheels turn, it faces where it goes). `kind` sedan | hatch | van.
 * `brake` lights the tail lights; `flames` puts two rocket flames on the roof; `smoke` puffs from the back; `bounce` for comedy.
 */
export const Car: React.FC<Placed & { color?: string; plate?: string; kind?: 'sedan' | 'hatch' | 'van'; siren?: boolean | string; brake?: boolean; flames?: boolean | number; smoke?: boolean; bounce?: number; tilt?: number }> = (props) => {
  const { color = '#c9ccd1', plate, kind = 'sedan', siren, brake, flames, smoke, bounce = 0, tilt = 0, scale = 1, at } = props;
  const { p, r, d, t } = usePlace(props);
  const plateTex = useTextTexture(plate ?? '', 256, 56, '#ffffff', '#111111', '#1f4fbf');
  const sirenTex = useTextTexture(typeof siren === 'string' ? siren : 'POLICJA', 512, 64, '#ffffff', '#1d3f9e');
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const L = kind === 'van' ? 4.6 : kind === 'hatch' ? 3.7 : 4.3;
  const cabinL = kind === 'van' ? 3.2 : kind === 'hatch' ? 2.2 : 2.1;
  const cabinZ = kind === 'van' ? -0.4 : kind === 'hatch' ? -0.45 : -0.2;
  const spin = d / 0.38;
  const hop = bounce ? Math.abs(Math.sin(t * 9)) * 0.25 * bounce : 0;
  const glass = '#2c3e55';
  const wheels: V3[] = [[-0.95, 0.38, L * 0.31], [0.95, 0.38, L * 0.31], [-0.95, 0.38, -L * 0.31], [0.95, 0.38, -L * 0.31]];
  const fl = flames ? (typeof flames === 'number' ? flames : 1) : 0;
  return (
    <group position={[p[0], p[1] + hop, p[2]]} rotation={[0, r, deg(tilt)]} scale={scale * k}>
      <BoxM s={[1.9, 0.75, L]} p={[0, 0.75, 0]} c={color} />
      <BoxM s={[1.66, 0.62, cabinL]} p={[0, 1.42, cabinZ]} c={color} />
      <BoxM s={[1.6, 0.48, 0.06]} p={[0, 1.42, cabinZ + cabinL / 2 + 0.01]} c={glass} />
      <BoxM s={[1.6, 0.48, 0.06]} p={[0, 1.42, cabinZ - cabinL / 2 - 0.01]} c={glass} />
      {[-1, 1].map((sd) => <BoxM key={sd} s={[0.06, 0.44, cabinL - 0.3]} p={[sd * 0.84, 1.42, cabinZ]} c={glass} />)}
      {[-0.65, 0.65].map((x) => <BoxM key={`h${x}`} s={[0.42, 0.2, 0.06]} p={[x, 0.85, L / 2 + 0.01]} c="#fff6d5" e="#fff3c0" ei={0.6} />)}
      {[-0.68, 0.68].map((x) => <BoxM key={`t${x}`} s={[0.48, 0.18, 0.06]} p={[x, 0.9, -L / 2 - 0.01]} c="#ff3b30" e="#ff2a1f" ei={brake ? 2.5 : 0.4} />)}
      <BoxM s={[1.96, 0.22, 0.12]} p={[0, 0.45, L / 2 + 0.02]} c="#2a2d33" />
      <BoxM s={[1.96, 0.22, 0.12]} p={[0, 0.45, -L / 2 - 0.02]} c="#2a2d33" />
      {plate && <mesh position={[0, 0.62, -L / 2 - 0.09]} rotation={[0, Math.PI, 0]}><planeGeometry args={[0.9, 0.2]} /><meshBasicMaterial map={plateTex} /></mesh>}
      {wheels.map((w, i) => (
        <group key={i} position={w} rotation={[spin, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.38, 0.38, 0.32, 14]} /><Mat c="#1d1f23" /></mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[w[0] > 0 ? 0.17 : -0.17, 0, 0]}><cylinderGeometry args={[0.2, 0.2, 0.02, 10]} /><Mat c="#b8bcc4" /></mesh>
        </group>
      ))}
      {siren && (() => {
        const on = Math.floor(t * 6) % 2 === 0;
        return (
          <>
            <BoxM s={[0.5, 0.16, 0.3]} p={[-0.27, 1.81, cabinZ]} c="#ff2d2d" e="#ff2d2d" ei={on ? 3 : 0.2} />
            <BoxM s={[0.5, 0.16, 0.3]} p={[0.27, 1.81, cabinZ]} c="#2d6bff" e="#2d6bff" ei={on ? 0.2 : 3} />
            {[-1, 1].map((sd) => <mesh key={sd} position={[sd * 0.955, 0.8, 0]} rotation={[0, sd * Math.PI / 2, 0]}><planeGeometry args={[L * 0.8, 0.3]} /><meshBasicMaterial map={sirenTex} /></mesh>)}
          </>
        );
      })()}
      {fl > 0 && [-0.45, 0.45].map((x, i) => <Flame key={x} pos={[x, 1.73, cabinZ - 0.2]} size={fl} seed={i} />)}
      {smoke && <Puffs pos={[0.6, 0.45, -L / 2 - 0.3]} />}
      <Blob r={1.3} sx={1} sz={L / 2.4} o={0.28} />
    </group>
  );
};

/** A flickering low-poly flame (rocket boost, fire). */
export const Flame: React.FC<{ pos?: V3; size?: number; seed?: number }> = ({ pos = [0, 0, 0], size = 1, seed = 0 }) => {
  const t = useTime();
  const f = 1 + Math.sin(t * 31 + seed * 2) * 0.12 + Math.sin(t * 17 + seed) * 0.08;
  return (
    <group position={pos} scale={[size, size * f, size]}>
      <mesh position={[0, 0.9, 0]}><coneGeometry args={[0.32, 1.8, 8]} /><meshStandardMaterial color="#ffb52e" emissive="#ff8a00" emissiveIntensity={1.4} flatShading /></mesh>
      <mesh position={[0, 0.55, 0]}><coneGeometry args={[0.18, 1, 8]} /><meshStandardMaterial color="#fff2a8" emissive="#ffe27a" emissiveIntensity={2} flatShading /></mesh>
    </group>
  );
};

/** Grey smoke puffs rising and fading (exhaust, a crash, a burnout). */
export const Puffs: React.FC<{ pos?: V3; count?: number; color?: string; big?: number }> = ({ pos = [0, 0, 0], count = 6, color = '#d9dbe0', big = 1 }) => {
  const t = useTime();
  return (
    <group position={pos}>
      {Array.from({ length: count }, (_, i) => {
        const life = 1.4;
        const a = ((t + i * (life / count)) % life) / life;
        const s = (0.2 + a * 0.8) * big;
        return (
          <mesh key={i} position={[(rand(`px${i}`) - 0.5) * 0.6, a * 1.4 * big, -a * 0.8]} scale={s}>
            <icosahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color={color} flatShading transparent opacity={(1 - a) * 0.85} />
          </mesh>
        );
      })}
    </group>
  );
};

/**
 * A blocky person. Walks when moving along `path`. `cry` adds falling tears, `wave` raises an arm,
 * `jump` hops, `mood` sets the mouth (smile | sad | shout | flat). `hat`: cap | helmet | hair | none.
 */
export const Person: React.FC<Placed & { skin?: string; shirt?: string; pants?: string; hair?: string; hat?: 'cap' | 'helmet' | 'hair' | 'none'; hatColor?: string; cry?: boolean; wave?: boolean; jump?: boolean; mood?: 'smile' | 'sad' | 'shout' | 'flat'; height?: number }> = (props) => {
  const { skin = '#e9b98f', shirt = '#3d7dd8', pants = '#2c3e66', hair = '#5a3b22', hat = 'hair', hatColor = '#d23a2f', cry, wave, jump, mood = 'flat', scale = 1, height = 1, at } = props;
  const { p, r, d, moving, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const swing = moving ? Math.sin(d * 3.2) * 0.6 : 0;
  const bob = moving ? Math.abs(Math.sin(d * 3.2)) * 0.06 : 0;
  const hop = jump ? Math.abs(Math.sin(t * 6)) * 0.6 : 0;
  const breathe = Math.sin(t * 2.2) * 0.015;
  const waveA = wave ? -2.6 + Math.sin(t * 10) * 0.35 : 0;
  const mouth = mood === 'smile' ? { s: [0.22, 0.05, 0.02] as V3, y: 1.86 } : mood === 'shout' ? { s: [0.16, 0.14, 0.02] as V3, y: 1.85 } : mood === 'sad' ? { s: [0.2, 0.04, 0.02] as V3, y: 1.83 } : { s: [0.16, 0.035, 0.02] as V3, y: 1.86 };
  return (
    <group position={[p[0], p[1] + bob + hop, p[2]]} rotation={[0, r, 0]} scale={[scale * k, scale * k * height, scale * k]}>
      {/* legs */}
      {[-0.13, 0.13].map((x, i) => (
        <group key={x} position={[x, 0.82, 0]} rotation={[(i ? -1 : 1) * swing, 0, 0]}>
          <BoxM s={[0.24, 0.78, 0.26]} p={[0, -0.4, 0]} c={pants} />
          <BoxM s={[0.26, 0.12, 0.34]} p={[0, -0.76, 0.04]} c="#f2f2f2" />
        </group>
      ))}
      {/* body */}
      <BoxM s={[0.6, 0.72 + breathe, 0.34]} p={[0, 1.2, 0]} c={shirt} />
      {/* arms */}
      {[-0.4, 0.4].map((x, i) => (
        <group key={x} position={[x, 1.5, 0]} rotation={[i === 1 && wave ? 0 : (i ? 1 : -1) * swing, 0, i === 1 && wave ? -waveA * 0.4 : 0]}>
          <group rotation={[i === 1 && wave ? waveA : 0, 0, 0]}>
            <BoxM s={[0.2, 0.66, 0.24]} p={[0, -0.3, 0]} c={shirt} />
            <BoxM s={[0.18, 0.14, 0.2]} p={[0, -0.68, 0]} c={skin} />
          </group>
        </group>
      ))}
      {/* head */}
      <BoxM s={[0.52, 0.52, 0.5]} p={[0, 1.86, 0]} c={skin} />
      {[-0.12, 0.12].map((x) => <BoxM key={x} s={[0.07, 0.09, 0.02]} p={[x, 1.92, 0.26]} c="#1a1a1a" />)}
      <BoxM s={mouth.s} p={[0, mouth.y - 0.1, 0.26]} c={mood === 'shout' ? '#5b1d1d' : '#7a3b2e'} />
      {hat === 'hair' && <BoxM s={[0.56, 0.16, 0.54]} p={[0, 2.16, -0.01]} c={hair} />}
      {hat === 'cap' && <><BoxM s={[0.56, 0.16, 0.54]} p={[0, 2.18, 0]} c={hatColor} /><BoxM s={[0.5, 0.05, 0.26]} p={[0, 2.12, 0.36]} c={hatColor} /></>}
      {hat === 'helmet' && <BoxM s={[0.6, 0.3, 0.58]} p={[0, 2.12, 0]} c={hatColor} />}
      {cry && [-0.12, 0.12].map((x, i) => Array.from({ length: 3 }, (_, j) => {
        const a = ((t * 1.6 + j / 3 + i * 0.17) % 1);
        return <BoxM key={`${x}-${j}`} s={[0.06, 0.1, 0.04]} p={[x, 1.84 - a * 0.9, 0.27 + a * 0.12]} c="#6cc3ff" e="#6cc3ff" ei={0.4} o={1 - a} />;
      }))}
      <Blob r={0.45} />
    </group>
  );
};

/** A pigeon / bird. Flaps when `fly` or when moving along a `path` (give `pos[1]` for height). */
export const Bird: React.FC<Placed & { color?: string; fly?: boolean }> = (props) => {
  const { color = '#8c95a3', fly, scale = 1, at } = props;
  const { p, r, moving, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const flap = fly || moving ? Math.sin(t * 22) * 0.9 : 1.35; // resting: wings folded down along the body
  const peck = !fly && !moving ? Math.max(0, Math.sin(t * 3)) * 0.3 : 0;
  return (
    <group position={p} rotation={[0, r, 0]} scale={scale * k}>
      <BoxM s={[0.34, 0.3, 0.5]} p={[0, 0.3, 0]} c={color} />
      <group position={[0, 0.5, 0.22]} rotation={[peck, 0, 0]}>
        <BoxM s={[0.22, 0.22, 0.22]} p={[0, 0.05, 0.04]} c="#6b7480" />
        <BoxM s={[0.08, 0.06, 0.12]} p={[0, 0.02, 0.2]} c="#f0a23a" />
        {[-0.08, 0.08].map((x) => <BoxM key={x} s={[0.04, 0.04, 0.02]} p={[x, 0.1, 0.15]} c="#ff7a1a" />)}
      </group>
      {[-1, 1].map((sd) => <group key={sd} position={[sd * 0.17, 0.4, 0]} rotation={[0, 0, sd * flap]}><BoxM s={[0.4, 0.05, 0.36]} p={[sd * 0.2, 0, 0]} c="#a3abb7" /></group>)}
      <BoxM s={[0.2, 0.06, 0.22]} p={[0, 0.3, -0.32]} c="#5d6570" />
      {!(fly || moving) && p[1] < 0.1 && <Blob r={0.25} />}
    </group>
  );
};

/** Low-poly clouds drifting in the sky. */
export const Clouds: React.FC<{ count?: number; y?: number; seed?: string }> = ({ count = 7, y = 26, seed = 'cl' }) => {
  const t = useTime();
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = (rand(`${seed}x${i}`) - 0.5) * 140 + t * 0.6;
        const z = 30 + rand(`${seed}z${i}`) * 160;
        const s = 2 + rand(`${seed}s${i}`) * 3;
        return (
          <group key={i} position={[x, y + rand(`${seed}y${i}`) * 10, z]} scale={s}>
            {[[0, 0, 0, 1], [0.9, -0.15, 0.1, 0.75], [-0.9, -0.2, 0, 0.7]].map(([cx, cy, cz, r], j) => (
              <mesh key={j} position={[cx, cy, cz]}><icosahedronGeometry args={[r, 0]} /><meshStandardMaterial color="#ffffff" flatShading /></mesh>
            ))}
          </group>
        );
      })}
    </>
  );
};

/** A road sign / billboard with text on it. */
export const Sign: React.FC<Placed & { text: string; bg?: string; fg?: string; w?: number; h?: number; pole?: number }> = ({ pos = [0, 0, 0], face = 0, text, bg = '#1f7a3a', fg = '#ffffff', w = 3, h = 1.1, pole = 2.4 }) => {
  const tex = useTextTexture(text, 512, Math.round(512 * (h / w)), bg, fg);
  return (
    <group position={pos} rotation={[0, deg(face), 0]}>
      {[-w / 3, w / 3].map((x) => <BoxM key={x} s={[0.12, pole, 0.12]} p={[x, pole / 2, 0]} c="#9aa1ab" />)}
      <mesh position={[0, pole + h / 2, 0.07]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} /></mesh>
      <BoxM s={[w + 0.1, h + 0.1, 0.1]} p={[0, pole + h / 2, 0]} c="#e8e8e8" />
    </group>
  );
};

/** Any coloured box (props, furniture, a sofa, a TV…). */
export const Prop: React.FC<Placed & { size?: V3; color?: string; y?: number }> = ({ pos = [0, 0, 0], face = 0, size = [1, 1, 1], color = '#cccccc' }) => (
  <group position={pos} rotation={[0, deg(face), 0]}>
    <BoxM s={size} p={[0, size[1] / 2, 0]} c={color} />
  </group>
);

// ---------- flat overlays (HTML on top of the 3D) ----------

const useIn = (at: number, out?: number) => {
  const t = useTime();
  if (t < at || (out !== undefined && t > out + 0.25)) return null;
  const p = ramp(t, at, at + 0.35, ease.back);
  const q = out === undefined ? 0 : ramp(t, out, out + 0.25, ease.inOut);
  return { p, q, t };
};

/** Name tag over a character (yellow text on a dark pill). x/y in px on a 1080-wide frame. */
export const Tag: React.FC<{ text: string; x: number; y: number; at?: number; out?: number; color?: string }> = ({ text, x, y, at = 0, out, color = '#ffd33d' }) => {
  const s = useIn(at, out);
  const th = useTheme();
  const { u } = useFormat();
  if (!s) return null;
  return (
    <div style={{ position: 'absolute', left: u(x), top: u(y), transform: `translate(-50%, -50%) scale(${mix(0.6, 1, s.p) * (1 - s.q * 0.3)})`, opacity: 1 - s.q, padding: `${u(10)}px ${u(22)}px`, borderRadius: u(14), background: 'rgba(28,28,30,.92)', border: `${u(3)}px solid ${color}`, color, fontFamily: font(th.display), fontWeight: 800, fontSize: u(40), whiteSpace: 'nowrap', boxShadow: `0 ${u(8)}px ${u(24)}px rgba(0,0,0,.35)` }}>{text}</div>
  );
};

/** A small white pill: emoji + text, optional ❌/✅ mark (`mark`), `dark` variant. Stack several with different y. */
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

/** Big speedometer number counting from → to (km/h), red when over `limit`. */
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

/** A big shouted word in a dark box (ZURÜCK!, STOP!, NIE!), optional small `sub` pill under it. Shakes on entry. */
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
