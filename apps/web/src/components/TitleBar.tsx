// The desktop app's own title bar (the window has no Windows frame): drag area, where you are, live status,
// and minimise / maximise / close drawn to match ALTTER.
import { AnimatePresence, motion } from 'motion/react';
import { Globe, MousePointer2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useData } from '../api';
import { useT, type Key } from '../i18n';
import { useRoute } from '../router';
import { Logo } from './ui';

interface Desktop {
  platform: string;
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  onState(cb: (s: { maximized: boolean; fullscreen: boolean; focused: boolean }) => void): () => void;
}
export const desktop = (window as unknown as { alterDesktop?: Desktop }).alterDesktop;
if (desktop) document.documentElement.classList.add('has-titlebar');

const SECTION_KEY: Record<string, Key> = {
  home: 'nav.home', chat: 'nav.chats', projects: 'nav.projects', agents: 'nav.agents', automations: 'nav.automations',
  studio: 'nav.studio', activity: 'nav.activity', memory: 'nav.memory', settings: 'nav.settings', trips: 'nav.trips', hands: 'nav.hands',
};

export function TitleBar() {
  const t = useT();
  const route = useRoute();
  const [max, setMax] = useState(false);
  const [focused, setFocused] = useState(true);
  const { data: net } = useData<{ url: string | null }>(desktop ? '/api/tunnel' : null, 15_000);
  const { data: hands } = useData<{ agents: { name: string; color: string }[] }>(desktop ? '/api/hands' : null, 4000);

  useEffect(() => {
    if (!desktop) return;
    desktop.isMaximized().then(setMax);
    return desktop.onState((s) => {
      setMax(s.maximized || s.fullscreen);
      setFocused(s.focused);
    });
  }, []);
  if (!desktop) return null;
  const where = SECTION_KEY[route.section] ? t(SECTION_KEY[route.section]) : '';
  const busy = hands?.agents ?? [];

  return (
    <header className={`titlebar${focused ? '' : ' blurred'}`} onDoubleClick={(e) => e.target === e.currentTarget && desktop.toggleMaximize()}>
      <div className="tb-brand">
        <Logo size={16} />
        <span>ALTTER</span>
        <AnimatePresence mode="popLayout">
          {where && (
            <motion.span key={where} className="tb-where" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              <i>/</i>{where}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="tb-status">
        <AnimatePresence>
          {busy.length > 0 && (
            <motion.span className="tb-chip" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} title={busy.map((a) => a.name).join(', ')}>
              <MousePointer2 size={12} />
              {busy.map((a) => <i key={a.name} style={{ background: a.color }} />)}
              {t('hands.chip', { n: busy.length })}
            </motion.span>
          )}
          {net?.url && (
            <motion.span className="tb-chip on" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} title={net.url}>
              <Globe size={12} />
              {t('tb.online')}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="tb-buttons">
        <button className="tb-btn" onClick={() => desktop.minimize()} aria-label={t('tb.minimize')} title={t('tb.minimize')}>
          <svg viewBox="0 0 12 12"><path d="M2 6.5h8" /></svg>
        </button>
        <button className="tb-btn" onClick={() => desktop.toggleMaximize()} aria-label={max ? t('tb.restore') : t('tb.maximize')} title={max ? t('tb.restore') : t('tb.maximize')}>
          {max ? (
            <svg viewBox="0 0 12 12"><path d="M3.5 4.5h5v5h-5z" /><path d="M5 3h4.5v4.5" /></svg>
          ) : (
            <svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" rx="1.2" /></svg>
          )}
        </button>
        <button className="tb-btn close" onClick={() => desktop.close()} aria-label={t('tb.close')} title={t('tb.close')}>
          <svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" /></svg>
        </button>
      </div>
    </header>
  );
}
