// People for the 3D world: a toy-like but detailed figure (face that blinks and talks, hair, hats, outfits,
// two-jointed arms and legs, poses, things in the hand) and a Crowd.
import React from 'react';
import * as THREE from 'three';
import { rand } from './stage';
import { Blob, deg, P, pick, popIn, usePlace, useTextTexture, type Placed, type V3 } from './core3d';

/** A darker / lighter version of a colour (k < 1 darker, > 1 lighter). */
export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k <= 1) c.multiplyScalar(k);
  else c.lerp(new THREE.Color('#ffffff'), Math.min(1, k - 1));
  return '#' + c.getHexString();
}

const MOODS = ['flat', 'smile', 'laugh', 'sad', 'shout', 'angry', 'surprised', 'sleep', 'love'] as const;
const POSES = ['stand', 'sit', 'lie', 'cheer', 'point', 'think', 'phone', 'carry', 'shrug', 'facepalm', 'dance', 'hips'] as const;
const HAIRS = ['short', 'long', 'bun', 'ponytail', 'curly', 'bald', 'mohawk', 'bob'] as const;
const HATS = ['none', 'hair', 'cap', 'helmet', 'beanie', 'tophat', 'chef', 'crown', 'cowboy', 'party', 'hardhat', 'headphones'] as const;
const OUTFITS = ['tshirt', 'hoodie', 'suit', 'dress', 'apron', 'coat', 'vest', 'uniform', 'tank'] as const;
const HOLDS = ['none', 'phone', 'cup', 'bag', 'briefcase', 'book', 'flowers', 'box', 'umbrella', 'mic', 'sign', 'balloon', 'bottle', 'pizza', 'money', 'laptop'] as const;

export interface PersonProps extends Placed {
  skin?: string; shirt?: string; pants?: string; hair?: string; shoes?: string;
  /** short | long | bun | ponytail | curly | bald | mohawk | bob */
  hairStyle?: (typeof HAIRS)[number];
  /** none | cap | helmet | beanie | tophat | chef | crown | cowboy | party | hardhat | headphones ("hair" = no hat, kept for old scenes) */
  hat?: (typeof HATS)[number];
  hatColor?: string;
  /** tshirt | hoodie | suit | dress | apron | coat | vest | uniform | tank */
  outfit?: (typeof OUTFITS)[number];
  /** flat | smile | laugh | sad | shout | angry | surprised | sleep | love */
  mood?: (typeof MOODS)[number];
  /** stand | sit | lie | cheer | point | think | phone | carry | shrug | facepalm | dance | hips */
  pose?: (typeof POSES)[number];
  /** something in the hand: phone | cup | bag | briefcase | book | flowers | box | umbrella | mic | sign | balloon | bottle | pizza | money | laptop */
  hold?: (typeof HOLDS)[number];
  holdColor?: string;
  /** text on a held sign */
  holdText?: string;
  glasses?: boolean | 'sun';
  beard?: boolean | string;
  /** adult | child | elder */
  age?: 'adult' | 'child' | 'elder';
  /** the mouth moves: true, or only between [from, to] seconds */
  talk?: boolean | [number, number];
  cry?: boolean; wave?: boolean; jump?: boolean; nod?: boolean; run?: boolean;
  /** shakes the head "no" */
  no?: boolean;
  /** taller / shorter (1 = normal) */
  height?: number;
  /** wider / slimmer body (1 = normal) */
  build?: number;
}

const HeldSign: React.FC<{ text: string; color: string }> = ({ text, color }) => {
  const tex = useTextTexture(text, 384, 192, color, '#111111');
  return (
    <group position={[0, -0.36, 0.05]} rotation={[deg(-75), 0, 0]}>
      <P shape="cyl" size={[0.05, 1.0, 0.05]} pos={[0, 0.45, 0]} color="#9b7a4f" />
      <P shape="box" size={[0.9, 0.46, 0.04]} pos={[0, 1.1, 0]} color={shade(color, 0.85)} />
      <mesh position={[0, 1.1, 0.025]}><planeGeometry args={[0.84, 0.4]} /><meshBasicMaterial map={tex} /></mesh>
    </group>
  );
};

/** What a hand holds; drawn at the hand (the forearm's end), y down the arm. */
const Held: React.FC<{ kind: (typeof HOLDS)[number]; color: string; text?: string; t: number }> = ({ kind, color, text, t }) => {
  const h: V3 = [0, -0.38, 0.04];
  switch (kind) {
    case 'phone': return <group position={h} rotation={[deg(80), 0, 0]}><P size={[0.16, 0.3, 0.03]} radius={0.02} color="#16181d" /><P shape="box" size={[0.13, 0.26, 0.005]} pos={[0, 0, 0.018]} color="#7fd2ff" glow={1.2} /></group>;
    case 'cup': return <group position={h}><P shape="cyl" size={[0.14, 0.18, 0.14]} pos={[0, -0.02, 0.08]} color={color} /><P shape="disc" size={[0.12, 0.01, 0.12]} pos={[0, 0.07, 0.08]} color="#5a3a22" /></group>;
    case 'bottle': return <group position={h}><P shape="cyl" size={[0.11, 0.26, 0.11]} pos={[0, 0, 0.08]} color={color} shine={0.7} /><P shape="cyl" size={[0.05, 0.1, 0.05]} pos={[0, 0.17, 0.08]} color={color} shine={0.7} /></group>;
    case 'bag': return <group position={[0, -0.44, 0]}><P shape="torus" size={[0.2, 0.025, 0]} pos={[0, -0.02, 0]} color={shade(color, 0.7)} /><P size={[0.36, 0.32, 0.16]} pos={[0, -0.26, 0]} color={color} /></group>;
    case 'briefcase': return <group position={[0, -0.44, 0]}><P shape="torus" size={[0.14, 0.025, 0]} pos={[0, -0.03, 0]} color="#222" /><P size={[0.46, 0.32, 0.12]} pos={[0, -0.24, 0]} color={color} /><P shape="box" size={[0.08, 0.05, 0.13]} pos={[0, -0.14, 0]} color="#d8b24a" metal={0.6} /></group>;
    case 'book': return <group position={h} rotation={[deg(70), 0, 0]}><P size={[0.24, 0.32, 0.06]} radius={0.01} color={color} /><P shape="box" size={[0.21, 0.29, 0.065]} pos={[0.01, 0, 0]} color="#f4f1e6" /></group>;
    case 'flowers': return <group position={h} rotation={[deg(20), 0, 0]}><P shape="cone" size={[0.16, 0.3, 0.16]} pos={[0, 0.04, 0.06]} rot={[180, 0, 0]} color="#e9e2cf" />{[[-0.07, 0.24, 0.06], [0.07, 0.25, 0.04], [0, 0.3, 0.09], [0, 0.22, 0.0]].map((p, i) => <P key={i} shape="ball" size={0.11} pos={p as V3} color={[color, '#ffd34d', '#ff8fb1', '#ffffff'][i]} />)}</group>;
    case 'umbrella': return <group position={h} rotation={[deg(-80), 0, 0]}><P shape="cyl" size={[0.03, 1.2, 0.03]} pos={[0, 0.55, 0]} color="#333" /><P shape="dome" size={[1.5, 0.32, 1.5]} pos={[0, 1.1, 0]} color={color} /></group>;
    case 'mic': return <group position={h} rotation={[deg(60), 0, 0]}><P shape="cyl" size={[0.05, 0.24, 0.05]} pos={[0, 0.08, 0]} color="#222" /><P shape="ball" size={0.11} pos={[0, 0.24, 0]} color="#8a8f98" metal={0.5} /></group>;
    case 'balloon': return <group position={h}><P shape="cyl" size={[0.012, 1.1, 0.012]} pos={[0, 0.6, 0]} rot={[0, 0, Math.sin(t * 2) * 4]} color="#ddd" /><P shape="ball" size={[0.42, 0.5, 0.42]} pos={[Math.sin(t * 2) * 0.04, 1.35, 0]} color={color} shine={0.7} /></group>;
    case 'pizza': return <group position={h} rotation={[deg(85), 0, 0]}><P shape="box" size={[0.46, 0.46, 0.06]} pos={[0, 0.1, 0.02]} color="#d9c7a3" /><P shape="disc" size={[0.38, 0.38, 0.02]} pos={[0, 0.1, 0.06]} rot={[90, 0, 0]} color="#e8a23a" /></group>;
    case 'money': return <group position={h} rotation={[deg(40), 0, 0]}>{[-12, 0, 12].map((a) => <P key={a} shape="box" size={[0.14, 0.28, 0.01]} pos={[a / 120, 0.1, 0.03]} rot={[0, 0, a]} color="#5fb66a" />)}</group>;
    case 'laptop': return <group position={[0, -0.36, 0.14]} rotation={[deg(80), 0, 0]}><P size={[0.5, 0.34, 0.03]} radius={0.01} color="#b9bec7" metal={0.4} /><P shape="box" size={[0.5, 0.32, 0.02]} pos={[0, 0.17, 0.15]} rot={[-75, 0, 0]} color="#2a2d33" /></group>;
    case 'sign': return <HeldSign text={text ?? '!'} color={color} />;
    default: return null;
  }
};

/**
 * A person. Walks when moving along `path` (`run` = running). See PersonProps for looks, poses and what the hand holds.
 * Keep one character the SAME in every shot: same skin, shirt, pants, hair, hairStyle, hat, outfit, glasses, beard.
 */
export const Person: React.FC<PersonProps> = (props) => {
  const { skin = '#e9b98f', shirt = '#3d7dd8', pants = '#2c3e66', hair = '#5a3b22', shoes = '#f2f2f2', hatColor = '#d23a2f', glasses, beard, cry, wave, jump, nod, no, run, talk, scale = 1, height = 1, build = 1, at, holdColor = '#e8e2d0', holdText } = props;
  const age = props.age ?? 'adult';
  const mood = pick('Person mood', props.mood, MOODS, 'flat');
  const pose = pick('Person pose', props.pose, POSES, 'stand');
  const hairStyle = pick('Person hairStyle', props.hairStyle, HAIRS, 'short');
  const hatRaw = pick('Person hat', props.hat, HATS, 'none');
  const hat = hatRaw === 'hair' ? 'none' : hatRaw;
  const outfit = pick('Person outfit', props.outfit, OUTFITS, 'tshirt');
  let hold = pick('Person hold', props.hold, HOLDS, 'none');
  if (pose === 'phone' && hold === 'none') hold = 'phone';
  if (pose === 'carry' && hold === 'none') hold = 'box';
  const { p, r, d, moving, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;

  const seed = rand(`${shirt}${hair}${props.pos?.join() ?? ''}`);
  const hairC = age === 'elder' && props.hair === undefined ? '#d9d9d9' : hair;
  const stride = run ? 4.4 : 3.2;
  const amp = run ? 0.95 : 0.6;
  const cyc = d * stride;
  const walking = moving && pose !== 'sit' && pose !== 'lie';
  const swing = walking ? Math.sin(cyc) * amp : 0;
  const bob = walking ? Math.abs(Math.sin(cyc)) * (run ? 0.1 : 0.05) : 0;
  const hop = jump ? Math.abs(Math.sin(t * 6)) * 0.6 : pose === 'cheer' ? Math.abs(Math.sin(t * 7)) * 0.18 : 0;
  const breathe = Math.sin(t * 2.2 + seed * 6) * 0.012;
  const dance = pose === 'dance' ? Math.sin(t * 6) : 0;

  // legs: [thigh, knee] angles per side (radians; negative = forward)
  const sit = pose === 'sit';
  const leg = (side: number) => {
    if (sit) return [-Math.PI / 2 + 0.05, Math.PI / 2 - 0.05];
    const s = side * swing;
    return [s + (pose === 'dance' ? side * dance * 0.25 : 0), walking ? Math.max(0, Math.sin(cyc + (side > 0 ? Math.PI : 0) + 0.9)) * (run ? 1.3 : 0.75) : 0];
  };
  // arms: [shoulder forward(−)/back(+), shoulder out, elbow]; index 0 = the left arm (x < 0), 1 = the main arm
  const arm = (i: number): [number, number, number] => {
    const side = i ? 1 : -1;
    const base: [number, number, number] = [-side * swing * 0.9, 0.07, walking ? -0.35 - (run ? 0.9 : 0) : -0.12];
    if (wave && i === 1) return [0, 2.5 + Math.sin(t * 10) * 0.3, -0.5];
    switch (pose) {
      case 'cheer': return [0, 2.55 + Math.sin(t * 9 + i) * 0.2, -0.3];
      case 'point': return i === 1 ? [-1.5, 0.05, 0] : base;
      case 'think': return i === 1 ? [-0.75, 0.1, -2.15] : [-0.2, 0.05, -1.5];
      case 'phone': return i === 1 ? [-0.95, 0.12, -1.75] : base;
      case 'facepalm': return i === 1 ? [-1.05, -0.25, -2.25] : base;
      case 'carry': return [-0.55, 0.05, -1.05];
      case 'shrug': return [-0.1, 0.5, -1.7];
      case 'hips': return [0.25, 0.55, -1.35];
      case 'sit': return [-0.55, 0.08, -0.75];
      case 'dance': return [0, 1.5 + side * dance * 0.9, -0.9];
      default: break;
    }
    if (hold !== 'none' && i === 1 && !['bag', 'briefcase'].includes(hold)) return [-0.5, 0.08, hold === 'umbrella' || hold === 'balloon' || hold === 'sign' ? -1.3 : -1.1];
    return base;
  };

  const long = outfit !== 'tshirt' && outfit !== 'tank' && outfit !== 'dress' && outfit !== 'apron' && outfit !== 'vest';
  const sleeve = outfit === 'tank' ? skin : shirt;
  const legC = outfit === 'dress' ? skin : pants;
  const talking = talk === true || (Array.isArray(talk) && t >= talk[0] && t <= talk[1]);
  const open = talking ? 0.03 + Math.abs(Math.sin(t * 13)) * 0.11 : 0;
  const blink = mood === 'sleep' || ((t + seed * 3) % 3.1) < 0.12;
  const browTilt = mood === 'sad' ? 0.38 : mood === 'angry' ? -0.45 : 0;
  const browY = mood === 'surprised' ? 2.1 : 2.065;
  const headRot: V3 = [nod ? Math.sin(t * 7) * 0.22 : mood === 'sad' ? 0.18 : 0, no ? Math.sin(t * 8) * 0.35 : 0, pose === 'think' ? 0.12 : 0];
  const lean = (run && walking ? 0.22 : 0) + (age === 'elder' ? 0.1 : 0);
  const sitDrop = sit ? -0.4 : 0;
  const childHead = age === 'child' ? 1.28 : 1;
  const all = scale * k * (age === 'child' ? 0.62 : 1);

  const body = (
    <group position={[0, bob + hop + sitDrop, 0]} rotation={[lean, 0, dance * 0.08]}>
      {/* legs */}
      {[-1, 1].map((side) => {
        const [a, b] = leg(side);
        return (
          <group key={side} position={[side * 0.145 * build, 0.9, 0]} rotation={[a, 0, 0]}>
            <P size={[0.23 * build, 0.46, 0.25]} pos={[0, -0.2, 0]} color={legC} />
            <group position={[0, -0.42, 0]} rotation={[b, 0, 0]}>
              <P size={[0.2 * build, 0.42, 0.22]} pos={[0, -0.19, 0]} color={legC} />
              <P size={[0.23, 0.13, 0.36]} pos={[0, -0.42, 0.055]} radius={0.05} color={shoes} />
            </group>
          </group>
        );
      })}
      {/* hips + torso */}
      <P size={[0.56 * build, 0.2, 0.33]} pos={[0, 0.93, 0]} color={outfit === 'dress' ? shirt : pants} />
      <P size={[0.62 * build, 0.72 + breathe, 0.37]} pos={[0, 1.25, 0]} radius={0.12} color={shirt} />
      {outfit === 'dress' && <P shape="cone" size={[0.92 * build, 0.62, 0.7]} pos={[0, 0.82, 0]} color={shirt} />}
      {outfit === 'coat' && <P size={[0.64 * build, 0.42, 0.39]} pos={[0, 0.82, 0]} radius={0.06} color={shirt} />}
      {outfit === 'hoodie' && <><P size={[0.5, 0.26, 0.24]} pos={[0, 1.6, -0.14]} radius={0.1} color={shade(shirt, 0.88)} /><P size={[0.34, 0.16, 0.04]} pos={[0, 1.04, 0.175]} color={shade(shirt, 0.85)} />{[-0.06, 0.06].map((x) => <P key={x} shape="cyl" size={[0.018, 0.2, 0.018]} pos={[x, 1.44, 0.19]} color="#f2f2f2" />)}</>}
      {outfit === 'suit' && <><P shape="box" size={[0.17, 0.34, 0.02]} pos={[0, 1.42, 0.19]} color="#ffffff" /><P shape="box" size={[0.07, 0.3, 0.025]} pos={[0, 1.4, 0.195]} color={hatColor} />{[-1, 1].map((sd) => <P key={sd} shape="box" size={[0.1, 0.4, 0.02]} pos={[sd * 0.13, 1.4, 0.2]} rot={[0, 0, sd * 16]} color={shade(shirt, 0.82)} />)}{[1.15, 1.02].map((y) => <P key={y} shape="ball" size={0.035} pos={[0, y, 0.195]} color="#1b1b1b" />)}</>}
      {outfit === 'apron' && <><P shape="box" size={[0.5 * build, 0.78, 0.03]} pos={[0, 1.08, 0.195]} color="#f4f1ea" /><P shape="box" size={[0.26, 0.14, 0.035]} pos={[0, 1.0, 0.2]} color="#e2ddd0" /></>}
      {outfit === 'vest' && <><P size={[0.64 * build, 0.6, 0.39]} pos={[0, 1.26, 0]} radius={0.1} color="#f5d20a" />{[1.38, 1.12].map((y) => <P key={y} shape="box" size={[0.65 * build, 0.06, 0.395]} pos={[0, y, 0]} color="#e9eef2" glow={0.25} />)}</>}
      {outfit === 'uniform' && <><P shape="box" size={[0.63 * build, 0.07, 0.38]} pos={[0, 0.98, 0]} color="#1b1d22" /><P shape="box" size={[0.09, 0.09, 0.02]} pos={[0, 0.98, 0.195]} color="#d8b24a" metal={0.6} /><P shape="box" size={[0.1, 0.12, 0.02]} pos={[-0.17, 1.42, 0.19]} color="#d8b24a" metal={0.6} />{[-1, 1].map((sd) => <P key={sd} shape="box" size={[0.16, 0.04, 0.3]} pos={[sd * 0.28, 1.615, 0]} color={shade(shirt, 0.7)} />)}</>}
      {outfit === 'tshirt' && <P shape="torus" size={[0.24, 0.035, 0]} pos={[0, 1.6, 0]} rot={[90, 0, 0]} color={shade(shirt, 0.82)} />}
      {/* neck */}
      <P shape="cyl" size={[0.19, 0.12, 0.19]} pos={[0, 1.65, 0]} color={shade(skin, 0.93)} />
      {/* arms */}
      {[0, 1].map((i) => {
        const side = i ? 1 : -1;
        const [sx, out, el] = arm(i);
        return (
          <group key={i} position={[side * (0.4 * build), 1.52, 0]} rotation={[sx, 0, side * out]}>
            <P size={[0.2, 0.4, 0.23]} pos={[0, -0.16, 0]} color={sleeve} />
            <group position={[0, -0.34, 0]} rotation={[el, 0, 0]}>
              <P size={[0.17, 0.36, 0.2]} pos={[0, -0.15, 0]} color={long ? shirt : skin} />
              <P shape="ball" size={[0.17, 0.18, 0.19]} pos={[0, -0.37, 0]} color={skin} />
              {i === 1 && hold !== 'none' && hold !== 'box' && <Held kind={hold} color={holdColor} text={holdText} t={t} />}
            </group>
          </group>
        );
      })}
      {hold === 'box' && <group position={[0, 1.12, 0.42]}><P size={[0.56, 0.42, 0.42]} radius={0.02} color={holdColor === '#e8e2d0' ? '#c79a5b' : holdColor} /><P shape="box" size={[0.57, 0.06, 0.1]} pos={[0, 0.19, 0]} color="#e9d9b5" /></group>}
      {/* head */}
      <group position={[0, 1.93, 0]} rotation={headRot} scale={childHead}>
        <group position={[0, -1.93, 0]}>
          <P size={[0.55, 0.53, 0.51]} pos={[0, 1.93, 0]} radius={0.17} color={skin} />
          {[-1, 1].map((sd) => <P key={sd} shape="ball" size={[0.07, 0.13, 0.11]} pos={[sd * 0.28, 1.92, 0]} color={shade(skin, 0.92)} />)}
          <P shape="ball" size={[0.08, 0.07, 0.07]} pos={[0, 1.9, 0.265]} color={shade(skin, 0.9)} />
          {/* eyes */}
          {[-1, 1].map((sd) => (
            <group key={sd} position={[sd * 0.12, 1.975, 0.25]}>
              {glasses === 'sun' ? null : blink ? <P shape="box" size={[0.12, 0.022, 0.02]} pos={[0, -0.01, 0.012]} color="#2a1c14" /> : (
                <>
                  <P shape="ball" size={[0.13, mood === 'surprised' ? 0.17 : 0.145, 0.05]} color="#ffffff" noShadow />
                  <P shape="ball" size={[0.07, 0.08, 0.04]} pos={[0, mood === 'sad' ? -0.015 : 0, 0.018]} color={mood === 'love' ? '#ff4f8b' : '#1d1410'} noShadow />
                  <P shape="ball" size={0.022} pos={[0.015, 0.022, 0.038]} color="#ffffff" noShadow />
                </>
              )}
              <P shape="box" size={[0.15, 0.032, 0.025]} pos={[0, browY - 1.975 + (mood === 'angry' ? -0.02 : 0), 0.015]} rot={[0, 0, sd * browTilt * 57.3]} color={shade(hairC, 0.75)} />
            </group>
          ))}
          {/* mouth */}
          {(() => {
            const z = 0.262;
            if (talking) return <P shape="ball" size={[0.15, open + 0.03, 0.03]} pos={[0, 1.79, z]} color="#5b1d1d" noShadow />;
            switch (mood) {
              case 'smile': case 'love': return <>{<P shape="box" size={[0.18, 0.035, 0.02]} pos={[0, 1.785, z]} color="#7a3b2e" />}{[-1, 1].map((sd) => <P key={sd} shape="box" size={[0.06, 0.035, 0.02]} pos={[sd * 0.105, 1.805, z]} rot={[0, 0, sd * 35]} color="#7a3b2e" />)}</>;
              case 'laugh': return <><P shape="ball" size={[0.21, 0.15, 0.03]} pos={[0, 1.78, z]} color="#5b1d1d" noShadow /><P shape="box" size={[0.16, 0.035, 0.02]} pos={[0, 1.835, z + 0.012]} color="#ffffff" /></>;
              case 'shout': return <><P shape="ball" size={[0.17, 0.19, 0.03]} pos={[0, 1.775, z]} color="#5b1d1d" noShadow /><P shape="ball" size={[0.1, 0.07, 0.02]} pos={[0, 1.72, z + 0.012]} color="#e0596b" noShadow /></>;
              case 'sad': return <>{<P shape="box" size={[0.15, 0.035, 0.02]} pos={[0, 1.79, z]} color="#7a3b2e" />}{[-1, 1].map((sd) => <P key={sd} shape="box" size={[0.06, 0.035, 0.02]} pos={[sd * 0.095, 1.772, z]} rot={[0, 0, -sd * 35]} color="#7a3b2e" />)}</>;
              case 'angry': return <P shape="box" size={[0.17, 0.045, 0.02]} pos={[0, 1.78, z]} color="#5b1d1d" />;
              case 'surprised': return <P shape="ball" size={[0.09, 0.11, 0.03]} pos={[0, 1.78, z]} color="#5b1d1d" noShadow />;
              default: return <P shape="box" size={[0.14, 0.032, 0.02]} pos={[0, 1.785, z]} color="#7a3b2e" />;
            }
          })()}
          {beard && <><P size={[0.5, 0.2, 0.2]} pos={[0, 1.72, 0.17]} radius={0.08} color={typeof beard === 'string' ? beard : shade(hairC, 0.9)} /><P shape="box" size={[0.22, 0.04, 0.03]} pos={[0, 1.83, 0.262]} color={typeof beard === 'string' ? beard : shade(hairC, 0.9)} /></>}
          {glasses && (glasses === 'sun'
            ? <><P shape="box" size={[0.46, 0.11, 0.03]} pos={[0, 1.975, 0.275]} color="#111111" shine={0.9} />{[-1, 1].map((sd) => <P key={sd} shape="box" size={[0.02, 0.03, 0.3]} pos={[sd * 0.275, 1.98, 0.12]} color="#111" />)}</>
            : <>{[-1, 1].map((sd) => <P key={sd} shape="torus" size={[0.17, 0.022, 0]} pos={[sd * 0.12, 1.975, 0.285]} color="#22252b" />)}<P shape="box" size={[0.08, 0.02, 0.02]} pos={[0, 1.98, 0.285]} color="#22252b" /></>)}
          {/* hair */}
          {hat !== 'helmet' && hat !== 'hardhat' && hairStyle !== 'bald' && (
            <>
              {hairStyle !== 'mohawk' && hairStyle !== 'curly' && <><P size={[0.59, 0.2, 0.56]} pos={[0, 2.135, -0.01]} radius={0.09} color={hairC} /><P size={[0.59, 0.36, 0.14]} pos={[0, 2.0, -0.225]} radius={0.06} color={hairC} /></>}
              {hairStyle === 'short' && <P size={[0.5, 0.09, 0.1]} pos={[0.03, 2.17, 0.24]} radius={0.04} color={hairC} />}
              {(hairStyle === 'long' || hairStyle === 'bob') && <>
                <P size={[0.62, hairStyle === 'long' ? 0.78 : 0.46, 0.16]} pos={[0, hairStyle === 'long' ? 1.78 : 1.93, -0.24]} radius={0.07} color={hairC} />
                {[-1, 1].map((sd) => <P key={sd} size={[0.11, hairStyle === 'long' ? 0.62 : 0.4, 0.34]} pos={[sd * 0.285, hairStyle === 'long' ? 1.85 : 1.95, -0.06]} radius={0.05} color={hairC} />)}
                <P size={[0.5, 0.08, 0.1]} pos={[0, 2.16, 0.24]} radius={0.04} color={hairC} />
              </>}
              {hairStyle === 'bun' && <P shape="ball" size={0.26} pos={[0, 2.3, -0.12]} color={hairC} />}
              {hairStyle === 'ponytail' && <group position={[0, 2.08, -0.3]} rotation={[0.5 + Math.sin(cyc) * 0.12, 0, Math.sin(t * 3) * 0.05]}><P shape="capsule" size={[0.16, 0.56, 0.16]} pos={[0, -0.24, 0]} color={hairC} /></group>}
              {hairStyle === 'curly' && [[0, 2.2, 0], [-0.2, 2.14, 0.08], [0.2, 2.14, 0.08], [-0.24, 2.05, -0.12], [0.24, 2.05, -0.12], [0, 2.12, -0.22], [-0.14, 2.24, -0.1], [0.14, 2.24, -0.1], [0, 2.0, -0.28]].map((q, i) => <P key={i} shape="ball" size={0.28} pos={q as V3} color={hairC} />)}
              {hairStyle === 'mohawk' && <P size={[0.1, 0.3, 0.52]} pos={[0, 2.26, -0.02]} radius={0.04} color={hairC} />}
            </>
          )}
          {/* hats */}
          {hat === 'cap' && <><P shape="dome" size={[0.6, 0.2, 0.58]} pos={[0, 2.13, 0]} color={hatColor} /><P size={[0.46, 0.04, 0.3]} pos={[0, 2.14, 0.36]} radius={0.015} color={shade(hatColor, 0.85)} /></>}
          {(hat === 'helmet' || hat === 'hardhat') && <><P shape="dome" size={[0.66, 0.34, 0.64]} pos={[0, 2.02, 0]} color={hat === 'hardhat' && props.hatColor === undefined ? '#f2c230' : hatColor} shine={0.6} />{hat === 'hardhat' && <P size={[0.5, 0.035, 0.22]} pos={[0, 2.04, 0.34]} radius={0.01} color={props.hatColor === undefined ? '#f2c230' : hatColor} />}</>}
          {hat === 'beanie' && <><P shape="dome" size={[0.62, 0.3, 0.6]} pos={[0, 2.08, 0]} color={hatColor} /><P shape="torus" size={[0.6, 0.09, 0]} pos={[0, 2.09, 0]} rot={[90, 0, 0]} color={shade(hatColor, 0.8)} /><P shape="ball" size={0.14} pos={[0, 2.42, 0]} color="#ffffff" /></>}
          {hat === 'tophat' && <><P shape="disc" size={[0.72, 0.03, 0.72]} pos={[0, 2.2, 0]} color={hatColor} /><P shape="cyl" size={[0.46, 0.42, 0.46]} pos={[0, 2.42, 0]} color={hatColor} /><P shape="cyl" size={[0.47, 0.07, 0.47]} pos={[0, 2.26, 0]} color="#b8232f" /></>}
          {hat === 'chef' && <><P shape="cyl" size={[0.5, 0.2, 0.5]} pos={[0, 2.28, 0]} color="#ffffff" />{[[0, 2.5, 0], [-0.16, 2.46, 0.05], [0.16, 2.46, 0.05], [0, 2.46, -0.15]].map((q, i) => <P key={i} shape="ball" size={0.34} pos={q as V3} color="#ffffff" />)}</>}
          {hat === 'crown' && <><P shape="cyl" size={[0.5, 0.14, 0.5]} pos={[0, 2.27, 0]} color="#f2c230" metal={0.7} shine={0.8} />{[0, 72, 144, 216, 288].map((a) => <P key={a} shape="cone" size={[0.12, 0.18, 0.12]} pos={[Math.sin(deg(a)) * 0.21, 2.42, Math.cos(deg(a)) * 0.21]} color="#f2c230" metal={0.7} shine={0.8} />)}<P shape="ball" size={0.07} pos={[0, 2.28, 0.25]} color="#e0354b" shine={0.9} /></>}
          {hat === 'cowboy' && <><P shape="disc" size={[0.95, 0.03, 0.8]} pos={[0, 2.19, 0]} color={hatColor} /><P size={[0.46, 0.26, 0.44]} pos={[0, 2.32, 0]} radius={0.1} color={hatColor} /></>}
          {hat === 'party' && <><P shape="cone" size={[0.3, 0.46, 0.3]} pos={[0, 2.44, 0]} color={hatColor} /><P shape="ball" size={0.09} pos={[0, 2.68, 0]} color="#ffd34d" /></>}
          {hat === 'headphones' && <><P shape="torus" size={[0.62, 0.05, 0]} pos={[0, 1.98, 0]} rot={[0, 0, 0]} color="#22252b" />{[-1, 1].map((sd) => <P key={sd} shape="cyl" size={[0.2, 0.09, 0.2]} pos={[sd * 0.31, 1.94, 0]} rot={[0, 0, 90]} color={hatColor} />)}</>}
          {/* tears */}
          {cry && [-0.12, 0.12].map((x, i) => Array.from({ length: 3 }, (_, j) => {
            const a = (t * 1.6 + j / 3 + i * 0.17) % 1;
            return <P key={`${x}-${j}`} shape="ball" size={[0.06, 0.1, 0.05]} pos={[x, 1.92 - a * 0.9, 0.28 + a * 0.12]} color="#6cc3ff" glow={0.5} opacity={1 - a} />;
          }))}
          {mood === 'sleep' && [0, 1, 2].map((j) => {
            const a = (t * 0.5 + j / 3) % 1;
            return <P key={j} shape="box" size={[0.1 + a * 0.1, 0.1 + a * 0.1, 0.02]} pos={[0.3 + a * 0.4, 2.3 + a * 0.7, 0]} color="#ffffff" opacity={1 - a} />;
          })}
        </group>
      </group>
    </group>
  );

  return (
    <group position={[p[0], p[1], p[2]]}>
      {p[1] < 0.5 && <Blob r={(pose === 'lie' ? 0.9 : 0.45) * all} />}
      <group rotation={[0, r, 0]} scale={[all, all * height, all]}>
        {pose === 'lie' ? <group position={[0, 0.2, 0.95]} rotation={[-Math.PI / 2, 0, 0]}>{body}</group> : body}
      </group>
    </group>
  );
};

const SKINS = ['#e9b98f', '#f3cda8', '#c98e62', '#8d5a3b', '#6b4329', '#f0c9a0'];
const SHIRTS = ['#3d7dd8', '#c0392b', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#e84393', '#34495e', '#f5f5f5', '#d35400'];
const PANTS = ['#2c3e66', '#3b3b2f', '#1f2329', '#5d4037', '#455a64', '#7b8794'];
const HAIRC = ['#5a3b22', '#1c1410', '#c9a05a', '#8b3a1a', '#d9d9d9', '#3a2a1c'];
/**
 * A crowd of different people standing in an area (`size` [w, d] around `pos`). `cheer` makes them jump and wave,
 * `look` turns them all to face a point [x, z]. Up to 40.
 */
export const Crowd: React.FC<{ pos?: V3; size?: [number, number]; count?: number; seed?: string; cheer?: boolean; face?: number; look?: [number, number]; mood?: PersonProps['mood'] }> = ({ pos = [0, 0, 0], size = [8, 4], count = 14, seed = 'crowd', cheer, face = 0, look, mood }) => (
  <>
    {Array.from({ length: Math.min(40, count) }, (_, i) => {
      const r = (n: string) => rand(`${seed}${n}${i}`);
      const x = pos[0] + (r('x') - 0.5) * size[0];
      const z = pos[2] + (r('z') - 0.5) * size[1];
      const pk = <T,>(arr: T[], n: string) => arr[Math.floor(r(n) * arr.length)];
      return (
        <Person key={i} pos={[x, pos[1], z]} face={look ? (Math.atan2(look[0] - x, look[1] - z) * 180) / Math.PI : face + (r('f') - 0.5) * 30}
          skin={pk(SKINS, 's')} shirt={pk(SHIRTS, 'h')} pants={pk(PANTS, 'p')} hair={pk(HAIRC, 'c')}
          hairStyle={pk([...HAIRS], 'y')} hat={r('t') > 0.8 ? pk(['cap', 'beanie'] as const, 'q') : 'none'} hatColor={pk(SHIRTS, 'k')}
          outfit={pk(['tshirt', 'hoodie', 'tshirt', 'dress', 'coat'] as const, 'o')} glasses={r('g') > 0.82}
          mood={mood ?? (cheer ? 'laugh' : pk(['flat', 'smile', 'smile'] as const, 'm'))} pose={cheer && r('c2') > 0.35 ? 'cheer' : 'stand'}
          height={0.92 + r('e') * 0.16} build={0.92 + r('b') * 0.2} />
      );
    })}
  </>
);
