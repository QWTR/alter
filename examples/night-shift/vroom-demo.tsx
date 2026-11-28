import { Timeline, Scene, Bg, Title, Text, Audio, staticFile } from 'alter-kit';

// Deterministic local smoke test, without generated assets or provider calls.
export const meta = { format: 'reel', seconds: 6, fps: 30, theme: 'racing', brand: { display: 'Arial', body: 'Arial' } };
export default () => <>
  <Audio src={staticFile('night-vroom.wav')} volume={0.12} />
  <Timeline overlap={0}>
    <Scene dur={3} enter="fade" exit="fade">
      <Bg variant="grid" />
      <Title kicker="VROOM · DEMO" title="Twoja następna trasa" size={100} hl={['trasa']} />
      <Text text="Zobacz, dokąd prowadzi droga." size={44} place="bottom" anim="fade" at={0.5} />
    </Scene>
    <Scene dur={3} enter="fade" exit="fade">
      <Bg variant="grid" />
      <Title kicker="RUSZAJ Z VROOM" title="Jedź. Odkrywaj. Wracaj." size={96} hl={['Odkrywaj.']} />
      <Text text="Lokalny test ALTTER Studio · 9:16" size={44} place="bottom" anim="fade" at={0.5} />
    </Scene>
  </Timeline>
</>;
