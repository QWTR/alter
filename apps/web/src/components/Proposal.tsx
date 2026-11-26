// An automation the AI proposed in a chat (```alter-automation block) — shown as a card, created with one click.
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, Check, ChevronDown, Pencil, Radar, Shield, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api, guest, invalidate, type Agent, type Message } from '../api';
import { useT, type Key } from '../i18n';
import { AgentDrawer } from './agentKit';
import { Markdown } from './Markdown';
import { PlanCard, splitPlans } from './PlanCard';
import { splitTrips, TripCard } from './TripCard';
import { TeamBoard, TeamCard, validBoard, validTeam, type BoardData, type TeamCardData } from './TeamCards';
import { AlertCard, SetupCard, splitFence, validAlert, validSetup, type Alert, type Setup } from './SetupCard';
import { Robot } from './Robot';
import { ScheduleEditor, useDescribeSchedule } from './schedule';
import { spring, toast } from './ui';

export interface Proposal {
  name: string;
  description?: string;
  instructions: string;
  schedule?: string;
  monitor?: { type: 'http' | 'tcp' | 'ping' | 'command'; target: string; everyMinutes?: number; autoFix?: boolean } | null;
  access?: 'chat' | 'read' | 'full';
  icon?: string;
  palette?: string;
  createdId?: string;
}

type Part = { kind: 'text'; text: string } | { kind: 'proposal'; proposal: Proposal | null; index: number; pending?: boolean };

const FENCE = '```alter-automation';

/** Answer text → markdown pieces and proposal cards (an unfinished block while streaming → a "preparing" card). */
export function splitProposals(text: string): Part[] {
  const parts: Part[] = [];
  let rest = text;
  let index = 0;
  while (rest) {
    const at = rest.indexOf(FENCE);
    if (at < 0) { parts.push({ kind: 'text', text: rest }); break; }
    if (at > 0) parts.push({ kind: 'text', text: rest.slice(0, at) });
    const bodyStart = rest.indexOf('\n', at);
    const end = bodyStart < 0 ? -1 : rest.indexOf('```', bodyStart);
    if (end < 0) { parts.push({ kind: 'proposal', proposal: null, index: index++, pending: true }); break; }
    let proposal: Proposal | null = null;
    try {
      const p = JSON.parse(rest.slice(bodyStart + 1, end));
      if (p && typeof p.name === 'string' && typeof p.instructions === 'string') proposal = p;
    } catch {}
    parts.push({ kind: 'proposal', proposal, index: index++ });
    rest = rest.slice(end + 3);
  }
  return parts.filter((p) => p.kind !== 'text' || p.text.trim());
}

export const hasProposal = (text: string) => text.includes(FENCE);

/** Markdown with proposal cards in place of their blocks. */
export function AnswerWithProposals({ text, m, conversationId }: { text: string; m?: Message; conversationId?: string | null }) {
  if (text.includes('```alter-teamrun'))
    return (
      <>
        {splitFence<BoardData>(text, 'alter-teamrun', validBoard).map((piece, i) => (piece.kind === 'card' ? <TeamBoard key={'b' + i} board={piece.card} conversationId={conversationId} /> : <AnswerWithProposals key={i} text={piece.text} m={m} conversationId={conversationId} />))}
      </>
    );
  if (/```alter-team\s/.test(text))
    return (
      <>
        {splitFence<TeamCardData>(text, 'alter-team', validTeam).map((piece, i) => (piece.kind === 'card' ? <TeamCard key={'t' + i} card={piece.card} pending={piece.pending} index={piece.index} messageId={m?.id} conversationId={conversationId} /> : <AnswerWithProposals key={i} text={piece.text} m={m} conversationId={conversationId} />))}
      </>
    );
  if (text.includes('```alter-alert'))
    return (
      <>
        {splitFence<Alert>(text, 'alter-alert', validAlert).map((piece, i) => (piece.kind === 'card' ? <AlertCard key={'a' + i} alert={piece.card} /> : <AnswerWithProposals key={i} text={piece.text} m={m} conversationId={conversationId} />))}
      </>
    );
  if (text.includes('```alter-setup'))
    return (
      <>
        {splitFence<Setup>(text, 'alter-setup', validSetup).map((piece, i) => (piece.kind === 'card' ? <SetupCard key={'s' + i} setup={piece.card} pending={piece.pending} index={piece.index} messageId={m?.id} conversationId={conversationId} /> : <AnswerWithProposals key={i} text={piece.text} m={m} conversationId={conversationId} />))}
      </>
    );
  if (text.includes('```alter-trip'))
    return (
      <>
        {splitTrips(text).map((piece, i) => (piece.kind === 'trip' ? <TripCard key={'t' + i} trip={piece.trip} pending={piece.pending} /> : <AnswerWithProposals key={i} text={piece.text} m={m} conversationId={conversationId} />))}
      </>
    );
  if (text.includes('```alter-plan'))
    return (
      <>
        {splitPlans(text).map((piece, i) => (piece.kind === 'plan' ? <PlanCard key={'p' + i} plan={piece.plan} pending={piece.pending} /> : <AnswerWithProposals key={i} text={piece.text} m={m} conversationId={conversationId} />))}
      </>
    );
  return (
    <>
      {splitProposals(text).map((p, i) =>
        p.kind === 'text' ? (
          <Markdown key={i} text={p.text} />
        ) : (
          <ProposalCard key={i} p={p.proposal} pending={p.pending} index={p.index} messageId={m?.id} conversationId={conversationId} />
        ),
      )}
    </>
  );
}

function ProposalCard({ p, pending, index, messageId, conversationId }: { p: Proposal | null; pending?: boolean; index: number; messageId?: number; conversationId?: string | null }) {
  const t = useT();
  const describe = useDescribeSchedule();
  const [edit, setEdit] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Proposal | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  if (!p)
    return (
      <div className="proposal pending">
        <span className="spinner" />
        <span className="muted">{pending ? t('proposal.preparing') : t('proposal.broken')}</span>
      </div>
    );

  const v = draft ?? p;
  const createdId = created ?? p.createdId ?? null;
  const canCreate = !guest && messageId != null && !!conversationId && !pending;
  const avatar = { palette: v.palette || 'violet', icon: v.icon || 'sparkles' };
  const when = v.monitor ? t('proposal.monitor', { type: t(`auto.type.${v.monitor.type}` as Key), n: v.monitor.everyMinutes ?? 5 }) : describe(v.schedule || 'manual');
  const access = v.monitor?.autoFix ? 'full' : v.access || 'chat';

  const create = async () => {
    setBusy(true);
    try {
      const edits = draft ? { name: draft.name, schedule: draft.schedule, instructions: draft.instructions } : {};
      const res = await api<{ agent: Agent }>(`/api/conversations/${conversationId}/messages/${messageId}/proposals/${index}`, { method: 'POST', body: edits });
      setCreated(res.agent.id);
      setEdit(false);
      invalidate('/api/agents', `/api/conversations/${conversationId}`);
      toast(t('proposal.created', { name: res.agent.name }), 'ok', <Robot avatar={res.agent.avatar} size={26} />);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div className={`proposal${createdId ? ' done' : ''}`} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring} layout>
      <div className="proposal-tag">{createdId ? <><Check size={13} />{t('proposal.tagDone')}</> : <><Sparkles size={13} />{t('proposal.tag')}</>}</div>
      <div className="proposal-head">
        <Robot avatar={avatar} size={44} running={busy} still={!!createdId} mood={createdId ? 'happy' : undefined} />
        <div className="grow" style={{ minWidth: 0 }}>
          {edit ? (
            <input className="input" value={v.name} maxLength={60} onChange={(e) => setDraft({ ...v, name: e.target.value })} />
          ) : (
            <b className="proposal-name">{v.name}</b>
          )}
          {v.description && !edit && <div className="small muted">{v.description}</div>}
        </div>
      </div>
      <div className="proposal-facts">
        <span>{v.monitor ? <Radar size={14} /> : <CalendarClock size={14} />}{when}</span>
        {v.monitor && <span className="mono truncate" title={v.monitor.target}>{v.monitor.target}</span>}
        <span className={access === 'full' ? 'warn' : ''}><Shield size={14} />{t(`access.${access}` as Key)}</span>
      </div>
      <AnimatePresence initial={false}>
        {edit && (
          <motion.div key="edit" className="proposal-edit" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            {!v.monitor && <ScheduleEditor value={v.schedule || 'manual'} onChange={(schedule) => setDraft({ ...v, schedule })} />}
            <textarea className="textarea" rows={5} value={v.instructions} onChange={(e) => setDraft({ ...v, instructions: e.target.value })} />
          </motion.div>
        )}
      </AnimatePresence>
      {!edit && (
        <>
          <button className="proposal-more" onClick={() => setMore(!more)}>
            {t('proposal.what')}
            <motion.span animate={{ rotate: more ? 180 : 0 }} style={{ display: 'grid' }}><ChevronDown size={14} /></motion.span>
          </button>
          <AnimatePresence initial={false}>
            {more && (
              <motion.div className="proposal-instr" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <Markdown text={v.instructions} />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
      <div className="proposal-actions">
        {createdId ? (
          <button className="btn sm" onClick={() => setOpen(createdId)}>{t('proposal.open')}</button>
        ) : canCreate ? (
          <>
            <button className="btn primary sm" onClick={create} disabled={busy || !v.name.trim() || !v.instructions.trim()}>
              {busy ? <span className="spinner" /> : <Check />}{t('proposal.create')}
            </button>
            <button className="btn ghost sm" onClick={() => setEdit(!edit)}><Pencil />{edit ? t('proposal.doneEditing') : t('common.edit')}</button>
            <span className="small faint grow" style={{ textAlign: 'right' }}>{t('proposal.orAsk')}</span>
          </>
        ) : (
          <span className="small faint">{guest ? t('proposal.hostOnly') : t('proposal.preparing')}</span>
        )}
      </div>
      <AgentDrawer agentId={open} onClose={() => setOpen(null)} />
    </motion.div>
  );
}
