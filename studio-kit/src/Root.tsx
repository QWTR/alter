import React from 'react';
import { Composition, Still } from 'remotion';
import { Stage, sizeOf, type Meta } from './kit/stage';
import { VIDEOS } from './videos.gen';

const LIST = VIDEOS.map(({ id, mod }) => {
  const meta: Meta = mod.meta ?? {};
  const Body = mod.default as React.FC;
  const Comp: React.FC = () => (
    <Stage meta={meta}>
      <Body />
    </Stage>
  );
  return { id, meta, Comp };
});

export const Root: React.FC = () => (
  <>
    {LIST.map(({ id, meta, Comp }) => {
      const [width, height] = sizeOf(meta);
      return meta.still ? (
        <Still key={id} id={id} component={Comp} width={width} height={height} />
      ) : (
        <Composition key={id} id={id} component={Comp} fps={meta.fps ?? 30} durationInFrames={Math.max(1, Math.round((meta.seconds ?? 10) * (meta.fps ?? 30)))} width={width} height={height} />
      );
    })}
  </>
);
