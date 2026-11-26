// Self-running teams: the ```alter-team card (who's on the team → "Create team and start") and the
// ```alter-teamrun live board (plan → work → test → fixes → report, every agent's status live).
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, CheckCircle2, ClipboardList, Crown, FlaskConical, Hammer, Loader2, RotateCcw, Rocket, ShieldCheck, Square, Users, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import { api, guest, invalidate, type Avatar } from '../api';
import { useT, type Key } from '../i18n';
import { navigate } from '../router';
import { useAgentStatuses, statusLine } from './agentStatus';
import { Markdown } from './Markdown';
import { Orb, spring, toast } from './ui';
import { AgentChatDrawer, type AgentChatOpen } from './AgentChat';

export interface TeamCardData {
  name: string; goal: string; lead: { name: string; instructions: string };
  members: { name: string; role: string; instructions?: string; access?: 'read' | 'full'; icon?: string; palette?: string }[];
  tester?: { name: string; instructions: string } | null; rounds?: number; start?: boolean; done?: boolean; groupId?: string;
}
export const validTeam = (x: any) => !!x && typeof x.goal === 'string' && Array.isArray(x.members);

export function TeamCard({ card, pending, index, messageId, conversationId }: { card: TeamCardData | null; pending?: boolean; index: number; messageId?: number; conversationId?: string | null }) {
  const t = useT();
  const [skip, setSkip] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [doneCard, setDoneCard] = useState<TeamCardData | null>(null);
  if (!card)
    return (
      <div className="proposal pending">
        <span className="spinner" />
        <span className="muted">{pending ? t('team.preparing') : t('proposal.broken')}</span>
      </div>
    );
  const v = doneCard ?? card;
  const done = !!v.done;
  const canApply = (!guest || !!guest.member) && messageId != null && !!conversationId && !pending && !done;
  const toggle = (i: number) => setSkip((k) => (k.includes(i) ? k.filter((x) => x !== i) : [...k, i]));
  const apply = async () => {
    setBusy(true);
    try {
      const r = await api<{ card: TeamCardData }>(`/api/conversations/${conversationId}/messages/${messageId}/team/${index}`, { method: 'POST', body: { skip } });
      setDoneCard(r.card);
      invalidate('/api/agents', '/api/groups', '/api/projects', `/api/conversations/${conversationId}`, '/api/conversations');
      toast(t('team.created', { name: r.card.name }), 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const total = v.members.length - skip.filter((i) => i >= 0).length + 1 + (v.tester && !skip.includes(-1) ? 1 : 0);

  return (
    <motion.div className={`proposal team-card${done ? ' done' : ''}`} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring} layout>
      <div className="proposal-tag">{done ? <><Check size={13} />{t('team.tagDone')}</> : <><Users size={13} />{t('team.tag')}</>}</div>
      <div className="setup-title">
        <b>@{v.name}</b>
        <div className="small muted">{v.goal}</div>
      </div>
      <div className="team-grid">
        <TeamPerson icon={<Crown size={14} />} name={v.lead?.name || 'Lead'} role={t('team.leadRole')} tone="lead" />
        {v.members.map((m, i) => (
          <TeamPerson key={i} name={m.name} role={m.role} tone={m.access === 'read' ? 'read' : 'full'} off={skip.includes(i)} onToggle={canApply ? () => toggle(i) : undefined} />
        ))}
        {v.tester && <TeamPerson icon={<ShieldCheck size={14} />} name={v.tester.name} role={t('team.testerRole')} tone="tester" off={skip.includes(-1)} onToggle={canApply ? () => toggle(-1) : undefined} />}
      </div>
      <div className="small faint">{t('team.flow', { n: total, rounds: v.rounds ?? 3 })}</div>
      <div className="proposal-actions">
        {canApply && (
          <motion.button className="btn primary" onClick={apply} disabled={busy} whileTap={{ scale: 0.96 }}>
            {busy ? <Loader2 className="spin" /> : <Rocket />}
            {v.start === false ? t('team.create') : t('team.createStart')}
          </motion.button>
        )}
        {done && !guest && <button className="btn" onClick={() => navigate('/agents')}><Users />{t('team.open')}</button>}
      </div>
    </motion.div>
  );
}

function TeamPerson({ name, role, tone, icon, off, onToggle }: { name: string; role: string; tone: string; icon?: React.ReactNode; off?: boolean; onToggle?: () => void }) {
  return (
    <div className={`team-person t-${tone}${off ? ' off' : ''}`}>
      <div className="team-person-ic">{icon ?? name.slice(0, 1).toUpperCase()}</div>
      <div className="grow" style={{ minWidth: 0 }}>
        <b className="truncate" style={{ display: 'block' }}>{name}</b>
        <div className="small faint truncate">{role}</div>
      </div>
      {onToggle && <button type="button" className="setup-x" onClick={onToggle}>{off ? <Check size={14} /> : <X size={14} />}</button>}
    </div>
  );
}

// ---------- live board ----------
interface Member { id: string; name: string; role: string; avatar: Avatar; status: 'waiting' | 'working' | 'done' | 'error'; task?: string; note?: string; kind: 'lead' | 'member' | 'tester' }
export interface BoardData {
  runId: string; team: string; groupId: string; goal: string; phase: string; round: number; rounds: number;
  members: Member[]; issues: { member: string; problem: string }[]; report?: string; error?: string; startedAt: string; finishedAt?: string;
}
export const validBoard = (x: any) => !!x && typeof x.runId === 'string' && Array.isArray(x.members);

const STEPS = [
  { key: 'plan', icon: ClipboardList },
  { key: 'work', icon: Hammer },
  { key: 'test', icon: FlaskConical },
  { key: 'fix', icon: Wrench },
  { key: 'report', icon: CheckCircle2 },
] as const;
const ORDER: Record<string, number> = { plan: 0, work: 1, test: 2, fix: 3, report: 4, done: 5 };

export function TeamBoard({ board, conversationId }: { board: BoardData | null; conversationId?: string | null }) {
  const t = useT();
  const live = useAgentStatuses();
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [chat, setChat] = useState<AgentChatOpen | null>(null);
  if (!board) return null;
  const running = !['done', 'stopped', 'error'].includes(board.phase);
  const at = ORDER[board.phase] ?? 5;
  const stop = async () => {
    setStopping(true);
    try {
      await api(`/api/squads/${board.runId}/stop`, { method: 'POST' });
      toast(t('agents.stopped'), 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  // a stopped / finished job can be started again (owner and workspace members)
  const again = async () => {
    if (!conversationId) return;
    setStarting(true);
    try {
      await api('/api/squads/start', { method: 'POST', body: { groupId: board.groupId, conversationId, goal: board.goal } });
      invalidate(`/api/conversations/${conversationId}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setStarting(false);
    }
  };
  const canAct = !guest || !!guest.member;
  const ordered = [...board.members].sort((a, b) => (a.kind === 'lead' ? -1 : b.kind === 'lead' ? 1 : a.kind === 'tester' ? 1 : b.kind === 'tester' ? -1 : 0));

  return (
    <motion.div className={`team-board${running ? ' running' : ''} ph-${board.phase}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} layout>
      <div className="team-board-head">
        <div className="team-board-title"><Users size={15} /><b>@{board.team}</b>
          {board.rounds > 1 && <span className="badge">{t('team.round', { n: board.round, of: board.rounds })}</span>}
        </div>
        {running && canAct && (
          <button className="btn danger-soft sm" onClick={stop} disabled={stopping}>{stopping ? <Loader2 className="spin" size={13} /> : <Square size={11} fill="currentColor" />}{t('agents.stop')}</button>
        )}
        {board.phase === 'done' && <span className="badge ok"><Check size={12} />{t('team.phase.done')}</span>}
        {board.phase === 'stopped' && <span className="badge">{t('agents.stopped')}</span>}
        {!running && canAct && conversationId && board.groupId && (
          <button className="btn sm" onClick={again} disabled={starting} title={board.goal}>{starting ? <Loader2 className="spin" size={13} /> : <RotateCcw size={13} />}{t('ac.again')}</button>
        )}
        {board.phase === 'error' && <span className="badge danger"><AlertTriangle size={12} />{t('team.phase.error')}</span>}
      </div>

      <div className="team-steps">
        {STEPS.map((s, i) => {
          const state = i < at ? 'past' : i === at && running ? 'now' : board.phase === 'done' ? 'past' : 'next';
          if (s.key === 'fix' && board.rounds < 2) return null;
          return (
            <div key={s.key} className={`team-step s-${state}`}>
              <span className="team-step-dot">{state === 'now' ? <Loader2 className="spin" size={13} /> : <s.icon size={13} />}</span>
              <span>{t(`team.phase.${s.key}` as Key)}</span>
            </div>
          );
        })}
      </div>

      <div className="team-people">
        <AnimatePresence initial={false}>
          {ordered.map((m) => {
            const now = live[m.id];
            const line = m.status === 'working' ? statusLine(now) || m.task : m.note || m.task;
            return (
              <motion.div key={m.id} className={`team-member clickable st-${m.status} k-${m.kind}`} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                role="button" tabIndex={0} title={t('ac.history')}
                onClick={() => setChat({ id: m.id, name: m.name, avatar: m.avatar, ws: guest ? '' : undefined })}
                onKeyDown={(e) => { if (e.key === 'Enter') setChat({ id: m.id, name: m.name, avatar: m.avatar, ws: guest ? '' : undefined }); }}>
                <div className="team-member-orb">
                  <Orb avatar={m.avatar} size={34} running={m.status === 'working'} />
                  {m.kind === 'lead' && <span className="team-crown"><Crown size={10} /></span>}
                </div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <b className="truncate">{m.name}</b>
                    <span className={`team-dot d-${m.status}`} />
                    <span className="small faint truncate">{t(`team.st.${m.status}` as Key)}</span>
                  </div>
                  {line && <div className="small muted team-line">{line}</div>}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {board.issues.length > 0 && board.phase !== 'done' && (
        <div className="team-issues">
          <div className="small faint" style={{ fontWeight: 600 }}>{t('team.issues', { n: board.issues.length })}</div>
          {board.issues.slice(0, 6).map((i, k) => <div key={k} className="small"><b>{i.member}:</b> {i.problem}</div>)}
        </div>
      )}
      {board.error && <div className="small danger-text">{board.error}</div>}
      {board.report && <div className="team-report"><Markdown text={board.report} /></div>}
      <AgentChatDrawer open={chat} onClose={() => setChat(null)} />
    </motion.div>
  );
}
