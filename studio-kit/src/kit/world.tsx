// The 3D world for story reels (built from code, not generated images): a camera, a sky, real sun shadows, weather,
// and the ground things stand on. The models that live in it are in people / animals / vehicles / places / things / sets.
//
//   <Scene dur={3.2}>
//     <World sky="day" cam={[{ t: 0, pos: [4, 2.4, 7], look: [0, 1.2, 0] }, { t: 3.2, pos: [2.5, 2, 5], look: [0, 1.3, 0] }]}>
//       <Scenery kind="park" />
//       <Person pos={[-0.8, 0, 0]} shirt="#c0392b" mood="smile" wave />
//       <Animal kind="dog" pos={[0.8, 0, 0.4]} happy />
//     </World>
//     <Tag text="Marek, 34" x={420} y={520} />
//   </Scene>
import React, { useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rand, useFormat, useTime } from './stage';
import { at2, BoxM, deg, kitWarn, track, type Key, type V3 } from './core3d';

const SKIES = {
  day: { top: '#6fb1ee', bottom: '#e3f0fb', sun: 2.6, amb: 1.0, ground: '#8fd16a', sunColor: '#fff6e6' },
  morning: { top: '#8cc4ef', bottom: '#ffe9c9', sun: 2.2, amb: 0.95, ground: '#93cf70', sunColor: '#ffe2b0' },
  sunset: { top: '#4a4c86', bottom: '#ffb37a', sun: 1.9, amb: 0.75, ground: '#7aa458', sunColor: '#ffb070' },
  dusk: { top: '#3b3f6b', bottom: '#f2a174', sun: 1.4, amb: 0.7, ground: '#6c9a4f', sunColor: '#ffb48a' },
  night: { top: '#060915', bottom: '#1c2340', sun: 0.45, amb: 0.4, ground: '#2b4a2a', sunColor: '#9db4ff' },
  overcast: { top: '#9aa3ad', bottom: '#d9dde1', sun: 1.1, amb: 1.25, ground: '#86b56a', sunColor: '#ffffff' },
  snow: { top: '#aebccb', bottom: '#eef3f8', sun: 1.5, amb: 1.3, ground: '#f2f6fa', sunColor: '#ffffff' },
  studio: { top: '#e9e4f5', bottom: '#ffffff', sun: 2, amb: 1.2, ground: '#efeaf7', sunColor: '#ffffff' },
  indoor: { top: '#d9cdbd', bottom: '#f3ece2', sun: 1.5, amb: 1.25, ground: '#cdb89c', sunColor: '#fff1dc' },
  space: { top: '#02030a', bottom: '#0d1030', sun: 1.8, amb: 0.45, ground: '#3a3d55', sunColor: '#ffffff' },
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

/** The sun: one shadow-casting light that follows what the camera looks at, so shadows are always sharp there. */
const Sun: React.FC<{ look: V3; intensity: number; color: string; reach: number }> = ({ look, intensity, color, reach }) => {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight();
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.bias = -0.0005;
    l.shadow.normalBias = 0.04;
    return l;
  }, []);
  const c = light.shadow.camera;
  if (c.right !== reach) { c.left = -reach; c.right = reach; c.top = reach; c.bottom = -reach; c.near = 1; c.far = 160; c.updateProjectionMatrix(); }
  light.color.set(color);
  light.intensity = intensity;
  light.position.set(look[0] + 16, 30, look[2] + 12);
  light.target.position.set(look[0], 0, look[2]);
  light.target.updateMatrixWorld();
  return <><primitive object={light} /><primitive object={light.target} /></>;
};

/**
 * A 3D shot. `cam`: one {pos, look} or keyframes [{t, pos, look, fov?}] (eased), or `follow` a path
 * (a chase cam: `offset` from the target, `look` ahead of it). `shake` (0–0.15) only for a real impact.
 * `sky`: day | morning | sunset | dusk | night | overcast | snow | studio | indoor | space, or [top, bottom] colours.
 * `tint` washes the whole shot (e.g. "#ff6a5a" for rage). `fog` [near, far] in metres.
 */
export const World: React.FC<{ children?: React.ReactNode; cam?: CamKey | CamKey[]; follow?: Follow; fov?: number; sky?: Sky | [string, string]; shake?: number; tint?: string; fog?: [number, number]; shadows?: boolean }> = ({ children, cam, follow, fov = 50, sky = 'day', shake = 0, tint, fog = [35, 160], shadows = true }) => {
  const { w, h } = useFormat();
  const t = useTime();
  let s: { top: string; bottom: string; sun: number; amb: number; ground: string; sunColor: string };
  if (Array.isArray(sky)) s = { top: sky[0], bottom: sky[1], sun: 2, amb: 1, ground: '#8fd16a', sunColor: '#ffffff' };
  else if (SKIES[sky]) s = SKIES[sky];
  else { kitWarn(`World sky "${String(sky)}" does not exist (available: ${Object.keys(SKIES).join(', ')} or [top, bottom] colours). Used "day".`); s = SKIES.day; }
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
  if (pos[1] < 0.25) pos = [pos[0], 0.25, pos[2]]; // never under the ground
  if (shake > 0) {
    const k = Math.min(shake, 0.4) * 0.12;
    pos = [pos[0] + Math.sin(t * 47) * k, pos[1] + Math.sin(t * 59 + 1) * k, pos[2] + Math.cos(t * 53) * k];
  }
  // the shadow map covers what the camera can see near its target
  const reach = Math.min(60, Math.max(14, Math.hypot(pos[0] - look[0], pos[1] - look[1], pos[2] - look[2]) * 1.5));
  return (
    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${s.top} 0%, ${s.bottom} 62%)` }}>
      <ThreeCanvas width={w} height={h} shadows={shadows ? 'soft' : false} camera={{ fov: f, near: 0.1, far: 600, position: pos }} style={{ position: 'absolute', inset: 0 }}>
        <Rig pos={pos} look={look} fov={f} />
        <fog attach="fog" args={[s.bottom, fog[0], fog[1]]} />
        <hemisphereLight args={[s.top, s.ground, s.amb]} />
        {shadows ? <Sun look={look} intensity={s.sun} color={s.sunColor} reach={reach} /> : <directionalLight position={[8, 14, 6]} intensity={s.sun} color={s.sunColor} />}
        <directionalLight position={[-6, 5, -8]} intensity={s.sun * 0.22} />
        {children}
      </ThreeCanvas>
      {tint && <div style={{ position: 'absolute', inset: 0, background: tint, mixBlendMode: 'multiply', opacity: 0.55 }} />}
    </div>
  );
};

const GROUNDS: Record<string, string> = { grass: '#7cc85a', sand: '#e8d6a0', snow: '#f1f5f9', dirt: '#9a7b56', asphalt: '#4a4e55', concrete: '#b9bcc0', wood: '#c49a6c', tiles: '#e6e1d8', carpet: '#8d6f9c', moon: '#9a9cab', water: '#3e8fd0', stage: '#2a2a33' };
/** The ground to the horizon. `kind`: grass | sand | snow | dirt | asphalt | concrete | wood | tiles | carpet | moon | stage — or any `color`. */
export const Ground: React.FC<{ kind?: string; color?: string; size?: number }> = ({ kind = 'grass', color, size = 1200 }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
    <planeGeometry args={[size, size]} />
    <meshStandardMaterial color={color ?? GROUNDS[kind] ?? GROUNDS.grass} roughness={1} />
  </mesh>
);

/**
 * A straight road along z (from `from` to `to`), centred on x. `lanes` 2 or 4 (motorway: barrier in the middle).
 * `walk` adds pavements on both sides. Rotate the whole thing with `face`.
 */
export const Road: React.FC<{ x?: number; from?: number; to?: number; width?: number; lanes?: 2 | 4; face?: number; color?: string; barrier?: boolean; walk?: boolean }> = ({ x = 0, from = -60, to = 300, width = 8, lanes = 2, face = 0, color = '#3d4148', barrier, walk }) => {
  const len = to - from;
  const mid = (from + to) / 2;
  const dashes = Math.floor(len / 6);
  const laneXs = lanes === 4 ? [-width / 4, width / 4] : [0];
  return (
    <group position={[x, 0, 0]} rotation={[0, deg(face), 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, mid]} receiveShadow>
        <planeGeometry args={[width, len]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {[-1, 1].map((sd) => <BoxM key={sd} s={[0.18, 0.02, len]} p={[sd * (width / 2 - 0.3), 0.02, mid]} c="#f4f4f4" />)}
      {laneXs.map((lx) => Array.from({ length: dashes }, (_, i) => <BoxM key={`${lx}-${i}`} s={[0.16, 0.02, 2.2]} p={[lx, 0.02, from + i * 6 + 3]} c="#f4f4f4" />))}
      {(barrier || lanes === 4) && <BoxM s={[0.35, 0.7, len]} p={[lanes === 4 ? 0 : width / 2 + 0.5, 0.35, mid]} c="#c9ced6" />}
      {walk && [-1, 1].map((sd) => <BoxM key={`w${sd}`} s={[2.4, 0.16, len]} p={[sd * (width / 2 + 1.2), 0.08, mid]} c="#c9cbd0" />)}
    </group>
  );
};

/** A footpath / pavement / carpet strip: a flat band from → to along z. */
export const Path: React.FC<{ x?: number; from?: number; to?: number; width?: number; face?: number; color?: string }> = ({ x = 0, from = -20, to = 40, width = 2.2, face = 0, color = '#d8c9a8' }) => (
  <group position={[x, 0, 0]} rotation={[0, deg(face), 0]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, (from + to) / 2]} receiveShadow>
      <planeGeometry args={[width, to - from]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  </group>
);

/** Water: a lake, a pool, the sea (`size` [w, d]; gentle moving glints). */
export const Water: React.FC<{ pos?: V3; size?: [number, number]; color?: string; round?: boolean }> = ({ pos = [0, 0, 0], size = [14, 10], color = '#3f93d6', round }) => {
  const t = useTime();
  return (
    <group position={[pos[0], pos[1] + 0.02, pos[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow scale={round ? [size[0] / 2, size[1] / 2, 1] : [1, 1, 1]}>
        {round ? <circleGeometry args={[1, 40]} /> : <planeGeometry args={size} />}
        <meshStandardMaterial color={color} roughness={0.25} metalness={0.15} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (t * 0.25 + rand(`wt${i}`)) % 1;
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[(rand(`wx${i}`) - 0.5) * size[0] * (round ? 0.6 : 0.85), 0.01, (rand(`wz${i}`) - 0.5) * size[1] * (round ? 0.6 : 0.85) + a * 0.6]}>
            <planeGeometry args={[0.5 + rand(`ww${i}`) * 0.9, 0.06]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={Math.sin(a * Math.PI) * 0.55} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
};

/** Low-poly clouds drifting in the sky. */
export const Clouds: React.FC<{ count?: number; y?: number; seed?: string; color?: string }> = ({ count = 7, y = 26, seed = 'cl', color = '#ffffff' }) => {
  const t = useTime();
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = (rand(`${seed}x${i}`) - 0.5) * 140 + t * 0.6;
        const z = 30 + rand(`${seed}z${i}`) * 160;
        const s = 2 + rand(`${seed}s${i}`) * 3;
        return (
          <group key={i} position={[x, y + rand(`${seed}y${i}`) * 10, z]} scale={s}>
            {[[0, 0, 0, 1], [0.9, -0.15, 0.1, 0.75], [-0.9, -0.2, 0, 0.7], [0.3, 0.3, -0.2, 0.6]].map(([cx, cy, cz, r], j) => (
              <mesh key={j} position={[cx, cy, cz]}><icosahedronGeometry args={[r, 1]} /><meshStandardMaterial color={color} flatShading /></mesh>
            ))}
          </group>
        );
      })}
    </>
  );
};

/** Stars in a night / space sky (they twinkle a little). */
export const Stars: React.FC<{ count?: number; seed?: string }> = ({ count = 90, seed = 'st' }) => {
  const t = useTime();
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a = rand(`${seed}a${i}`) * Math.PI * 2;
        const el = 0.12 + rand(`${seed}e${i}`) * 1.2;
        const R = 260;
        return (
          <mesh key={i} position={[Math.cos(a) * Math.cos(el) * R, Math.sin(el) * R, Math.sin(a) * Math.cos(el) * R]} scale={0.5 + rand(`${seed}s${i}`) * 1.1}>
            <sphereGeometry args={[0.7, 6, 5]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.55 + Math.sin(t * 2 + i) * 0.35} fog={false} />
          </mesh>
        );
      })}
    </>
  );
};

/** The sun or the moon as a glowing disc in the sky (`moon` for the moon). */
export const SkyDisc: React.FC<{ pos?: V3; size?: number; moon?: boolean; color?: string }> = ({ pos = [-40, 60, 160], size = 14, moon, color }) => (
  <mesh position={pos}>
    <sphereGeometry args={[size / 2, 24, 16]} />
    <meshBasicMaterial color={color ?? (moon ? '#f4f1dc' : '#fff2b8')} fog={false} />
  </mesh>
);

const Falling: React.FC<{ count: number; area: number; height: number; speed: number; centre: V3; render: (i: number) => React.ReactNode; drift?: number; seed: string }> = ({ count, area, height, speed, centre, render, drift = 0, seed }) => {
  const t = useTime();
  return (
    <group position={[centre[0], 0, centre[2]]}>
      {Array.from({ length: count }, (_, i) => {
        const a = (t * speed * (0.7 + rand(`${seed}v${i}`) * 0.6) + rand(`${seed}o${i}`)) % 1;
        return (
          <group key={i} position={[(rand(`${seed}x${i}`) - 0.5) * area + Math.sin(t * 1.3 + i) * drift, height * (1 - a), (rand(`${seed}z${i}`) - 0.5) * area]}>
            {render(i)}
          </group>
        );
      })}
    </group>
  );
};
/** Rain over the area around `pos` (where the action is). */
export const Rain: React.FC<{ pos?: V3; count?: number; area?: number }> = ({ pos = [0, 0, 0], count = 160, area = 26 }) => (
  <Falling count={count} area={area} height={14} speed={1.5} centre={pos} seed="rn" render={() => <mesh><boxGeometry args={[0.025, 0.55, 0.025]} /><meshBasicMaterial color="#cfe6ff" transparent opacity={0.6} /></mesh>} />
);
/** Snow falling around `pos`. */
export const Snow: React.FC<{ pos?: V3; count?: number; area?: number }> = ({ pos = [0, 0, 0], count = 140, area = 26 }) => (
  <Falling count={count} area={area} height={12} speed={0.22} drift={0.5} centre={pos} seed="sn" render={() => <mesh><sphereGeometry args={[0.07, 6, 5]} /><meshBasicMaterial color="#ffffff" /></mesh>} />
);
