// "@" in the composer: pick an agent or a group to bring into this chat.
import { AnimatePresence, motion } from 'motion/react';
import { UsersRound } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent, type RefObject } from 'react';
import { useData, type Agent, type AgentGroup } from '../api';
import { useT } from '../i18n';
import { agentName } from './agentKit';
import { statusLine, useAgentStatuses } from './agentStatus';
import { Robot } from './Robot';
import { spring } from './ui';

type Item = { kind: 'agent'; agent: Agent; name: string } | { kind: 'group'; group: AgentGroup; name: string };

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** The "@word" right before the caret, if any. */
function atQuery(value: string, caret: number): { q: string; start: number } | null {
  const before = value.slice(0, caret);
  const m = before.match(/(^|\s)@([\p{L}\d _-]{0,30})$/u);
  if (!m) return null;
  // names may contain spaces, but a query running past two words is just text
  if ((m[2].match(/ /g) ?? []).length > 2) return null;
  return { q: m[2], start: caret - m[2].length - 1 };
}

export function useMentions(input: string, setInput: (v: string) => void, taRef: RefObject<HTMLTextAreaElement | null>, enabled: boolean) {
  const { data: agents } = useData<Agent[]>(enabled ? '/api/agents' : null);
  const { data: groups } = useData<AgentGroup[]>(enabled ? '/api/groups' : null);
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(0);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const t = useT();

  const query = enabled ? atQuery(input, caret) : null;
  const items: Item[] = query
    ? [
        ...(groups ?? []).map((g) => ({ kind: 'group' as const, group: g, name: g.name })),
        ...(agents ?? []).filter((a) => !a.monitor).map((a) => ({ kind: 'agent' as const, agent: a, name: agentName(a, t) })),
      ].filter((it) => norm(it.name).startsWith(norm(query.q)) || norm(it.name).includes(' ' + norm(query.q))).slice(0, 7)
    : [];
  const open = !!query && items.length > 0 && closedAt !== query.start;
  useEffect(() => setSel(0), [query?.q]);

  const pick = (it: Item) => {
    if (!query) return;
    const next = input.slice(0, query.start) + '@' + it.name + ' ' + input.slice(caret);
    setInput(next);
    const pos = query.start + it.name.length + 2;
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
    if (e.key === 'Escape') {
      setClosedAt(query!.start);
      return true;
    }
    return false;
  };
  const track = () => setCaret(taRef.current?.selectionStart ?? 0);

  const reopen = () => { setClosedAt(null); track(); };
  return { open, items, sel, pick, onKey, track, reopen };
}

export function MentionMenu({ m }: { m: ReturnType<typeof useMentions> }) {
  const t = useT();
  const statuses = useAgentStatuses();
  return (
    <AnimatePresence>
      {m.open && (
        <motion.div className="mention-menu" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }} transition={spring}>
          <div className="picker-head">{t('mention.title')}</div>
          {m.items.map((it, i) => (
            <button key={(it.kind === 'agent' ? it.agent.id : it.group.id)} type="button" className={`picker-item${i === m.sel ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); m.pick(it); }}>
              {it.kind === 'agent' ? <Robot avatar={it.agent.avatar} size={28} still={statuses[it.agent.id]?.state !== 'working'} running={statuses[it.agent.id]?.state === 'working'} /> : <div className="menu-ic"><UsersRound size={15} /></div>}
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="truncate" style={{ display: 'block' }}>@{it.name}</b>
                <div className="small faint truncate">
                  {it.kind === 'group'
                    ? t('groups.members', { n: it.group.members.length })
                    : statuses[it.agent.id]?.state === 'working'
                      ? `⚡ ${statusLine(statuses[it.agent.id])}`
                      : it.agent.description || t('agentStatus.idle')}
                </div>
              </div>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
