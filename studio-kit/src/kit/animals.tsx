// Animals for the 3D world: one parametric four-legged builder (dog, cat, cow, pig, sheep, horse, fox, bear, rabbit,
// mouse, elephant, lion, deer), small two-legged ones (chicken, duck, penguin, frog), a fish and the pigeon-like Bird.
import React from 'react';
import { rand } from './stage';
import { Blob, P, pick, popIn, usePlace, type Placed, type V3 } from './core3d';
import { shade } from './people';

interface Quad {
  body: V3; legH: number; legW: number; head: V3; headUp: number; headFwd: number; neck?: number;
  snout: V3; ear: 'point' | 'flop' | 'round' | 'long' | 'none' | 'big'; tail: 'thin' | 'bushy' | 'curl' | 'stub' | 'long' | 'tuft' | 'none';
  color: string; belly?: string; nose?: string; extra?: 'horns' | 'mane' | 'wool' | 'trunk' | 'antlers' | 'spots' | 'lionmane' | 'stripes' | 'whiskers'; hoof?: string;
}
const QUADS: Record<string, Quad> = {
  dog: { body: [0.42, 0.42, 0.9], legH: 0.42, legW: 0.13, head: [0.38, 0.36, 0.38], headUp: 0.24, headFwd: 0.2, snout: [0.2, 0.17, 0.22], ear: 'flop', tail: 'thin', color: '#c58a4a', belly: '#f0dcc0', nose: '#22201f' },
  cat: { body: [0.3, 0.3, 0.66], legH: 0.26, legW: 0.09, head: [0.32, 0.29, 0.29], headUp: 0.16, headFwd: 0.12, snout: [0.14, 0.09, 0.07], ear: 'point', tail: 'long', color: '#8a8f98', belly: '#e9e9ec', nose: '#e48a9a', extra: 'whiskers' },
  cow: { body: [0.78, 0.76, 1.7], legH: 0.62, legW: 0.19, head: [0.46, 0.46, 0.6], headUp: 0.14, headFwd: 0.34, snout: [0.4, 0.26, 0.2], ear: 'flop', tail: 'tuft', color: '#f4f1ea', belly: '#f4f1ea', nose: '#e6a3a8', extra: 'spots', hoof: '#2a2522' },
  pig: { body: [0.56, 0.5, 0.95], legH: 0.24, legW: 0.14, head: [0.46, 0.42, 0.4], headUp: 0.04, headFwd: 0.2, snout: [0.22, 0.17, 0.12], ear: 'point', tail: 'curl', color: '#f2a7b0', nose: '#e07f8d', hoof: '#a8626c' },
  sheep: { body: [0.6, 0.56, 0.95], legH: 0.34, legW: 0.1, head: [0.28, 0.3, 0.34], headUp: 0.1, headFwd: 0.24, snout: [0.2, 0.16, 0.12], ear: 'flop', tail: 'stub', color: '#f7f4ec', nose: '#2a2522', extra: 'wool', hoof: '#2a2522' },
  horse: { body: [0.6, 0.66, 1.75], legH: 0.98, legW: 0.15, head: [0.34, 0.4, 0.7], headUp: 0.62, headFwd: 0.42, neck: 0.75, snout: [0.28, 0.26, 0.24], ear: 'point', tail: 'bushy', color: '#8a5a35', nose: '#3a2a1e', extra: 'mane', hoof: '#221a14' },
  fox: { body: [0.3, 0.32, 0.72], legH: 0.3, legW: 0.09, head: [0.34, 0.3, 0.32], headUp: 0.18, headFwd: 0.16, snout: [0.14, 0.12, 0.24], ear: 'point', tail: 'bushy', color: '#e2742b', belly: '#fbf3e6', nose: '#1d1b1a' },
  bear: { body: [0.86, 0.84, 1.45], legH: 0.46, legW: 0.26, head: [0.6, 0.54, 0.52], headUp: 0.2, headFwd: 0.26, snout: [0.28, 0.22, 0.22], ear: 'round', tail: 'stub', color: '#6b4a32', belly: '#8a6547', nose: '#1d1b1a' },
  rabbit: { body: [0.26, 0.28, 0.44], legH: 0.14, legW: 0.09, head: [0.26, 0.26, 0.26], headUp: 0.18, headFwd: 0.1, snout: [0.12, 0.09, 0.07], ear: 'long', tail: 'stub', color: '#efe9e1', nose: '#e48a9a', extra: 'whiskers' },
  mouse: { body: [0.16, 0.15, 0.26], legH: 0.05, legW: 0.045, head: [0.15, 0.14, 0.16], headUp: 0.04, headFwd: 0.08, snout: [0.07, 0.06, 0.09], ear: 'big', tail: 'long', color: '#9a9aa2', nose: '#e48a9a' },
  elephant: { body: [1.5, 1.5, 2.5], legH: 1.0, legW: 0.44, head: [1.05, 1.05, 0.95], headUp: 0.3, headFwd: 0.5, snout: [0.3, 0.3, 0.3], ear: 'big', tail: 'tuft', color: '#8f949e', extra: 'trunk', hoof: '#7a7f89' },
  lion: { body: [0.6, 0.62, 1.5], legH: 0.56, legW: 0.18, head: [0.5, 0.46, 0.46], headUp: 0.26, headFwd: 0.26, snout: [0.26, 0.2, 0.2], ear: 'round', tail: 'tuft', color: '#d9a14e', belly: '#f0d7a8', nose: '#3a2a1e', extra: 'lionmane' },
  deer: { body: [0.42, 0.48, 1.15], legH: 0.82, legW: 0.1, head: [0.26, 0.28, 0.42], headUp: 0.5, headFwd: 0.3, neck: 0.55, snout: [0.18, 0.15, 0.16], ear: 'point', tail: 'stub', color: '#b07a48', belly: '#f1e3cc', nose: '#221a14', extra: 'antlers', hoof: '#221a14' },
  zebra: { body: [0.56, 0.62, 1.6], legH: 0.9, legW: 0.14, head: [0.32, 0.38, 0.64], headUp: 0.56, headFwd: 0.4, neck: 0.68, snout: [0.26, 0.24, 0.22], ear: 'point', tail: 'tuft', color: '#f4f4f4', nose: '#1d1b1a', extra: 'stripes', hoof: '#1d1b1a' },
};
const BIPEDS = ['chicken', 'duck', 'penguin', 'frog', 'owl'] as const;
export const ANIMALS = [...Object.keys(QUADS), ...BIPEDS, 'fish'] as const;

export interface AnimalProps extends Placed {
  /** dog | cat | cow | pig | sheep | horse | fox | bear | rabbit | mouse | elephant | lion | deer | zebra | chicken | duck | penguin | frog | owl | fish */
  kind?: string;
  /** main fur / feather colour (each kind has a natural default) */
  color?: string;
  /** second colour: belly, patches, spots */
  color2?: string;
  /** tail wags fast, little hops */
  happy?: boolean;
  /** sits (dogs, cats, bears…) */
  sit?: boolean;
  /** lies down with closed eyes */
  sleep?: boolean;
  jump?: boolean;
  /** mouth opens and closes (barking, talking) */
  talk?: boolean;
  /** a collar / scarf / bow colour */
  collar?: string;
}

const Eye: React.FC<{ pos: V3; s?: number; closed?: boolean }> = ({ pos, s = 1, closed }) => closed
  ? <P shape="box" size={[0.07 * s, 0.014 * s, 0.02 * s]} pos={pos} color="#1b1512" />
  : <group position={pos}><P shape="ball" size={[0.075 * s, 0.085 * s, 0.04 * s]} color="#16110e" noShadow /><P shape="ball" size={0.022 * s} pos={[0.012 * s, 0.018 * s, 0.02 * s]} color="#ffffff" noShadow /></group>;

const Quadruped: React.FC<AnimalProps & { q: Quad; kind: string }> = (props) => {
  const { q, kind, happy, sit, sleep, jump, talk, collar, scale = 1, at } = props;
  const { p, r, d, moving, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const c = props.color ?? q.color;
  const c2 = props.color2 ?? q.belly ?? shade(c, 1.25);
  const [bw, bh, bl] = q.body;
  const down = sleep ? q.legH * 0.85 : 0;
  const by = q.legH + bh / 2 - down; // body centre height
  const cyc = d * (2.2 / Math.max(0.3, q.legH + 0.3)) * 2;
  const sw = moving && !sleep && !sit ? Math.sin(cyc) * 0.55 : 0;
  const hop = (jump ? Math.abs(Math.sin(t * 6)) * 0.5 : 0) + (happy && !moving ? Math.abs(Math.sin(t * 9)) * 0.06 : 0) + (moving ? Math.abs(Math.sin(cyc)) * 0.03 : 0);
  const sitTilt = sit && !sleep ? -0.5 : 0;
  const wag = Math.sin(t * (happy ? 22 : 5)) * (happy ? 0.7 : 0.18);
  const headBob = sleep ? 0.5 : Math.sin(t * 2 + bl) * 0.04 + (moving ? Math.sin(cyc * 2) * 0.05 : 0);
  const hz = bl / 2 + q.headFwd;
  const hy = by + bh / 2 + q.headUp - (sleep ? q.headUp + bh * 0.35 : 0);
  const [hw, hh, hl] = q.head;
  const legX = bw / 2 - q.legW / 2 - 0.01, legZ = bl / 2 - q.legW / 2 - 0.02;
  const eyeY = hh * 0.14, eyeZ = hl / 2 + 0.005;
  return (
    <group position={[p[0], p[1], p[2]]}>
      {p[1] < 0.5 && <Blob r={Math.max(bw, bl * 0.6) * 0.75 * scale * k} />}
      <group position={[0, hop, 0]} rotation={[0, r, 0]} scale={scale * k}>
        {/* legs */}
        {!sleep && [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz], i) => {
          const back = sz < 0;
          const a = sit && back ? -1.35 : sit ? 0.25 : sw * (sx * sz > 0 ? 1 : -1);
          const y = sit && back ? q.legH * 0.45 : q.legH;
          return (
            <group key={i} position={[sx * legX, y + 0.02, sz * legZ]} rotation={[a, 0, 0]}>
              <P size={[q.legW, q.legH + 0.04, q.legW * 1.1]} pos={[0, -q.legH / 2, 0]} radius={q.legW * 0.32} color={kind === 'zebra' && i % 2 ? '#2a2a2a' : c} />
              <P size={[q.legW * 1.12, Math.min(0.12, q.legH * 0.28), q.legW * 1.3]} pos={[0, -q.legH + Math.min(0.06, q.legH * 0.14), q.legW * 0.08]} radius={0.03} color={q.hoof ?? shade(c, 0.82)} />
            </group>
          );
        })}
        <group position={[0, by - (sit ? bl * 0.12 : 0), 0]} rotation={[sitTilt, 0, 0]}>
          {/* body */}
          <P size={[bw, bh, bl]} radius={Math.min(bw, bh) * 0.36} color={c} />
          <P size={[bw * 0.8, bh * 0.5, bl * 0.82]} pos={[0, -bh * 0.3, 0]} radius={Math.min(bw, bh) * 0.2} color={c2} />
          {q.extra === 'wool' && Array.from({ length: 16 }, (_, i) => <P key={i} shape="ball" size={0.3 + rand(`w${i}`) * 0.12} pos={[(rand(`wx${i}`) - 0.5) * bw * 1.05, (rand(`wy${i}`) - 0.25) * bh * 0.85, (rand(`wz${i}`) - 0.5) * bl * 1.0]} color={c} />)}
          {q.extra === 'spots' && Array.from({ length: 7 }, (_, i) => <P key={i} shape="ball" size={[0.34 + rand(`s${i}`) * 0.25, 0.3, 0.42]} pos={[(rand(`sx${i}`) > 0.5 ? 1 : -1) * bw * 0.44, (rand(`sy${i}`) - 0.3) * bh * 0.5, (rand(`sz${i}`) - 0.5) * bl * 0.8]} color={props.color2 ?? '#2a2522'} />)}
          {q.extra === 'stripes' && Array.from({ length: 7 }, (_, i) => <P key={i} shape="box" size={[bw + 0.02, bh * 0.92, 0.07]} pos={[0, 0.02, -bl / 2 + 0.16 + i * (bl - 0.3) / 6]} rot={[0, 0, 0]} color="#22201f" />)}
          {collar && <P shape="torus" size={[Math.min(hw, bw) * 0.95, 0.05, 0]} pos={[0, bh * 0.3 + (q.neck ? q.neck * 0.45 : 0), bl / 2 + 0.03 + (q.neck ? 0.12 : 0)]} rot={[35, 0, 0]} color={collar} />}
          {/* tail */}
          <group position={[0, bh * 0.28, -bl / 2]} rotation={[q.tail === 'stub' ? 0 : q.neck ? -2.4 : -0.7, wag, 0]}>
            {q.tail === 'thin' && <P shape="capsule" size={[0.07, bl * 0.5, 0.07]} pos={[0, bl * 0.22, 0]} color={c} />}
            {q.tail === 'long' && <><P shape="capsule" size={[0.06, bl * 0.6, 0.06]} pos={[0, bl * 0.28, 0]} color={c} /><P shape="ball" size={0.07} pos={[0, bl * 0.58, 0]} color={c} /></>}
            {q.tail === 'bushy' && <><P shape="capsule" size={[Math.max(0.14, bw * 0.4), bl * 0.52, Math.max(0.14, bw * 0.4)]} pos={[0, bl * 0.24, 0]} color={kind === 'horse' ? shade(c, 0.5) : c} /><P shape="ball" size={Math.max(0.13, bw * 0.34)} pos={[0, bl * 0.5, 0]} color={kind === 'fox' ? '#fbf3e6' : kind === 'horse' ? shade(c, 0.5) : c} /></>}
            {q.tail === 'curl' && <P shape="torus" size={[0.16, 0.04, 0]} pos={[0, 0.08, -0.02]} rot={[0, 90, 0]} color={shade(c, 0.9)} />}
            {q.tail === 'stub' && <P shape="ball" size={Math.max(0.1, bw * 0.3)} pos={[0, 0, -0.03]} color={kind === 'rabbit' || kind === 'deer' ? '#ffffff' : c} />}
            {q.tail === 'tuft' && <><P shape="capsule" size={[0.05, bl * 0.4, 0.05]} pos={[0, bl * 0.17, 0]} color={c} /><P shape="ball" size={0.13} pos={[0, bl * 0.38, 0]} color={shade(c, 0.45)} /></>}
          </group>
          {/* neck */}
          {q.neck && <P size={[bw * 0.52, q.neck, bw * 0.6]} pos={[0, bh * 0.3 + q.neck * 0.3, bl / 2 - 0.1 + q.headFwd * 0.4]} rot={[35, 0, 0]} radius={bw * 0.2} color={c} />}
          {q.extra === 'mane' && <P size={[0.1, (q.neck ?? 0.5) * 1.05, 0.26]} pos={[0, bh * 0.42 + (q.neck ?? 0.5) * 0.36, bl / 2 - 0.26 + q.headFwd * 0.3]} rot={[35, 0, 0]} radius={0.04} color={shade(c, 0.5)} />}
        </group>
        {/* head */}
        <group position={[0, hy - (sit ? 0 : 0), hz - (sit ? bl * 0.2 : 0)]} rotation={[headBob, happy ? Math.sin(t * 4) * 0.12 : 0, 0]}>
          {q.extra === 'lionmane' && <P shape="ball" size={[hw * 1.75, hh * 1.8, hl * 0.9]} pos={[0, 0, -hl * 0.18]} color="#8a4f1c" />}
          <P size={q.head} radius={Math.min(hw, hh, hl) * 0.36} color={c} />
          <P size={q.snout} pos={[0, -hh * 0.16, hl / 2 + q.snout[2] * 0.36]} radius={Math.min(...q.snout) * 0.4} color={kind === 'pig' || kind === 'cow' ? q.nose! : q.belly ?? shade(c, 1.2)} />
          {q.extra !== 'trunk' && kind !== 'pig' && kind !== 'cow' && <P shape="ball" size={[q.snout[0] * 0.42, q.snout[1] * 0.4, 0.06]} pos={[0, -hh * 0.1, hl / 2 + q.snout[2] * 0.84]} color={q.nose ?? '#22201f'} />}
          {(kind === 'pig' || kind === 'cow') && [-1, 1].map((sd) => <P key={sd} shape="ball" size={[0.04, 0.06, 0.02]} pos={[sd * q.snout[0] * 0.2, -hh * 0.16, hl / 2 + q.snout[2] * 0.87]} color={shade(q.nose!, 0.6)} />)}
          {talk && <P shape="ball" size={[q.snout[0] * 0.6, 0.02 + Math.abs(Math.sin(t * 12)) * q.snout[1] * 0.7, 0.05]} pos={[0, -hh * 0.36, hl / 2 + q.snout[2] * 0.5]} color="#5b1d1d" noShadow />}
          {q.extra === 'trunk' && <group position={[0, -hh * 0.2, hl / 2]} rotation={[0.15 + Math.sin(t * 2) * 0.12, 0, 0]}><P shape="capsule" size={[0.3, 1.0, 0.3]} pos={[0, -0.42, 0.1]} color={c} /><P shape="capsule" size={[0.24, 0.6, 0.24]} pos={[0, -0.95, 0.24]} rot={[-40, 0, 0]} color={c} />{[-1, 1].map((sd) => <P key={sd} shape="cone" size={[0.12, 0.6, 0.12]} pos={[sd * 0.3, -0.25, 0.24]} rot={[115, 0, 0]} color="#f6f1e2" />)}</group>}
          {q.extra === 'whiskers' && [-1, 1].map((sd) => [0.03, -0.03].map((dy) => <P key={`${sd}${dy}`} shape="box" size={[0.16, 0.008, 0.008]} pos={[sd * (q.snout[0] * 0.5 + 0.07), -hh * 0.16 + dy, hl / 2 + 0.03]} rot={[0, 0, sd * dy * 300]} color="#f4f4f4" />))}
          {[-1, 1].map((sd) => <Eye key={sd} pos={[sd * hw * 0.27, eyeY, eyeZ]} s={Math.max(0.75, hw / 0.38)} closed={sleep || ((t + bl) % 3.4) < 0.12} />)}
          {/* ears */}
          {[-1, 1].map((sd) => {
            const ex = sd * hw * 0.36, ey = hh / 2;
            const tw = Math.sin(t * 3 + sd) * 4;
            switch (q.ear) {
              case 'point': return <P key={sd} shape="cone" size={[hw * 0.3, hh * 0.42, hw * 0.16]} pos={[ex, ey + hh * 0.14, -hl * 0.1]} rot={[0, 0, -sd * 8 + tw * 0.3]} color={kind === 'fox' ? '#2a1c14' : c} />;
              case 'flop': return <P key={sd} size={[hw * 0.14, hh * 0.56, hw * 0.3]} pos={[sd * (hw / 2 + 0.01), ey - hh * 0.26, -hl * 0.05]} rot={[0, 0, sd * (12 + tw)]} radius={0.03} color={shade(c, kind === 'cow' ? 0.95 : 0.72)} />;
              case 'round': return <P key={sd} shape="ball" size={[hw * 0.3, hw * 0.3, hw * 0.14]} pos={[ex, ey + 0.01, -hl * 0.05]} color={c} />;
              case 'long': return <group key={sd} position={[sd * hw * 0.2, ey - 0.02, -hl * 0.1]} rotation={[-0.15, 0, -sd * 0.12 + tw * 0.004]}><P shape="capsule" size={[hw * 0.3, hh * 1.5, hw * 0.14]} pos={[0, hh * 0.72, 0]} color={c} /><P shape="capsule" size={[hw * 0.14, hh * 1.1, hw * 0.05]} pos={[0, hh * 0.72, hw * 0.06]} color="#f0a9b4" /></group>;
              case 'big': return <P key={sd} shape="disc" size={[hw * (kind === 'elephant' ? 0.95 : 0.7), hw * 0.08, hw * (kind === 'elephant' ? 1.1 : 0.7)]} pos={[sd * hw * (kind === 'elephant' ? 0.72 : 0.42), kind === 'elephant' ? 0 : ey, -hl * 0.12]} rot={[90, 0, sd * (kind === 'elephant' ? 20 + tw : 0)]} color={kind === 'elephant' ? shade(c, 0.9) : '#e9b4bd'} />;
              default: return null;
            }
          })}
          {q.extra === 'horns' && [-1, 1].map((sd) => <P key={sd} shape="cone" size={[0.08, 0.22, 0.08]} pos={[sd * hw * 0.3, hh / 2 + 0.08, -hl * 0.1]} rot={[0, 0, -sd * 25]} color="#f1ead7" />)}
          {kind === 'cow' && [-1, 1].map((sd) => <P key={`h${sd}`} shape="cone" size={[0.08, 0.2, 0.08]} pos={[sd * hw * 0.3, hh / 2 + 0.07, -hl * 0.12]} rot={[0, 0, -sd * 30]} color="#f1ead7" />)}
          {q.extra === 'antlers' && [-1, 1].map((sd) => <group key={sd} position={[sd * hw * 0.26, hh / 2, -hl * 0.12]} rotation={[0, 0, -sd * 0.35]}><P shape="cyl" size={[0.04, 0.42, 0.04]} pos={[0, 0.2, 0]} color="#e9dcc0" /><P shape="cyl" size={[0.03, 0.2, 0.03]} pos={[sd * 0.07, 0.3, 0]} rot={[0, 0, -sd * 55]} color="#e9dcc0" /><P shape="cyl" size={[0.03, 0.18, 0.03]} pos={[-sd * 0.05, 0.4, 0]} rot={[0, 0, sd * 45]} color="#e9dcc0" /></group>)}
          {sleep && [0, 1, 2].map((j) => { const a = (t * 0.5 + j / 3) % 1; return <P key={j} shape="box" size={[0.08 + a * 0.08, 0.08 + a * 0.08, 0.02]} pos={[hw * 0.6 + a * 0.3, hh * 0.6 + a * 0.6, 0]} color="#ffffff" opacity={1 - a} />; })}
        </group>
      </group>
    </group>
  );
};

const Biped: React.FC<AnimalProps & { kind: (typeof BIPEDS)[number] }> = (props) => {
  const { kind, happy, jump, talk, sleep, scale = 1, at } = props;
  const { p, r, d, moving, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const def = { chicken: ['#fbfaf5', '#f0a23a'], duck: ['#f6d743', '#f08a24'], penguin: ['#22262e', '#f5a623'], frog: ['#58b947', '#3f9a36'], owl: ['#8a6a48', '#f0a23a'] }[kind];
  const c = props.color ?? def[0];
  const c2 = props.color2 ?? (kind === 'penguin' || kind === 'owl' ? '#f5f1e6' : shade(c, 0.86));
  const waddle = moving ? Math.sin(d * 9) * 0.16 : 0;
  const hop = (jump || (kind === 'frog' && moving) ? Math.abs(Math.sin(t * 6)) * 0.45 : 0) + (happy ? Math.abs(Math.sin(t * 9)) * 0.08 : 0);
  const flap = happy || jump ? Math.sin(t * 20) * 0.7 : moving ? Math.sin(d * 9) * 0.2 : 0;
  const H = kind === 'penguin' ? 0.86 : kind === 'frog' ? 0.3 : kind === 'owl' ? 0.56 : 0.44;
  const W = kind === 'penguin' ? 0.5 : kind === 'frog' ? 0.44 : kind === 'owl' ? 0.44 : 0.36;
  const closed = sleep || ((t + W) % 3.3) < 0.12;
  if (kind === 'frog') return (
    <group position={[p[0], p[1], p[2]]}>
      {p[1] < 0.5 && <Blob r={0.32 * scale * k} />}
      <group position={[0, hop, 0]} rotation={[0, r, 0]} scale={scale * k}>
        <P size={[0.44, 0.28, 0.46]} pos={[0, 0.18, 0]} radius={0.12} color={c} />
        <P size={[0.36, 0.14, 0.38]} pos={[0, 0.09, 0.03]} radius={0.06} color="#d9efb5" />
        {[-1, 1].map((sd) => <React.Fragment key={sd}><P shape="ball" size={0.15} pos={[sd * 0.13, 0.36, 0.14]} color={c} /><Eye pos={[sd * 0.13, 0.37, 0.21]} s={1.1} closed={closed} /><P size={[0.14, 0.1, 0.3]} pos={[sd * 0.25, 0.06, -0.08]} radius={0.04} color={c2} /><P size={[0.1, 0.06, 0.16]} pos={[sd * 0.2, 0.03, 0.2]} radius={0.02} color={c2} /></React.Fragment>)}
        <P shape="box" size={[0.26, talk ? 0.03 + Math.abs(Math.sin(t * 12)) * 0.08 : 0.018, 0.02]} pos={[0, 0.2, 0.235]} color="#2f5f27" />
      </group>
    </group>
  );
  return (
    <group position={[p[0], p[1], p[2]]}>
      {p[1] < 0.5 && <Blob r={W * 0.75 * scale * k} />}
      <group position={[0, hop, 0]} rotation={[0, r, waddle]} scale={scale * k}>
        {/* feet */}
        {[-1, 1].map((sd) => <P key={sd} size={[0.12, 0.04, 0.2]} pos={[sd * W * 0.22, 0.02, 0.05 + (moving ? Math.sin(d * 9 + (sd > 0 ? Math.PI : 0)) * 0.06 : 0)]} radius={0.015} color={def[1]} />)}
        {kind !== 'penguin' && [-1, 1].map((sd) => <P key={`l${sd}`} shape="cyl" size={[0.035, 0.12, 0.035]} pos={[sd * W * 0.22, 0.09, 0]} color={def[1]} />)}
        {/* body */}
        <P shape="ball" size={[W, H, W * (kind === 'penguin' || kind === 'owl' ? 0.9 : 1.25)]} pos={[0, (kind === 'penguin' ? 0.04 : 0.13) + H / 2, kind === 'penguin' || kind === 'owl' ? 0 : -0.04]} color={c} />
        {(kind === 'penguin' || kind === 'owl') && <P shape="ball" size={[W * 0.74, H * 0.78, W * 0.5]} pos={[0, 0.04 + H * 0.45 + (kind === 'owl' ? 0.09 : 0), W * 0.24]} color={c2} />}
        {/* wings */}
        {[-1, 1].map((sd) => <group key={`w${sd}`} position={[sd * W * 0.47, (kind === 'penguin' ? 0.04 : 0.13) + H * 0.62, 0]} rotation={[0, 0, sd * (0.12 + Math.abs(flap))]}><P size={[0.06, H * 0.56, W * 0.6]} pos={[0, -H * 0.24, 0]} radius={0.025} color={kind === 'penguin' ? c : shade(c, 0.88)} /></group>)}
        {/* head */}
        <group position={[0, (kind === 'penguin' ? 0.04 : 0.13) + H + (kind === 'penguin' || kind === 'owl' ? -0.02 : 0.1), kind === 'penguin' || kind === 'owl' ? 0 : 0.1]} rotation={[sleep ? 0.4 : moving ? Math.sin(d * 9) * 0.12 : Math.max(0, Math.sin(t * 2.6)) * (kind === 'chicken' ? 0.35 : 0.05), 0, 0]}>
          <P shape="ball" size={kind === 'penguin' ? [0.38, 0.34, 0.36] : kind === 'owl' ? [0.42, 0.34, 0.36] : [0.24, 0.24, 0.24]} color={c} />
          {kind === 'owl' && [-1, 1].map((sd) => <React.Fragment key={sd}><P shape="disc" size={[0.17, 0.02, 0.17]} pos={[sd * 0.1, 0.02, 0.17]} rot={[90, 0, 0]} color={c2} /><P shape="cone" size={[0.08, 0.12, 0.05]} pos={[sd * 0.15, 0.2, 0]} color={c} /></React.Fragment>)}
          {[-1, 1].map((sd) => <Eye key={sd} pos={[sd * (kind === 'penguin' || kind === 'owl' ? 0.1 : 0.075), 0.03, kind === 'penguin' ? 0.165 : kind === 'owl' ? 0.185 : 0.108]} s={kind === 'chicken' || kind === 'duck' ? 0.7 : 1} closed={closed} />)}
          {kind === 'duck'
            ? <P size={[0.14, talk ? 0.05 + Math.abs(Math.sin(t * 12)) * 0.05 : 0.05, 0.16]} pos={[0, -0.03, 0.17]} radius={0.02} color={def[1]} />
            : <P shape="cone" size={[kind === 'penguin' ? 0.1 : 0.08, kind === 'penguin' ? 0.16 : 0.12, 0.08]} pos={[0, -0.03, kind === 'penguin' ? 0.22 : kind === 'owl' ? 0.2 : 0.15]} rot={[90, 0, 0]} color={def[1]} />}
          {kind === 'chicken' && <><P size={[0.05, 0.1, 0.16]} pos={[0, 0.15, 0]} radius={0.02} color="#d8342c" /><P shape="ball" size={[0.05, 0.08, 0.05]} pos={[0, -0.11, 0.1]} color="#d8342c" /></>}
        </group>
        {(kind === 'chicken' || kind === 'duck') && <P size={[0.14, 0.16, 0.14]} pos={[0, 0.13 + H * 0.72, -W * 0.6]} rot={[-30, 0, 0]} radius={0.04} color={shade(c, 0.9)} />}
      </group>
    </group>
  );
};

const Fish: React.FC<AnimalProps> = (props) => {
  const { scale = 1, at } = props;
  const { p, r, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const c = props.color ?? '#f08a24';
  return (
    <group position={[p[0], p[1] + Math.sin(t * 2.5) * 0.05, p[2]]} rotation={[0, r + Math.sin(t * 6) * 0.12, 0]} scale={scale * k}>
      <P shape="ball" size={[0.16, 0.26, 0.42]} pos={[0, 0.2, 0]} color={c} shine={0.6} />
      <P shape="cone" size={[0.04, 0.22, 0.2]} pos={[0, 0.2, -0.28]} rot={[-90, 0, Math.sin(t * 6) * 18]} color={props.color2 ?? shade(c, 0.8)} />
      <P shape="cone" size={[0.03, 0.12, 0.14]} pos={[0, 0.35, 0]} color={props.color2 ?? shade(c, 0.8)} />
      {[-1, 1].map((sd) => <Eye key={sd} pos={[sd * 0.07, 0.24, 0.13]} s={0.7} />)}
    </group>
  );
};

/**
 * An animal. `kind`: dog | cat | cow | pig | sheep | horse | fox | bear | rabbit | mouse | elephant | lion | deer | zebra |
 * chicken | duck | penguin | frog | owl | fish. Walks when moving along `path`. `happy` (wags, hops), `sit`, `sleep`, `jump`, `talk`.
 * `color` / `color2` recolour it (a black cat: color="#1d1d1f"); `collar` adds a collar; `scale` makes a giant or a tiny one.
 */
export const Animal: React.FC<AnimalProps> = (props) => {
  const kind = pick('Animal', props.kind, ANIMALS as unknown as readonly string[], 'dog');
  if (kind === 'fish') return <Fish {...props} />;
  if ((BIPEDS as readonly string[]).includes(kind)) return <Biped {...props} kind={kind as (typeof BIPEDS)[number]} />;
  return <Quadruped {...props} kind={kind} q={QUADS[kind]} />;
};

/** A pigeon-like bird. Flaps when `fly` or when moving along a `path` (give `pos[1]` for height). Any `color` (a crow: "#1d1d1f", a parrot: "#2fae5a"). */
export const Bird: React.FC<Placed & { color?: string; fly?: boolean }> = (props) => {
  const { color = '#8c95a3', fly, scale = 1, at } = props;
  const { p, r, moving, t } = usePlace(props);
  const k = at === undefined ? 1 : popIn(t, at);
  if (k <= 0) return null;
  const air = fly || moving;
  const flap = air ? Math.sin(t * 22) * 0.9 : 1.35; // resting: wings folded down along the body
  const peck = !air ? Math.max(0, Math.sin(t * 3)) * 0.3 : 0;
  return (
    <group position={p} rotation={[0, r, 0]} scale={scale * k}>
      <P shape="ball" size={[0.34, 0.32, 0.54]} pos={[0, 0.3, 0]} color={color} />
      <P shape="ball" size={[0.26, 0.2, 0.3]} pos={[0, 0.24, 0.08]} color={shade(color, 1.25)} />
      <group position={[0, 0.5, 0.22]} rotation={[peck, 0, 0]}>
        <P shape="ball" size={0.24} pos={[0, 0.05, 0.04]} color={shade(color, 0.8)} />
        <P shape="cone" size={[0.08, 0.14, 0.07]} pos={[0, 0.03, 0.2]} rot={[90, 0, 0]} color="#f0a23a" />
        {[-0.08, 0.08].map((x) => <Eye key={x} pos={[x, 0.09, 0.14]} s={0.55} />)}
      </group>
      {[-1, 1].map((sd) => <group key={sd} position={[sd * 0.15, 0.4, 0]} rotation={[0, 0, sd * flap]}><P size={[0.42, 0.05, 0.36]} pos={[sd * 0.2, 0, 0]} radius={0.02} color={shade(color, 1.15)} /></group>)}
      <P size={[0.2, 0.05, 0.24]} pos={[0, 0.3, -0.34]} radius={0.02} color={shade(color, 0.7)} />
      {!air && [-1, 1].map((sd) => <P key={`f${sd}`} shape="cyl" size={[0.03, 0.14, 0.03]} pos={[sd * 0.07, 0.07, 0]} color="#f0a23a" />)}
      {!air && p[1] < 0.1 && <Blob r={0.25} />}
    </group>
  );
};
