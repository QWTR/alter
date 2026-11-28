import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen, Bot, Brain, Briefcase, Calendar, Camera, Clapperboard, Code, Cpu, Film, Folder, Globe, Heart, House, Lightbulb, Mail,
  Megaphone, Moon, Music, Palette, PenTool, Rocket, Server, Shield, ShoppingBag, Sparkles, Sunrise, Target, Telescope,
  TrendingUp, Users, Wrench, Zap, X, CircleCheck, CircleAlert, Info, Database, Radar, type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Avatar } from '../api';
import { Robot } from './Robot';

// ---------- motion presets ----------
export const spring = { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const;
export const ease = [0.22, 1, 0.36, 1] as const;

export const listItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};
export const stagger = (i: number, step = 0.035) => ({ ...listItem, transition: { duration: 0.32, ease, delay: Math.min(i * step, 0.3) } });

// ---------- palettes & icons ----------
export const PALETTES: Record<string, string> = {
  violet: 'linear-gradient(140deg, #a48bff 0%, #6a4cff 55%, #3f2bb8 100%)',
  ocean: 'linear-gradient(140deg, #6fe3ff 0%, #3a8bff 55%, #2446c9 100%)',
  sunset: 'linear-gradient(140deg, #ffd36e 0%, #ff8a4c 50%, #e8416f 100%)',
  mint: 'linear-gradient(140deg, #9cf5cf 0%, #2fcf98 50%, #0f8a7a 100%)',
  rose: 'linear-gradient(140deg, #ffb3d1 0%, #ff5c9a 50%, #b5246b 100%)',
  amber: 'linear-gradient(140deg, #ffe58a 0%, #ffb02e 50%, #d0661a 100%)',
  slate: 'linear-gradient(140deg, #c3c9dd 0%, #7a83a6 50%, #3e4563 100%)',
  lime: 'linear-gradient(140deg, #e3ff8a 0%, #8be04a 50%, #2f9a3d 100%)',
};
export const PALETTE_KEYS = Object.keys(PALETTES);
export const paletteSolid: Record<string, string> = {
  violet: '#8b74ff', ocean: '#3a8bff', sunset: '#ff8a4c', mint: '#2fcf98', rose: '#ff5c9a', amber: '#ffb02e', slate: '#7a83a6', lime: '#8be04a',
};

export const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, sunrise: Sunrise, moon: Moon, mail: Mail, clapperboard: Clapperboard, telescope: Telescope, server: Server,
  cpu: Cpu, target: Target, folder: Folder, briefcase: Briefcase, rocket: Rocket, palette: Palette, code: Code, camera: Camera,
  music: Music, heart: Heart, globe: Globe, shield: Shield, zap: Zap, bot: Bot, brain: Brain, calendar: Calendar, bag: ShoppingBag,
  pen: PenTool, megaphone: Megaphone, book: BookOpen, home: House, wrench: Wrench, trend: TrendingUp, users: Users, film: Film,
  idea: Lightbulb, database: Database, radar: Radar,
};
export const ICON_KEYS = Object.keys(ICONS);

/** An agent's face: an animated robot head (see Robot.tsx). */
export function Orb({ avatar, size = 44, running = false }: { avatar?: Avatar | null; size?: number; running?: boolean }) {
  return <Robot avatar={avatar} size={size} running={running} still={size < 30} />;
}

/** The plain gradient tile (projects, tiny places). */
export function GradientOrb({ avatar, size = 44, running = false }: { avatar?: Avatar | null; size?: number; running?: boolean }) {
  const Icon = ICONS[avatar?.icon ?? 'sparkles'] ?? Sparkles;
  return (
    <motion.div
      className={`orb${running ? ' running' : ''}`}
      style={{ width: size, height: size, ['--orb' as any]: PALETTES[avatar?.palette ?? 'violet'] ?? PALETTES.violet }}
      animate={running ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={running ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : spring}
    >
      <Icon size={size * 0.46} strokeWidth={2.1} />
    </motion.div>
  );
}

// ---------- logo ----------
export function Logo({ size = 28, animated = false }: { size?: number; animated?: boolean }) {
  const id = useId().replace(/:/g, '');
  const draw = animated
    ? { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 1.1, ease } }
    : {};
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} aria-label="ALTTER">
      <defs>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#231a47" />
          <stop offset=".55" stopColor="#130f26" />
          <stop offset="1" stopColor="#0a0913" />
        </linearGradient>
        <radialGradient id={`g${id}`} cx=".5" cy=".38" r=".6">
          <stop offset="0" stopColor="#7c5cff" stopOpacity=".55" />
          <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6e0ff" />
          <stop offset="1" stopColor="#8f76ff" />
        </linearGradient>
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5ad7ff" stopOpacity=".9" />
          <stop offset="1" stopColor="#5ad7ff" stopOpacity=".15" />
        </linearGradient>
        <radialGradient id={`o${id}`} cx=".4" cy=".35" r=".7">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".45" stopColor="#9ee8ff" />
          <stop offset="1" stopColor="#6b5cff" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#t${id})`} />
      <rect width="512" height="512" rx="116" fill={`url(#g${id})`} />
      <motion.path d="M190 376 L290 136 L390 376" fill="none" stroke={`url(#h${id})`} strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" opacity=".55" {...draw} transition={animated ? { duration: 1.1, ease, delay: 0.35 } : undefined} />
      <motion.path d="M146 384 L256 124 L366 384" fill="none" stroke={`url(#s${id})`} strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" {...draw} />
      <motion.circle
        cx="256" cy="304" r="34" fill={`url(#o${id})`}
        initial={animated ? { scale: 0 } : false}
        animate={animated ? { scale: [0, 1.25, 1] } : undefined}
        transition={animated ? { duration: 0.6, delay: 0.9, ease } : undefined}
        style={{ transformOrigin: '256px 304px' }}
      />
    </svg>
  );
}

// ---------- provider mark (no vendor logos — a neutral monogram tile) ----------
const PROVIDER_COLORS: Record<string, string> = {
  claude: 'linear-gradient(140deg, #f0a37a, #c9653a)',
  codex: 'linear-gradient(140deg, #6ee7c0, #10a37f)',
  gemini: 'linear-gradient(140deg, #8ab4ff, #6b5cff 60%, #d16ba5)',
  demo: 'linear-gradient(140deg, #9a97ad, #5b5870)',
};
export function ProviderMark({ id, name, size = 46 }: { id: string; name: string; size?: number }) {
  return (
    <div className="provider-mark" style={{ background: PROVIDER_COLORS[id] ?? PROVIDER_COLORS.demo, width: size, height: size, fontSize: size * 0.4, borderRadius: size * 0.3 }}>
      {name.slice(0, 1)}
    </div>
  );
}

// ---------- controls ----------
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" className="switch" data-on={on} onClick={() => onChange(!on)} aria-pressed={on} aria-label={label}>
      <motion.span className="knob" animate={{ x: on ? 16 : 0 }} transition={spring} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size }: {
  value: T; options: { value: T; label: string; icon?: LucideIcon; title?: string }[]; onChange: (v: T) => void; size?: 'sm';
}) {
  const id = useId();
  return (
    <div className="segmented" style={size === 'sm' ? { fontSize: 12 } : undefined}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)} title={o.title}>
          {o.value === value && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={spring} />}
          {o.icon && <o.icon />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: string; icon?: LucideIcon; count?: number }[]; onChange: (v: T) => void }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  // which sides hide more tabs (a fade shows it there); wide screens wrap instead of scrolling
  const [edge, setEdge] = useState({ l: false, r: false });
  const measure = () => {
    const b = ref.current;
    if (!b) return;
    const l = b.scrollLeft > 2, r = b.scrollLeft + b.clientWidth < b.scrollWidth - 2;
    setEdge((e) => (e.l === l && e.r === r ? e : { l, r }));
  };
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('button.active');
    const box = ref.current;
    if (el && box && box.scrollWidth > box.clientWidth) {
      // only as far as needed to show the active tab, so the first tabs stay visible whenever they can
      const left = el.offsetLeft - box.offsetLeft, right = left + el.offsetWidth;
      if (left < box.scrollLeft) box.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
      else if (right > box.scrollLeft + box.clientWidth) box.scrollTo({ left: right - box.clientWidth + 24, behavior: 'smooth' });
    }
    measure();
  }, [value]);
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="tabs" ref={ref} onScroll={measure} data-l={edge.l || undefined} data-r={edge.r || undefined}>
      {tabs.map((tb) => (
        <button key={tb.value} className={tb.value === value ? 'active' : ''} onClick={() => onChange(tb.value)}>
          {tb.icon && <tb.icon />}
          {tb.label}
          {tb.count != null && <span className="faint small">{tb.count}</span>}
          {tb.value === value && <motion.span layoutId={`tab-${id}`} className="tab-line" transition={spring} />}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <motion.div className="empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
      <motion.div className="empty-icon" initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={softSpring}>
        <Icon size={26} />
      </motion.div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </motion.div>
  );
}

export function PageHead({ title, lead, actions }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

// ---------- overlays ----------
export function Modal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            className={`modal${wide ? ' wide' : ''}`}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.15 } }}
            transition={softSpring}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * A side sheet (full screen on phones). It always has a close button, and the phone's Back button
 * (or the browser's) closes it instead of leaving the page: opening it adds a history step.
 */
export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    history.pushState({ ...(history.state ?? {}), alterDrawer: true }, '', location.href);
    const onPop = () => closeRef.current();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      // closed with the button / overlay / Esc: drop the history step we added (not when Back already did)
      if (history.state?.alterDrawer) history.back();
    };
  }, [open]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="o" className="drawer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside key="d" className="drawer" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%', transition: { duration: 0.22, ease } }} transition={{ type: 'spring', stiffness: 380, damping: 40 }}>
            <button type="button" className="drawer-close btn ghost icon" onClick={onClose} aria-label="close"><X /></button>
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ModalHead({ icon, title, text, onClose }: { icon?: ReactNode; title: string; text?: string; onClose: () => void }) {
  return (
    <div className="modal-head">
      {icon}
      <div className="grow">
        <h2>{title}</h2>
        {text && <p>{text}</p>}
      </div>
      <button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><X /></button>
    </div>
  );
}

// ---------- toasts ----------
type Toast = { id: number; text: string; kind: 'ok' | 'error' | 'info'; icon?: ReactNode };
let toasts: Toast[] = [];
const toastSubs = new Set<() => void>();
let nextId = 1;
export function toast(text: string, kind: Toast['kind'] = 'info', icon?: ReactNode, ms = 4200) {
  const id = nextId++;
  toasts = [...toasts.slice(-3), { id, text, kind, icon }];
  toastSubs.forEach((s) => s());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== id);
    toastSubs.forEach((s) => s());
  }, ms);
}
export function Toasts() {
  const list = useSyncExternalStore(
    (cb) => {
      toastSubs.add(cb);
      return () => toastSubs.delete(cb);
    },
    () => toasts,
  );
  return (
    <div className="toasts">
      <AnimatePresence initial={false}>
        {list.map((x) => (
          <motion.div key={x.id} layout className="toast" initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }} transition={softSpring}>
            {x.icon ?? (x.kind === 'ok' ? <CircleCheck color="var(--ok)" /> : x.kind === 'error' ? <CircleAlert color="var(--danger)" /> : <Info color="var(--accent-strong)" />)}
            <span>{x.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------- misc ----------
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Spinner() {
  return <span className="spinner" />;
}
