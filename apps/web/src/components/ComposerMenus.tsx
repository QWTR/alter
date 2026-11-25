// Compact composer menus: what the AI may do (access) and which project the chat belongs to.
import { AnimatePresence, motion } from 'motion/react';
import { AtSign, Check, ChevronDown, Eye, FolderKanban, FolderPlus, ListChecks, MessageCircle, Plus, Puzzle, Terminal, WandSparkles, type LucideIcon, BookOpen, ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Access, Project } from '../api';
import { useT, type Key } from '../i18n';
import { navigate } from '../router';
import { spring } from './ui';

function Menu({ label, icon, title, disabled, wide, iconOnly, children }: { label: ReactNode; icon: ReactNode; title?: string; disabled?: boolean; wide?: boolean; iconOnly?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="picker" ref={ref}>
      {iconOnly ? (
        <motion.button type="button" className={`btn ghost icon sm plus-btn${open ? ' open' : ''}`} onClick={() => setOpen(!open)} title={title} whileTap={{ scale: 0.9 }} animate={{ rotate: open ? 45 : 0 }} transition={spring}>
          {icon}
        </motion.button>
      ) : (
      <button type="button" className={`chip-select${open ? ' open' : ''}`} disabled={disabled} onClick={() => setOpen(!open)} title={title}>
        {icon}
        <span className="chip-label">{label}</span>
        {!disabled && <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring} style={{ display: 'grid' }}><ChevronDown /></motion.span>}
      </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            className="picker-pop up"
            style={{ width: wide ? 280 : 270 }}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={spring}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Item({ icon: Icon, color, title, hint, active, onClick, i, disabled }: { icon: LucideIcon; color?: string; title: string; hint?: string; active?: boolean; onClick: () => void; i: number; disabled?: boolean }) {
  return (
    <motion.button type="button" disabled={disabled} className={`picker-item${active ? ' active' : ''}`} onClick={onClick} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
      <div className="menu-ic" style={color ? { background: `color-mix(in srgb, ${color} 18%, transparent)`, color } : undefined}><Icon size={16} /></div>
      <div className="grow" style={{ minWidth: 0 }}>
        <b className="truncate" style={{ display: 'block' }}>{title}</b>
        {hint && <div className="small faint truncate">{hint}</div>}
      </div>
      {active && <Check size={15} style={{ color: 'var(--accent-strong)', flexShrink: 0 }} />}
    </motion.button>
  );
}

const ACCESS: { value: Access; icon: LucideIcon; color: string }[] = [
  { value: 'chat', icon: MessageCircle, color: 'var(--accent-strong)' },
  { value: 'read', icon: Eye, color: '#3aa8ff' },
  { value: 'full', icon: Terminal, color: '#ff9a3d' },
];

export function AccessPicker({ value, onChange }: { value: Access; onChange: (a: Access) => void }) {
  const t = useT();
  const cur = ACCESS.find((a) => a.value === value) ?? ACCESS[0];
  const Icon = cur.icon;
  return (
    <Menu label={t(`chat.access.${cur.value}` as Key)} icon={<Icon style={{ color: cur.color }} />} title={t(`chat.access.${cur.value}Hint` as Key)}>
      {(close) => (
        <>
          <div className="picker-head">{t('menu.access')}</div>
          {ACCESS.map((a, i) => (
            <Item key={a.value} i={i} icon={a.icon} color={a.color} title={t(`chat.access.${a.value}` as Key)} hint={t(`chat.access.${a.value}Hint` as Key)} active={a.value === value} onClick={() => { onChange(a.value); close(); }} />
          ))}
        </>
      )}
    </Menu>
  );
}

/** Project for this chat. A new chat can pick one; an existing chat shows where it lives. */
export function ProjectPicker({ projects, value, onChange, locked }: { projects: Project[] | undefined; value: string | null; onChange: (id: string | null) => void; locked?: boolean }) {
  const t = useT();
  const cur = projects?.find((p) => p.id === value);
  return (
    <Menu
      disabled={locked}
      wide
      label={cur ? cur.name : t('menu.noProject')}
      icon={<FolderKanban style={cur ? { color: cur.color } : undefined} />}
      title={t('menu.project')}
    >
      {(close) => (
        <>
          <div className="picker-head">{t('menu.project')}</div>
          <div className="menu-scroll">
            <Item i={0} icon={MessageCircle} title={t('menu.noProject')} hint={t('menu.noProjectHint')} active={!value} onClick={() => { onChange(null); close(); }} />
            {(projects ?? []).map((p, i) => (
              <Item key={p.id} i={i + 1} icon={FolderKanban} color={p.color} title={p.name} hint={p.description || undefined} active={p.id === value} onClick={() => { onChange(p.id); close(); }} />
            ))}
          </div>
          <button type="button" className="picker-foot" onClick={() => { close(); navigate('/projects'); }}>
            <FolderPlus size={14} /> {t('projects.new')}
          </button>
        </>
      )}
    </Menu>
  );
}

/** The "+" next to attach and mic: tag agents, improve the prompt, plan mode, plugins. */
export function PlusMenu({ planMode, onPlan, canEnhance, enhancing, onEnhance, onMention, onLibrary, onPlugins }: {
  planMode: boolean; onPlan: () => void; canEnhance: boolean; enhancing: boolean; onEnhance: () => void; onMention: () => void; onLibrary?: () => void; onPlugins?: () => void;
}) {
  const t = useT();
  return (
    <Menu iconOnly label="" icon={<Plus size={18} />} title={t('plus.title')}>
      {(close) => (
        <>
          <div className="picker-head">{t('plus.title')}</div>
          <Item i={0} icon={AtSign} color="#3aa8ff" title={t('plus.mention')} hint={t('plus.mentionHint')} onClick={() => { close(); onMention(); }} />
          <Item i={1} icon={WandSparkles} color="var(--accent-strong)" title={enhancing ? t('enhance.busy') : t('enhance.label')} hint={canEnhance ? t('enhance.hint') : t('plus.enhanceEmpty')} disabled={!canEnhance || enhancing} onClick={() => { close(); onEnhance(); }} />
          <Item i={2} icon={ListChecks} color="#22c55e" title={t('plan.toggle')} hint={t('plan.toggleHint')} active={planMode} onClick={() => { onPlan(); close(); }} />
          {onLibrary && <Item i={3} icon={BookOpen} color="#e87ba4" title={t('prompts.fromLibrary')} hint={t('prompts.fromLibraryHint')} onClick={() => { close(); onLibrary(); }} />}
          <Item i={4} icon={ImagePlus} color="#2ee6ff" title={t('nav.media')} hint={t('plus.mediaHint')} onClick={() => { close(); navigate('/media'); }} />
          <Item i={5} icon={Puzzle} color="#ff9a3d" title={t('plugins.title')} hint={t('plus.pluginsHint')} onClick={() => { close(); if (onPlugins) onPlugins(); else navigate('/settings?tab=plugins'); }} />
        </>
      )}
    </Menu>
  );
}
