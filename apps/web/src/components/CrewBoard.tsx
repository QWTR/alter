// The live board of a crew working on the screen: who is on the team (with their colour and what they
// are doing right now), the lead's plan as a checklist, and the notes they send each other.
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, CircleDashed, Crown, Loader2, MessagesSquare, Square, Users } from 'lucide-react';
import { useState } from 'react';
import { api, guest, useData } from '../api';
import { useT, type Key } from '../i18n';
import { navigate, useRoute } from '../router';
import { spring, toast } from './ui';

interface Member { name: string; color: string; conversationId?: string; state: 'working' | 'done' | 'stopped'; action: string; task?: string; lead?: boolean }
interface Board { crew: string; members: Member[]; plan: { who: string; task: string; status: 'todo' | 'working' | 'done' }[]; notes: { name: string; color: string; text: string; at: number; to?: string }[]; startedAt: number; updatedAt: number }

export function CrewBoard({ crew }: { crew: string | null | undefined }) {
  const t = useT();
  const route = useRoute();
  const { data: b } = useData<Board | null>(crew ? `/api/hands/board/${crew}` : null);
  const [notesOpen, setNotesOpen] = useState(true);
  const [stopping, setStopping] = useState(false);
  if (!b || !b.members?.length) return null;
  const running = b.members.some((m) => m.state === 'working');
  const colorOf = (name: string) => b.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.color ?? 'var(--accent)';
  const open = (id?: string) => {
    if (!id) return;
    navigate(route.parts[0] === 'agents' && route.parts[1] ? `/agents/${route.parts[1]}/${id}` : `/chat/${id}`);
  };
  const stop = async () => {
    setStopping(true);
    try {
      await api('/api/hands/stop', { method: 'POST' });
      toast(t('agents.stopped'), 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setStopping(false);
    }
  };
  const notes = b.notes.filter((n) => !n.text.startsWith('Plan: '));

  return (
    <motion.div className={`team-board crew-board${running ? ' running' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} layout>
      <div className="team-board-head">
        <div className="team-board-title"><Users size={15} /><b>{t('crew.board')}</b><span className="badge">{b.members.length}</span></div>
        {running && !guest && (
          <button className="btn danger-soft sm" onClick={stop} disabled={stopping}>{stopping ? <Loader2 className="spin" size={13} /> : <Square size={11} fill="currentColor" />}{t('agents.stop')}</button>
        )}
        {!running && <span className="badge ok"><Check size={12} />{t('team.phase.done')}</span>}
      </div>

      <div className="team-people">
        {b.members.map((m) => (
          <button key={m.name} type="button" className={`team-member crew-member st-${m.state === 'working' ? 'working' : m.state === 'done' ? 'done' : 'error'}`} style={{ ['--crew' as any]: m.color }} onClick={() => open(m.conversationId)} title={m.conversationId ? t('crew.open') : undefined}>
            <span className="crew-dot">{m.lead ? <Crown size={12} /> : m.name.slice(0, 1).toUpperCase()}</span>
            <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
              <div className="row" style={{ gap: 6 }}>
                <b className="truncate">{m.name}</b>
                {m.state === 'working' && <span className="team-dot d-working" />}
                <span className="small faint truncate">{t(`crew.st.${m.state}` as Key)}</span>
              </div>
              {m.task && <div className="small muted team-line">{m.task}</div>}
              {m.state === 'working' && m.action && <div className="small faint team-line">{m.action}</div>}
            </div>
          </button>
        ))}
      </div>

      {b.plan.length > 0 && (
        <div className="crew-plan">
          <div className="small faint" style={{ fontWeight: 600 }}>{t('crew.plan')}</div>
          {b.plan.map((p, i) => (
            <div key={i} className={`crew-task s-${p.status}`}>
              <span className="crew-task-ic">{p.status === 'done' ? <Check size={13} /> : p.status === 'working' ? <Loader2 className="spin" size={13} /> : <CircleDashed size={13} />}</span>
              <b style={{ color: colorOf(p.who) }}>{p.who}</b>
              <span className="small">{p.task}</span>
            </div>
          ))}
        </div>
      )}

      <div className="crew-notes">
        <button type="button" className="proposal-more" onClick={() => setNotesOpen(!notesOpen)}>
          <MessagesSquare size={14} />{t('crew.notes')} <span className="faint">({notes.length})</span>
          <motion.span animate={{ rotate: notesOpen ? 180 : 0 }} style={{ display: 'grid' }}><ChevronDown size={14} /></motion.span>
        </button>
        <AnimatePresence initial={false}>
          {notesOpen && (
            <motion.div className="crew-feed" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              {!notes.length && <div className="small faint">{t('crew.noNotes')}</div>}
              {notes.slice(-14).map((n, i) => (
                <motion.div key={n.at + n.name + i} className="crew-note" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
                  <b style={{ color: n.color }}>{n.name}</b>
                  {n.to && <span className="faint"> → <b style={{ color: colorOf(n.to) }}>{n.to}</b></span>}
                  <span className="small">: {n.text}</span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
