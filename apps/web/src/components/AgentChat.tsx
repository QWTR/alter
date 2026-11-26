// An agent's own chat: every job it got (from the team lead, from you, from its schedule) and what it answered,
// live while it works — and a box to give it the next job. Opened by clicking an agent on a team board,
// in a workspace's Agents tab or on the Agents page. Workspace members use the /api/ws endpoints.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, ChevronDown, Crown, Loader2, MessageCircle, Pencil, Square, Trash2, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, guest, invalidate, useData, type Agent, type Avatar, type Run } from '../api';
import { formatTime, useT, type Key } from '../i18n';
import { navigate } from '../router';
import { useAgentStatuses, statusLine } from './agentStatus';
import { Markdown } from './Markdown';
import { Drawer, Orb, toast } from './ui';

/** ws: '?project=…' (or '' for a member's own workspace) → workspace endpoints; undefined → the owner's own. */
export interface AgentChatOpen { id: string; ws?: string; name?: string; avatar?: Avatar }

export function AgentChatDrawer({ open, onClose }: { open: AgentChatOpen | null; onClose: () => void }) {
  return <Drawer open={!!open} onClose={onClose}>{open && <AgentChat key={open.id} {...open} onClose={onClose} />}</Drawer>;
}

function Long({ text, limit = 700 }: { text: string; limit?: number }) {
  const t = useT();
  const [all, setAll] = useState(false);
  const long = text.length > limit;
  return (
    <>
      <Markdown text={long && !all ? text.slice(0, limit).replace(/\s+\S*$/, '') + ' …' : text} />
      {long && <button className="ac-more" onClick={() => setAll(!all)}>{all ? t('ac.less') : t('ac.all')}<ChevronDown size={12} style={all ? { transform: 'rotate(180deg)' } : undefined} /></button>}
    </>
  );
}

/** embedded: inside the agent drawer of the Agents page (it has its own header, buttons and editor). */
export function AgentChat({ id, ws, name, avatar, onClose, embedded }: AgentChatOpen & { onClose: () => void; embedded?: boolean }) {
  const t = useT();
  const wsMode = ws !== undefined || !!guest;
  const q = ws ?? '';
  const listUrl = wsMode ? `/api/ws/agents${q}` : '/api/agents';
  const runsUrl = wsMode ? `/api/ws/agents/${id}/runs${q}` : `/api/runs?agentId=${id}`;
  const base = wsMode ? `/api/ws/agents/${id}` : `/api/agents/${id}`;
  const { data: agents } = useData<Agent[]>(listUrl, 4000);
  const { data: runs } = useData<Run[]>(runsUrl, 2000);
  const live = useAgentStatuses();
  const a = agents?.find((x) => x.id === id);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [instr, setInstr] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const list = [...(runs ?? [])].reverse();
  const working = !!a?.running || list.some((r) => r.status === 'running');
  const shown = a?.name ?? name ?? '…';

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [list.length, list[list.length - 1]?.output?.length, working]);

  const refresh = () => invalidate(runsUrl, listUrl);
  const send = async () => {
    const task = text.trim();
    if (!task || busy) return;
    setBusy(true);
    try {
      await api(`${base}/run${wsMode ? q : ''}`, { method: 'POST', body: { task } });
      setText('');
      toast(t('ac.sent', { name: shown }), 'ok');
      setTimeout(refresh, 600);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const stop = async () => {
    try { await api(`${base}/stop${wsMode ? q : ''}`, { method: 'POST' }); toast(t('agents.stopped'), 'info'); refresh(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async () => {
    if (!confirm(t('agents.deleteConfirm'))) return;
    try {
      await api(`${base}${wsMode ? q : ''}`, { method: 'DELETE' });
      invalidate(listUrl, '/api/agents', '/api/projects');
      onClose();
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const saveInstr = async () => {
    try {
      await api(`${base}${wsMode ? q : ''}`, { method: 'PUT', body: { instructions: instr } });
      setEditing(false);
      invalidate(listUrl, '/api/agents');
      toast(t('common.saved'), 'ok');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div className={`ac${embedded ? ' ac-embedded' : ''}`}>
      {!embedded && <div className="ac-head">
        <Orb avatar={a?.avatar ?? avatar ?? { palette: 'violet', icon: 'bot' }} size={48} running={working} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="row" style={{ margin: '2px 0', fontSize: 19, gap: 6 }}>{a?.team?.lead && <Crown size={15} style={{ color: 'var(--warn)' }} />}<span className="truncate">{shown}</span></h2>
          <div className="small muted truncate">{a?.team ? `@${a.team.name} · ` : ''}{a?.description}</div>
        </div>
        {!wsMode && <button className="btn ghost icon" title={t('agents.talk')} onClick={() => { onClose(); navigate(`/agents/${id}`); }}><MessageCircle size={17} /></button>}
        <button className="btn ghost icon danger" title={t('common.delete')} onClick={remove}><Trash2 size={17} /></button>
      </div>}

      {a && !embedded && (
        <details className="ac-instr">
          <summary>{t('ac.instr')}</summary>
          {editing ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <textarea className="textarea" rows={6} value={instr} onChange={(e) => setInstr(e.target.value)} />
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn sm" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
                <button className="btn primary sm" onClick={saveInstr} disabled={!instr.trim()}>{t('common.save')}</button>
              </div>
            </div>
          ) : (
            <div className="ac-instr-body">
              <Long text={a.instructions} limit={500} />
              <button className="btn ghost sm" onClick={() => { setInstr(a.instructions); setEditing(true); }}><Pencil size={13} />{t('common.edit')}</button>
            </div>
          )}
        </details>
      )}

      {!embedded && <div className="small faint ac-label">{t('ac.history')}</div>}
      <div className="ac-log">
        {runs && !list.length && <p className="muted small" style={{ textAlign: 'center', margin: '24px 0' }}>{t('ac.empty')}</p>}
        <AnimatePresence initial={false}>
          {list.map((r) => {
            const steps: string[] = r.detail ? (() => { try { return JSON.parse(r.detail!); } catch { return []; } })() : [];
            const fromLead = r.trigger === 'team';
            return (
              <motion.div key={r.id} className="ac-turn" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                {r.task && (
                  <div className="ac-msg ac-in">
                    <div className="ac-who small faint">{fromLead ? <><Crown size={11} />{t('ac.lead')}</> : <><User size={11} />{r.trigger === 'manual' ? t('ac.you') : t(`activity.trigger.${r.trigger}` as Key)}</>} · {formatTime(r.started_at)}</div>
                    <Long text={r.task} />
                  </div>
                )}
                <div className={`ac-msg ac-out st-${r.status}`}>
                  <div className="ac-who small faint">{shown}{!r.task ? ` · ${formatTime(r.started_at)}` : ''}{r.provider ? ` · ${r.provider}` : ''}</div>
                  {r.status === 'running' ? (
                    <div className="ac-working">
                      <Loader2 className="spin" size={14} />
                      <span className="truncate">{statusLine(live[id]) || steps[steps.length - 1] || t('ac.working')}</span>
                    </div>
                  ) : r.output ? <Long text={r.output} limit={1500} /> : <span className="danger-text small">{r.error ?? t('common.error')}</span>}
                  {r.status !== 'running' && steps.length > 0 && (
                    <details className="ac-steps"><summary className="small faint">{t('activity.steps', { n: steps.length })}</summary>{steps.slice(-30).map((s, k) => <div key={k} className="small faint truncate">{s}</div>)}</details>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={end} />
      </div>

      <div className="ac-compose">
        <textarea
          className="textarea" rows={2} value={text} placeholder={t('ac.ph', { name: shown })} disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!working) send(); } }}
        />
        {working
          ? <button className="btn danger-soft" onClick={stop} title={t('agents.stop')}><Square size={12} fill="currentColor" />{t('agents.stop')}</button>
          : <button className="btn primary icon" onClick={send} disabled={!text.trim() || busy} title={t('common.send' as Key)}>{busy ? <Loader2 className="spin" size={16} /> : <ArrowUp size={17} />}</button>}
      </div>
    </div>
  );
}
