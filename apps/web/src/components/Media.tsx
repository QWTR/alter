// Rendered results in the chat (video player, images) and the live render / install progress bar.
import { AnimatePresence, motion } from 'motion/react';
import { Clapperboard, Download, Expand, Film, Image as ImageIcon, Music, PackageOpen, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { MediaItem, RenderProgress } from '../api';
import { useT } from '../i18n';
import { softSpring } from './ui';

const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Format of a render from its file name (promo-square.mp4 → square). */
const shapeOf = (name: string) => (/-(reel|story)\b/.test(name) ? 'tall' : /-(square)\b/.test(name) ? 'square' : /-(wide|thumb|banner)\b/.test(name) ? 'wide' : '');

export function MediaResults({ list }: { list: MediaItem[] }) {
  const t = useT();
  const [big, setBig] = useState<MediaItem | null>(null);
  if (!list.length) return null;
  return (
    <div className={`media-results n${Math.min(list.length, 3)}`}>
      {list.map((m) => (
        <motion.div key={m.url} className={`media-card ${m.kind} ${shapeOf(m.name)}`} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={softSpring}>
          {m.kind === 'video' ? (
            <video src={m.url} controls playsInline preload="metadata" loop />
          ) : m.kind === 'image' ? (
            <img src={m.url} alt={m.name} onClick={() => setBig(m)} />
          ) : (
            <audio src={m.url} controls preload="metadata" />
          )}
          <div className="media-foot">
            {m.kind === 'video' ? <Film size={14} /> : m.kind === 'image' ? <ImageIcon size={14} /> : <Music size={14} />}
            <span className="truncate grow" title={m.name}>{m.name}</span>
            <span className="faint">{size(m.size)}</span>
            {m.kind === 'image' && <button className="btn ghost icon sm" onClick={() => setBig(m)} title={t('studio.fullscreen')}><Expand size={14} /></button>}
            <a className="btn ghost icon sm" href={m.url} download={m.name} title={t('studio.download')}><Download size={14} /></a>
          </div>
        </motion.div>
      ))}
      <AnimatePresence>
        {big && (
          <motion.div className="lightbox" onClick={() => setBig(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.img src={big.url} alt={big.name} initial={{ scale: 0.94 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }} transition={softSpring} />
            <span className="lightbox-name">{big.name}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const STAGES: Record<string, { icon: typeof Film; key: 'studio.stage.install' | 'studio.stage.browser' | 'studio.stage.bundle' | 'studio.stage.render' }> = {
  install: { icon: PackageOpen, key: 'studio.stage.install' },
  browser: { icon: Sparkles, key: 'studio.stage.browser' },
  bundle: { icon: Clapperboard, key: 'studio.stage.bundle' },
  render: { icon: Film, key: 'studio.stage.render' },
};

/** "Rendering promo · 42 %" with a moving bar. */
export function ProgressBar({ p }: { p: RenderProgress }) {
  const t = useT();
  const s = STAGES[p.stage] ?? STAGES.render;
  const pct = Math.max(2, Math.min(100, p.pct));
  return (
    <motion.div className="render-progress" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={softSpring}>
      <div className="row" style={{ gap: 8 }}>
        <s.icon size={15} />
        <span className="grow truncate">{t(s.key)}{p.label && p.stage !== 'install' ? ` · ${p.label}` : ''}</span>
        <b>{Math.round(pct)}%</b>
      </div>
      <div className="render-track">
        <motion.div className="render-fill" animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 24 }} />
      </div>
    </motion.div>
  );
}
