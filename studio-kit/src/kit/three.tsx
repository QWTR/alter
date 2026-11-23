// 3D scenes (three.js through @remotion/three): glossy shapes, an image on a spinning card, a logo cube.
import React, { useEffect, useMemo, useState } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import { ease, media, mix, ramp, rand, useFormat, useTheme, useTime } from './stage';

function useTexture(src?: string) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [handle] = useState(() => (src ? delayRender(`texture ${src}`) : null));
  useEffect(() => {
    if (!src) return;
    new THREE.TextureLoader().load(
      media(src),
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        setTex(t);
        if (handle !== null) continueRender(handle);
      },
      undefined,
      () => handle !== null && continueRender(handle),
    );
  }, [src, handle]);
  return tex;
}

const Lights: React.FC<{ accent: string; accent2: string }> = ({ accent, accent2 }) => (
  <>
    <ambientLight intensity={0.35} />
    <directionalLight position={[4, 6, 5]} intensity={2.2} />
    <pointLight position={[-5, -2, 3]} intensity={40} color={accent} />
    <pointLight position={[5, -3, -2]} intensity={30} color={accent2} />
  </>
);

export type Preset = 'orbs' | 'card' | 'cube' | 'rings' | 'blob' | 'tunnel';

/**
 * 3D scene. `preset`:
 *  orbs — glossy spheres floating around · card — `image` on a 3D card that turns to camera
 *  cube — spinning cube with `image` on its faces · rings — gyroscope rings · blob — morphing glossy blob · tunnel — flying through rings
 */
export const Scene3D: React.FC<{ preset?: Preset; image?: string; at?: number; color?: string; speed?: number; scale?: number }> = ({ preset = 'orbs', image, at = 0, color, speed = 1, scale = 1 }) => {
  const { w, h } = useFormat();
  const th = useTheme();
  const t = Math.max(0, useTime() - at) * speed;
  const tex = useTexture(preset === 'card' || preset === 'cube' ? image : undefined);
  const accent = color ?? th.accent;
  const intro = ramp(t, 0, 1.2 / speed, ease.out);
  const portrait = h > w;
  const zoom = portrait ? 1.35 : 1;

  const orbs = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ x: (rand(`ox${i}`) - 0.5) * 6, y: (rand(`oy${i}`) - 0.5) * 6, z: (rand(`oz${i}`) - 0.5) * 3 - 1, r: 0.25 + rand(`or${i}`) * 0.6, c: i % 3 })), []);

  let body: React.ReactNode = null;
  if (preset === 'orbs')
    body = orbs.map((o, i) => (
      <mesh key={i} position={[o.x, o.y + Math.sin(t * 0.8 + i) * 0.35, o.z]} scale={o.r * mix(0.2, 1, intro) * scale}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshPhysicalMaterial color={[accent, th.accent2, '#ffffff'][o.c]} roughness={0.12} metalness={0.1} clearcoat={1} clearcoatRoughness={0.05} />
      </mesh>
    ));
  if (preset === 'card')
    body = (
      <mesh rotation={[mix(0.6, 0.05, intro) + Math.sin(t * 0.7) * 0.06, mix(-1.2, -0.25, intro) + Math.sin(t * 0.5) * 0.2, mix(0.3, 0, intro)]} scale={scale}>
        <boxGeometry args={[3, 3 * (tex ? tex.image.height / tex.image.width : 0.62), 0.06]} />
        <meshStandardMaterial attach="material-0" color="#222" />
        <meshStandardMaterial attach="material-1" color="#222" />
        <meshStandardMaterial attach="material-2" color="#222" />
        <meshStandardMaterial attach="material-3" color="#222" />
        <meshPhysicalMaterial attach="material-4" map={tex ?? undefined} color={tex ? '#ffffff' : accent} roughness={0.35} clearcoat={0.6} />
        <meshStandardMaterial attach="material-5" color="#111" />
      </mesh>
    );
  if (preset === 'cube')
    body = (
      <mesh rotation={[t * 0.5 + 0.4, t * 0.7, 0]} scale={mix(0.1, 1.5, intro) * scale}>
        <boxGeometry args={[1, 1, 1]} />
        <meshPhysicalMaterial map={tex ?? undefined} color={tex ? '#ffffff' : accent} roughness={0.2} clearcoat={1} />
      </mesh>
    );
  if (preset === 'rings')
    body = [0, 1, 2].map((i) => (
      <mesh key={i} rotation={[t * (0.6 + i * 0.25) + i, t * (0.4 + i * 0.3), i * 0.7]} scale={(1.4 + i * 0.45) * mix(0.3, 1, intro) * scale}>
        <torusGeometry args={[1, 0.045, 32, 160]} />
        <meshPhysicalMaterial color={[accent, th.accent2, '#ffffff'][i]} metalness={0.9} roughness={0.15} />
      </mesh>
    ));
  if (preset === 'blob')
    body = (
      <mesh rotation={[t * 0.3, t * 0.4, 0]} scale={[1.6 + Math.sin(t * 1.3) * 0.15, 1.6 + Math.cos(t * 1.1) * 0.15, 1.6 + Math.sin(t * 0.9) * 0.12].map((v) => v * mix(0.2, 1, intro) * scale) as [number, number, number]}>
        <icosahedronGeometry args={[1, 24]} />
        <meshPhysicalMaterial color={accent} roughness={0.05} metalness={0.2} clearcoat={1} iridescence={1} iridescenceIOR={1.4} />
      </mesh>
    );
  if (preset === 'tunnel')
    body = Array.from({ length: 18 }, (_, i) => {
      const z = -24 + ((i * 1.6 + t * 4) % 28.8);
      return (
        <mesh key={i} position={[0, 0, z]} rotation={[0, 0, i * 0.3 + t * 0.2]}>
          <torusGeometry args={[2.2, 0.03, 16, 120]} />
          <meshBasicMaterial color={i % 2 ? accent : th.accent2} transparent opacity={Math.max(0, Math.min(1, (z + 24) / 8))} />
        </mesh>
      );
    });

  return (
    <ThreeCanvas width={w} height={h} camera={{ fov: 45, position: [0, 0, (preset === 'tunnel' ? 6 : 8) * zoom] }} style={{ position: 'absolute', inset: 0 }}>
      <Lights accent={accent} accent2={th.accent2} />
      {body}
    </ThreeCanvas>
  );
};
