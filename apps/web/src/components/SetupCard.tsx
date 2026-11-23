// Cards the AI puts in a chat to *do* things: ```alter-setup (connect folders, sites, APIs,
// automations, phone alerts to a project — one click) and ```alter-alert (something broke:
// fix it / find the cause / check again).
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, BellRing, Bot, Check, CheckCircle2, FolderGit2, FolderKanban, FolderOpen, Globe, Loader2, NotebookPen, RefreshCw, Search, Server, Wrench, X, type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { api, guest, invalidate, type Message } from '../api';
import { useT, type Key } from '../i18n';
import { navigate } from '../router';
import { NotificationsCard } from './Notifications';
import { chatSend } from './PlanCard';
import { spring, toast } from './ui';

type Piece<T> = { kind: 'text'; text: string } | { kind: 'card'; card: T | null; pending?: boolean; index: number };

/** Splits an answer around ```<fence> JSON blocks (an unfinished block while streaming → pending). */
export function splitFence<T>(text: string, fence: string, valid: (x: any) => boolean): Piece<T>[] {
  const out: Piece<T>[] = [];
  const open = '```' + fence;
  let rest = text;
  let index = 0;
  while (rest) {
    const at = rest.indexOf(open);
    if (at < 0) { out.push({ kind: 'text', text: rest }); break; }
    if (at > 0) out.push({ kind: 'text', text: rest.slice(0, at) });
    const bodyStart = rest.indexOf('\n', at);
    const end = bodyStart < 0 ? -1 : rest.indexOf('```', bodyStart);
    if (end < 0) { out.push({ kind: 'card', card: null, pending: true, index }); break; }
    let card: T | null = null;
    try {
      const p = JSON.parse(rest.slice(bodyStart + 1, end));
      if (valid(p)) card = p;
    } catch {}
    out.push({ kind: 'card', card, index: index++ });
    rest = rest.slice(end + 3);
  }
  return out.filter((p) => p.kind !== 'text' || p.text.trim());
}

// ---------- setup ----------
export interface SetupStep { do: string; name?: string; path?: string; url?: string; folder?: string; description?: string; watch?: boolean; everyMinutes?: number; autoFix?: boolean; schedule?: string; text?: string; instructions?: string; notify?: boolean }
export interface Setup { title: string; summary?: string; steps: SetupStep[]; done?: boolean; results?: { ok: boolean; note: string }[] }

const STEP_ICON: Record<string, LucideIcon> = { project: FolderKanban, folder: FolderOpen, site: Globe, api: Server, repo: FolderGit2, automation: Bot, instructions: NotebookPen, notify: BellRing };

function stepLine(s: SetupStep, t: ReturnType<typeof useT>): { title: string; detail?: string } {
  switch (s.do) {
    case 'project': return { title: t('setup.project', { name: s.name ?? '' }), detail: s.folder || s.description };
    case 'folder': return { title: t('setup.folder', { name: s.name || (s.path ?? '').split(/[\\/]/).filter(Boolean).pop() || '' }), detail: s.path };
    case 'site':
    case 'api': return { title: t(s.do === 'api' ? 'setup.api' : 'setup.site', { name: s.name || s.url || '' }), detail: [s.url, s.watch !== false ? t('setup.watch', { n: s.everyMinutes ?? 5 }) : '', s.autoFix ? t('setup.autoFix') : ''].filter(Boolean).join(' · ') };
    case 'repo': return { title: t('setup.repo', { name: s.name || s.url || '' }), detail: s.url };
    case 'automation': return { title: t('setup.automation', { name: s.name ?? '' }), detail: [s.schedule, s.notify ? '🔔' : ''].filter(Boolean).join(' · ') };
    case 'instructions': return { title: t('setup.instructions'), detail: s.text };
    case 'notify': return { title: t('setup.notify') };
    default: return { title: s.do };
  }
}

export function SetupCard({ setup, pending, index, messageId, conversationId }: { setup: Setup | null; pending?: boolean; index: number; messageId?: number; conversationId?: string | null }) {
  const t = useT();
  const [skip, setSkip] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<Setup | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  if (!setup)
    return (
      <div className="proposal pending">
        <span className="spinner" />
        <span className="muted">{pending ? t('setup.preparing') : t('proposal.broken')}</span>
      </div>
    );
  const v = applied ?? setup;
  const done = !!v.done;
  const canApply = !guest && messageId != null && !!conversationId && !pending && !done;
  const wantsNotify = v.steps.some((s) => s.do === 'notify');

  const apply = async () => {
    setBusy(true);
    try {
      const r = await api<{ setup: Setup; projectId: string | null }>(`/api/conversations/${conversationId}/messages/${messageId}/setup/${index}`, { method: 'POST', body: { skip } });
      setApplied(r.setup);
      setProjectId(r.projectId);
      invalidate('/api/projects', '/api/agents', `/api/conversations/${conversationId}`, '/api/conversations');
      const bad = (r.setup.results ?? []).filter((x) => !x.ok && x.note !== 'skipped').length;
      toast(bad ? t('setup.partly', { n: bad }) : t('setup.doneToast'), bad ? 'error' : 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div className={`proposal setup-card${done ? ' done' : ''}`} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring} layout>
      <div className="proposal-tag">{done ? <><Check size={13} />{t('setup.tagDone')}</> : <><Wrench size={13} />{t('setup.tag')}</>}</div>
      <div className="setup-title">
        <b>{v.title}</b>
        {v.summary && <div className="small muted">{v.summary}</div>}
      </div>
      <div className="setup-steps">
        {v.steps.map((s, i) => {
          const Icon = STEP_ICON[s.do] ?? Wrench;
          const line = stepLine(s, t);
          const res = v.results?.[i];
          const off = skip.includes(i);
          return (
            <motion.div key={i} className={`setup-step${off ? ' off' : ''}${res ? (res.ok ? ' ok' : res.note === 'skipped' ? ' off' : ' bad') : ''}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
              <div className={`setup-ic k-${s.do}`}><Icon size={15} /></div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="setup-step-title">{line.title}</div>
                {(res && !res.ok && res.note !== 'skipped' ? res.note : line.detail) && <div className={`small ${res && !res.ok ? 'danger-text' : 'faint'} truncate`}>{res && !res.ok && res.note !== 'skipped' ? res.note : line.detail}</div>}
              </div>
              {res ? (
                res.ok ? <CheckCircle2 size={17} className="ok-text" /> : res.note === 'skipped' ? <span className="faint small">—</span> : <AlertTriangle size={16} className="danger-text" />
              ) : canApply ? (
                <button type="button" className="setup-x" title={off ? t('setup.include') : t('setup.skip')} onClick={() => setSkip((k) => (off ? k.filter((x) => x !== i) : [...k, i]))}>
                  {off ? <Check size={14} /> : <X size={14} />}
                </button>
              ) : null}
            </motion.div>
          );
        })}
      </div>
      <AnimatePresence>{done && wantsNotify && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}><NotificationsCard /></motion.div>}</AnimatePresence>
      <div className="proposal-actions">
        {canApply && (
          <motion.button className="btn primary" onClick={apply} disabled={busy || skip.length === v.steps.length} whileTap={{ scale: 0.96 }}>
            {busy ? <Loader2 className="spin" /> : <Check />}
            {t('setup.apply')}
          </motion.button>
        )}
        {done && projectId && (
          <button className="btn" onClick={() => navigate(`/projects/${projectId}`)}><FolderKanban />{t('setup.openProject')}</button>
        )}
      </div>
    </motion.div>
  );
}

// ---------- alerts ----------
export interface Alert { agentId: string; name: string; kind: 'fail' | 'ok' | 'error'; target?: string; message: string; autoFix?: boolean }

export function AlertCard({ alert }: { alert: Alert | null }) {
  const t = useT();
  const [checking, setChecking] = useState(false);
  if (!alert) return null;
  const bad = alert.kind !== 'ok';
  const check = async () => {
    setChecking(true);
    try {
      const r = await api<{ status: string; message: string }>(`/api/agents/${alert.agentId}/check`, { method: 'POST' });
      toast(`${alert.name}: ${r.message || r.status}`, r.status === 'ok' ? 'ok' : 'error');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setChecking(false);
    }
  };
  return (
    <motion.div className={`alert-card ${alert.kind}`} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring}>
      <div className="alert-head">
        <motion.div className="alert-ic" animate={bad ? { scale: [1, 1.12, 1] } : {}} transition={{ repeat: bad ? Infinity : 0, duration: 1.6 }}>
          {bad ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        </motion.div>
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{t(`alert.${alert.kind}` as Key, { name: alert.name })}</b>
          {alert.target && <div className="small faint mono truncate">{alert.target}</div>}
        </div>
      </div>
      <div className="alert-msg mono small">{alert.message}</div>
      {bad && alert.autoFix && <div className="small muted">{t('alert.fixing')}</div>}
      {!guest && (
        <div className="proposal-actions">
          {bad && (
            <>
              <button className="btn primary sm" onClick={() => chatSend({ text: t('alert.fixMsg', { name: alert.name, msg: alert.message.slice(0, 200) }), access: 'full', plan: false })}><Wrench size={14} />{t('alert.fix')}</button>
              <button className="btn sm" onClick={() => chatSend({ text: t('alert.whyMsg', { name: alert.name }), access: 'read', plan: false })}><Search size={14} />{t('alert.why')}</button>
            </>
          )}
          <button className="btn ghost sm" onClick={check} disabled={checking}>{checking ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}{t('alert.check')}</button>
        </div>
      )}
    </motion.div>
  );
}

export const validSetup = (p: any) => p && Array.isArray(p.steps);
export const validAlert = (p: any) => p && typeof p.agentId === 'string' && typeof p.message === 'string';
export type { Message };
