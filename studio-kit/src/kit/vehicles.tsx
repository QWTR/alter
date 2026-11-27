// Vehicles for the 3D world. They are OPTIONAL: use one only when the story is about it or the user asked for it.
// Car (12 kinds; emergency lights exist only on police / ambulance / firetruck), Bike, Boat, Plane, Helicopter,
// Rocket, Ufo, Train, AirBalloon.
import React from 'react';
import { Blob, deg, kitWarn, P, pick, popIn, usePlace, useTextTexture, type Placed, type V3 } from './core3d';
import { shade } from './people';
import { Flame, Puffs } from './things';

const CARS = {
  sedan: { L: 4.3, W: 1.86, body: 0.62, cab: [2.1, 0.58, -0.2], wr: 0.36 },
  hatch: { L: 3.8, W: 1.8, body: 0.62, cab: [2.2, 0.6, -0.42], wr: 0.35 },
  sport: { L: 4.4, W: 1.92, body: 0.5, cab: [1.7, 0.42, -0.35], wr: 0.36 },
  suv: { L: 4.5, W: 1.96, body: 0.8, cab: [2.7, 0.66, -0.35], wr: 0.44 },
  van: { L: 4.8, W: 1.96, body: 0.92, cab: [3.5, 0.76, -0.45], wr: 0.38 },
  pickup: { L: 5.0, W: 1.94, body: 0.74, cab: [1.7, 0.62, 0.45], wr: 0.42 },
  taxi: { L: 4.3, W: 1.86, body: 0.62, cab: [2.1, 0.58, -0.2], wr: 0.36 },
  police: { L: 4.3, W: 1.86, body: 0.62, cab: [2.1, 0.58, -0.2], wr: 0.36 },
  ambulance: { L: 5.0, W: 2.0, body: 1.0, cab: [3.7, 0.95, -0.5], wr: 0.4 },
  firetruck: { L: 7.2, W: 2.3, body: 1.3, cab: [1.9, 1.0, 2.5], wr: 0.5 },
  bus: { L: 9.0, W: 2.4, body: 1.0, cab: [8.7, 1.25, 0], wr: 0.48 },
  truck: { L: 7.0, W: 2.3, body: 0.9, cab: [1.9, 1.2, 2.45], wr: 0.5 },
} as const;
type CarKind = keyof typeof CARS;
const EMERGENCY: CarKind[] = ['police', 'ambulance', 'firetruck'];
const DEFAULT_COLOR: Partial<Record<CarKind, string>> = { taxi: '#f2c230', police: '#f4f6f8', ambulance: '#f7f7f5', firetruck: '#d6322b', bus: '#e2572b', truck: '#3f6fb5' };

const SideText: React.FC<{ text: string; w: number; h: number; x: number; y: number; z?: number; bg: string; fg: string }> = ({ text, w, h, x, y, z = 0, bg, fg }) => {
  const tex = useTextTexture(text, 512, Math.max(32, Math.round(512 * (h / w))), bg, fg);
  return <>{[-1, 1].map((sd) => <mesh key={sd} position={[sd * x, y, z]} rotation={[0, sd * Math.PI / 2, 0]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} /></mesh>)}</>;
};

export interface CarProps extends Placed {
  /** sedan | hatch | sport | suv | van | pickup | taxi | police | ambulance | firetruck | bus | truck */
  kind?: CarKind;
  color?: string;
  plate?: string;
  /** words on the side (a company van, a bus line; police default POLICJA) */
  text?: string;
  /** flashing emergency lights — ONLY police | ambulance | firetruck have them (on by default there; false = off). Ignored on every other kind. */
  siren?: boolean | string;
  /** a driver is visible inside: true, or their colours */
  driver?: boolean | { skin?: string; shirt?: string; hair?: string };
  brake?: boolean; lights?: boolean;
  /** rocket flames on the roof (comedy only) */
  flames?: boolean | number;
  smoke?: boolean; bounce?: number; tilt?: number;
  /** something on the roof rack: a box / luggage colour */
  cargo?: string;
}
/**
 * A car / van / bus / truck. `path` drives it (wheels turn, it faces where it goes).
 * A civilian car NEVER has police lights: lights and sirens exist only on kind="police" | "ambulance" | "firetruck".
 * Keep one car the SAME in every shot: same kind, color and plate.
 */
export const Car: React.FC<CarProps> = (props) => {
  const { plate, siren, brake, lights, flames, smoke, bounce = 0, tilt = 0, scale = 1, at, driver, cargo } = props;
  const kind = pick('Car', props.kind, Object.keys(CARS) as CarKind[], 'sedan');
  const emergency = EMERGENCY.includes(kind);
  if (siren && !emergency) kitWarn(`Car kind="${kind}" has siren set, but a civilian car has no police lights — siren was ignored. For a police car write <Car kind="police" />.`);
  const { L, W, body, cab, wr } = CARS[kind];
  const color = props.color ?? DEFAULT_COLOR[kind] ?? '#c9ccd1';
  const text = props.text ?? (typeof siren === 'string' ? siren : kind === 'police' ? 'POLICJA' : kind === 'taxi' ? 'TAXI' : kind === 'ambulance' ? 'AMBULANS' : '');
  const { p, r, d, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const [cabL, cabH, cabZ] = cab;
  const spin = d / wr;
  const hop = bounce ? Math.abs(Math.sin(t * 9)) * 0.25 * bounce : 0;
  const glass = '#27384d';
  const floor = wr * 0.8; // underside height
  const by = floor + body / 2;
  const top = floor + body; // where the cabin starts
  const big = kind === 'bus' || kind === 'truck' || kind === 'firetruck';
  const wz = big ? L * 0.34 : L * 0.31;
  const wheelZs = kind === 'truck' || kind === 'firetruck' ? [wz, -wz * 0.35, -wz] : [wz, -wz];
  const flashing = emergency && siren !== false;
  const on = Math.floor(t * 6) % 2 === 0;
  const fl = flames ? (typeof flames === 'number' ? flames : 1) : 0;
  const dark = shade(color, 0.72);
  const roofY = top + cabH;
  const drv = driver ? (typeof driver === 'object' ? driver : {}) : null;
  return (
    <group position={[p[0], p[1] + hop, p[2]]} rotation={[0, r, deg(tilt)]} scale={scale * k}>
      {/* lower body */}
      <P size={[W, body, L]} pos={[0, by, 0]} radius={Math.min(0.2, body * 0.3)} color={color} shine={0.55} />
      <P shape="box" size={[W - 0.1, 0.16, L - 0.5]} pos={[0, floor - 0.02, 0]} color="#1c1e22" />
      {/* bumpers, grille, lights */}
      {[1, -1].map((sd) => <P key={sd} size={[W + 0.04, 0.2, 0.18]} pos={[0, floor + 0.13, sd * (L / 2 - 0.02)]} radius={0.06} color="#2a2d33" />)}
      {!big && <P shape="box" size={[W * 0.42, 0.14, 0.04]} pos={[0, by + 0.02, L / 2 + 0.005]} color="#16181c" />}
      {[-1, 1].map((sd) => <P key={`h${sd}`} size={[0.34, 0.17, 0.08]} pos={[sd * (W / 2 - 0.3), by + body * 0.2, L / 2 - 0.01]} radius={0.05} color="#fff6d5" glow={lights ? 2.2 : 0.5} />)}
      {[-1, 1].map((sd) => <P key={`t${sd}`} size={[0.36, 0.15, 0.08]} pos={[sd * (W / 2 - 0.3), by + body * 0.22, -L / 2 + 0.01]} radius={0.04} color="#ff3b30" glow={brake ? 2.6 : 0.45} />)}
      {plate && <PlateTex plate={plate} z={-L / 2 - 0.1} y={floor + 0.3} />}
      {plate && <PlateTex plate={plate} z={L / 2 + 0.1} y={floor + 0.3} front />}
      {/* cabin: glass band with pillars and a roof */}
      {kind !== 'truck' && kind !== 'firetruck' && <>
        <P size={[W - 0.22, cabH * 0.8, cabL - 0.06]} pos={[0, top + cabH * 0.38, cabZ]} radius={0.1} color={glass} shine={0.9} />
        <P size={[W - 0.18, cabH * 0.26, cabL]} pos={[0, top + cabH * 0.87, cabZ]} radius={0.07} color={color} shine={0.55} />
        {[-1, 1].map((sx) => [cabL / 2 - 0.08, -cabL / 2 + 0.08, ...(cabL > 1.9 ? [0.05] : []), ...(kind === 'bus' ? [-3, -1.5, 1.5, 3] : [])].map((z) => <P key={`${sx}${z}`} shape="box" size={[0.07, cabH * 0.86, 0.11]} pos={[sx * (W / 2 - 0.12), top + cabH * 0.4, cabZ + z]} rot={[z === cabL / 2 - 0.08 ? -14 : z === -cabL / 2 + 0.08 ? 12 : 0, 0, 0]} color={color} />))}
      </>}
      {(kind === 'truck' || kind === 'firetruck') && <>
        <P size={[W, cabH, cabL]} pos={[0, top + cabH / 2, cabZ]} radius={0.14} color={color} shine={0.5} />
        <P shape="box" size={[W - 0.3, cabH * 0.42, 0.05]} pos={[0, top + cabH * 0.62, cabZ + cabL / 2 + 0.005]} color={glass} shine={0.9} />
        {[-1, 1].map((sd) => <P key={sd} shape="box" size={[0.05, cabH * 0.38, cabL * 0.5]} pos={[sd * (W / 2 + 0.005), top + cabH * 0.62, cabZ + 0.1]} color={glass} shine={0.9} />)}
      </>}
      {kind === 'truck' && <><P size={[W + 0.06, 2.3, L - 2.3]} pos={[0, top + 1.15, -1.05]} radius={0.05} color={props.cargo ?? '#f1f1ee'} />{text && <SideText text={text} w={(L - 2.3) * 0.8} h={0.7} x={W / 2 + 0.04} y={top + 1.2} z={-1.05} bg={props.cargo ?? '#f1f1ee'} fg="#1d1d1f" />}</>}
      {kind === 'firetruck' && <><P size={[W, 1.0, L - 2.4]} pos={[0, top + 0.5, -1.1]} radius={0.05} color={color} /><group position={[0, top + 1.14, -1.2]} rotation={[deg(-6), 0, 0]}>{[-0.4, 0.4].map((x) => <P key={x} shape="box" size={[0.07, 0.07, L - 2.8]} pos={[x, 0, 0]} color="#d5d8dd" metal={0.5} />)}{Array.from({ length: 9 }, (_, i) => <P key={i} shape="box" size={[0.8, 0.05, 0.05]} pos={[0, 0, -1.9 + i * 0.48]} color="#d5d8dd" metal={0.5} />)}</group><P shape="box" size={[W + 0.02, 0.16, L - 2.5]} pos={[0, top + 0.3, -1.1]} color="#f4f6f8" /></>}
      {kind === 'pickup' && <>{[-1, 1].map((sd) => <P key={sd} shape="box" size={[0.1, 0.42, 2.0]} pos={[sd * (W / 2 - 0.05), top + 0.2, -1.4]} color={color} />)}<P shape="box" size={[W, 0.42, 0.1]} pos={[0, top + 0.2, -L / 2 + 0.06]} color={color} /></>}
      {kind === 'sport' && <><P shape="box" size={[W - 0.2, 0.05, 0.36]} pos={[0, top + 0.26, -L / 2 + 0.3]} color={dark} />{[-1, 1].map((sd) => <P key={sd} shape="box" size={[0.06, 0.24, 0.1]} pos={[sd * (W / 2 - 0.35), top + 0.12, -L / 2 + 0.3]} color={dark} />)}</>}
      {kind === 'suv' && [-1, 1].map((sd) => <P key={sd} shape="box" size={[0.05, 0.05, cabL * 0.8]} pos={[sd * (W / 2 - 0.3), roofY + 0.05, cabZ]} color="#2a2d33" />)}
      {kind === 'taxi' && <TaxiSign y={roofY + 0.11} z={cabZ} text={text} />}
      {/* doors, handles, mirrors */}
      {!big && [-1, 1].map((sx) => <React.Fragment key={sx}>
        {[cabZ + 0.05, cabZ + cabL / 2 - 0.1].map((z) => <P key={z} shape="box" size={[0.012, body * 0.86, 0.025]} pos={[sx * (W / 2 + 0.002), by + 0.02, z]} color={dark} />)}
        <P shape="box" size={[0.03, 0.035, 0.16]} pos={[sx * (W / 2 + 0.01), by + body * 0.3, cabZ + cabL / 4]} color="#d8dbe0" metal={0.5} />
        <P size={[0.16, 0.11, 0.09]} pos={[sx * (W / 2 + 0.07), top + 0.07, cabZ + cabL / 2 - 0.12]} radius={0.03} color={dark} />
      </React.Fragment>)}
      {/* side stripe / words */}
      {kind === 'police' && <><P shape="box" size={[W + 0.014, 0.2, L * 0.82]} pos={[0, by + 0.04, 0]} color="#1d3f9e" />{text && <SideText text={text} w={L * 0.36} h={0.17} x={W / 2 + 0.012} y={by + 0.04} bg="#1d3f9e" fg="#ffffff" />}</>}
      {kind === 'ambulance' && <><P shape="box" size={[W + 0.014, 0.16, L * 0.9]} pos={[0, by - 0.12, 0]} color="#e0352f" /><P shape="box" size={[W + 0.016, 0.5, 0.16]} pos={[0, top + 0.34, -0.9]} color="#e0352f" /><P shape="box" size={[W + 0.016, 0.16, 0.5]} pos={[0, top + 0.34, -0.9]} color="#e0352f" />{text && <SideText text={text} w={1.5} h={0.22} x={W / 2 + 0.014} y={by + 0.22} z={0.9} bg={color} fg="#e0352f" />}</>}
      {(kind === 'van' || kind === 'bus') && text && <SideText text={text} w={kind === 'bus' ? 4 : 2.2} h={kind === 'bus' ? 0.4 : 0.36} x={W / 2 + 0.012} y={by + 0.05} z={kind === 'bus' ? 0 : -0.6} bg={color} fg={shade(color, 0.25)} />}
      {/* driver */}
      {drv && <group scale={0.82} position={[kind === 'bus' ? -0.7 : -0.42, top - 0.3, cabZ + (big ? (kind === 'bus' ? cabL / 2 - 0.9 : 0.1) : cabL / 2 - 0.85)]}><P size={[0.46, 0.42, 0.26]} pos={[0, 0.16, 0]} radius={0.08} color={drv.shirt ?? '#3d7dd8'} /><P size={[0.36, 0.36, 0.34]} pos={[0, 0.56, 0]} radius={0.11} color={drv.skin ?? '#e9b98f'} /><P size={[0.38, 0.12, 0.36]} pos={[0, 0.72, -0.01]} radius={0.05} color={drv.hair ?? '#5a3b22'} /></group>}
      {/* wheels */}
      {wheelZs.map((z) => [-1, 1].map((sx) => (
        <group key={`${z}${sx}`} position={[sx * (W / 2 - 0.1), wr, z]}>
          <P shape="disc" size={[wr * 2 + 0.18, 0.3, wr * 2 + 0.18]} pos={[-sx * 0.07, 0.05, 0]} rot={[0, 0, 90]} color="#17191c" />
          <group rotation={[spin, 0, 0]}>
            <P shape="disc" size={[wr * 2, 0.3, wr * 2]} rot={[0, 0, 90]} color="#1d1f23" />
            <P shape="disc" size={[wr * 1.2, 0.31, wr * 1.2]} rot={[0, 0, 90]} color="#b8bcc4" metal={0.6} shine={0.7} />
            {[0, 60, 120].map((a) => <P key={a} shape="box" size={[0.32, wr * 1.1, 0.06]} rot={[a, 0, 0]} color="#8d9199" />)}
          </group>
        </group>
      )))}
      {/* emergency lights: only emergency kinds */}
      {emergency && <>
        <P size={[kind === 'police' ? 1.1 : W * 0.7, 0.07, 0.3]} pos={[0, roofY + 0.035, kind === 'firetruck' ? cabZ : cabZ + (kind === 'ambulance' ? cabL / 2 - 0.5 : 0)]} radius={0.02} color="#22252b" />
        {[-1, 1].map((sd) => <P key={sd} size={[kind === 'police' ? 0.48 : W * 0.28, 0.15, 0.26]} pos={[sd * (kind === 'police' ? 0.27 : W * 0.18), roofY + 0.13, kind === 'firetruck' ? cabZ : cabZ + (kind === 'ambulance' ? cabL / 2 - 0.5 : 0)]} radius={0.05} color={kind === 'police' && sd < 0 ? '#ff2d2d' : '#2d6bff'} glow={flashing ? ((sd < 0) === on ? 3 : 0.25) : 0.25} />)}
      </>}
      {cargo && kind !== 'truck' && <><P size={[W * 0.62, 0.36, Math.min(1.6, cabL * 0.7)]} pos={[0, roofY + 0.2, cabZ]} radius={0.05} color={cargo} /><P shape="box" size={[W * 0.64, 0.04, 0.08]} pos={[0, roofY + 0.28, cabZ]} color={shade(cargo, 0.6)} /></>}
      {fl > 0 && [-0.45, 0.45].map((x, i) => <Flame key={x} pos={[x, roofY - 0.05, cabZ - 0.2]} size={fl} seed={i} />)}
      {smoke && <Puffs pos={[0.6, 0.45, -L / 2 - 0.3]} />}
      <Blob r={W * 0.72} sx={1} sz={L / 2.4} o={0.2} />
    </group>
  );
};
const PlateTex: React.FC<{ plate: string; z: number; y: number; front?: boolean }> = ({ plate, z, y, front }) => {
  const tex = useTextTexture(plate, 256, 56, '#ffffff', '#111111', '#1f4fbf');
  return <mesh position={[0, y, z]} rotation={[0, front ? 0 : Math.PI, 0]}><planeGeometry args={[0.82, 0.18]} /><meshBasicMaterial map={tex} /></mesh>;
};
const TaxiSign: React.FC<{ y: number; z: number; text: string }> = ({ y, z, text }) => {
  const tex = useTextTexture(text || 'TAXI', 256, 80, '#fff7cf', '#111111');
  return <group position={[0, y, z]}><P size={[0.62, 0.2, 0.22]} radius={0.05} color="#fff7cf" glow={0.6} />{[1, -1].map((sd) => <mesh key={sd} position={[0, 0, sd * 0.112]} rotation={[0, sd > 0 ? 0 : Math.PI, 0]}><planeGeometry args={[0.56, 0.16]} /><meshBasicMaterial map={tex} /></mesh>)}</group>;
};

/** A bicycle (wheels turn when moving). `rider` draws a simple seated rider in those colours. */
export const Bike: React.FC<Placed & { color?: string; rider?: boolean | { skin?: string; shirt?: string; pants?: string; hair?: string; helmet?: string } }> = (props) => {
  const { color = '#d8342c', rider, scale = 1, at } = props;
  const { p, r, d, moving, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const spin = d / 0.34;
  const rd = rider ? (typeof rider === 'object' ? rider : {}) : null;
  const ped = moving ? d * 2.2 : 0;
  return (
    <group position={p} rotation={[0, r, 0]} scale={scale * k}>
      {[0.52, -0.52].map((z) => <group key={z} position={[0, 0.34, z]} rotation={[spin, 0, 0]}><P shape="torus" size={[0.68, 0.05, 0]} rot={[0, 90, 0]} color="#1d1f23" />{[0, 60, 120].map((a) => <P key={a} shape="box" size={[0.012, 0.6, 0.012]} rot={[a, 0, 0]} color="#c9ccd1" />)}</group>)}
      <P shape="cyl" size={[0.045, 0.62, 0.045]} pos={[0, 0.6, 0.02]} rot={[62, 0, 0]} color={color} />
      <P shape="cyl" size={[0.045, 0.56, 0.045]} pos={[0, 0.58, -0.2]} rot={[-18, 0, 0]} color={color} />
      <P shape="cyl" size={[0.04, 0.6, 0.04]} pos={[0, 0.84, 0.02]} rot={[88, 0, 0]} color={color} />
      <P shape="cyl" size={[0.04, 0.56, 0.04]} pos={[0, 0.62, 0.42]} rot={[-20, 0, 0]} color={color} />
      <P shape="cyl" size={[0.035, 0.5, 0.035]} pos={[0, 0.34, -0.3]} rot={[90, 0, 0]} color={color} />
      <P shape="cyl" size={[0.03, 0.46, 0.03]} pos={[0, 0.92, 0.34]} rot={[0, 0, 90]} color="#22252b" />
      <P size={[0.14, 0.05, 0.26]} pos={[0, 0.9, -0.3]} radius={0.02} color="#22252b" />
      {rd && <group position={[0, 0.9, -0.28]}>
        <P size={[0.42, 0.5, 0.26]} pos={[0, 0.36, 0.1]} rot={[25, 0, 0]} radius={0.08} color={rd.shirt ?? '#3d7dd8'} />
        <P size={[0.38, 0.38, 0.36]} pos={[0, 0.82, 0.26]} radius={0.12} color={rd.skin ?? '#e9b98f'} />
        <P shape="dome" size={[0.44, 0.22, 0.44]} pos={[0, 0.9, 0.26]} color={rd.helmet ?? rd.hair ?? '#f2c230'} />
        {[-1, 1].map((sd) => <React.Fragment key={sd}>
          <P size={[0.12, 0.5, 0.14]} pos={[sd * 0.24, 0.42, 0.38]} rot={[62, 0, 0]} radius={0.04} color={rd.shirt ?? '#3d7dd8'} />
          <group position={[sd * 0.12, 0.02, 0.05]} rotation={[-0.9 + Math.sin(ped + (sd > 0 ? Math.PI : 0)) * 0.5, 0, 0]}><P size={[0.15, 0.46, 0.17]} pos={[0, -0.2, 0]} radius={0.05} color={rd.pants ?? '#2c3e66'} /><P size={[0.13, 0.4, 0.15]} pos={[0, -0.5, -0.1]} rot={[35, 0, 0]} radius={0.04} color={rd.pants ?? '#2c3e66'} /></group>
        </React.Fragment>)}
      </group>}
      <Blob r={0.55} sx={0.5} sz={1.6} />
    </group>
  );
};

/** A boat on Water. `kind` sail | motor | row. Rocks gently. */
export const Boat: React.FC<Placed & { kind?: 'sail' | 'motor' | 'row'; color?: string; sail?: string }> = (props) => {
  const { color = '#f4f1ea', sail = '#ffffff', scale = 1, at } = props;
  const kind = pick('Boat', props.kind, ['sail', 'motor', 'row'] as const, 'sail');
  const { p, r, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  return (
    <group position={[p[0], p[1] + 0.05 + Math.sin(t * 1.6) * 0.05, p[2]]} rotation={[Math.sin(t * 1.3) * 0.04, r, Math.sin(t * 1.1) * 0.05]} scale={scale * k}>
      <P size={[1.5, 0.6, 3.6]} pos={[0, 0.2, 0]} radius={0.28} color={color} shine={0.5} />
      <P shape="box" size={[1.52, 0.1, 3.5]} pos={[0, 0.36, 0]} color="#c0392b" />
      <P shape="box" size={[1.2, 0.06, 3.0]} pos={[0, 0.5, 0]} color="#b98a55" />
      {kind === 'sail' && <><P shape="cyl" size={[0.08, 3.4, 0.08]} pos={[0, 2.2, 0.2]} color="#8a5a35" /><P shape="wedge" size={[0.04, 2.8, 1.7]} pos={[0, 2.1, -0.75]} color={sail} /><P shape="wedge" size={[0.04, 2.2, 1.1]} pos={[0, 1.8, 0.85]} rot={[0, 180, 0]} color={shade(sail, 0.92)} /></>}
      {kind === 'motor' && <><P size={[1.1, 0.6, 1.2]} pos={[0, 0.82, 0.3]} radius={0.12} color={color} /><P shape="box" size={[1.0, 0.3, 0.05]} pos={[0, 0.92, 0.9]} color="#27384d" /><P size={[0.3, 0.5, 0.3]} pos={[0, 0.5, -1.85]} radius={0.06} color="#22252b" /></>}
      {kind === 'row' && [-1, 1].map((sd) => <P key={sd} shape="cyl" size={[0.05, 2.2, 0.05]} pos={[sd * 1.1, 0.55, 0]} rot={[0, 0, sd * 70 + Math.sin(t * 2) * 12]} color="#b98a55" />)}
    </group>
  );
};

/** An airliner-style plane (give `pos[1]` for height; flies along `path`). */
export const Plane: React.FC<Placed & { color?: string; stripe?: string }> = (props) => {
  const { color = '#f4f6f8', stripe = '#2d6bff', scale = 1, at } = props;
  const { p, r, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  return (
    <group position={[p[0], p[1] + Math.sin(t * 1.4) * 0.08, p[2]]} rotation={[0, r, Math.sin(t * 0.9) * 0.04]} scale={scale * k}>
      <P shape="capsule" size={[1.3, 9, 1.3]} pos={[0, 1.4, 0]} rot={[90, 0, 0]} color={color} shine={0.6} />
      <P shape="box" size={[1.32, 0.14, 7]} pos={[0, 1.36, 0]} color={stripe} />
      <P size={[11, 0.16, 1.9]} pos={[0, 1.15, 0.2]} radius={0.07} color={color} />
      <P size={[4, 0.12, 1.1]} pos={[0, 1.6, -3.9]} radius={0.05} color={color} />
      <P shape="wedge" size={[0.14, 1.8, 1.6]} pos={[0, 2.5, -3.9]} color={stripe} />
      {[-1, 1].map((sd) => <P key={sd} shape="capsule" size={[0.5, 1.5, 0.5]} pos={[sd * 2.6, 0.8, 0.6]} rot={[90, 0, 0]} color="#8d9199" metal={0.4} />)}
      <P shape="box" size={[1.0, 0.3, 0.05]} pos={[0, 1.75, 4.05]} rot={[-35, 0, 0]} color="#27384d" />
      {Array.from({ length: 9 }, (_, i) => [-1, 1].map((sd) => <P key={`${i}${sd}`} shape="box" size={[0.02, 0.2, 0.24]} pos={[sd * 0.655, 1.62, -2.6 + i * 0.7]} color="#27384d" />))}
    </group>
  );
};

/** A helicopter (the rotor spins; give `pos[1]` for height). */
export const Helicopter: React.FC<Placed & { color?: string }> = (props) => {
  const { color = '#e0352f', scale = 1, at } = props;
  const { p, r, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  return (
    <group position={[p[0], p[1] + Math.sin(t * 2) * 0.06, p[2]]} rotation={[0.06, r, 0]} scale={scale * k}>
      <P shape="ball" size={[1.6, 1.6, 2.4]} pos={[0, 1.3, 0]} color={color} shine={0.5} />
      <P shape="ball" size={[1.3, 1.0, 1.2]} pos={[0, 1.4, 0.75]} color="#27384d" shine={0.9} />
      <P shape="capsule" size={[0.34, 2.8, 0.34]} pos={[0, 1.5, -2.2]} rot={[90, 0, 0]} color={color} />
      <P size={[0.08, 0.7, 0.4]} pos={[0, 1.9, -3.4]} radius={0.03} color={color} />
      <group position={[0.12, 1.7, -3.4]} rotation={[t * 30, 0, 0]}><P shape="box" size={[0.03, 0.9, 0.08]} color="#22252b" /></group>
      <P shape="cyl" size={[0.12, 0.3, 0.12]} pos={[0, 2.2, 0]} color="#22252b" />
      <group position={[0, 2.36, 0]} rotation={[0, t * 24, 0]}>{[0, 90].map((a) => <P key={a} shape="box" size={[5.6, 0.03, 0.2]} rot={[0, a, 0]} color="#22252b" />)}</group>
      {[-1, 1].map((sd) => <React.Fragment key={sd}><P shape="cyl" size={[0.06, 2.2, 0.06]} pos={[sd * 0.7, 0.3, 0]} rot={[90, 0, 0]} color="#8d9199" />{[0.6, -0.6].map((z) => <P key={z} shape="cyl" size={[0.05, 0.5, 0.05]} pos={[sd * 0.6, 0.52, z]} rot={[0, 0, sd * 20]} color="#8d9199" />)}</React.Fragment>)}
    </group>
  );
};

/** A rocket. `launch` = the second it takes off (flames, smoke, then it rises). */
export const Rocket: React.FC<Placed & { color?: string; accent?: string; launch?: number }> = (props) => {
  const { color = '#f4f6f8', accent = '#e0352f', launch, scale = 1, at } = props;
  const { p, r, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const up = launch !== undefined && t > launch ? Math.pow(t - launch, 2) * 6 : 0;
  const rumble = launch !== undefined && t > launch - 0.8 && up < 30 ? Math.sin(t * 60) * 0.03 : 0;
  return (
    <group position={[p[0] + rumble, p[1] + up, p[2]]} rotation={[0, r, 0]} scale={scale * k}>
      <P shape="capsule" size={[1.1, 3.6, 1.1]} pos={[0, 2.4, 0]} color={color} shine={0.6} />
      <P shape="cone" size={[1.1, 1.3, 1.1]} pos={[0, 4.55, 0]} color={accent} />
      <P shape="ball" size={[0.5, 0.5, 0.2]} pos={[0, 3.2, 0.5]} color="#27384d" shine={0.9} />
      <P shape="torus" size={[0.6, 0.07, 0]} pos={[0, 3.2, 0.52]} color="#c9ccd1" metal={0.6} />
      {[0, 90, 180, 270].map((a) => <group key={a} rotation={[0, deg(a), 0]}><P shape="wedge" size={[0.1, 1.1, 0.8]} pos={[0, 1.1, -0.85]} color={accent} /></group>)}
      <P shape="cone" size={[0.8, 0.5, 0.8]} pos={[0, 0.45, 0]} color="#3a3d44" />
      {launch !== undefined && t > launch - 0.5 && <><group rotation={[Math.PI, 0, 0]} position={[0, 0.3, 0]}><Flame size={1.5} /></group>{up < 12 && <Puffs pos={[0, -up, 0]} big={2.5} count={10} />}</>}
    </group>
  );
};

/** A flying saucer (hovers, lights blink; `beam` shines a light cone down). */
export const Ufo: React.FC<Placed & { color?: string; beam?: boolean }> = (props) => {
  const { color = '#9aa3ad', beam, scale = 1, at } = props;
  const { p, r, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  return (
    <group position={[p[0], p[1] + Math.sin(t * 2) * 0.15, p[2]]} rotation={[Math.sin(t * 1.5) * 0.05, r + t * 0.6, 0]} scale={scale * k}>
      <P shape="ball" size={[3.4, 0.7, 3.4]} pos={[0, 0, 0]} color={color} metal={0.6} shine={0.8} />
      <P shape="dome" size={[1.5, 0.75, 1.5]} pos={[0, 0.2, 0]} color="#8fe3ff" opacity={0.75} shine={0.9} />
      {Array.from({ length: 8 }, (_, i) => <P key={i} shape="ball" size={0.2} pos={[Math.sin((i / 8) * Math.PI * 2) * 1.35, -0.12, Math.cos((i / 8) * Math.PI * 2) * 1.35]} color={i % 2 ? '#ffe45c' : '#ff5c8a'} glow={Math.floor(t * 4 + i) % 2 ? 2.5 : 0.4} />)}
      {beam && <mesh position={[0, -Math.max(1, p[1]) / 2 - 0.2, 0]}><coneGeometry args={[Math.max(1, p[1]) * 0.32, Math.max(1, p[1]), 24, 1, true]} /><meshBasicMaterial color="#b9ffd9" transparent opacity={0.28} depthWrite={false} side={2} /></mesh>}
    </group>
  );
};

/** A train: a locomotive and `cars` wagons, on its own track along the path. */
export const Train: React.FC<Placed & { color?: string; cars?: number }> = (props) => {
  const { color = '#2f7d4f', cars = 2, scale = 1, at } = props;
  const { p, r, d, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const spin = d / 0.4;
  const wheels = (z0: number, n: number) => Array.from({ length: n }, (_, i) => [-1, 1].map((sd) => <group key={`${z0}${i}${sd}`} position={[sd * 0.95, 0.4, z0 + (i - (n - 1) / 2) * 1.1]} rotation={[spin, 0, 0]}><P shape="disc" size={[0.8, 0.16, 0.8]} rot={[0, 0, 90]} color="#22252b" /><P shape="box" size={[0.17, 0.6, 0.08]} color="#c0392b" /></group>));
  return (
    <group position={p} rotation={[0, r, 0]} scale={scale * k}>
      <P size={[2.0, 0.5, 5]} pos={[0, 0.85, 0]} radius={0.08} color="#22252b" />
      <P shape="cyl" size={[1.6, 3.2, 1.6]} pos={[0, 1.9, 0.9]} rot={[90, 0, 0]} color={color} shine={0.5} />
      <P size={[2.0, 2.0, 1.6]} pos={[0, 2.1, -1.6]} radius={0.1} color={color} />
      <P size={[2.2, 0.14, 1.9]} pos={[0, 3.16, -1.6]} radius={0.05} color="#c0392b" />
      <P shape="cyl" size={[0.5, 0.8, 0.5]} pos={[0, 3.05, 1.8]} color="#22252b" />
      <Puffs pos={[0, 3.5, 1.8]} big={1.4} />
      <P shape="ball" size={0.36} pos={[0, 1.9, 2.55]} color="#fff6d5" glow={1.5} />
      {[-1, 1].map((sd) => <P key={sd} shape="box" size={[0.03, 0.7, 0.8]} pos={[sd * 1.01, 2.4, -1.6]} color="#27384d" />)}
      {wheels(0, 4)}
      {Array.from({ length: Math.min(6, cars) }, (_, i) => {
        const z = -5.4 - i * 5.2;
        return <group key={i}><P size={[2.0, 0.4, 4.8]} pos={[0, 0.85, z]} radius={0.06} color="#22252b" /><P size={[2.0, 1.9, 4.6]} pos={[0, 2.0, z]} radius={0.12} color={i % 2 ? shade(color, 1.25) : '#c0392b'} /><P size={[2.1, 0.12, 4.8]} pos={[0, 3.0, z]} radius={0.05} color="#3a3d44" />{[-1.4, 0, 1.4].map((wz) => [-1, 1].map((sd) => <P key={`${wz}${sd}`} shape="box" size={[0.03, 0.7, 0.9]} pos={[sd * 1.01, 2.25, z + wz]} color="#27384d" />))}{wheels(z, 4)}</group>;
      })}
    </group>
  );
};

/** A hot-air balloon (floats; give `pos[1]` for height). */
export const AirBalloon: React.FC<Placed & { color?: string; color2?: string }> = (props) => {
  const { color = '#e0352f', color2 = '#f2c230', scale = 1, at } = props;
  const { p, r, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  return (
    <group position={[p[0], p[1] + Math.sin(t * 0.9) * 0.25, p[2]]} rotation={[0, r + t * 0.1, Math.sin(t * 0.7) * 0.03]} scale={scale * k}>
      <P shape="ball" size={[5, 5.6, 5]} pos={[0, 5.6, 0]} color={color} />
      {[0, 45, 90, 135].map((a) => <P key={a} shape="ball" size={[0.7, 5.62, 5.02]} pos={[0, 5.6, 0]} rot={[0, a, 0]} color={color2} />)}
      <P shape="cone" size={[2.2, 1.6, 2.2]} pos={[0, 2.6, 0]} rot={[180, 0, 0]} color={color} />
      {[[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([x, z], i) => <P key={i} shape="cyl" size={[0.03, 1.5, 0.03]} pos={[x, 1.3, z]} color="#5a3b22" />)}
      <P size={[1.2, 0.8, 1.2]} pos={[0, 0.4, 0]} radius={0.08} color="#b98a55" />
    </group>
  );
};
