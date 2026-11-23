// Plan mode: the plan the AI wrote (```alter-plan block) as a card — approve it to run, or ask for changes.
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, CircleHelp, Clock, ListChecks, Package, PencilLine, Play } from 'lucide-react';
import { useState } from 'react';
import { guest } from '../api';
import { useT } from '../i18n';
import { spring } from './ui';

export interface Plan {
  title: string;
  goal?: string;
  steps: { title: string; detail?: string }[];
  deliverables?: string[];
  questions?: string[];
  estimate?: string;
  risks?: string[];
}

export const PLAN_FENCE = '```alter-plan';

/** Ask the open chat to send a message (plan approvals, quick replies). */
export function chatSend(detail: { text: string; access?: 'chat' | 'read' | 'full'; plan?: boolean; draft?: boolean }) {
  window.dispatchEvent(new CustomEvent('alter:chat-send', { detail }));
}

type Piece = { kind: 'text'; text: string } | { kind: 'plan'; plan: Plan | null; pending?: boolean };

export function splitPlans(text: string): Piece[] {
  const out: Piece[] = [];
  let rest = text;
  while (rest) {
    const at = rest.indexOf(PLAN_FENCE);
    if (at < 0) { out.push({ kind: 'text', text: rest }); break; }
    if (at > 0) out.push({ kind: 'text', text: rest.slice(0, at) });
    const bodyStart = rest.indexOf('\n', at);
    const end = bodyStart < 0 ? -1 : rest.indexOf('```', bodyStart);
    if (end < 0) { out.push({ kind: 'plan', plan: null, pending: true }); break; }
    let plan: Plan | null = null;
    try {
      const p = JSON.parse(rest.slice(bodyStart + 1, end));
      if (p && typeof p.title === 'string' && Array.isArray(p.steps)) plan = p;
    } catch {}
    out.push({ kind: 'plan', plan });
    rest = rest.slice(end + 3);
  }
  return out.filter((p) => p.kind !== 'text' || p.text.trim());
}

export function PlanCard({ plan, pending }: { plan: Plan | null; pending?: boolean }) {
  const t = useT();
  const [state, setState] = useState<'open' | 'approved' | 'editing'>('open');
  const [open, setOpen] = useState<number | null>(null);
  const canAct = !guest || guest.guestsCanSend;

  if (!plan)
    return (
      <div className="plan-card pending">
        <div className="plan-head">
          <span className="plan-icon"><ListChecks /></span>
          <b>{pending ? t('plan.writing') : t('plan.broken')}</b>
          {pending && <span className="typing-dots" style={{ marginLeft: 'auto' }}><i /><i /><i /></span>}
        </div>
        {pending && <div className="plan-skel">{[0, 1, 2].map((i) => <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />)}</div>}
      </div>
    );

  const approve = () => {
    setState('approved');
    chatSend({ text: t('plan.approveMsg', { title: plan.title }), access: 'full', plan: false });
  };
  const change = () => {
    setState('editing');
    chatSend({ text: t('plan.changeMsg') + ' ', plan: true, draft: true });
  };

  return (
    <motion.div className={`plan-card${state === 'approved' ? ' approved' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="plan-head">
        <span className="plan-icon"><ListChecks /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="plan-kicker">{t('plan.kicker')}</div>
          <b className="plan-title">{plan.title}</b>
        </div>
        {plan.estimate && <span className="plan-est"><Clock size={13} />{plan.estimate}</span>}
      </div>
      {plan.goal && <p className="plan-goal">{plan.goal}</p>}
      <ol className="plan-steps">
        {plan.steps.map((s, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i, ...spring }} className={open === i ? 'open' : ''} onClick={() => s.detail && setOpen(open === i ? null : i)}>
            <span className="plan-n">{state === 'approved' ? <Check size={13} /> : i + 1}</span>
            <div className="grow">
              <span className="plan-step">{s.title}</span>
              <AnimatePresence initial={false}>
                {s.detail && open === i && (
                  <motion.div className="plan-detail" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>{s.detail}</motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.li>
        ))}
      </ol>
      {!!plan.deliverables?.length && (
        <div className="plan-row"><Package size={14} /><div className="plan-tags">{plan.deliverables.map((d) => <span key={d}>{d}</span>)}</div></div>
      )}
      {!!plan.risks?.length && (
        <div className="plan-row warn"><AlertTriangle size={14} /><div>{plan.risks.join(' · ')}</div></div>
      )}
      {!!plan.questions?.length && (
        <div className="plan-questions">
          <div className="plan-row"><CircleHelp size={14} /><b>{t('plan.questions')}</b></div>
          <ul>{plan.questions.map((q) => <li key={q}>{q}</li>)}</ul>
        </div>
      )}
      {canAct && (
        <div className="plan-actions">
          {state === 'approved' ? (
            <span className="plan-done"><Check size={15} />{t('plan.approved')}</span>
          ) : (
            <>
              <motion.button className="btn primary" whileTap={{ scale: 0.96 }} onClick={approve}><Play />{t('plan.approve')}</motion.button>
              <button className="btn" onClick={change}><PencilLine />{t('plan.change')}</button>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
