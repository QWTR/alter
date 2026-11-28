// An agent's own chat: every job it got (from the team lead, from you, from its schedule) and what it answered,
// live while it works — and a box to give it the next job. Opened by clicking an agent on a team board,
// in a workspace's Agents tab or on the Agents page. Workspace members use the /api/ws endpoints.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, ChevronDown, Crown, FileText, Loader2, MessageCircle, Paperclip, Pencil, Square, Trash2, User, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, guest, invalidate, uploadFile, useData, type Agent, type Attachment, type Avatar, type Run, type Skill } from '../api';
import { formatTime, useT, type Key } from '../i18n';
import { navigate } from '../router';
import { useAgentStatuses, statusLine } from './agentStatus';
import { Markdown } from './Markdown';
import { MediaResults } from './Media';
import { Drawer, Orb, toast } from './ui';
import { GitHubSkills } from './GitHubSkills';
import { useChatDraft } from '../useChatDraft';

/** ws: '?project=…' (or '' for a member's own workspace) → workspace endpoints; undefined → the owner's own. */
export interface AgentChatOpen { id: string; ws?: string; name?: string; avatar?: Avatar }

export function AgentChatDrawer({ open, onClose }: { open: AgentChatOpen | null; onClose: () => void }) {
  return <Drawer open={!!open} onClose={onClose}>{open && <AgentChat key={open.id} {...open} onClose={onClose} />}</Drawer>;
}

/** Files a person sent with a task. */
function Sent({ list, onBig }: { list: Attachment[]; onBig: (a: Attachment) => void }) {
  return (
    <div className="ac-sent">
      {list.map((a) => a.type.startsWith('image/')
        ? <img key={a.id} src={a.url} alt={a.name} title={a.name} loading="lazy" onClick={() => onBig(a)} />
        : <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><FileText size={14} />{a.name}</a>)}
    </div>
  );
}

/** The pictures are shown under the answer, so lines that are only their path (or a markdown image of it) are dropped. */
function withoutShown(text: string, names: string[]): string {
  const shown = new Set(names.map((n) => n.toLowerCase()));
  const fileOf = (s: string) => decodeURIComponent(s.trim().replace(/^file:\/+/i, '').replace(/[`*]/g, '')).split(/[\\/]/).pop()?.toLowerCase() ?? '';
  return text
    .split('\n')
    .map((line) => line.replace(/!\[[^\]]*\]\(([^)]*\([^)]*\)[^)]*|[^)]*)\)/g, (all, src: string) => { try { return shown.has(fileOf(src)) ? '' : all; } catch { return all; } }))
    .filter((line, i, arr) => {
      const bare = line.trim().replace(/^[-*]\s+/, '').replace(/^`|`$/g, '');
      if (!bare) return !(i > 0 && !arr[i - 1].trim()); // no runs of blank lines where pictures were
      return !(/^(?:[A-Za-z]:[\\/]|\/|file:)/.test(bare) && shown.has(fileOf(bare)));
    })
    .join('\n')
    .trim();
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
  const { data: skills } = useData<Skill[]>(!guest ? '/api/skills' : null);
  const { data: runs } = useData<Run[]>(runsUrl, 2000);
  const live = useAgentStatuses();
  const a = agents?.find((x) => x.id === id);
  const [text, setText] = useChatDraft(`agent-task:${id}`);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [adding, setAdding] = useState(0);
  const [big, setBig] = useState<Attachment | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [instr, setInstr] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const list = [...(runs ?? [])].reverse();
  const working = !!a?.running || list.some((r) => r.status === 'running');
  const shown = a?.name ?? name ?? '…';

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [list.length, list[list.length - 1]?.output?.length, working]);

  const refresh = () => invalidate(runsUrl, listUrl);
  const send = async () => {
    const task = text.trim();
    if ((!task && !files.length) || busy || adding) return;
    setBusy(true);
    try {
      await api(`${base}/run${wsMode ? q : ''}`, { method: 'POST', body: { task, attachments: files.map((f) => f.id) } });
      setText('');
      setFiles([]);
      toast(t('ac.sent', { name: shown }), 'ok');
      setTimeout(refresh, 600);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const add = async (list: File[]) => {
    for (const file of list.slice(0, 20)) {
      setAdding((n) => n + 1);
      try { const a = await uploadFile(file); setFiles((cur) => [...cur, a]); }
      catch (e) { toast(`${t('ac.attachErr')}: ${(e as Error).message}`, 'error'); }
      finally { setAdding((n) => n - 1); }
    }
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
    if (saving) return;
    setSaving(true);
    try {
      await api(`${base}${wsMode ? q : ''}`, { method: 'PUT', body: { instructions: instr, ...(!guest ? { skills: selectedSkills } : {}) } });
      setEditing(false);
      invalidate(listUrl, '/api/agents');
      toast(t('common.saved'), 'ok');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setSaving(false); }
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
              {!guest && <>
                <b className="small">{t('agents.skills')}</b>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {(skills ?? []).map(skill => <button key={skill.id} type="button" className={`badge${selectedSkills.includes(skill.id) ? ' accent' : ''}`} aria-pressed={selectedSkills.includes(skill.id)} title={skill.description + (skill.source ? `\nSHA: ${skill.source.sha}` : '')} onClick={() => setSelectedSkills(ids => ids.includes(skill.id) ? ids.filter(id => id !== skill.id) : [...ids, skill.id])}>{skill.name}</button>)}
                </div>
                <GitHubSkills onInstalled={id => setSelectedSkills(ids => [...new Set([...ids, id])])} />
              </>}
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn sm" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
                <button className="btn primary sm" onClick={saveInstr} disabled={saving || !instr.trim()}>{t('common.save')}</button>
              </div>
            </div>
          ) : (
            <div className="ac-instr-body">
              <Long text={a.instructions} limit={500} />
              {!!a.skills.length && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{a.skills.map(id => <span className="badge" key={id}>{skills?.find(s => s.id === id)?.name ?? id}</span>)}</div>}
              <button className="btn ghost sm" onClick={() => { setInstr(a.instructions); setSelectedSkills(a.skills); setEditing(true); }}><Pencil size={13} />{t('common.edit')}</button>
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
                    <div className="ac-who small faint">{r.author ? <><User size={11} />{r.author}</> : fromLead ? <><Crown size={11} />{t('ac.lead')}</> : <><User size={11} />{r.trigger === 'manual' ? t('ac.you') : t(`activity.trigger.${r.trigger}` as Key)}</>} · {formatTime(r.started_at)}</div>
                    {!!r.attachments?.length && <Sent list={r.attachments} onBig={setBig} />}
                    {r.task !== '(see the attached files)' && <Long text={r.task} />}
                  </div>
                )}
                <div className={`ac-msg ac-out st-${r.status}`}>
                  <div className="ac-who small faint">{shown}{!r.task ? ` · ${formatTime(r.started_at)}` : ''}{r.provider ? ` · ${r.provider}` : ''}</div>
                  {r.status === 'running' ? (
                    <div className="ac-working">
                      <Loader2 className="spin" size={14} />
                      <span className="truncate">{statusLine(live[id]) || steps[steps.length - 1] || t('ac.working')}</span>
                    </div>
                  ) : r.output ? <><Long text={r.media?.length ? withoutShown(r.output, r.media.map((m) => m.name)) : r.output} limit={1500} />{!!r.media?.length && <MediaResults list={r.media} />}</> : <span className="danger-text small">{r.error ?? t('common.error')}</span>}
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
      {big && <div className="lightbox" onClick={() => setBig(null)}><img src={big.url} alt={big.name} /><span className="lightbox-name">{big.name}</span></div>}

      {(files.length > 0 || adding > 0) && (
        <div className="ac-files">
          {files.map((f) => (
            <span key={f.id} className={`ac-file${f.type.startsWith('image/') ? ' img' : ''}`} title={f.name}>
              {f.type.startsWith('image/') ? <img src={f.url} alt={f.name} onClick={() => setBig(f)} /> : <><FileText size={14} /><span className="truncate">{f.name}</span></>}
              <button type="button" onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))} title={t('common.delete')}><X size={11} /></button>
            </span>
          ))}
          {adding > 0 && <span className="ac-file"><Loader2 className="spin" size={14} /></span>}
        </div>
      )}
      <div className="ac-compose" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add([...e.dataTransfer.files]); }}>
        <input ref={pick} type="file" multiple hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <button className="btn ghost icon" type="button" onClick={() => pick.current?.click()} title={t('ac.attach')} disabled={working}><Paperclip size={17} /></button>
        <textarea
          className="textarea" rows={2} value={text} placeholder={t('ac.ph', { name: shown })} disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); add(fs); } }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!working) send(); } }}
        />
        {working
          ? <button className="btn danger-soft" onClick={stop} title={t('agents.stop')}><Square size={12} fill="currentColor" />{t('agents.stop')}</button>
          : <button className="btn primary icon" onClick={send} disabled={(!text.trim() && !files.length) || busy || adding > 0} title={t('common.send' as Key)}>{busy ? <Loader2 className="spin" size={16} /> : <ArrowUp size={17} />}</button>}
      </div>
    </div>
  );
}
