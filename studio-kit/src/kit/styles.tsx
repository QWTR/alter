// Style engine views: one scene in many animation styles.
//   <StyleGrid items={[{ name: 'Claymation', src: 'assets/x/styles/clay.png' }, …]} title="10 stylów" />   (a still: pick a style)
//   <StyleShowcase items={[…]} title="10 stylów animacji" sub="(który wybierasz?)" per={2.2} cta="Napisz STYL w komentarzu" />
//   — the viral "N animation styles" reel: a numbered list on the left fills in one by one, the current style plays on the right,
//     then all of them in a grid with the call to action.
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, useVideoConfig } from 'remotion';
import { font, media, mix, ramp, useFormat, useTheme, useTime } from './stage';

export interface StyleItem { name: string; src: string; from?: number }
const isVideo = (src: string) => /\.(mp4|webm|mov|m4v)$/i.test(src);

/** The picture of one style: a clip (muted) or a still with a slow push-in. */
const StyleMedia: React.FC<{ it: StyleItem; dur: number; radius: number; zoom?: boolean }> = ({ it, dur, radius, zoom = true }) => {
  const t = useTime();
  const { fps } = useVideoConfig();
  const k = zoom ? mix(1.0, 1.08, Math.min(1, t / Math.max(1, dur))) : 1;
  const style: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${k})` };
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', background: '#111' }}>
      {isVideo(it.src)
        ? <OffthreadVideo src={media(it.src)} muted trimBefore={Math.round((it.from ?? 0) * fps)} style={style} />
        : <Img src={media(it.src)} style={style} />}
    </div>
  );
};

/** Title block like the reference: big number + title, a small line under it. */
const headSize = (title: string, u: (n: number) => number, w: number) => {
  const size = u(84);
  const lines = Math.max(1, Math.ceil((title.length * size * 0.52) / (w - u(120))));
  return { size, lines, bottom: u(150) + lines * size * 1.05 };
};
const Head: React.FC<{ title: string; sub?: string; at?: number }> = ({ title, sub, at = 0 }) => {
  const t = useTime();
  const th = useTheme();
  const { u } = useFormat();
  const p = at < 0 ? 1 : ramp(t, at, at + 0.5);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: u(150), textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * u(20)}px)` }}>
      <div style={{ fontFamily: font(th.display), fontWeight: 900, fontSize: headSize(title, u, useFormat().w).size, lineHeight: 1.05, letterSpacing: '-0.02em', color: th.ink, padding: `0 ${u(60)}px` }}>{title}</div>
      {sub && <div style={{ fontFamily: font(th.body), fontSize: u(34), marginTop: u(10), color: th.muted }}>{sub}</div>}
    </div>
  );
};

/** Pick a style: every style as a numbered card in a grid (render as a still). */
export const StyleGrid: React.FC<{ items: StyleItem[]; title?: string; sub?: string; cols?: number }> = ({ items, title, sub, cols }) => {
  const th = useTheme();
  const { w, h, u } = useFormat();
  const n = items.length;
  const c = cols ?? (n === 3 ? 3 : n <= 4 ? 2 : n <= 9 ? 3 : 4);
  const rows = Math.ceil(n / c);
  const top = title ? headSize(title, u, w).bottom + u(sub ? 80 : 40) : u(70);
  const pad = u(44), gap = u(22);
  const cw = (w - pad * 2 - gap * (c - 1)) / c;
  const labelH = u(86);
  const ch = Math.min(cw * 16 / 9, (h - top - pad - gap * (rows - 1)) / rows - labelH);
  const cardW = ch * 9 / 16;
  const gridW = cardW * c + gap * (c - 1);
  const left = (w - gridW) / 2;
  const gridH = rows * (ch + labelH) + gap * (rows - 1);
  const top0 = top + Math.max(0, (h - top - pad - gridH) / 2);
  const fs = Math.min(u(28), cardW / 8.5);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${th.bg2} 0%, ${th.bg} 70%)` }}>
      {title && <Head title={title} sub={sub} at={-1} />}
      {items.map((it, i) => {
        const x = left + (i % c) * (cardW + gap);
        const y = top0 + Math.floor(i / c) * (ch + labelH + gap);
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: cardW }}>
            <div style={{ position: 'relative', width: cardW, height: ch, boxShadow: `0 ${u(14)}px ${u(40)}px rgba(0,0,0,.45)`, borderRadius: u(20) }}>
              <StyleMedia it={it} dur={1} radius={u(20)} zoom={false} />
            </div>
            <div style={{ marginTop: u(12), fontFamily: font(th.body), fontWeight: 700, fontSize: fs, lineHeight: 1.15, color: th.ink, textAlign: 'center', overflow: 'hidden', maxHeight: fs * 2.3 }}>
              <span style={{ color: th.accent }}>{i + 1}.</span> {it.name}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** The "N animation styles" reel. Length = items × per + outro (use showcaseLength for meta.seconds). */
export const StyleShowcase: React.FC<{ items: StyleItem[]; title?: string; sub?: string; per?: number; outro?: number; cta?: string; handle?: string }> = ({ items, title, sub, per = 2.2, outro = 3.5, cta, handle }) => {
  const t = useTime();
  const th = useTheme();
  const { fps } = useVideoConfig();
  const { w, h, u } = useFormat();
  const n = items.length;
  const cur = Math.min(n - 1, Math.floor(t / per));
  const inOutro = t >= n * per;
  // layout: list on the left third, the card on the right
  const cardY = u(sub ? 370 : 330);
  const cardW = w * 0.6, cardH = Math.min(cardW * 16 / 9, h - cardY - u(300));
  const cardX = w - cardW - u(48);
  const listX = u(48), listTop = cardY + u(30), rowH = Math.min(u(64), (cardH - u(40)) / Math.max(1, n));
  const listW = cardX - listX - u(16);
  const outroP = ramp(t, n * per, n * per + 0.5);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 90% 60% at 50% 10%, ${th.bg2} 0%, ${th.bg} 75%)`, color: th.ink }}>
      {title && <Head title={title} sub={sub} />}
      {/* the list: items fill in up to the current one, the current one is bold in the accent colour */}
      <div style={{ position: 'absolute', left: listX, top: listTop, opacity: 1 - outroP }}>
        {items.map((it, i) => {
          const shown = inOutro || i <= cur;
          const on = !inOutro && i === cur;
          return (
            <div key={i} style={{ height: rowH, display: 'flex', alignItems: 'center', gap: u(12), fontFamily: font(th.body), fontSize: Math.min(u(30), rowH * 0.5), fontWeight: on ? 800 : 500, width: listW, color: on ? th.ink : th.muted }}>
              <span style={{ color: on ? th.accent : th.muted, minWidth: u(46) }}>{i + 1})</span>
              <span style={{ opacity: shown ? 1 : 0, transform: `translateX(${shown ? 0 : u(-10)}px)`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
            </div>
          );
        })}
      </div>
      {/* the current style */}
      {items.map((it, i) => (
        <Sequence key={i} from={Math.round(i * per * fps)} durationInFrames={Math.round(per * fps)} layout="none">
          <div style={{ position: 'absolute', left: cardX, top: cardY, width: cardW, height: cardH, borderRadius: u(26), boxShadow: `0 ${u(24)}px ${u(70)}px rgba(0,0,0,.55)`, opacity: 1 - outroP }}>
            <StyleMedia it={it} dur={per} radius={u(26)} />
            {handle && <div style={{ position: 'absolute', right: u(18), top: u(16), fontFamily: font(th.body), fontWeight: 700, fontSize: u(20), color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,.6)' }}>{handle}</div>}
          </div>
        </Sequence>
      ))}
      {/* outro: every style at once + the call to action */}
      {inOutro && (
        <div style={{ position: 'absolute', inset: 0, opacity: outroP }}>
          {(() => {
            const c = n <= 4 ? 2 : n <= 6 ? 3 : n <= 8 ? 4 : 5;
            const rows = Math.ceil(n / c);
            const gap = u(16);
            const top0 = u(sub ? 370 : 330);
            const maxH = h - top0 - u(560);
            const cw0 = (w - u(80) - gap * (c - 1)) / c;
            const chh = Math.min(cw0 * 16 / 9, (maxH - gap * (rows - 1)) / rows);
            const cw = chh * 9 / 16;
            const left = (w - (cw * c + gap * (c - 1))) / 2;
            const blockH = rows * (chh + gap) + (cta ? u(160) : 0);
            const top = Math.max(top0, (h - blockH) / 2 - u(60));
            const ctaTop = top + rows * (chh + gap) + u(40);
            return [...items.map((it, i) => {
              const r = Math.floor(i / c);
              const inRow = Math.min(c, n - r * c);
              const rowLeft = left + ((c - inRow) * (cw + gap)) / 2;
              const p = ramp(t, n * per + 0.1 + i * 0.05, n * per + 0.5 + i * 0.05);
              return (
                <div key={i} style={{ position: 'absolute', left: rowLeft + (i % c) * (cw + gap), top: top + r * (chh + gap), width: cw, height: chh, borderRadius: u(16), overflow: 'hidden', transform: `scale(${mix(0.9, 1, p)})`, opacity: p }}>
                  <StyleMedia it={it} dur={outro} radius={u(16)} />
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `${u(18)}px ${u(8)}px ${u(8)}px`, background: 'linear-gradient(transparent, rgba(0,0,0,.7))', fontFamily: font(th.body), fontWeight: 700, fontSize: Math.min(u(22), cw / 8), color: '#fff', textAlign: 'center', lineHeight: 1.1 }}>{i + 1}. {it.name}</div>
                </div>
              );
            }), cta ? (
              <div key="cta" style={{ position: 'absolute', left: u(60), right: u(60), top: ctaTop, textAlign: 'center', fontFamily: font(th.display), fontWeight: 900, fontSize: u(64), lineHeight: 1.1, color: th.ink, opacity: ramp(t, n * per + 0.6, n * per + 1.1), transform: `translateY(${(1 - ramp(t, n * per + 0.6, n * per + 1.1)) * u(20)}px)` }}>{cta}</div>
            ) : null];
          })()}
        </div>
      )}
    </AbsoluteFill>
  );
};

/** meta.seconds for a StyleShowcase. */
export const showcaseLength = (count: number, per = 2.2, outro = 3.5) => +(count * per + outro).toFixed(2);
