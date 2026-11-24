// Settings → Plugins: a marketplace of MCP servers (Higgsfield, Figma, Blender, a real browser…) + your own.
import { AnimatePresence, motion } from 'motion/react';
import {
  AudioLines, BookOpen, Box, Briefcase, Bug, Calendar, Check, Clapperboard, CreditCard, Database, FileText, Flame, FolderOpen, GitBranch, Globe, HardDrive,
  Headphones, Kanban, KeyRound, LayoutGrid, ListChecks, ListTree, LogIn, Mail, Megaphone, MessagesSquare, Mic, NotebookPen, Palette, PenTool,
  Plus, Presentation, Puzzle, Search, Server, Shapes, Sparkles, Store, Table, Trash2, Users, Video, Workflow, Zap, Receipt, Truck, ShoppingCart, MessageCircle, Send, UserCheck, FileCheck, Calculator, type LucideIcon,
} from 'lucide-react';
import { CalendarsCard } from './Calendars';
import { useState } from 'react';
import { api, invalidate, useData } from '../api';
import { useT, type Key } from '../i18n';
import { Field, Modal, ModalHead, Switch, spring, stagger, toast } from './ui';


interface CatalogEntry {
  id: string; title: string; category: string; icon: string; color: string; description: string; homepage: string;
  transport: 'http' | 'stdio'; oauth?: boolean; login?: string[]; needs?: string; popular?: boolean;
  keys?: { name: string; label: string; help?: string }[];
}
interface Installed { id: string; name: string; title: string; catalogId?: string; transport: 'http' | 'stdio'; url?: string; command?: string; args?: string[]; oauth?: boolean; enabled: boolean }

const ICONS: Record<string, LucideIcon> = {
  AudioLines, BookOpen, Box, Briefcase, Bug, Calendar, Clapperboard, CreditCard, Database, FileText, Flame, FolderOpen, GitBranch, Globe, HardDrive, Headphones,
  Kanban, LayoutGrid, ListChecks, ListTree, Mail, Megaphone, MessagesSquare, Mic, NotebookPen, Palette, PenTool, Presentation, Server, Shapes, Store, Table, Users, Video, Workflow, Zap,
  Receipt, Truck, ShoppingCart, MessageCircle, Send, UserCheck, FileCheck, Calculator,
};
const CATS = ['all', 'office', 'tasks', 'meet', 'sales', 'finance', 'commerce', 'hr', 'auto', 'create', 'design', 'web', 'dev', 'data'] as const;
type Cat = (typeof CATS)[number];

function PluginIcon({ icon, color, size = 42 }: { icon?: string; color?: string; size?: number }) {
  const I = (icon && ICONS[icon]) || Puzzle;
  return (
    <div className="plug-ic" style={{ width: size, height: size, color: color ?? 'var(--accent-strong)', background: `color-mix(in srgb, ${color ?? 'var(--accent)'} 16%, transparent)` }}>
      <I size={size * 0.48} />
    </div>
  );
}

export function PluginsTab() {
  const t = useT();
  const { data } = useData<{ installed: Installed[]; catalog: CatalogEntry[] }>('/api/plugins', 6000);
  const [cat, setCat] = useState<Cat>('all');
  const [q, setQ] = useState('');
  const [keysFor, setKeysFor] = useState<CatalogEntry | null>(null);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (!data) return <div className="card"><div className="skeleton" style={{ height: 160 }} /></div>;
  const desc = (c: CatalogEntry) => { const k = `plugins.d.${c.id}` as Key; const v = t(k); return v === k ? c.description : v; };
  const installedIds = new Set(data.installed.map((p) => p.catalogId).filter(Boolean));
  const shown = data.catalog.filter((c) => (cat === 'all' || c.category === cat) && (!q.trim() || (c.title + ' ' + c.description).toLowerCase().includes(q.trim().toLowerCase())));

  const refresh = () => invalidate('/api/plugins');
  const install = async (c: CatalogEntry, keys?: Record<string, string>) => {
    if (c.keys?.length && !keys) return setKeysFor(c);
    setBusy(c.id);
    try {
      const r = await api<{ plugins: Installed[] }>('/api/plugins', { method: 'POST', body: { catalogId: c.id, keys } });
      toast(t('plugins.installed', { name: c.title }), 'ok');
      setKeysFor(null);
      refresh();
      if ((c.oauth || c.login) && r.plugins[0]) login(r.plugins[0]);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  const login = async (p: Installed) => {
    try {
      const r = await api<{ device?: boolean }>(`/api/plugins/${p.id}/login`, { method: 'POST' });
      toast(r.device ? t('plugins.deviceHint', { name: p.title }) : t('plugins.loginHint', { name: p.name }), 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const toggle = async (p: Installed, on: boolean) => {
    await api(`/api/plugins/${p.id}`, { method: 'PUT', body: { enabled: on } });
    refresh();
  };
  const remove = async (p: Installed) => {
    if (!confirm(t('plugins.removeConfirm', { name: p.title }))) return;
    await api(`/api/plugins/${p.id}`, { method: 'DELETE' });
    refresh();
  };

  return (
    <div className="plug-page">
      <div className="card plug-hero">
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <div className="net-orb on"><Puzzle /></div>
          <div className="grow">
            <h3>{t('plugins.title')}</h3>
            <p className="muted small" style={{ margin: '4px 0 0' }}>{t('plugins.lead')}</p>
          </div>
          <button className="btn" onClick={() => setCustom(true)}><Plus />{t('plugins.custom')}</button>
        </div>
      </div>

      <CalendarsCard />

      {data.installed.length > 0 && (
        <section>
          <div className="section-title">{t('plugins.yours')}</div>
          <div className="plug-list">
            {data.installed.map((p, i) => {
              const c = data.catalog.find((x) => x.id === p.catalogId);
              return (
                <motion.div key={p.id} className={`plug-row${p.enabled ? '' : ' off'}`} layout {...stagger(i)}>
                  <PluginIcon icon={c?.icon} color={c?.color} size={36} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>{p.title}</b>
                    <div className="small faint truncate">{p.transport === 'http' ? p.url : [p.command, ...(p.args ?? [])].join(' ')}</div>
                  </div>
                  {(p.oauth || c?.login) && <button className="btn sm" onClick={() => login(p)} title={t('plugins.loginTitle')}><LogIn size={14} />{t('plugins.login')}</button>}
                  <Switch on={p.enabled} onChange={(v) => toggle(p, v)} label={p.title} />
                  <button className="btn ghost icon sm danger" onClick={() => remove(p)} title={t('common.delete')}><Trash2 /></button>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="row plug-filters">
          <div className="plug-search"><Search size={15} /><input className="input" placeholder={t('plugins.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="plug-cats">{CATS.map((c) => { const n = c === 'all' ? data.catalog.length : data.catalog.filter((x) => x.category === c).length; return n ? <button key={c} type="button" className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{t(`plugins.cat.${c}` as Key)}<span>{n}</span></button> : null; })}</div>
        </div>
        <div className="plug-grid" key={cat}>
          {shown.map((c, i) => {
            const have = installedIds.has(c.id);
            return (
              <motion.div key={c.id} className="plug-card" {...stagger(i)} whileHover={{ y: -3, transition: spring }}>
                <div className="row" style={{ gap: 12 }}>
                  <PluginIcon icon={c.icon} color={c.color} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <b>{c.title}</b>
                      {c.popular && <span className="badge accent"><Sparkles size={11} />{t('plugins.popular')}</span>}
                    </div>
                    <div className="small faint">{c.oauth || c.login ? t('plugins.viaLogin') : c.keys?.length ? t('plugins.viaKey') : c.transport === 'stdio' ? t('plugins.local') : t('plugins.online')}</div>
                  </div>
                </div>
                <p className="small muted plug-desc">{desc(c)}</p>
                {c.needs && <p className="small faint plug-needs">⚙ {c.needs}</p>}
                <div className="row" style={{ gap: 8, marginTop: 'auto' }}>
                  <a className="small faint" href={c.homepage} target="_blank" rel="noreferrer">{t('plugins.more')}</a>
                  <span className="grow" />
                  {have ? (
                    <span className="badge ok"><Check size={12} />{t('plugins.have')}</span>
                  ) : (
                    <button className="btn primary sm" disabled={busy === c.id} onClick={() => install(c)}>
                      {busy === c.id ? <span className="spinner" /> : <Plus size={14} />}{t('plugins.install')}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      <KeysModal entry={keysFor} busy={!!busy} onClose={() => setKeysFor(null)} onSave={(k) => keysFor && install(keysFor, k)} />
      <CustomModal open={custom} onClose={() => setCustom(false)} onDone={refresh} />
    </div>
  );
}

function KeysModal({ entry, busy, onClose, onSave }: { entry: CatalogEntry | null; busy: boolean; onClose: () => void; onSave: (k: Record<string, string>) => void }) {
  const t = useT();
  const [vals, setVals] = useState<Record<string, string>>({});
  return (
    <Modal open={!!entry} onClose={onClose}>
      {entry && (
        <>
          <ModalHead icon={<KeyRound />} title={t('plugins.keysTitle', { name: entry.title })} text={t('plugins.keysText')} onClose={onClose} />
          {entry.keys?.map((k) => (
            <Field key={k.name} label={k.label} hint={k.help}>
              <input className="input" type="password" autoComplete="off" value={vals[k.name] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [k.name]: e.target.value }))} />
            </Field>
          ))}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
            <button className="btn primary" disabled={busy || entry.keys?.some((k) => !vals[k.name]?.trim())} onClick={() => onSave(vals)}>{t('plugins.install')}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function CustomModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [source, setSource] = useState('');
  const [title, setTitle] = useState('');
  const [oauth, setOauth] = useState(false);
  const [busy, setBusy] = useState(false);
  const isUrl = /^https?:\/\//i.test(source.trim());
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ plugins: Installed[] }>('/api/plugins', { method: 'POST', body: { source, title: title || undefined, oauth } });
      toast(t('plugins.installed', { name: r.plugins.map((p) => p.title).join(', ') }), 'ok');
      setSource(''); setTitle(''); setOauth(false);
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose}>
      <ModalHead icon={<Puzzle />} title={t('plugins.custom')} text={t('plugins.customText')} onClose={onClose} />
      <Field label={t('plugins.source')}>
        <textarea className="input" rows={5} spellCheck={false} style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }} placeholder={'https://mcp.example.com/mcp\nnpx -y some-mcp-server\n{ "mcpServers": { … } }'} value={source} onChange={(e) => setSource(e.target.value)} />
      </Field>
      <Field label={t('plugins.name')}>
        <input className="input" placeholder={t('plugins.namePh')} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <AnimatePresence>
        {isUrl && (
          <motion.label className="row small" style={{ gap: 8, cursor: 'pointer' }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Switch on={oauth} onChange={setOauth} label={t('plugins.oauth')} />{t('plugins.oauth')}
          </motion.label>
        )}
      </AnimatePresence>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn primary" disabled={busy || !source.trim()} onClick={save}>{busy ? <span className="spinner" /> : <Plus size={14} />}{t('plugins.add')}</button>
      </div>
    </Modal>
  );
}
