// Places for the 3D world: nature (Tree, Trees, Bush, Flowers, Rock, Mountains, Grass), buildings (House, Block,
// Shop, Tower, Barn), rooms (Room, Wall, Door, Window, Picture, Rug), street things (StreetLamp, Bench, Bin,
// TrafficLight, Fence, BusStop, Fountain, Stage) and furniture (Table, Chair, Sofa, Bed, Desk, Shelf, FloorLamp,
// Tv, Fridge, Plant, Cabinet, Stove, Sink, Bath, Toilet, Wardrobe, Screen).
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rand, useTime } from './stage';
import { Blob, deg, Mat, P, pick, popIn, useTextTexture, type Placed, type V3 } from './core3d';
import { shade } from './people';

type At = Placed & { color?: string };
const G: React.FC<Placed & { children: React.ReactNode; shadow?: number }> = ({ pos = [0, 0, 0], face = 0, scale = 1, at, children, shadow = 0 }) => {
  const t = useTime();
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  return <group position={pos} rotation={[0, deg(face), 0]} scale={scale * k}>{shadow > 0 && <Blob r={shadow} />}{children}</group>;
};

// ---------- nature ----------

const TREES = ['pine', 'round', 'palm', 'birch', 'dead', 'blossom', 'autumn', 'apple'] as const;
/** A tree. `kind`: pine | round | palm | birch | dead | blossom | autumn | apple. */
export const Tree: React.FC<At & { kind?: (typeof TREES)[number] }> = ({ kind: kd, color, ...g }) => {
  const kind = pick('Tree', kd, TREES, 'pine');
  const t = useTime();
  const sway = Math.sin(t * 1.2 + (g.pos?.[0] ?? 0)) * 0.02;
  const leaf = color ?? { pine: '#3f9a45', round: '#4cae4f', palm: '#3fa558', birch: '#7cc85a', dead: '#000000', blossom: '#ffb3cf', autumn: '#e2852b', apple: '#4cae4f' }[kind];
  return (
    <G {...g} shadow={1.1}>
      {kind === 'pine' && <><P shape="cyl" size={[0.32, 1.2, 0.32]} pos={[0, 0.6, 0]} color="#7a5234" />{[[1.25, 1.7, 1.75], [1.0, 1.4, 2.6], [0.72, 1.2, 3.35]].map(([r, h, y], i) => <mesh key={i} position={[0, y, 0]} rotation={[0, i, sway]} castShadow><coneGeometry args={[r, h, 9]} /><Mat c={shade(leaf, 1 + i * 0.1)} /></mesh>)}</>}
      {(kind === 'round' || kind === 'blossom' || kind === 'autumn' || kind === 'apple') && <>
        <P shape="cyl" size={[0.34, 1.6, 0.34]} pos={[0, 0.8, 0]} color="#7a5234" />
        <P shape="cyl" size={[0.14, 0.8, 0.14]} pos={[0.3, 1.7, 0]} rot={[0, 0, -40]} color="#7a5234" />
        {[[0, 2.7, 0, 1.9], [0.75, 2.4, 0.2, 1.3], [-0.7, 2.45, -0.1, 1.35], [0.1, 2.35, 0.75, 1.2], [-0.1, 2.5, -0.7, 1.25], [0.2, 3.3, 0.1, 1.2]].map(([x, y, z, s], i) => <mesh key={i} position={[x + sway * y, y, z]} castShadow><icosahedronGeometry args={[s / 2, 1]} /><Mat c={shade(leaf, 0.9 + (i % 3) * 0.1)} /></mesh>)}
        {kind === 'apple' && [[0.6, 2.1, 0.5], [-0.6, 2.2, 0.4], [0.2, 2.0, 0.85], [-0.3, 2.9, 0.75], [0.8, 2.7, -0.1]].map((q, i) => <P key={i} shape="ball" size={0.18} pos={q as V3} color="#d8342c" />)}
      </>}
      {kind === 'palm' && <>
        {[0, 1, 2, 3].map((i) => <P key={i} shape="cyl" size={[0.3 - i * 0.03, 1.0, 0.3 - i * 0.03]} pos={[i * 0.12, 0.5 + i * 0.95, 0]} rot={[0, 0, -8]} color="#9b7a4f" />)}
        {[0, 60, 120, 180, 240, 300].map((a) => <group key={a} position={[0.42, 4.0, 0]} rotation={[0, deg(a), 0]}><P size={[0.5, 0.06, 2.0]} pos={[0, -0.2 + sway * 4, 1.0]} rot={[25, 0, 0]} radius={0.025} color={leaf} /></group>)}
        {[[0.3, 3.8, 0.15], [0.55, 3.8, -0.1]].map((q, i) => <P key={i} shape="ball" size={0.24} pos={q as V3} color="#6b4a32" />)}
      </>}
      {kind === 'birch' && <><P shape="cyl" size={[0.22, 3.2, 0.22]} pos={[0, 1.6, 0]} color="#f1efe8" />{[0.6, 1.3, 2.1].map((y) => <P key={y} shape="box" size={[0.23, 0.05, 0.1]} pos={[0, y, 0.07]} color="#2a2a2a" />)}{[[0, 3.6, 0, 1.5], [0.5, 3.1, 0.2, 1.0], [-0.5, 3.2, -0.1, 1.05]].map(([x, y, z, s], i) => <mesh key={i} position={[x + sway * y, y, z]} scale={[1, 1.25, 1]} castShadow><icosahedronGeometry args={[s / 2, 1]} /><Mat c={shade(leaf, 0.95 + i * 0.08)} /></mesh>)}</>}
      {kind === 'dead' && <><P shape="cyl" size={[0.32, 2.2, 0.32]} pos={[0, 1.1, 0]} color="#5d4a3a" />{[[0.4, 2.3, -45, 1.1], [-0.35, 2.0, 50, 0.9], [0.1, 2.8, -12, 0.9], [-0.5, 2.7, 62, 0.5]].map(([x, y, a, l], i) => <P key={i} shape="cyl" size={[0.1, l, 0.1]} pos={[x, y, 0]} rot={[i * 20 - 20, 0, a]} color="#5d4a3a" />)}</>}
    </G>
  );
};

/** Rows of trees and bushes on both sides of a road / path (z from → to), seeded so every frame matches. */
export const Trees: React.FC<{ from?: number; to?: number; gap?: number; side?: number; spread?: number; seed?: string; bushes?: boolean; kinds?: (typeof TREES)[number][] }> = ({ from = -40, to = 260, gap = 9, side = 7, spread = 18, seed = 'trees', bushes = true, kinds = ['pine', 'pine', 'round'] }) => {
  const items = useMemo(() => {
    const out: { x: number; z: number; s: number; kind: string }[] = [];
    for (let z = from, i = 0; z < to; z += gap, i++)
      for (const sd of [-1, 1]) {
        const r = rand(`${seed}${i}${sd}`);
        out.push({ x: sd * (side + rand(`${seed}x${i}${sd}`) * spread), z: z + (r - 0.5) * gap, s: 0.8 + r * 0.7, kind: bushes && r < 0.25 ? 'bush' : kinds[Math.floor(rand(`${seed}k${i}${sd}`) * kinds.length)] });
      }
    return out;
  }, [from, to, gap, side, spread, seed, bushes, kinds.join()]);
  return <>{items.map((it, i) => it.kind === 'bush' ? <Bush key={i} pos={[it.x, 0, it.z]} scale={it.s} /> : <Tree key={i} pos={[it.x, 0, it.z]} scale={it.s} kind={it.kind as (typeof TREES)[number]} />)}</>;
};

/** A bush / hedge clump. */
export const Bush: React.FC<At & { flowers?: string }> = ({ color = '#3e9a48', flowers, ...g }) => (
  <G {...g} shadow={0.7}>
    {[[0, 0.42, 0, 0.95], [0.45, 0.34, 0.1, 0.7], [-0.45, 0.36, -0.05, 0.75], [0.05, 0.3, 0.42, 0.6]].map(([x, y, z, s], i) => <mesh key={i} position={[x, y, z]} castShadow><icosahedronGeometry args={[s / 2, 1]} /><Mat c={shade(color, 0.92 + i * 0.06)} /></mesh>)}
    {flowers && [[0.2, 0.75, 0.2], [-0.3, 0.66, 0.18], [0.5, 0.55, 0.3], [-0.05, 0.6, 0.55], [0.0, 0.86, -0.05]].map((q, i) => <P key={i} shape="ball" size={0.12} pos={q as V3} color={flowers} />)}
  </G>
);

/** A patch of flowers scattered on the ground (`size` [w, d]). */
export const Flowers: React.FC<{ pos?: V3; size?: [number, number]; count?: number; seed?: string; colors?: string[] }> = ({ pos = [0, 0, 0], size = [6, 4], count = 24, seed = 'fl', colors = ['#ff8fb1', '#ffd34d', '#ffffff', '#b28dff', '#ff6b5a'] }) => (
  <group position={pos}>
    {Array.from({ length: count }, (_, i) => {
      const x = (rand(`${seed}x${i}`) - 0.5) * size[0], z = (rand(`${seed}z${i}`) - 0.5) * size[1], h = 0.18 + rand(`${seed}h${i}`) * 0.16;
      return <group key={i} position={[x, 0, z]}><P shape="cyl" size={[0.02, h, 0.02]} pos={[0, h / 2, 0]} color="#3f9a45" noShadow /><P shape="ball" size={[0.12, 0.07, 0.12]} pos={[0, h, 0]} color={colors[i % colors.length]} /><P shape="ball" size={0.045} pos={[0, h + 0.03, 0]} color="#ffd34d" noShadow /></group>;
    })}
  </group>
);

/** Tufts of grass / reeds scattered around (`size` [w, d]). */
export const Grass: React.FC<{ pos?: V3; size?: [number, number]; count?: number; seed?: string; color?: string }> = ({ pos = [0, 0, 0], size = [10, 8], count = 40, seed = 'gr', color = '#5fae45' }) => (
  <group position={pos}>
    {Array.from({ length: count }, (_, i) => <mesh key={i} position={[(rand(`${seed}x${i}`) - 0.5) * size[0], 0.12, (rand(`${seed}z${i}`) - 0.5) * size[1]]} rotation={[0, rand(`${seed}r${i}`) * 3, 0]}><coneGeometry args={[0.1, 0.28 + rand(`${seed}h${i}`) * 0.2, 4]} /><Mat c={shade(color, 0.85 + rand(`${seed}c${i}`) * 0.3)} /></mesh>)}
  </group>
);

/** A rock / boulder. */
export const Rock: React.FC<At & { size?: number }> = ({ color = '#8d9199', size = 1, ...g }) => (
  <G {...g} shadow={0.6 * size}>
    <mesh position={[0, 0.32 * size, 0]} scale={[size, size * 0.72, size * 0.85]} rotation={[0.2, 0.6, 0.1]} castShadow receiveShadow><icosahedronGeometry args={[0.55, 0]} /><Mat c={color} /></mesh>
    <mesh position={[0.42 * size, 0.16 * size, 0.2 * size]} scale={size * 0.5} rotation={[0.5, 1.2, 0.3]} castShadow><icosahedronGeometry args={[0.5, 0]} /><Mat c={shade(color, 0.88)} /></mesh>
  </G>
);

/** Mountains on the horizon (put them far: z 120–200). `snow` caps them. */
export const Mountains: React.FC<{ z?: number; count?: number; seed?: string; color?: string; snow?: boolean; height?: number }> = ({ z = 170, count = 7, seed = 'mt', color = '#6f8296', snow = true, height = 60 }) => (
  <>
    {Array.from({ length: count }, (_, i) => {
      const x = (i - (count - 1) / 2) * 70 + (rand(`${seed}x${i}`) - 0.5) * 40;
      const h = height * (0.6 + rand(`${seed}h${i}`) * 0.7);
      const w = h * (1.0 + rand(`${seed}w${i}`) * 0.5);
      return (
        <group key={i} position={[x, 0, z + rand(`${seed}z${i}`) * 40]}>
          <mesh position={[0, h / 2, 0]}><coneGeometry args={[w / 2, h, 6]} /><Mat c={shade(color, 0.85 + rand(`${seed}c${i}`) * 0.3)} /></mesh>
          {snow && <mesh position={[0, h * 0.86, 0]}><coneGeometry args={[w * 0.142, h * 0.285, 6]} /><Mat c="#f6f9fc" /></mesh>}
        </group>
      );
    })}
  </>
);

// ---------- buildings ----------

/** A house: walls, framed windows, a door with a step, a gable roof, a chimney. */
export const House: React.FC<Placed & { w?: number; d?: number; floors?: number; wall?: string; roof?: string; win?: string; door?: string; lit?: boolean }> = ({ w = 7, d = 6, floors = 2, wall = '#eeeae4', roof = '#c8423a', win = '#5b9bd5', door = '#5a3b2a', lit, ...g }) => {
  const h = floors * 2.8;
  const roofGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 - 0.4, 0); s.lineTo(w / 2 + 0.4, 0); s.lineTo(0, w * 0.38); s.lineTo(-w / 2 - 0.4, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: d + 0.6, bevelEnabled: false });
    geo.translate(0, 0, -(d + 0.6) / 2);
    return geo;
  }, [w, d]);
  const wins: V3[] = [];
  for (let f = 0; f < floors; f++) for (const x of [-w / 3, w / 3]) wins.push([x, 1.6 + f * 2.8, d / 2]);
  if (floors > 1) wins.push([0, 1.6 + 2.8, d / 2]);
  return (
    <G {...g} shadow={w * 0.62}>
      <P shape="box" size={[w + 0.2, 0.3, d + 0.2]} pos={[0, 0.15, 0]} color={shade(wall, 0.72)} />
      <P shape="box" size={[w, h, d]} pos={[0, h / 2, 0]} color={wall} />
      <mesh geometry={roofGeo} position={[0, h, 0]} castShadow><Mat c={roof} /></mesh>
      <P shape="box" size={[0.7, 1.5, 0.7]} pos={[w * 0.26, h + w * 0.3, -d * 0.15]} color={shade(wall, 0.8)} />
      {wins.map((p, i) => <group key={i} position={p}><P shape="box" size={[1.3, 1.3, 0.08]} color="#ffffff" /><P shape="box" size={[1.1, 1.1, 0.1]} color={lit ? '#ffe9a6' : win} glow={lit ? 1.4 : 0} shine={0.8} /><P shape="box" size={[0.06, 1.1, 0.12]} color="#ffffff" /><P shape="box" size={[1.1, 0.06, 0.12]} color="#ffffff" /><P shape="box" size={[1.4, 0.08, 0.2]} pos={[0, -0.7, 0.06]} color="#ffffff" /></group>)}
      <P shape="box" size={[1.4, 2.3, 0.08]} pos={[0, 1.15, d / 2]} color="#ffffff" />
      <P shape="box" size={[1.2, 2.1, 0.12]} pos={[0, 1.07, d / 2]} color={door} />
      <P shape="ball" size={0.1} pos={[0.42, 1.05, d / 2 + 0.08]} color="#f2c230" metal={0.7} />
      <P shape="box" size={[1.8, 0.16, 0.7]} pos={[0, 0.08, d / 2 + 0.35]} color="#b9bcc0" />
    </G>
  );
};

/** A block of flats (rows of windows, balconies, an entrance). */
export const Block: React.FC<Placed & { w?: number; d?: number; floors?: number; wall?: string }> = ({ w = 14, d = 8, floors = 6, wall = '#cfd3d8', ...g }) => {
  const h = floors * 2.7;
  const cols = Math.floor(w / 2.4);
  return (
    <G {...g} shadow={w * 0.6}>
      <P shape="box" size={[w, h, d]} pos={[0, h / 2, 0]} color={wall} />
      <P shape="box" size={[w + 0.3, 0.3, d + 0.3]} pos={[0, h + 0.15, 0]} color={shade(wall, 0.75)} />
      {Array.from({ length: floors }, (_, f) => Array.from({ length: cols }, (_, i) => {
        const x = -w / 2 + 1.4 + i * 2.4, y = 1.5 + f * 2.7;
        const lit = rand(`bw${f}-${i}`) > 0.8;
        return <group key={`${f}-${i}`} position={[x, y, d / 2]}><P shape="box" size={[1.3, 1.3, 0.06]} color="#f4f4f4" /><P shape="box" size={[1.12, 1.12, 0.08]} color={lit ? '#f3d27a' : '#6d8fb5'} glow={lit ? 0.8 : 0} shine={0.8} />{f > 0 && i % 2 === 0 && <><P shape="box" size={[1.7, 0.1, 0.8]} pos={[0, -0.75, 0.4]} color={shade(wall, 0.8)} /><P shape="box" size={[1.7, 0.6, 0.06]} pos={[0, -0.42, 0.78]} color={shade(wall, 0.65)} /></>}</group>;
      }))}
      <P shape="box" size={[2.2, 2.6, 0.3]} pos={[0, 1.3, d / 2 + 0.1]} color={shade(wall, 0.6)} />
      <P shape="box" size={[1.5, 2.1, 0.1]} pos={[0, 1.05, d / 2 + 0.27]} color="#3c5870" shine={0.8} />
    </G>
  );
};

/** A shop / café / restaurant front with a sign over the door and an awning. `name` is written on the sign. */
export const Shop: React.FC<Placed & { name?: string; w?: number; wall?: string; awning?: string; signBg?: string; signFg?: string }> = ({ name = 'SKLEP', w = 8, wall = '#f1e9da', awning = '#d8342c', signBg = '#22252b', signFg = '#ffffff', ...g }) => {
  const tex = useTextTexture(name, 512, 96, signBg, signFg);
  const d = 6, h = 4.2;
  return (
    <G {...g} shadow={w * 0.6}>
      <P shape="box" size={[w, h, d]} pos={[0, h / 2, 0]} color={wall} />
      <P shape="box" size={[w + 0.3, 0.3, d + 0.3]} pos={[0, h + 0.15, 0]} color={shade(wall, 0.7)} />
      <P shape="box" size={[w * 0.56, 2.0, 0.1]} pos={[-w * 0.18, 1.5, d / 2]} color="#8fc3e8" shine={0.9} opacity={0.75} />
      <P shape="box" size={[w * 0.58, 0.14, 0.2]} pos={[-w * 0.18, 0.45, d / 2 + 0.02]} color={shade(wall, 0.65)} />
      <P shape="box" size={[1.3, 2.3, 0.1]} pos={[w * 0.3, 1.15, d / 2]} color="#3c5870" shine={0.8} />
      <P shape="box" size={[0.06, 0.4, 0.14]} pos={[w * 0.3 - 0.45, 1.15, d / 2 + 0.05]} color="#d8dbe0" metal={0.6} />
      <P shape="box" size={[w * 0.86, 0.8, 0.14]} pos={[0, 3.45, d / 2 + 0.05]} color={signBg} />
      <mesh position={[0, 3.45, d / 2 + 0.13]}><planeGeometry args={[w * 0.8, 0.66]} /><meshBasicMaterial map={tex} /></mesh>
      {Array.from({ length: 8 }, (_, i) => <P key={i} shape="box" size={[w * 0.9 / 8, 0.06, 1.3]} pos={[-w * 0.45 + (i + 0.5) * (w * 0.9 / 8), 2.72, d / 2 + 0.6]} rot={[18, 0, 0]} color={i % 2 ? '#ffffff' : awning} />)}
    </G>
  );
};

/** A glass office tower. */
export const Tower: React.FC<Placed & { w?: number; floors?: number; color?: string }> = ({ w = 10, floors = 16, color = '#5d86b0', ...g }) => {
  const h = floors * 3;
  return (
    <G {...g} shadow={w * 0.7}>
      <P shape="box" size={[w, h, w]} pos={[0, h / 2, 0]} color={color} shine={0.9} metal={0.25} />
      {Array.from({ length: floors }, (_, f) => <P key={f} shape="box" size={[w + 0.06, 0.16, w + 0.06]} pos={[0, f * 3 + 2.9, 0]} color={shade(color, 0.55)} />)}
      {[-1, 0, 1].map((i) => <React.Fragment key={i}><P shape="box" size={[0.14, h, w + 0.08]} pos={[i * w / 3, h / 2, 0]} color={shade(color, 0.55)} /><P shape="box" size={[w + 0.08, h, 0.14]} pos={[0, h / 2, i * w / 3]} color={shade(color, 0.55)} /></React.Fragment>)}
      <P shape="box" size={[w * 0.4, 1.2, w * 0.4]} pos={[0, h + 0.6, 0]} color="#8d9199" />
    </G>
  );
};

/** A red farm barn. */
export const Barn: React.FC<Placed & { color?: string }> = ({ color = '#b8322a', ...g }) => (
  <G {...g} shadow={5}>
    <P shape="box" size={[8, 4.4, 9]} pos={[0, 2.2, 0]} color={color} />
    <P shape="prism" size={[9.6, 2.6, 8.8]} pos={[0, 5.7, 0]} rot={[0, 90, 0]} color="#6b6f76" />
    <P shape="box" size={[3.2, 3.4, 0.1]} pos={[0, 1.7, 4.52]} color={shade(color, 0.7)} />
    {[45, -45].map((a) => <P key={a} shape="box" size={[4.4, 0.2, 0.12]} pos={[0, 1.7, 4.56]} rot={[0, 0, a]} color="#ffffff" />)}
    {[[-1.7, 1.7], [1.7, 1.7], [0, 3.5]].map(([x, y], i) => <P key={i} shape="box" size={i < 2 ? [0.2, 3.5, 0.13] : [3.5, 0.2, 0.13]} pos={[x, y, 4.56]} color="#ffffff" />)}
  </G>
);

// ---------- rooms ----------

/**
 * An indoor room open towards the camera: a floor, a back wall and two side walls (`w` × `d`, walls `h` high).
 * Centre is [0, 0, 0]; the back wall is at z = −d/2. Put the camera at z ≈ d/2 + 3 looking in. Use <World sky="indoor">.
 * `floor`: wood | tiles | carpet | concrete or a colour. `window` / `door`: put one on the back wall.
 */
export const Room: React.FC<Placed & { w?: number; d?: number; h?: number; wall?: string; floor?: string; window?: boolean; door?: boolean; sideWalls?: boolean; baseboard?: boolean }> = ({ w = 9, d = 7, h = 3.4, wall = '#e9dfd0', floor = 'wood', window = true, door, sideWalls = true, baseboard = true, ...g }) => {
  const fc = { wood: '#c49a6c', tiles: '#e6e1d8', carpet: '#8d6f9c', concrete: '#b9bcc0' }[floor] ?? floor;
  return (
    <G {...g}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial color={fc} roughness={floor === 'tiles' ? 0.35 : 0.9} /></mesh>
      {floor === 'wood' && Array.from({ length: Math.floor(w / 0.9) }, (_, i) => <P key={i} shape="box" size={[0.02, 0.006, d]} pos={[-w / 2 + (i + 1) * 0.9, 0.006, 0]} color={shade(fc, 0.8)} noShadow />)}
      {floor === 'tiles' && <>{Array.from({ length: Math.floor(w / 1) }, (_, i) => <P key={`x${i}`} shape="box" size={[0.02, 0.006, d]} pos={[-w / 2 + (i + 1), 0.006, 0]} color={shade(fc, 0.82)} noShadow />)}{Array.from({ length: Math.floor(d / 1) }, (_, i) => <P key={`z${i}`} shape="box" size={[w, 0.006, 0.02]} pos={[0, 0.006, -d / 2 + (i + 1)]} color={shade(fc, 0.82)} noShadow />)}</>}
      <P shape="box" size={[w, h, 0.16]} pos={[0, h / 2, -d / 2 - 0.08]} color={wall} />
      {sideWalls && [-1, 1].map((sd) => <P key={sd} shape="box" size={[0.16, h, d]} pos={[sd * (w / 2 + 0.08), h / 2, 0]} color={shade(wall, 0.93)} />)}
      {baseboard && <P shape="box" size={[w, 0.14, 0.04]} pos={[0, 0.07, -d / 2 + 0.02]} color="#ffffff" />}
      {window && <Window pos={[door ? -w * 0.22 : 0, 1.9, -d / 2 + 0.02]} />}
      {door && <Door pos={[w * 0.28, 0, -d / 2 + 0.03]} />}
    </G>
  );
};
/** A free-standing wall (`w` wide, `h` high). */
export const Wall: React.FC<Placed & { w?: number; h?: number; color?: string; thick?: number }> = ({ w = 6, h = 3.2, color = '#e9dfd0', thick = 0.16, ...g }) => (
  <G {...g}><P shape="box" size={[w, h, thick]} pos={[0, h / 2, 0]} color={color} /></G>
);
/** A door in its frame (stands on the floor; `open` 0–1 swings it). */
export const Door: React.FC<At & { open?: number }> = ({ color = '#8a5a35', open = 0, ...g }) => (
  <G {...g}>
    <P shape="box" size={[1.16, 2.24, 0.08]} pos={[0, 1.12, 0]} color="#ffffff" />
    <group position={[-0.5, 0, 0.03]} rotation={[0, deg(-100 * open), 0]}><P size={[1.0, 2.1, 0.07]} pos={[0.5, 1.07, 0.02]} radius={0.01} color={color} /><P shape="box" size={[0.7, 0.7, 0.02]} pos={[0.5, 1.55, 0.06]} color={shade(color, 0.85)} /><P shape="box" size={[0.7, 0.8, 0.02]} pos={[0.5, 0.6, 0.06]} color={shade(color, 0.85)} /><P shape="ball" size={0.09} pos={[0.9, 1.05, 0.09]} color="#f2c230" metal={0.7} /></group>
  </G>
);
/** A window on a wall (`pos` = its centre; shows sky; `night` = dark sky). */
export const Window: React.FC<Placed & { w?: number; h?: number; night?: boolean; curtains?: string }> = ({ w = 1.8, h = 1.4, night, curtains, ...g }) => (
  <G {...g}>
    <P shape="box" size={[w + 0.2, h + 0.2, 0.06]} color="#ffffff" />
    <P shape="box" size={[w, h, 0.07]} color={night ? '#18213f' : '#9fd3f5'} glow={night ? 0.1 : 0.55} />
    <P shape="box" size={[0.06, h, 0.09]} color="#ffffff" /><P shape="box" size={[w, 0.06, 0.09]} color="#ffffff" />
    <P shape="box" size={[w + 0.36, 0.08, 0.24]} pos={[0, -h / 2 - 0.12, 0.1]} color="#ffffff" />
    {curtains && [-1, 1].map((sd) => <P key={sd} size={[w * 0.3, h + 0.5, 0.1]} pos={[sd * (w / 2 + 0.05), 0, 0.12]} radius={0.04} color={curtains} />)}
  </G>
);
/** A framed picture / poster on a wall (`pos` = its centre; `text` writes on it). */
export const Picture: React.FC<At & { w?: number; h?: number; text?: string }> = ({ color = '#7fb8d8', w = 1, h = 0.8, text, ...g }) => {
  const tex = useTextTexture(text ?? ' ', 256, Math.round(256 * (h / w)), color, '#111111');
  return (
    <G {...g}>
      <P shape="box" size={[w + 0.12, h + 0.12, 0.05]} color="#3a2a1c" />
      {text ? <mesh position={[0, 0, 0.03]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} /></mesh> : <><P shape="box" size={[w, h, 0.06]} color={color} /><P shape="ball" size={[w * 0.5, h * 0.4, 0.02]} pos={[-w * 0.1, -h * 0.2, 0.03]} color="#4cae4f" /><P shape="ball" size={[w * 0.18, w * 0.18, 0.02]} pos={[w * 0.25, h * 0.2, 0.03]} color="#ffd34d" /></>}
    </G>
  );
};
/** A rug on the floor. */
export const Rug: React.FC<At & { size?: [number, number]; round?: boolean }> = ({ color = '#b5524a', size = [3, 2], round, ...g }) => (
  <G {...g}>
    {round ? <P shape="disc" size={[size[0], 0.03, size[0]]} pos={[0, 0.015, 0]} color={color} noShadow /> : <><P shape="box" size={[size[0], 0.03, size[1]]} pos={[0, 0.015, 0]} color={color} noShadow /><P shape="box" size={[size[0] * 0.82, 0.034, size[1] * 0.74]} pos={[0, 0.016, 0]} color={shade(color, 1.25)} noShadow /></>}
  </G>
);

// ---------- street things ----------

/** A street lamp (`on` lights it). */
export const StreetLamp: React.FC<Placed & { on?: boolean }> = ({ on, ...g }) => (
  <G {...g} shadow={0.3}>
    <P shape="cyl" size={[0.3, 0.3, 0.3]} pos={[0, 0.15, 0]} color="#2f3238" />
    <P shape="cyl" size={[0.11, 4.6, 0.11]} pos={[0, 2.3, 0]} color="#2f3238" />
    <P shape="cyl" size={[0.08, 1.2, 0.08]} pos={[0, 4.6, 0.5]} rot={[90, 0, 0]} color="#2f3238" />
    <P size={[0.4, 0.14, 0.6]} pos={[0, 4.52, 1.0]} radius={0.05} color="#2f3238" />
    <P shape="box" size={[0.3, 0.04, 0.46]} pos={[0, 4.44, 1.0]} color="#fff3c4" glow={on ? 3 : 0.3} />
    {on && <pointLight position={[0, 4.2, 1]} intensity={30} distance={14} color="#ffe2a0" />}
  </G>
);
/** A park bench. */
export const Bench: React.FC<At> = ({ color = '#a8703f', ...g }) => (
  <G {...g} shadow={0.9}>
    {[-0.16, 0, 0.16].map((z) => <P key={z} shape="box" size={[1.8, 0.05, 0.13]} pos={[0, 0.48, z]} color={color} />)}
    {[0.72, 0.92].map((y) => <P key={y} shape="box" size={[1.8, 0.13, 0.05]} pos={[0, y, -0.28]} rot={[-10, 0, 0]} color={color} />)}
    {[-0.75, 0.75].map((x) => <React.Fragment key={x}><P shape="box" size={[0.08, 0.48, 0.5]} pos={[x, 0.24, 0]} color="#2f3238" /><P shape="box" size={[0.08, 0.6, 0.06]} pos={[x, 0.75, -0.28]} rot={[-10, 0, 0]} color="#2f3238" /></React.Fragment>)}
  </G>
);
/** A rubbish bin. */
export const Bin: React.FC<At> = ({ color = '#3d7f52', ...g }) => (
  <G {...g} shadow={0.35}><P shape="cyl" size={[0.5, 0.8, 0.5]} pos={[0, 0.4, 0]} color={color} /><P shape="cyl" size={[0.56, 0.08, 0.56]} pos={[0, 0.84, 0]} color={shade(color, 0.7)} /><P shape="box" size={[0.3, 0.1, 0.02]} pos={[0, 0.62, 0.25]} color="#1b1d22" /></G>
);
/** A traffic light. `state`: red | yellow | green. */
export const TrafficLight: React.FC<Placed & { state?: 'red' | 'yellow' | 'green' }> = ({ state = 'red', ...g }) => (
  <G {...g} shadow={0.25}>
    <P shape="cyl" size={[0.12, 3.2, 0.12]} pos={[0, 1.6, 0]} color="#2f3238" />
    <P size={[0.42, 1.1, 0.3]} pos={[0, 3.5, 0]} radius={0.06} color="#1b1d22" />
    {(['red', 'yellow', 'green'] as const).map((s, i) => <P key={s} shape="ball" size={[0.24, 0.24, 0.1]} pos={[0, 3.84 - i * 0.34, 0.14]} color={{ red: '#ff3b30', yellow: '#ffcc00', green: '#34c759' }[s]} glow={state === s ? 3 : 0.08} />)}
  </G>
);
/** A fence along x (`length` metres). `kind`: wood | picket | metal. */
export const Fence: React.FC<At & { length?: number; kind?: 'wood' | 'picket' | 'metal' }> = ({ length = 8, kind = 'wood', color, ...g }) => {
  const c = color ?? (kind === 'picket' ? '#ffffff' : kind === 'metal' ? '#4a4e55' : '#a8703f');
  const n = Math.max(2, Math.round(length / (kind === 'picket' ? 0.3 : 1.6)));
  return (
    <G {...g}>
      {Array.from({ length: n + 1 }, (_, i) => <P key={i} shape="box" size={kind === 'picket' ? [0.14, 1.0, 0.04] : [0.12, 1.2, 0.12]} pos={[-length / 2 + (i * length) / n, kind === 'picket' ? 0.5 : 0.6, 0]} color={c} />)}
      {[0.4, 0.9].map((y) => <P key={y} shape="box" size={[length, kind === 'metal' ? 0.05 : 0.1, 0.05]} pos={[0, kind === 'picket' ? y * 0.8 : y, kind === 'picket' ? -0.04 : 0]} color={c} />)}
    </G>
  );
};
/** A bus stop shelter with a bench. */
export const BusStop: React.FC<Placed & { name?: string }> = ({ name = 'BUS', ...g }) => {
  const tex = useTextTexture(name, 256, 64, '#1d3f9e', '#ffffff');
  return (
    <G {...g} shadow={1.6}>
      {[-1.5, 1.5].map((x) => <P key={x} shape="box" size={[0.1, 2.5, 0.1]} pos={[x, 1.25, -0.6]} color="#4a4e55" />)}
      <P shape="box" size={[3.3, 0.1, 1.5]} pos={[0, 2.55, -0.1]} color="#4a4e55" />
      <P shape="box" size={[3.0, 1.9, 0.05]} pos={[0, 1.4, -0.62]} color="#bfe1f5" opacity={0.45} shine={1} />
      <P shape="box" size={[2.2, 0.08, 0.4]} pos={[0, 0.5, -0.35]} color="#a8703f" />
      <mesh position={[0, 2.3, 0.66]}><planeGeometry args={[1.4, 0.34]} /><meshBasicMaterial map={tex} /></mesh>
    </G>
  );
};
/** A fountain (water sprays up). */
export const Fountain: React.FC<Placed> = (g) => {
  const t = useTime();
  return (
    <G {...g} shadow={2}>
      <P shape="cyl" size={[3.6, 0.5, 3.6]} pos={[0, 0.25, 0]} color="#c9cbd0" />
      <P shape="disc" size={[3.2, 0.02, 3.2]} pos={[0, 0.5, 0]} color="#5fb0ff" shine={0.9} />
      <P shape="cyl" size={[0.4, 1.3, 0.4]} pos={[0, 0.9, 0]} color="#c9cbd0" />
      <P shape="cyl" size={[1.4, 0.16, 1.4]} pos={[0, 1.55, 0]} color="#c9cbd0" />
      {Array.from({ length: 10 }, (_, i) => { const a = (t * 1.4 + i / 10) % 1; const ang = i * 2.4; return <P key={i} shape="ball" size={0.14} pos={[Math.sin(ang) * a * 0.9, 1.7 + Math.sin(a * Math.PI) * 1.0, Math.cos(ang) * a * 0.9]} color="#cfeaff" opacity={0.8} />; })}
    </G>
  );
};
/** A show stage with curtains (a talent show, a concert, a talk). */
export const Stage3D: React.FC<At & { w?: number }> = ({ color = '#8f1d2c', w = 10, ...g }) => (
  <G {...g}>
    <P shape="box" size={[w, 0.8, 5]} pos={[0, 0.4, 0]} color="#3a2a1c" />
    <P shape="box" size={[w, 0.06, 5]} pos={[0, 0.83, 0]} color="#b98a55" />
    <P shape="box" size={[w, 5, 0.2]} pos={[0, 3.3, -2.4]} color={shade(color, 0.55)} />
    {[-1, 1].map((sd) => Array.from({ length: 4 }, (_, i) => <P key={`${sd}${i}`} shape="cyl" size={[0.5, 5, 0.5]} pos={[sd * (w / 2 - 0.3 - i * 0.42), 3.3, -2.0 + i * 0.05]} color={i % 2 ? color : shade(color, 0.85)} />))}
    <P shape="box" size={[w, 0.9, 0.5]} pos={[0, 5.5, -1.9]} color={color} />
    {[-1, 1].map((sd) => <React.Fragment key={sd}><P shape="cyl" size={[0.3, 0.4, 0.3]} pos={[sd * w * 0.3, 5.0, 1.6]} rot={[40, 0, 0]} color="#22252b" /><P shape="disc" size={[0.26, 0.02, 0.26]} pos={[sd * w * 0.3, 4.86, 1.47]} rot={[130, 0, 0]} color="#fff3c4" glow={2.5} /></React.Fragment>)}
  </G>
);

// ---------- furniture (stands on the floor, y = 0) ----------

/** A table. `size` [w, d], `h` height (0.75 dining, 0.45 coffee table). `round` = round top. */
export const Table: React.FC<At & { size?: [number, number]; h?: number; round?: boolean }> = ({ color = '#b98a55', size = [1.6, 0.9], h = 0.75, round, ...g }) => (
  <G {...g} shadow={size[0] * 0.5}>
    {round ? <><P shape="disc" size={[size[0], 0.06, size[0]]} pos={[0, h - 0.03, 0]} color={color} /><P shape="cyl" size={[0.12, h - 0.06, 0.12]} pos={[0, (h - 0.06) / 2, 0]} color={shade(color, 0.7)} /><P shape="disc" size={[size[0] * 0.5, 0.04, size[0] * 0.5]} pos={[0, 0.02, 0]} color={shade(color, 0.7)} /></>
      : <><P size={[size[0], 0.07, size[1]]} pos={[0, h - 0.035, 0]} radius={0.02} color={color} />{[-1, 1].map((sx) => [-1, 1].map((sz) => <P key={`${sx}${sz}`} shape="box" size={[0.08, h - 0.07, 0.08]} pos={[sx * (size[0] / 2 - 0.1), (h - 0.07) / 2, sz * (size[1] / 2 - 0.1)]} color={shade(color, 0.8)} />))}</>}
  </G>
);
/** A chair (seat 0.48 m high: a Person with pose="sit" at the same pos sits on it). `kind`: wood | office | stool | armchair. */
export const Chair: React.FC<At & { kind?: 'wood' | 'office' | 'stool' | 'armchair' }> = ({ color, kind: kd, ...g }) => {
  const kind = pick('Chair', kd, ['wood', 'office', 'stool', 'armchair'] as const, 'wood');
  const c = color ?? { wood: '#a8703f', office: '#2f3238', stool: '#c9743f', armchair: '#4f7a8f' }[kind];
  return (
    <G {...g} shadow={0.42}>
      {kind === 'wood' && <><P size={[0.48, 0.06, 0.46]} pos={[0, 0.46, 0]} radius={0.015} color={c} />{[-1, 1].map((sx) => [-1, 1].map((sz) => <P key={`${sx}${sz}`} shape="box" size={[0.05, sz < 0 ? 1.0 : 0.44, 0.05]} pos={[sx * 0.2, sz < 0 ? 0.5 : 0.22, sz * 0.19]} color={shade(c, 0.85)} />))}{[0.7, 0.9].map((y) => <P key={y} shape="box" size={[0.44, 0.12, 0.04]} pos={[0, y, -0.19]} color={c} />)}</>}
      {kind === 'office' && <><P shape="cyl" size={[0.06, 0.34, 0.06]} pos={[0, 0.25, 0]} color="#9aa1ab" metal={0.6} />{[0, 72, 144, 216, 288].map((a) => <group key={a} rotation={[0, deg(a), 0]}><P shape="box" size={[0.06, 0.04, 0.32]} pos={[0, 0.07, 0.16]} color="#2f3238" /><P shape="ball" size={0.08} pos={[0, 0.04, 0.3]} color="#111" /></group>)}<P size={[0.5, 0.1, 0.48]} pos={[0, 0.46, 0]} radius={0.04} color={c} /><P size={[0.46, 0.6, 0.09]} pos={[0, 0.86, -0.22]} rot={[-6, 0, 0]} radius={0.04} color={c} />{[-1, 1].map((sd) => <P key={sd} shape="box" size={[0.05, 0.04, 0.3]} pos={[sd * 0.27, 0.66, 0]} color="#2f3238" />)}</>}
      {kind === 'stool' && <><P shape="disc" size={[0.4, 0.07, 0.4]} pos={[0, 0.72, 0]} color={c} />{[0, 120, 240].map((a) => <P key={a} shape="cyl" size={[0.04, 0.72, 0.04]} pos={[Math.sin(deg(a)) * 0.15, 0.35, Math.cos(deg(a)) * 0.15]} rot={[Math.cos(deg(a)) * 8, 0, -Math.sin(deg(a)) * 8]} color="#2f3238" />)}</>}
      {kind === 'armchair' && <><P size={[0.9, 0.42, 0.85]} pos={[0, 0.24, 0]} radius={0.1} color={c} /><P size={[0.9, 0.7, 0.24]} pos={[0, 0.72, -0.32]} radius={0.1} color={c} />{[-1, 1].map((sd) => <P key={sd} size={[0.2, 0.34, 0.85]} pos={[sd * 0.44, 0.52, 0]} radius={0.09} color={shade(c, 0.9)} />)}<P size={[0.56, 0.14, 0.56]} pos={[0, 0.46, 0.08]} radius={0.06} color={shade(c, 1.15)} /></>}
    </G>
  );
};
/** A sofa (seat 0.45 m high). */
export const Sofa: React.FC<At & { w?: number }> = ({ color = '#5b7a99', w = 2.2, ...g }) => (
  <G {...g} shadow={w * 0.5}>
    <P size={[w, 0.4, 0.95]} pos={[0, 0.24, 0]} radius={0.1} color={color} />
    <P size={[w, 0.72, 0.28]} pos={[0, 0.72, -0.34]} radius={0.12} color={color} />
    {[-1, 1].map((sd) => <P key={sd} size={[0.26, 0.42, 0.95]} pos={[sd * (w / 2 - 0.08), 0.54, 0]} radius={0.11} color={shade(color, 0.9)} />)}
    {Array.from({ length: Math.round(w / 0.8) }, (_, i) => { const a = { length: Math.round(w / 0.8) }; return ( <P key={i} size={[(w - 0.6) / a.length - 0.04, 0.16, 0.64]} pos={[-(w - 0.6) / 2 + ((i + 0.5) * (w - 0.6)) / a.length, 0.5, 0.1]} radius={0.07} color={shade(color, 1.15)} />); })}
    <P size={[0.42, 0.42, 0.14]} pos={[-w / 2 + 0.55, 0.78, -0.12]} rot={[-15, 0, 12]} radius={0.06} color="#f2c230" />
    {[-1, 1].map((sx) => [-1, 1].map((sz) => <P key={`${sx}${sz}`} shape="cyl" size={[0.06, 0.08, 0.06]} pos={[sx * (w / 2 - 0.15), 0.04, sz * 0.36]} color="#3a2a1c" />))}
  </G>
);
/** A bed (a Person with pose="lie" at the same pos, y = 0.5, lies on it). */
export const Bed: React.FC<At & { w?: number }> = ({ color = '#7fa8c9', w = 1.6, ...g }) => (
  <G {...g} shadow={1.3}>
    <P size={[w, 0.3, 2.1]} pos={[0, 0.2, 0]} radius={0.04} color="#8a5a35" />
    <P size={[w - 0.08, 0.2, 2.0]} pos={[0, 0.42, 0]} radius={0.08} color="#f4f1ea" />
    <P size={[w - 0.04, 0.16, 1.3]} pos={[0, 0.5, 0.36]} radius={0.07} color={color} />
    <P size={[w, 0.9, 0.1]} pos={[0, 0.6, -1.06]} radius={0.04} color="#8a5a35" />
    <P size={[w * 0.5, 0.14, 0.4]} pos={[0, 0.58, -0.72]} radius={0.06} color="#ffffff" />
  </G>
);
/** A desk with drawers (0.75 m high). */
export const Desk: React.FC<At & { w?: number }> = ({ color = '#c9a57a', w = 1.6, ...g }) => (
  <G {...g} shadow={w * 0.45}>
    <P size={[w, 0.06, 0.75]} pos={[0, 0.72, 0]} radius={0.015} color={color} />
    <P shape="box" size={[0.45, 0.66, 0.68]} pos={[w / 2 - 0.26, 0.36, 0]} color={shade(color, 0.85)} />
    {[0.55, 0.33, 0.11].map((y) => <React.Fragment key={y}><P shape="box" size={[0.4, 0.18, 0.02]} pos={[w / 2 - 0.26, y, 0.345]} color={color} /><P shape="box" size={[0.12, 0.025, 0.03]} pos={[w / 2 - 0.26, y, 0.365]} color="#8d9199" /></React.Fragment>)}
    <P shape="box" size={[0.06, 0.69, 0.68]} pos={[-w / 2 + 0.06, 0.345, 0]} color={shade(color, 0.85)} />
  </G>
);
/** A bookshelf / storage shelf full of things. */
export const Shelf: React.FC<At & { w?: number; h?: number; books?: boolean }> = ({ color = '#a8703f', w = 1.4, h = 2.0, books = true, ...g }) => {
  const rows = Math.max(2, Math.round(h / 0.45));
  return (
    <G {...g} shadow={w * 0.45}>
      <P shape="box" size={[w, h, 0.04]} pos={[0, h / 2, -0.17]} color={shade(color, 0.75)} />
      {[-1, 1].map((sd) => <P key={sd} shape="box" size={[0.05, h, 0.36]} pos={[sd * (w / 2 - 0.025), h / 2, 0]} color={color} />)}
      {Array.from({ length: rows + 1 }, (_, r) => <P key={r} shape="box" size={[w, 0.04, 0.36]} pos={[0, 0.02 + (r * (h - 0.04)) / rows, 0]} color={color} />)}
      {books && Array.from({ length: rows }, (_, r) => Array.from({ length: Math.floor((w - 0.2) / 0.1) }, (_, i) => rand(`bk${r}-${i}`) > 0.2 ? <P key={`${r}-${i}`} shape="box" size={[0.075, 0.22 + rand(`bh${r}-${i}`) * 0.12, 0.24]} pos={[-w / 2 + 0.14 + i * 0.1, 0.04 + (r * (h - 0.04)) / rows + (0.22 + rand(`bh${r}-${i}`) * 0.12) / 2, 0]} color={['#3f6fb5', '#c0392b', '#2f7d4f', '#f2c230', '#8e44ad', '#e8e2d0', '#d35400'][Math.floor(rand(`bc${r}-${i}`) * 7)]} noShadow /> : null))}
    </G>
  );
};
/** A floor lamp (`on` lights it). */
export const FloorLamp: React.FC<At & { on?: boolean }> = ({ color = '#f3e2b8', on = true, ...g }) => (
  <G {...g} shadow={0.25}>
    <P shape="disc" size={[0.36, 0.04, 0.36]} pos={[0, 0.02, 0]} color="#2f3238" />
    <P shape="cyl" size={[0.035, 1.5, 0.035]} pos={[0, 0.78, 0]} color="#2f3238" />
    <P shape="cone" size={[0.5, 0.4, 0.5]} pos={[0, 1.66, 0]} color={color} glow={on ? 0.9 : 0} />
    {on && <pointLight position={[0, 1.5, 0]} intensity={8} distance={7} color="#ffdfa0" />}
  </G>
);
/** A TV on a stand (`on` = glowing screen; `text` shows words on the screen). */
export const Tv: React.FC<Placed & { on?: boolean; screen?: string; text?: string; w?: number }> = ({ on = true, screen = '#4f9bff', text, w = 1.5, ...g }) => {
  const tex = useTextTexture(text ?? ' ', 512, 288, screen, '#ffffff');
  return (
    <G {...g} shadow={w * 0.4}>
      <P size={[w + 0.3, 0.5, 0.45]} pos={[0, 0.25, 0]} radius={0.03} color="#8a5a35" />
      <P shape="box" size={[0.4, 0.04, 0.24]} pos={[0, 0.52, 0]} color="#16181c" />
      <P shape="box" size={[0.08, 0.14, 0.05]} pos={[0, 0.6, 0]} color="#16181c" />
      <P size={[w, w * 0.58, 0.06]} pos={[0, 0.66 + w * 0.29, 0]} radius={0.02} color="#16181c" />
      {text && on ? <mesh position={[0, 0.66 + w * 0.29, 0.032]}><planeGeometry args={[w - 0.08, w * 0.58 - 0.08]} /><meshBasicMaterial map={tex} /></mesh> : <P shape="box" size={[w - 0.08, w * 0.58 - 0.08, 0.005]} pos={[0, 0.66 + w * 0.29, 0.032]} color={on ? screen : '#0c0d10'} glow={on ? 1.3 : 0} />}
    </G>
  );
};
/** A big screen / whiteboard / projector screen on a stand or wall (`text` writes on it). */
export const Screen: React.FC<Placed & { text?: string; bg?: string; fg?: string; w?: number; h?: number; stand?: boolean }> = ({ text = '', bg = '#ffffff', fg = '#111111', w = 2.4, h = 1.4, stand = true, ...g }) => {
  const tex = useTextTexture(text || ' ', 512, Math.round(512 * (h / w)), bg, fg);
  const y = stand ? 1.0 + h / 2 : 0;
  return (
    <G {...g}>
      {stand && [-w / 2 + 0.2, w / 2 - 0.2].map((x) => <P key={x} shape="box" size={[0.06, 1.0 + h, 0.06]} pos={[x, (1.0 + h) / 2, -0.05]} color="#5d6066" />)}
      <P shape="box" size={[w + 0.1, h + 0.1, 0.05]} pos={[0, y, 0]} color="#c9ccd1" />
      <mesh position={[0, y, 0.03]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} /></mesh>
    </G>
  );
};
/** A fridge (`open` 0–1 swings the door and lights the inside). */
export const Fridge: React.FC<At & { open?: number }> = ({ color = '#e9edf0', open = 0, ...g }) => (
  <G {...g} shadow={0.5}>
    <P size={[0.8, 1.9, 0.7]} pos={[0, 0.95, 0]} radius={0.04} color={color} shine={0.7} />
    {open > 0 && <><P shape="box" size={[0.7, 1.7, 0.02]} pos={[0, 0.95, 0.34]} color="#fffbe6" glow={1.2} />{[0.5, 0.95, 1.4].map((y) => <P key={y} shape="box" size={[0.68, 0.02, 0.2]} pos={[0, y, 0.3]} color="#c9ccd1" />)}</>}
    <group position={[-0.4, 0, 0.35]} rotation={[0, deg(-110 * open), 0]}>
      <P size={[0.8, 1.2, 0.06]} pos={[0.4, 0.62, 0.03]} radius={0.02} color={color} shine={0.7} />
      <P size={[0.8, 0.62, 0.06]} pos={[0.4, 1.58, 0.03]} radius={0.02} color={color} shine={0.7} />
      {[1.0, 1.42].map((y) => <P key={y} shape="box" size={[0.04, 0.3, 0.05]} pos={[0.72, y, 0.08]} color="#9aa1ab" metal={0.6} />)}
    </group>
  </G>
);
/** A plant in a pot. `kind`: leafy | palm | cactus | flower. */
export const Plant: React.FC<At & { kind?: 'leafy' | 'palm' | 'cactus' | 'flower'; pot?: string }> = ({ color = '#3f9a45', kind: kd, pot = '#c9743f', ...g }) => {
  const kind = pick('Plant', kd, ['leafy', 'palm', 'cactus', 'flower'] as const, 'leafy');
  return (
    <G {...g} shadow={0.35}>
      <P shape="cone" size={[0.44, 0.4, 0.44]} pos={[0, 0.2, 0]} rot={[180, 0, 0]} color={pot} /><P shape="cyl" size={[0.46, 0.07, 0.46]} pos={[0, 0.4, 0]} color={shade(pot, 0.85)} />
      {kind === 'leafy' && [[0, 0.75, 0, 0.5], [0.2, 0.62, 0.1, 0.36], [-0.2, 0.66, -0.05, 0.4], [0.02, 0.95, 0.04, 0.34]].map(([x, y, z, s], i) => <mesh key={i} position={[x, y, z]} castShadow><icosahedronGeometry args={[s / 2, 1]} /><Mat c={shade(color, 0.9 + i * 0.07)} /></mesh>)}
      {kind === 'palm' && <><P shape="cyl" size={[0.05, 0.7, 0.05]} pos={[0, 0.75, 0]} color="#7a5234" />{[0, 72, 144, 216, 288].map((a) => <group key={a} position={[0, 1.1, 0]} rotation={[0, deg(a), 0]}><P size={[0.16, 0.02, 0.7]} pos={[0, -0.06, 0.34]} rot={[25, 0, 0]} radius={0.008} color={color} /></group>)}</>}
      {kind === 'cactus' && <><P shape="capsule" size={[0.2, 0.7, 0.2]} pos={[0, 0.75, 0]} color={color} /><P shape="capsule" size={[0.1, 0.26, 0.1]} pos={[0.16, 0.78, 0]} rot={[0, 0, -45]} color={color} /></>}
      {kind === 'flower' && <>{[[-0.1, 0], [0.1, 0.05], [0, -0.1]].map(([x, z], i) => <React.Fragment key={i}><P shape="cyl" size={[0.02, 0.4, 0.02]} pos={[x, 0.62, z]} color="#3f9a45" /><P shape="ball" size={0.16} pos={[x, 0.86, z]} color={['#ff8fb1', '#ffd34d', '#b28dff'][i]} /></React.Fragment>)}</>}
    </G>
  );
};
/** A kitchen counter / shop counter / bar / reception desk (`w` wide, 0.95 m high). */
export const Cabinet: React.FC<At & { w?: number; top?: string }> = ({ color = '#e9e4da', w = 2.4, top = '#3a3d44', ...g }) => (
  <G {...g} shadow={w * 0.45}>
    <P shape="box" size={[w, 0.9, 0.65]} pos={[0, 0.45, 0]} color={color} />
    <P size={[w + 0.06, 0.06, 0.72]} pos={[0, 0.93, 0]} radius={0.015} color={top} shine={0.7} />
    {Array.from({ length: Math.max(1, Math.round(w / 0.6)) }, (_, i) => { const a = { length: Math.max(1, Math.round(w / 0.6)) }; return (<React.Fragment key={i}><P shape="box" size={[w / a.length - 0.06, 0.74, 0.02]} pos={[-w / 2 + ((i + 0.5) * w) / a.length, 0.45, 0.33]} color={shade(color, 0.93)} /><P shape="box" size={[0.03, 0.14, 0.03]} pos={[-w / 2 + ((i + 0.5) * w) / a.length + (w / a.length) * 0.3, 0.6, 0.35]} color="#8d9199" metal={0.6} /></React.Fragment>); })}
  </G>
);
/** A cooker with an oven (`on` = a pan steaming on it). */
export const Stove: React.FC<At & { on?: boolean }> = ({ color = '#e9edf0', on, ...g }) => (
  <G {...g} shadow={0.45}>
    <P shape="box" size={[0.7, 0.9, 0.65]} pos={[0, 0.45, 0]} color={color} />
    <P shape="box" size={[0.72, 0.04, 0.67]} pos={[0, 0.92, 0]} color="#16181c" />
    {[[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]].map(([x, z], i) => <P key={i} shape="disc" size={[0.2, 0.01, 0.2]} pos={[x, 0.945, z]} color={on && i === 2 ? '#ff5a2a' : '#3a3d44'} glow={on && i === 2 ? 1.5 : 0} />)}
    <P shape="box" size={[0.56, 0.42, 0.02]} pos={[0, 0.4, 0.33]} color="#16181c" shine={0.8} />
    <P shape="box" size={[0.5, 0.03, 0.04]} pos={[0, 0.66, 0.35]} color="#9aa1ab" metal={0.6} />
    {on && <><P shape="cyl" size={[0.26, 0.14, 0.26]} pos={[-0.17, 1.02, 0.15]} color="#9aa1ab" metal={0.6} /><group position={[-0.17, 1.1, 0.15]} scale={0.45}><SteamPuffs /></group></>}
  </G>
);
const SteamPuffs: React.FC = () => {
  const t = useTime();
  return <>{[0, 1, 2, 3].map((i) => { const a = (t * 0.7 + i / 4) % 1; return <mesh key={i} position={[Math.sin(i * 2) * 0.15, a * 1.4, 0]} scale={0.3 + a * 0.6}><icosahedronGeometry args={[0.5, 1]} /><meshStandardMaterial color="#ffffff" transparent opacity={(1 - a) * 0.6} depthWrite={false} /></mesh>; })}</>;
};
/** A sink unit (kitchen or bathroom). */
export const Sink: React.FC<At> = ({ color = '#e9e4da', ...g }) => (
  <G {...g} shadow={0.45}>
    <P shape="box" size={[0.8, 0.9, 0.6]} pos={[0, 0.45, 0]} color={color} />
    <P size={[0.84, 0.06, 0.64]} pos={[0, 0.93, 0]} radius={0.015} color="#f4f6f8" shine={0.8} />
    <P shape="box" size={[0.5, 0.02, 0.36]} pos={[0, 0.955, 0.02]} color="#b9c3cc" shine={0.9} metal={0.4} />
    <P shape="cyl" size={[0.04, 0.26, 0.04]} pos={[0, 1.08, -0.24]} color="#c9ccd1" metal={0.8} /><P shape="cyl" size={[0.035, 0.18, 0.035]} pos={[0, 1.2, -0.16]} rot={[90, 0, 0]} color="#c9ccd1" metal={0.8} />
  </G>
);
/** A bath tub (`full` = water and foam). */
export const Bath: React.FC<At & { full?: boolean }> = ({ color = '#ffffff', full = true, ...g }) => (
  <G {...g} shadow={1}>
    <P size={[0.85, 0.58, 1.8]} pos={[0, 0.29, 0]} radius={0.16} color={color} shine={0.8} />
    <P size={[0.68, 0.06, 1.6]} pos={[0, 0.57, 0]} radius={0.03} color={full ? '#9fd8ff' : '#dfe6ea'} shine={0.9} />
    {full && Array.from({ length: 9 }, (_, i) => <P key={i} shape="ball" size={0.16 + rand(`ft${i}`) * 0.12} pos={[(rand(`fx${i}`) - 0.5) * 0.5, 0.62, (rand(`fz${i}`) - 0.5) * 1.3]} color="#ffffff" />)}
    <P shape="cyl" size={[0.04, 0.3, 0.04]} pos={[0, 0.72, -0.86]} color="#c9ccd1" metal={0.8} />
  </G>
);
/** A toilet. */
export const Toilet: React.FC<At> = ({ color = '#ffffff', ...g }) => (
  <G {...g} shadow={0.35}>
    <P size={[0.4, 0.4, 0.5]} pos={[0, 0.2, 0.05]} radius={0.12} color={color} shine={0.8} />
    <P shape="disc" size={[0.44, 0.06, 0.52]} pos={[0, 0.43, 0.06]} color={color} shine={0.8} />
    <P size={[0.46, 0.5, 0.2]} pos={[0, 0.65, -0.26]} radius={0.04} color={color} shine={0.8} />
  </G>
);
/** A wardrobe / cupboard. */
export const Wardrobe: React.FC<At & { w?: number; h?: number }> = ({ color = '#b98a55', w = 1.4, h = 2.1, ...g }) => (
  <G {...g} shadow={w * 0.45}>
    <P size={[w, h, 0.6]} pos={[0, h / 2, 0]} radius={0.02} color={color} />
    {[-1, 1].map((sd) => <React.Fragment key={sd}><P shape="box" size={[w / 2 - 0.05, h - 0.14, 0.02]} pos={[sd * (w / 4), h / 2, 0.3]} color={shade(color, 1.12)} /><P shape="box" size={[0.03, 0.2, 0.03]} pos={[sd * 0.07, h / 2, 0.32]} color="#8d9199" metal={0.6} /></React.Fragment>)}
  </G>
);
