// "#" in the composer: every installed plugin; pick one to tell the AI "use this for this message".
import { AnimatePresence, motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent, type RefObject } from 'react';
import { useData } from '../api';
import { useT } from '../i18n';
import { navigate } from '../router';
import { PluginIcon } from './Plugins';
import { spring } from './ui';

interface Installed { id: string; name: string; title: string; catalogId?: string; enabled: boolean }
interface CatalogEntry { id: string; icon: string; color: string; description: string }
type State = 'ok' | 'login' | 'offline' | 'missing' | 'off' | 'unknown';
type Item = { kind: 'plugin'; p: Installed; c?: CatalogEntry; state?: State } | { kind: 'add' };

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** The "#word" right before the caret, if any (not a "#" inside a word or a link). */
function hashQuery(value: string, caret: number): { q: string; start: number } | null {
  const m = value.slice(0, caret).match(/(^|\s)#([\p{L}\d_-]{0,30})$/u);
  return m ? { q: m[2], start: caret - m[2].length - 1 } : null;
}

export function usePluginTags(input: string, setInput: (v: string) => void, taRef: RefObject<HTMLTextAreaElement | null>, enabled: boolean) {
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(0);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const query = enabled ? hashQuery(input, caret) : null;
  const { data } = useData<{ installed: Installed[]; catalog: CatalogEntry[] }>(enabled ? '/api/plugins' : null);
  const { data: st } = useData<{ status: Record<string, { state: State }> }>(query ? '/api/plugins/status' : null);

  const all = (data?.installed ?? [])
    .map((p) => ({ kind: 'plugin' as const, p, c: data?.catalog.find((c) => c.id === p.catalogId), state: st?.status[p.id]?.state }))
    .sort((a, b) => Number(b.p.enabled) - Number(a.p.enabled));
  const items: Item[] = query
    ? [...all.filter((it) => !query.q || norm(it.p.name).includes(norm(query.q)) || norm(it.p.title).includes(norm(query.q))).slice(0, 8), { kind: 'add' as const }]
    : [];
  const open = !!query && closedAt !== query.start && !!data;
  useEffect(() => setSel(0), [query?.q]);

  const pick = (it: Item) => {
    if (!query) return;
    if (it.kind === 'add') { navigate('/settings?tab=plugins'); return; }
    const tag = '#' + it.p.name;
    const next = input.slice(0, query.start) + tag + ' ' + input.slice(caret);
    setInput(next);
    const pos = query.start + tag.length + 1;
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(pos, pos); setCaret(pos); }
    });
  };

  /** Call first in the textarea's onKeyDown; true = the key was used by the menu. */
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(items[sel]);
      return true;
    }
    if (e.key === 'Escape') { setClosedAt(query!.start); return true; }
    return false;
  };
  const track = () => setCaret(taRef.current?.selectionStart ?? 0);
  const reopen = () => { setClosedAt(null); track(); };
  return { open, items, sel, pick, onKey, track, reopen, empty: !all.length };
}

export function PluginTagMenu({ m }: { m: ReturnType<typeof usePluginTags> }) {
  const t = useT();
  return (
    <AnimatePresence>
      {m.open && (
        <motion.div className="mention-menu plugin-tags" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }} transition={spring}>
          <div className="picker-head">{t('ptag.title')}</div>
          {m.empty && <div className="small faint" style={{ padding: '4px 10px 8px' }}>{t('ptag.none')}</div>}
          {m.items.map((it, i) => it.kind === 'add' ? (
            <button key="add" type="button" className={`picker-item${i === m.sel ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); m.pick(it); }}>
              <div className="menu-ic"><Plus size={15} /></div>
              <div className="grow"><b>{t('ptag.add')}</b></div>
            </button>
          ) : (
            <button key={it.p.id} type="button" className={`picker-item${i === m.sel ? ' active' : ''}${it.p.enabled ? '' : ' off'}`} onMouseDown={(e) => { e.preventDefault(); m.pick(it); }}>
              <PluginIcon icon={it.c?.icon} color={it.c?.color} size={28} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="truncate" style={{ display: 'block' }}>#{it.p.name} <span className="faint" style={{ fontWeight: 400 }}>{it.p.title}</span></b>
                <div className="small faint truncate">
                  {it.state && it.state !== 'ok' && it.state !== 'unknown' ? <span className={`ptag-st ${it.state}`}>{t(`plugins.st.${it.state}`)}{it.c?.description ? ' · ' : ''}</span> : null}
                  {it.c?.description ?? ''}
                </div>
              </div>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
