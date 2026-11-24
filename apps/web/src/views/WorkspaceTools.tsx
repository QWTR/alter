// The company side of a workspace: task board, documents & reports, invoices/quotes/orders, a shared calendar
// (subscribable from Google / Outlook / Apple), automations, and the company page (departments + people).
import { AnimatePresence, motion } from 'motion/react';
import {
  Bot, Building2, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Copy, FileText, Filter, Link2, MessageSquare,
  Plus, Printer, Receipt, Save, Sparkles, Trash2, UserPlus, Users, Wand2, X, Zap,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { api, invalidate, token as authToken, useData, type Agent, type Status } from '../api';
import { Markdown } from '../components/Markdown';
import { MemberDot } from '../components/Presence';
import { Drawer, Empty, Modal, ModalHead, Segmented, Switch, toast } from '../components/ui';
import { ago, useT } from '../i18n';
import { googleLink } from '../components/CalendarAdd';

// ---------- shared types ----------
export interface Actor { id: string; name: string; color: string }
export interface Dept { id: string; name: string; color: string }
export interface WsPersonLite { id: string; name: string; color: string; title?: string; online?: boolean }
export interface Task {
  id: string; title: string; description: string; status: Status4; priority: string; assignee: string | null;
  department_id: string | null; due: string | null; position: number; created_by: string | null; created_at: string; updated_at: string; done_at: string | null; comments?: number;
}
type Status4 = 'todo' | 'doing' | 'review' | 'done';
const COLS: Status4[] = ['todo', 'doing', 'review', 'done'];
const PRIOS = ['low', 'normal', 'high', 'urgent'];
const PRIO_COLOR: Record<string, string> = { low: '#8a8f98', normal: '#5b8cff', high: '#f0a030', urgent: '#ef4f5f' };

export interface WsCtx {
  q: string; // "?project=…" (owner) or "" / "?project=…" (member)
  isOwner: boolean;
  me: { id: string; name: string; color: string };
  owner: { name: string };
  members: WsPersonLite[];
  departments: Dept[];
  agents: Agent[];
  projectId: string;
  projectName: string;
  memberKey?: string;
}
/** Keys here are built from data (status, kind…), so look them up loosely. */
const useTT = () => useT() as unknown as (k: string, p?: Record<string, string | number>) => string;
const qs = (q: string, extra: string) => (q ? `${q}&${extra}` : `?${extra}`);
const today = () => new Date().toISOString().slice(0, 10);

/** Everyone a task can go to: the owner, the team, the workspace's AI agents. */
function useAssignees(c: WsCtx) {
  return useMemo(() => [
    { id: 'owner', name: c.owner.name, color: '#7c5cff', agent: false },
    ...c.members.map((m) => ({ id: `p:${m.id}`, name: m.name, color: m.color, agent: false })),
    ...c.agents.filter((a) => !a.monitor).map((a) => ({ id: `a:${a.id}`, name: a.name, color: '#22b8a0', agent: true })),
  ], [c.owner.name, c.members, c.agents]);
}
function Who({ id, list, size = 22 }: { id: string | null; list: ReturnType<typeof useAssignees>; size?: number }) {
  const a = list.find((x) => x.id === id);
  if (!a) return null;
  return a.agent ? <span className="wt-agent" title={a.name} style={{ width: size, height: size }}><Bot size={size * 0.6} /></span> : <span title={a.name}><MemberDot name={a.name} color={a.color} size={size} /></span>;
}
const dueClass = (t: Task) => (!t.due || t.status === 'done' ? '' : t.due.slice(0, 10) < today() ? ' late' : t.due.slice(0, 10) === today() ? ' soon' : '');
const fmtDay = (d: string) => new Date(d.slice(0, 10) + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// ======================================================= TASKS
export function TasksPane({ c }: { c: WsCtx }) {
  const t = useTT();
  const key = `/api/ws/tasks${c.q}`;
  const { data: tasks } = useData<Task[]>(key, 8000);
  const people = useAssignees(c);
  const [who, setWho] = useState('');
  const [dept, setDept] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [plan, setPlan] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Status4 | null>(null);

  const shown = (tasks ?? []).filter((x) => (!who || (who === 'me' ? x.assignee === (c.isOwner ? 'owner' : `p:${c.me.id}`) : x.assignee === who)) && (!dept || x.department_id === dept));
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adding.trim()) return;
    try {
      await api(key, { method: 'POST', body: { title: adding, assignee: who && who !== 'me' ? who : null, department_id: dept || null } });
      setAdding('');
      invalidate(key);
    } catch (err) { toast((err as Error).message, 'error'); }
  };
  const move = async (id: string, status: Status4) => {
    const cur = tasks?.find((x) => x.id === id);
    if (!cur || cur.status === status) return;
    try { await api(`/api/ws/tasks/${id}${c.q}`, { method: 'PUT', body: { status } }); invalidate(key); } catch (err) { toast((err as Error).message, 'error'); }
  };

  return (
    <div className="wt-pane">
      <div className="wt-bar">
        <div className="wt-filters">
          <Filter size={14} className="faint" />
          <select className="input sm" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">{t('wt.everyone')}</option>
            <option value="me">{t('wt.mine')}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.agent ? '🤖 ' : ''}{p.name}</option>)}
          </select>
          {!!c.departments.length && (
            <select className="input sm" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">{t('wt.allDepts')}</option>
              {c.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
        </div>
        <button className="btn primary sm" onClick={() => setPlan(true)}><Sparkles size={14} />{t('wt.plan')}</button>
      </div>

      <div className="wt-board">
        {COLS.map((col) => {
          const list = shown.filter((x) => x.status === col);
          return (
            <div key={col} className={`wt-col${over === col ? ' over' : ''}`} data-col={col}
              onDragOver={(e) => { e.preventDefault(); setOver(col); }} onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain') || drag; if (id) void move(id, col); setDrag(null); }}>
              <div className="wt-col-head"><span className={`wt-dot s-${col}`} /><b>{t(`wt.s.${col}`)}</b><span className="faint small">{list.length}</span></div>
              {col === 'todo' && (
                <form onSubmit={add} className="wt-quick">
                  <Plus size={14} className="faint" />
                  <input placeholder={t('wt.quickAdd')} value={adding} maxLength={200} onChange={(e) => setAdding(e.target.value)} />
                </form>
              )}
              <div className="wt-cards">
                <AnimatePresence initial={false}>
                  {list.map((x) => (
                    <motion.button layout key={x.id} type="button" className="wt-card" draggable
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                      onDragStart={(e) => { (e as unknown as React.DragEvent).dataTransfer?.setData('text/plain', x.id); setDrag(x.id); }}
                      onClick={() => setOpen(x.id)}>
                      <span className="wt-card-title">{x.priority !== 'normal' && <span className="wt-prio" style={{ background: PRIO_COLOR[x.priority] }} title={t(`wt.p.${x.priority}`)} />}{x.title}</span>
                      <span className="wt-card-meta">
                        {x.department_id && <span className="wt-tag">{c.departments.find((d) => d.id === x.department_id)?.name}</span>}
                        {x.due && <span className={`wt-due${dueClass(x)}`}><CalendarDays size={12} />{fmtDay(x.due)}</span>}
                        {!!x.comments && <span className="faint small row" style={{ gap: 3 }}><MessageSquare size={12} />{x.comments}</span>}
                        <span className="grow" />
                        <Who id={x.assignee} list={people} />
                      </span>
                      {/* phones can't drag: a quick "next step" */}
                      {col !== 'done' && <span className="wt-next" role="button" title={t(`wt.s.${COLS[COLS.indexOf(col) + 1]}`)} onClick={(e) => { e.stopPropagation(); void move(x.id, COLS[COLS.indexOf(col) + 1]); }}><ChevronRight size={14} /></span>}
                    </motion.button>
                  ))}
                </AnimatePresence>
                {!list.length && <div className="wt-empty faint small">{t('wt.dropHere')}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <TaskDrawer c={c} id={open} task={tasks?.find((x) => x.id === open)} people={people} onClose={() => setOpen(null)} />
      <PlanModal c={c} open={plan} onClose={() => setPlan(false)} />
    </div>
  );
}

function TaskDrawer({ c, id, task, people, onClose }: { c: WsCtx; id: string | null; task?: Task; people: ReturnType<typeof useAssignees>; onClose: () => void }) {
  const t = useTT();
  const key = `/api/ws/tasks${c.q}`;
  const { data: comments } = useData<{ id: number; author: Actor; body: string; created_at: string }[]>(id ? `/api/ws/tasks/${id}/comments${c.q}` : null, 5000);
  const [draft, setDraft] = useState<Partial<Task>>({});
  const [note, setNote] = useState('');
  useEffect(() => { setDraft({}); setNote(''); }, [id]);
  if (!task) return <Drawer open={false} onClose={onClose}>{null}</Drawer>;
  const v = { ...task, ...draft };
  const save = async (patch: Partial<Task>) => {
    setDraft((d) => ({ ...d, ...patch }));
    try { await api(`/api/ws/tasks/${task.id}${c.q}`, { method: 'PUT', body: patch }); invalidate(key, `/api/ws/tasks/${task.id}/comments`); } catch (err) { toast((err as Error).message, 'error'); }
  };
  const comment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    await api(`/api/ws/tasks/${task.id}/comments${c.q}`, { method: 'POST', body: { body: note } }).catch((err) => toast(err.message, 'error'));
    setNote('');
    invalidate(`/api/ws/tasks/${task.id}/comments`, key);
  };
  const remove = async () => {
    if (!confirm(t('wt.deleteTask'))) return;
    await api(`/api/ws/tasks/${task.id}${c.q}`, { method: 'DELETE' }).catch(() => {});
    invalidate(key);
    onClose();
  };
  const ev = task.due ? { title: task.title, start: new Date(task.due.slice(0, 10) + 'T00:00'), end: new Date(Date.parse(task.due.slice(0, 10) + 'T00:00') + 86400_000), allDay: true, note: task.description } : null;
  return (
    <Drawer open={!!id} onClose={onClose}>
      <div className="wt-drawer">
        <div className="wt-status-row">
          {COLS.map((s) => (
            <button key={s} type="button" className={`wt-status${v.status === s ? ' on' : ''}`} onClick={() => save({ status: s })}><span className={`wt-dot s-${s}`} />{t(`wt.s.${s}`)}</button>
          ))}
        </div>
        <input className="wt-title-input" value={v.title} maxLength={200} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} onBlur={() => draft.title != null && draft.title !== task.title && save({ title: draft.title })} />
        <div className="wt-fields">
          <label>{t('wt.assignee')}</label>
          <select className="input sm" value={v.assignee ?? ''} onChange={(e) => save({ assignee: e.target.value || null })}>
            <option value="">{t('wt.nobody')}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.agent ? '🤖 ' : ''}{p.name}</option>)}
          </select>
          <label>{t('wt.due')}</label>
          <div className="row" style={{ gap: 6 }}>
            <input className="input sm grow" type="date" value={v.due?.slice(0, 10) ?? ''} onChange={(e) => save({ due: e.target.value || null })} />
            {ev && <a className="btn ghost icon sm" href={googleLink(ev)} target="_blank" rel="noopener noreferrer" title={t('calAdd.google')}><CalendarPlus size={15} /></a>}
          </div>
          <label>{t('wt.priority')}</label>
          <select className="input sm" value={v.priority} onChange={(e) => save({ priority: e.target.value })}>
            {PRIOS.map((p) => <option key={p} value={p}>{t(`wt.p.${p}`)}</option>)}
          </select>
          {!!c.departments.length && <>
            <label>{t('wt.dept')}</label>
            <select className="input sm" value={v.department_id ?? ''} onChange={(e) => save({ department_id: e.target.value || null })}>
              <option value="">—</option>
              {c.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </>}
        </div>
        {v.assignee?.startsWith('a:') && <p className="small muted wt-hint"><Bot size={14} />{t('wt.agentHint')}</p>}
        <textarea className="input" rows={5} placeholder={t('wt.describe')} value={v.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} onBlur={() => draft.description != null && draft.description !== task.description && save({ description: draft.description })} />
        <div className="small faint" style={{ marginTop: 6 }}>{t('wt.activity')}</div>
        <div className="wt-comments">
          {(comments ?? []).map((m) => (
            <div key={m.id} className="wt-comment">
              <MemberDot name={m.author.name} color={m.author.color} size={24} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small"><b>{m.author.name}</b> <span className="faint">· {ago(m.created_at)}</span></div>
                {/^→ (todo|doing|review|done)$/.test(m.body.trim())
                  ? <span className="small muted row" style={{ gap: 6 }}>{t('wt.movedTo')} <span className={`wt-dot s-${m.body.trim().slice(2)}`} /><b>{t(`wt.s.${m.body.trim().slice(2)}`)}</b></span>
                  : <Markdown text={m.body} />}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn ghost sm wt-del" onClick={remove}><Trash2 size={14} />{t('wt.deleteTaskBtn')}</button>
        <form className="row" style={{ gap: 6 }} onSubmit={comment}>
          <input className="input grow" placeholder={t('wt.comment')} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn primary icon" disabled={!note.trim()}><Check size={15} /></button>
        </form>
      </div>
    </Drawer>
  );
}

function PlanModal({ c, open, onClose }: { c: WsCtx; open: boolean; onClose: () => void }) {
  const t = useTT();
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const made = await api<Task[]>(`/api/ws/plan${c.q}`, { method: 'POST', body: { goal } });
      toast(t('wt.planned', { n: made.length }), 'ok');
      invalidate(`/api/ws/tasks${c.q}`);
      setGoal('');
      onClose();
    } catch (err) { toast((err as Error).message, 'error'); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose}>
      <ModalHead icon={<Sparkles />} title={t('wt.plan')} text={t('wt.planLead')} onClose={onClose} />
      <form style={{ display: 'grid', gap: 10 }} onSubmit={go}>
        <textarea className="input" rows={5} autoFocus placeholder={t('wt.planPh')} value={goal} onChange={(e) => setGoal(e.target.value)} />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy || goal.trim().length < 4}>{busy ? <span className="spinner" /> : <Wand2 size={15} />}{busy ? t('wt.planning') : t('wt.planGo')}</button>
        </div>
      </form>
    </Modal>
  );
}

// ======================================================= DOCUMENTS
interface Doc { id: string; title: string; body?: string; excerpt?: string; kind: 'doc' | 'report' | 'notes'; author: Actor; created_at: string; updated_at: string }
export function DocsPane({ c }: { c: WsCtx }) {
  const t = useTT();
  const key = `/api/ws/docs${c.q}`;
  const { data: docs } = useData<Doc[]>(key, 10_000);
  const [sel, setSel] = useState<string | null>(null);
  const [kind, setKind] = useState<'all' | 'doc' | 'report'>('all');
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(7);
  const list = (docs ?? []).filter((d) => kind === 'all' || (kind === 'report' ? d.kind === 'report' : d.kind !== 'report'));
  const create = async () => {
    const d = await api<Doc>(key, { method: 'POST', body: { title: t('wt.untitled'), body: '' } }).catch((e) => (toast(e.message, 'error'), null));
    if (d) { invalidate(key); setSel(d.id); }
  };
  const report = async () => {
    setBusy(true);
    try {
      const d = await api<Doc>(`/api/ws/report${c.q}`, { method: 'POST', body: { days } });
      invalidate(key);
      setSel(d.id);
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };
  return (
    <div className={`wt-pane wt-docs${sel ? ' has-sel' : ''}`}>
      <aside className="wt-doclist">
        <div className="wt-doc-actions">
          <button className="btn primary sm" onClick={create}><Plus size={14} />{t('wt.newDoc')}</button>
          <div className="row wt-report" style={{ gap: 0 }}>
            <button className="btn sm" disabled={busy} onClick={report}>{busy ? <span className="spinner" /> : <Sparkles size={14} />}{busy ? t('wt.writing') : t('wt.report')}</button>
            <select className="input sm" value={days} onChange={(e) => setDays(+e.target.value)} title={t('wt.period')}>
              <option value={1}>{t('wt.d1')}</option><option value={7}>{t('wt.d7')}</option><option value={30}>{t('wt.d30')}</option>
            </select>
          </div>
        </div>
        <Segmented size="sm" value={kind} onChange={setKind} options={[{ value: 'all', label: t('wt.all') }, { value: 'doc', label: t('wt.docs') }, { value: 'report', label: t('wt.reports') }]} />
        {!list.length && <p className="small faint" style={{ textAlign: 'center', margin: '18px 0' }}>{t('wt.noDocs')}</p>}
        {list.map((d) => (
          <button key={d.id} className={`ws-row${d.id === sel ? ' active' : ''}`} onClick={() => setSel(d.id)}>
            {d.kind === 'report' ? <Sparkles size={15} className="faint" /> : <FileText size={15} className="faint" />}
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="truncate" style={{ display: 'block' }}>{d.title}</span>
              <span className="small faint truncate" style={{ display: 'block' }}>{d.author.name} · {ago(d.updated_at)}</span>
            </span>
          </button>
        ))}
      </aside>
      <section className="wt-docview">
        {sel ? <DocEditor key={sel} c={c} id={sel} onClose={() => setSel(null)} /> : <Empty icon={FileText} title={t('wt.docsTitle')} text={t('wt.docsLead')} />}
      </section>
    </div>
  );
}
function DocEditor({ c, id, onClose }: { c: WsCtx; id: string; onClose: () => void }) {
  const t = useTT();
  const { data: doc } = useData<Doc>(`/api/ws/docs/${id}${c.q}`);
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => { if (doc) { setTitle(doc.title); setBody(doc.body ?? ''); if (!doc.body && doc.kind !== 'report') setEdit(true); } }, [doc?.id]);
  if (!doc) return <div style={{ margin: 'auto' }}><span className="spinner" /></div>;
  const save = async () => {
    await api(`/api/ws/docs/${id}${c.q}`, { method: 'PUT', body: { title, body } }).catch((e) => toast(e.message, 'error'));
    invalidate(`/api/ws/docs`);
    setEdit(false);
  };
  const remove = async () => {
    if (!confirm(t('wt.deleteDoc'))) return;
    await api(`/api/ws/docs/${id}${c.q}`, { method: 'DELETE' }).catch(() => {});
    invalidate('/api/ws/docs');
    onClose();
  };
  return (
    <div className="wt-doc">
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost icon sm wt-doc-back" onClick={onClose}><ChevronLeft size={16} /></button>
        {edit ? <input className="wt-title-input grow" value={title} onChange={(e) => setTitle(e.target.value)} /> : <h2 className="grow truncate" style={{ margin: 0 }}>{doc.title}</h2>}
        {edit ? <button className="btn primary sm" onClick={save}><Save size={14} />{t('common.save')}</button> : <button className="btn sm" onClick={() => setEdit(true)}>{t('wt.edit')}</button>}
        <button className="btn ghost icon sm" onClick={() => printHtml(doc.title, `<h1>${escapeHtml(doc.title)}</h1>${document.querySelector('.wt-doc-body')?.innerHTML ?? ''}`)} title={t('wt.print')}><Printer size={15} /></button>
        <button className="btn ghost icon sm" onClick={remove} title={t('common.delete')}><Trash2 size={15} /></button>
      </div>
      <div className="small faint">{doc.kind === 'report' ? `✨ ${t('wt.aiReport')} · ` : ''}{doc.author.name} · {ago(doc.updated_at)}</div>
      {edit ? <textarea className="input wt-doc-edit" value={body} placeholder={t('wt.docPh')} onChange={(e) => setBody(e.target.value)} /> : <div className="wt-doc-body"><Markdown text={doc.body || ''} /></div>}
    </div>
  );
}

// ======================================================= INVOICES · QUOTES · ORDERS
type Kind = 'invoice' | 'quote' | 'order';
interface Party { name: string; taxId?: string; address?: string; email?: string; phone?: string; bank?: string }
interface Line { name: string; qty: number; unit: string; price: number; vat: number }
interface Sale { id: string; kind: Kind; number: string; status: string; client: Party; seller: Party; items: Line[]; currency: string; issue_date: string; due_date: string | null; notes: string; net: number; vat: number; gross: number; created_by: Actor; updated_at: string }
interface SalesData { docs: Sale[]; seller: Party; stats: { invoiced: number; paid: number; unpaid: number; overdue: number; count: number } }
const money = (n: number, cur = 'PLN') => { try { return n.toLocaleString(undefined, { style: 'currency', currency: cur }); } catch { return `${n.toFixed(2)} ${cur}`; } };
const SALE_ST = ['draft', 'sent', 'accepted', 'paid', 'cancelled'];

export function SalesPane({ c }: { c: WsCtx }) {
  const t = useTT();
  const key = `/api/ws/sales${c.q}`;
  const { data } = useData<SalesData>(key, 15_000);
  const [kind, setKind] = useState<Kind>('invoice');
  const [edit, setEdit] = useState<Sale | 'new' | null>(null);
  const [ai, setAi] = useState('');
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState(false);
  const list = (data?.docs ?? []).filter((d) => d.kind === kind);
  const draft = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api<Sale>(`/api/ws/sales/draft${c.q}`, { method: 'POST', body: { text: ai, kind } });
      invalidate(key);
      setAi('');
      setEdit(d);
    } catch (err) { toast((err as Error).message, 'error'); }
    setBusy(false);
  };
  const noSeller = data && !data.seller.name;
  return (
    <div className="wt-pane">
      {data && (
        <div className="wt-stats">
          <div><span>{t('wt.invoiced')}</span><b>{money(data.stats.invoiced)}</b></div>
          <div><span>{t('wt.paid')}</span><b className="ok">{money(data.stats.paid)}</b></div>
          <div><span>{t('wt.unpaid')}</span><b>{money(data.stats.unpaid)}</b></div>
          <div><span>{t('wt.overdue')}</span><b className={data.stats.overdue ? 'bad' : ''}>{money(data.stats.overdue)}</b></div>
        </div>
      )}
      {noSeller && c.isOwner && (
        <button className="wt-banner" onClick={() => setProfile(true)}><Building2 size={16} /><span className="grow">{t('wt.sellerMissing')}</span><ChevronRight size={16} /></button>
      )}
      <div className="wt-bar">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'invoice', label: t('wt.k.invoice'), icon: Receipt }, { value: 'quote', label: t('wt.k.quote'), icon: FileText }, { value: 'order', label: t('wt.k.order'), icon: Zap }]} />
        <span className="grow" />
        {c.isOwner && <button className="btn ghost sm" onClick={() => setProfile(true)}><Building2 size={14} />{t('wt.myCompany')}</button>}
        <button className="btn primary sm" onClick={() => setEdit('new')}><Plus size={14} />{t(`wt.new.${kind}`)}</button>
      </div>
      <form className="wt-ai" onSubmit={draft}>
        <Sparkles size={16} />
        <input placeholder={t(`wt.aiPh.${kind}`)} value={ai} onChange={(e) => setAi(e.target.value)} />
        <button className="btn primary sm" disabled={busy || ai.trim().length < 4}>{busy ? <span className="spinner" /> : <Wand2 size={14} />}{t('wt.aiMake')}</button>
      </form>
      <div className="wt-sales">
        {!list.length && <Empty icon={Receipt} title={t(`wt.none.${kind}`)} text={t('wt.salesLead')} />}
        {list.map((d) => {
          const late = d.status !== 'paid' && d.status !== 'cancelled' && d.kind === 'invoice' && d.due_date && d.due_date < today();
          return (
            <button key={d.id} className="wt-sale" onClick={() => setEdit(d)}>
              <span className="mono small">{d.number}</span>
              <span className="grow truncate"><b>{d.client.name || '—'}</b> <span className="faint small">· {fmtDay(d.issue_date)}</span></span>
              <span className={`wt-st st-${late ? 'late' : d.status}`}>{late ? t('wt.overdue') : t(`wt.st.${d.status}`)}</span>
              <b className="wt-amount">{money(d.gross, d.currency)}</b>
            </button>
          );
        })}
      </div>
      {edit && <SaleEditor c={c} sale={edit === 'new' ? null : edit} kind={kind} seller={data?.seller} onClose={() => setEdit(null)} />}
      {profile && <SellerModal seller={data?.seller} onClose={() => setProfile(false)} />}
    </div>
  );
}

function SaleEditor({ c, sale, kind, seller, onClose }: { c: WsCtx; sale: Sale | null; kind: Kind; seller?: Party; onClose: () => void }) {
  const t = useTT();
  const [v, setV] = useState<Partial<Sale>>(() => sale ?? { kind, client: { name: '' }, items: [{ name: '', qty: 1, unit: t('wt.unit'), price: 0, vat: 23 }], currency: 'PLN', status: 'draft', notes: '', issue_date: today() });
  const [busy, setBusy] = useState(false);
  const items = v.items ?? [];
  const tot = items.reduce((a, l) => { const n = (l.qty || 0) * (l.price || 0); return { net: a.net + n, vat: a.vat + (l.vat > 0 ? (n * l.vat) / 100 : 0) }; }, { net: 0, vat: 0 });
  const setLine = (i: number, p: Partial<Line>) => setV((x) => ({ ...x, items: (x.items ?? []).map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const setClient = (p: Partial<Party>) => setV((x) => ({ ...x, client: { ...(x.client ?? { name: '' }), ...p } }));
  const save = async (extra?: Partial<Sale>) => {
    setBusy(true);
    try {
      const body = { ...v, ...extra };
      const d = sale ? await api<Sale>(`/api/ws/sales/${sale.id}${c.q}`, { method: 'PUT', body }) : await api<Sale>(`/api/ws/sales${c.q}`, { method: 'POST', body });
      invalidate('/api/ws/sales');
      setV(d);
      toast(t('wt.saved'), 'ok');
      return d;
    } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  };
  const convert = async (to: Kind) => {
    const s = sale ?? (await save());
    if (!s) return;
    const d = await api<Sale>(`/api/ws/sales/${s.id}/convert${c.q}`, { method: 'POST', body: { kind: to } }).catch((e) => (toast(e.message, 'error'), null));
    if (d) { invalidate('/api/ws/sales'); toast(`${t(`wt.k.${to}`)} ${d.number}`, 'ok'); onClose(); }
  };
  const remove = async () => {
    if (!sale || !confirm(t('wt.deleteSale'))) return;
    await api(`/api/ws/sales/${sale.id}${c.q}`, { method: 'DELETE' }).catch(() => {});
    invalidate('/api/ws/sales');
    onClose();
  };
  const k = (v.kind ?? kind) as Kind;
  return (
    <Modal open onClose={onClose} wide>
      <ModalHead icon={<Receipt />} title={`${t(`wt.k.${k}`)}${v.number ? ` ${v.number}` : ''}`} text={sale ? `${t('wt.by')} ${sale.created_by.name} · ${ago(sale.updated_at)}` : t('wt.numberAuto')} onClose={onClose} />
      <div className="wt-sale-form">
        <div className="wt-grid2">
          <fieldset>
            <legend>{t('wt.client')}</legend>
            <input className="input" placeholder={t('wt.clientName')} value={v.client?.name ?? ''} onChange={(e) => setClient({ name: e.target.value })} />
            <input className="input" placeholder={t('wt.taxId')} value={v.client?.taxId ?? ''} onChange={(e) => setClient({ taxId: e.target.value })} />
            <textarea className="input" rows={2} placeholder={t('wt.address')} value={v.client?.address ?? ''} onChange={(e) => setClient({ address: e.target.value })} />
            <input className="input" placeholder="E-mail" value={v.client?.email ?? ''} onChange={(e) => setClient({ email: e.target.value })} />
          </fieldset>
          <fieldset>
            <legend>{t('wt.details')}</legend>
            <label className="small faint">{t('wt.issued')}</label>
            <input className="input" type="date" value={v.issue_date ?? ''} onChange={(e) => setV((x) => ({ ...x, issue_date: e.target.value }))} />
            <label className="small faint">{k === 'quote' ? t('wt.validUntil') : t('wt.payBy')}</label>
            <input className="input" type="date" value={v.due_date ?? ''} onChange={(e) => setV((x) => ({ ...x, due_date: e.target.value || null }))} />
            <div className="row" style={{ gap: 6 }}>
              <select className="input grow" value={v.status} onChange={(e) => setV((x) => ({ ...x, status: e.target.value }))}>
                {SALE_ST.map((s) => <option key={s} value={s}>{t(`wt.st.${s}`)}</option>)}
              </select>
              <select className="input" value={v.currency} onChange={(e) => setV((x) => ({ ...x, currency: e.target.value }))}>
                {['PLN', 'EUR', 'USD', 'GBP', 'CHF', 'CZK', 'UAH'].map((cur) => <option key={cur}>{cur}</option>)}
              </select>
            </div>
          </fieldset>
        </div>
        <div className="wt-lines">
          <div className="wt-line head small faint"><span>{t('wt.item')}</span><span>{t('wt.qty')}</span><span>{t('wt.unitL')}</span><span>{t('wt.netPrice')}</span><span>VAT</span><span>{t('wt.gross')}</span><span /></div>
          {items.map((l, i) => (
            <div key={i} className="wt-line">
              <input className="input" placeholder={t('wt.itemPh')} value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} />
              <input className="input" type="number" min={0} step="any" value={l.qty} onChange={(e) => setLine(i, { qty: +e.target.value })} />
              <input className="input" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
              <input className="input" type="number" min={0} step="0.01" value={l.price} onChange={(e) => setLine(i, { price: +e.target.value })} />
              <select className="input" value={l.vat} onChange={(e) => setLine(i, { vat: +e.target.value })}>
                {[23, 8, 5, 0].map((r) => <option key={r} value={r}>{r}%</option>)}<option value={-1}>zw</option>
              </select>
              <span className="wt-line-sum">{money((l.qty || 0) * (l.price || 0) * (1 + Math.max(0, l.vat) / 100), v.currency)}</span>
              <button type="button" className="btn ghost icon sm" onClick={() => setV((x) => ({ ...x, items: (x.items ?? []).filter((_, j) => j !== i) }))}><X size={14} /></button>
            </div>
          ))}
          <button type="button" className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setV((x) => ({ ...x, items: [...(x.items ?? []), { name: '', qty: 1, unit: t('wt.unit'), price: 0, vat: 23 }] }))}><Plus size={14} />{t('wt.addLine')}</button>
        </div>
        <textarea className="input" rows={2} placeholder={t('wt.notes')} value={v.notes ?? ''} onChange={(e) => setV((x) => ({ ...x, notes: e.target.value }))} />
        <div className="wt-totals">
          <span>{t('wt.net')} <b>{money(tot.net, v.currency)}</b></span>
          <span>VAT <b>{money(tot.vat, v.currency)}</b></span>
          <span className="big">{t('wt.toPay')} <b>{money(tot.net + tot.vat, v.currency)}</b></span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {sale && <button type="button" className="btn ghost sm" onClick={remove}><Trash2 size={14} />{t('common.delete')}</button>}
          <span className="grow" />
          {k === 'quote' && <button type="button" className="btn sm" onClick={() => convert('order')}><Zap size={14} />{t('wt.toOrder')}</button>}
          {k !== 'invoice' && <button type="button" className="btn sm" onClick={() => convert('invoice')}><Receipt size={14} />{t('wt.toInvoice')}</button>}
          {k === 'invoice' && sale && v.status !== 'paid' && <button type="button" className="btn sm" onClick={() => save({ status: 'paid' })}><Check size={14} />{t('wt.markPaid')}</button>}
          <button type="button" className="btn sm" onClick={async () => { const d = sale ? await save() : await save(); if (d) printHtml(`${t(`wt.k.${d.kind}`)} ${d.number}`, saleHtml(d, seller, t)); }}><Printer size={14} />{t('wt.pdf')}</button>
          <button type="button" className="btn primary sm" disabled={busy} onClick={() => save()}>{busy ? <span className="spinner" /> : <Save size={14} />}{t('common.save')}</button>
        </div>
      </div>
    </Modal>
  );
}

function SellerModal({ seller, onClose }: { seller?: Party; onClose: () => void }) {
  const t = useTT();
  const [v, setV] = useState<Party>(seller ?? { name: '' });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await api('/api/company/profile', { method: 'PUT', body: v }).catch((err) => toast(err.message, 'error'));
    invalidate('/api/ws/sales');
    onClose();
  };
  const f = (k: keyof Party, ph: string, area = false) => area
    ? <textarea className="input" rows={2} placeholder={ph} value={v[k] ?? ''} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />
    : <input className="input" placeholder={ph} value={v[k] ?? ''} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />;
  return (
    <Modal open onClose={onClose}>
      <ModalHead icon={<Building2 />} title={t('wt.myCompany')} text={t('wt.myCompanyLead')} onClose={onClose} />
      <form style={{ display: 'grid', gap: 8 }} onSubmit={save}>
        {f('name', t('wt.companyName'))}{f('taxId', t('wt.taxId'))}{f('address', t('wt.address'), true)}{f('bank', t('wt.bank'))}{f('email', 'E-mail')}{f('phone', t('wt.phone'))}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button><button className="btn primary"><Save size={14} />{t('common.save')}</button></div>
      </form>
    </Modal>
  );
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
function saleHtml(d: Sale, seller: Party | undefined, t: (k: string, p?: Record<string, string | number>) => string) {
  const s = d.status === 'draft' ? seller ?? d.seller : d.seller;
  const party = (p: Party) => `<b>${escapeHtml(p.name || '—')}</b><br>${p.taxId ? `NIP: ${escapeHtml(p.taxId)}<br>` : ''}${escapeHtml(p.address ?? '').replace(/\n/g, '<br>')}${p.email ? `<br>${escapeHtml(p.email)}` : ''}${p.phone ? `<br>${escapeHtml(p.phone)}` : ''}`;
  const byRate = new Map<number, { net: number; vat: number }>();
  for (const l of d.items) { const n = l.qty * l.price; const r = byRate.get(l.vat) ?? { net: 0, vat: 0 }; r.net += n; r.vat += l.vat > 0 ? (n * l.vat) / 100 : 0; byRate.set(l.vat, r); }
  const m = (n: number) => money(n, d.currency);
  return `<style>body{font:13px/1.45 system-ui,Segoe UI,Arial;color:#111;margin:32px}h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border-bottom:1px solid #ddd;padding:7px 6px;text-align:left}th{background:#f4f4f6;font-weight:600}td.n,th.n{text-align:right}.two{display:flex;gap:40px;margin-top:22px}.two>div{flex:1}.muted{color:#666}.sum{margin-left:auto;width:320px}.sum td{border:0;padding:3px 6px}.big td{font-size:16px;font-weight:700;border-top:2px solid #111}</style>
<div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>${escapeHtml(t(`wt.k.${d.kind}`))} ${escapeHtml(d.number)}</h1><div class="muted">${t('wt.issued')}: ${d.issue_date}${d.due_date ? ` · ${d.kind === 'quote' ? t('wt.validUntil') : t('wt.payBy')}: ${d.due_date}` : ''}</div></div></div>
<div class="two"><div><div class="muted">${t('wt.seller')}</div>${party(s)}</div><div><div class="muted">${t('wt.client')}</div>${party(d.client)}</div></div>
<table><tr><th>#</th><th>${t('wt.item')}</th><th class="n">${t('wt.qty')}</th><th>${t('wt.unitL')}</th><th class="n">${t('wt.netPrice')}</th><th class="n">VAT</th><th class="n">${t('wt.net')}</th><th class="n">${t('wt.gross')}</th></tr>
${d.items.map((l, i) => { const n = l.qty * l.price; return `<tr><td>${i + 1}</td><td>${escapeHtml(l.name)}</td><td class="n">${l.qty}</td><td>${escapeHtml(l.unit)}</td><td class="n">${m(l.price)}</td><td class="n">${l.vat < 0 ? 'zw' : `${l.vat}%`}</td><td class="n">${m(n)}</td><td class="n">${m(n * (1 + Math.max(0, l.vat) / 100))}</td></tr>`; }).join('')}</table>
<table class="sum">${[...byRate].map(([r, x]) => `<tr><td class="muted">VAT ${r < 0 ? 'zw' : `${r}%`}</td><td class="n">${m(x.net)} + ${m(x.vat)}</td></tr>`).join('')}
<tr><td>${t('wt.net')}</td><td class="n">${m(d.net)}</td></tr><tr><td>VAT</td><td class="n">${m(d.vat)}</td></tr><tr class="big"><td>${t('wt.toPay')}</td><td class="n">${m(d.gross)}</td></tr></table>
${s.bank ? `<p>${t('wt.bank')}: <b>${escapeHtml(s.bank)}</b></p>` : ''}${d.notes ? `<p class="muted">${escapeHtml(d.notes).replace(/\n/g, '<br>')}</p>` : ''}`;
}
/** Print (→ "Save as PDF") through a hidden frame: works in the desktop app and in browsers. */
function printHtml(title: string, html: string) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${html}</body></html>`);
  d.close();
  setTimeout(() => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60_000); }, 250);
}

// ======================================================= CALENDAR
interface CalEv { title: string; start: string; end?: string; allDay?: boolean; calendar?: string }
export function CalendarPane({ c }: { c: WsCtx }) {
  const t = useTT();
  const { data } = useData<{ tasks: Task[]; events: CalEv[] }>(`/api/ws/calendar${c.q}`, 20_000);
  const { data: st } = useData<Status & { publicUrl?: string | null }>(c.memberKey ? null : '/api/status');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [copied, setCopied] = useState(false);
  const people = useAssignees(c);
  const ownerKey = authToken && !authToken.includes(':') ? authToken : '';
  const base = (st?.publicUrl || '').replace(/\/+$/, '') || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '' : location.origin);
  const key = c.memberKey ? `ws:${c.memberKey}` : ownerKey;
  const feed = base && key ? `${base}/api/ws/feed.ics?key=${encodeURIComponent(key)}&project=${c.projectId}` : '';
  const gsub = feed ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed.replace(/^https?:/, 'webcal:'))}` : '';

  const first = new Date(month);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const byDay = new Map<string, { label: string; kind: 'task' | 'event'; done?: boolean; color?: string; who?: string | null }[]>();
  for (const x of data?.tasks ?? []) { const k = x.due!.slice(0, 10); byDay.set(k, [...(byDay.get(k) ?? []), { label: x.title, kind: 'task', done: x.status === 'done', who: x.assignee }]); }
  for (const e of data?.events ?? []) { const k = iso(new Date(e.start)); byDay.set(k, [...(byDay.get(k) ?? []), { label: `${e.allDay ? '' : new Date(e.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ' '}${e.title}`, kind: 'event' }]); }
  const wd = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));
  const now = iso(new Date());
  return (
    <div className="wt-pane">
      <div className="wt-bar">
        <button className="btn ghost icon sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <b style={{ minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
        <button className="btn ghost icon sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
        <button className="btn ghost sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>{t('wt.today')}</button>
        <span className="grow" />
        <span className="small faint row" style={{ gap: 10 }}><span className="row" style={{ gap: 4 }}><span className="wt-dot s-doing" />{t('wt.deadlines')}</span>{c.isOwner && <span className="row" style={{ gap: 4 }}><span className="wt-dot ev" />{t('wt.myCalendar')}</span>}</span>
      </div>
      <div className="wt-month">
        {wd.map((w) => <div key={w} className="wt-wd small faint">{w}</div>)}
        {days.map((d) => {
          const k = iso(d);
          const items = byDay.get(k) ?? [];
          return (
            <div key={k} className={`wt-day${d.getMonth() !== month.getMonth() ? ' out' : ''}${k === now ? ' now' : ''}`}>
              <span className="wt-day-n">{d.getDate()}</span>
              {items.slice(0, 4).map((x, i) => (
                <span key={i} className={`wt-chip ${x.kind}${x.done ? ' done' : ''}${x.kind === 'task' && k < now && !x.done ? ' late' : ''}`} title={`${x.label}${x.who ? ` → ${people.find((p) => p.id === x.who)?.name ?? ''}` : ''}`}>{x.label}</span>
              ))}
              {items.length > 4 && <span className="small faint">+{items.length - 4}</span>}
            </div>
          );
        })}
      </div>
      <div className="card wt-sub">
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <CalendarPlus size={20} style={{ flex: 'none', marginTop: 2 }} />
          <div className="grow" style={{ minWidth: 0, display: 'grid', gap: 8 }}>
            <b>{t('wt.subTitle')}</b>
            <span className="small muted">{feed ? t('wt.subLead') : t('wt.subNeedsLink')}</span>
            {feed && (
              <>
                <div className="share-link"><Link2 size={14} /><span className="truncate mono small grow">{feed}</span>
                  <button className="btn ghost icon sm" onClick={() => navigator.clipboard?.writeText(feed).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })}>{copied ? <Check /> : <Copy />}</button>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <a className="btn primary sm" href={gsub} target="_blank" rel="noopener noreferrer"><CalendarPlus size={14} />{t('wt.subGoogle')}</a>
                  <a className="btn sm" href={feed.replace(/^https?:/, 'webcal:')}><CalendarDays size={14} />{t('wt.subApple')}</a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ======================================================= AUTOMATIONS (owner)
interface Rules { weeklyReport: boolean; dailyDigest: boolean; notifyDone: boolean }
export function AutoPane({ c, rules }: { c: WsCtx; rules?: Rules }) {
  const t = useTT();
  const [r, setR] = useState<Rules>(rules ?? { weeklyReport: false, dailyDigest: false, notifyDone: false });
  useEffect(() => { if (rules) setR(rules); }, [rules?.weeklyReport, rules?.dailyDigest, rules?.notifyDone]);
  const set = async (k: keyof Rules, v: boolean) => {
    setR((x) => ({ ...x, [k]: v }));
    await api(`/api/ws/rules${c.q}`, { method: 'PUT', body: { [k]: v } }).catch((e) => toast(e.message, 'error'));
    invalidate('/api/ws/me');
  };
  const rows: { k: keyof Rules; icon: typeof Zap }[] = [{ k: 'weeklyReport', icon: Sparkles }, { k: 'dailyDigest', icon: FileText }, { k: 'notifyDone', icon: Check }];
  return (
    <div className="wt-pane" style={{ maxWidth: 760 }}>
      <p className="muted" style={{ margin: '0 0 6px' }}>{t('wt.autoLead')}</p>
      {rows.map(({ k, icon: I }) => (
        <div key={k} className="card wt-rule">
          <span className="wt-rule-ico"><I size={18} /></span>
          <div className="grow" style={{ minWidth: 0 }}><b>{t(`wt.r.${k}`)}</b><div className="small muted">{t(`wt.r.${k}.d`)}</div></div>
          <Switch on={r[k]} onChange={(v) => set(k, v)} />
        </div>
      ))}
      <div className="card wt-rule">
        <span className="wt-rule-ico"><Bot size={18} /></span>
        <div className="grow"><b>{t('wt.r.agents')}</b><div className="small muted">{t('wt.r.agents.d')}</div></div>
        <Check size={18} className="ok" />
      </div>
      <div className="card wt-rule">
        <span className="wt-rule-ico"><Zap size={18} /></span>
        <div className="grow"><b>{t('wt.r.more')}</b><div className="small muted">{t('wt.r.more.d')}</div></div>
        <a className="btn sm" href="#/settings?tab=plugins">{t('wt.r.moreGo')}</a>
      </div>
    </div>
  );
}

// ======================================================= COMPANY (owner): departments + people
interface CompanyPerson { id: string; name: string; color: string; title: string; role: 'admin' | 'member'; departmentIds: string[]; projectIds: string[]; joined: boolean; online: boolean; lastSeen: string | null; token: string }
interface Company { name: string; departments: Dept[]; people: CompanyPerson[]; workspaces: { id: string; name: string; color: string; icon: string; open: number; done: number; late: number; people: number }[] }
export function CompanyView() {
  const t = useTT();
  const { data } = useData<Company>('/api/company', 10_000);
  const { data: st } = useData<Status & { publicUrl?: string | null }>('/api/status');
  const [dept, setDept] = useState('');
  const [person, setPerson] = useState<CompanyPerson | 'new' | null>(null);
  const [filter, setFilter] = useState('');
  const base = useMemo(() => (st?.publicUrl || '').replace(/\/+$/, '') || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '' : location.origin) || st?.lanUrls?.[0] || location.origin, [st]);
  if (!data) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;
  const addDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dept.trim()) return;
    await api('/api/company/departments', { method: 'POST', body: { name: dept } }).catch((err) => toast(err.message, 'error'));
    setDept('');
    invalidate('/api/company', '/api/ws/me');
  };
  const delDept = async (id: string) => {
    if (!confirm(t('wt.deleteDept'))) return;
    await api(`/api/company/departments/${id}`, { method: 'DELETE' }).catch(() => {});
    invalidate('/api/company', '/api/ws/me');
  };
  const shown = data.people.filter((p) => !filter || p.departmentIds.includes(filter));
  return (
    <div className="wt-company">
      <div className="card wt-depts">
        <div className="row" style={{ justifyContent: 'space-between' }}><b>{t('wt.depts')}</b><span className="small faint">{data.departments.length}</span></div>
        <div className="wt-dept-list">
          <button className={`wt-dept${!filter ? ' on' : ''}`} onClick={() => setFilter('')}><Users size={14} />{t('wt.allPeople')}<span className="faint small">{data.people.length}</span></button>
          {data.departments.map((d) => (
            <div key={d.id} className={`wt-dept${filter === d.id ? ' on' : ''}`} onClick={() => setFilter(d.id)} role="button">
              <span className="wt-dot" style={{ background: d.color }} />
              <span className="grow truncate">{d.name}</span>
              <span className="faint small">{data.people.filter((p) => p.departmentIds.includes(d.id)).length}</span>
              <button className="btn ghost icon sm" onClick={(e) => { e.stopPropagation(); void delDept(d.id); }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <form className="row" style={{ gap: 6 }} onSubmit={addDept}>
          <input className="input sm grow" placeholder={t('wt.deptPh')} value={dept} maxLength={40} onChange={(e) => setDept(e.target.value)} />
          <button className="btn sm" disabled={!dept.trim()}><Plus size={14} /></button>
        </form>
      </div>
      <div className="wt-people">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <b>{t('wt.people')}</b>
          <button className="btn primary sm" onClick={() => setPerson('new')}><UserPlus size={14} />{t('wt.addPerson')}</button>
        </div>
        {!shown.length && <Empty icon={Users} title={t('wt.noPeople')} text={t('wt.noPeopleLead')} />}
        {shown.map((p) => (
          <button key={p.id} className="card wt-person" onClick={() => setPerson(p)}>
            <span className={`ws-person${p.online ? ' on' : ''}`}><MemberDot name={p.name} color={p.color} size={34} /></span>
            <span className="grow" style={{ minWidth: 0 }}>
              <b className="truncate" style={{ display: 'block' }}>{p.name}{p.role === 'admin' ? <span className="wt-tag" style={{ marginLeft: 6 }}>admin</span> : null}</b>
              <span className="small faint truncate" style={{ display: 'block' }}>{[p.title, ...p.departmentIds.map((id) => data.departments.find((d) => d.id === id)?.name)].filter(Boolean).join(' · ') || '—'}</span>
            </span>
            <span className="small faint hide-narrow">{p.projectIds.length} WS · {p.online ? t('ws.isOnline') : p.joined ? (p.lastSeen ? ago(p.lastSeen) : t('ws.offline')) : t('ws.invited')}</span>
          </button>
        ))}
      </div>
      {person && <PersonModal person={person === 'new' ? null : person} company={data} base={base} onClose={() => setPerson(null)} />}
    </div>
  );
}

function PersonModal({ person, company, base, onClose }: { person: CompanyPerson | null; company: Company; base: string; onClose: () => void }) {
  const t = useTT();
  const [v, setV] = useState({ name: person?.name ?? '', title: person?.title ?? '', role: person?.role ?? 'member', departmentIds: person?.departmentIds ?? [], projectIds: person?.projectIds ?? company.workspaces.slice(0, 1).map((w) => w.id) });
  const [saved, setSaved] = useState<CompanyPerson | null>(person);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const link = saved ? `${base}/#/w/${saved.token}/${encodeURIComponent(saved.name)}` : '';
  useEffect(() => { if (link) QRCode.toDataURL(link, { margin: 1, width: 160 }).then(setQr, () => setQr('')); }, [link]);
  const toggle = (k: 'departmentIds' | 'projectIds', id: string) => setV((x) => ({ ...x, [k]: x[k].includes(id) ? x[k].filter((y) => y !== id) : [...x[k], id] }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const p = saved ? await api<CompanyPerson>(`/api/company/people/${saved.id}`, { method: 'PUT', body: v }) : await api<CompanyPerson>('/api/company/people', { method: 'POST', body: v });
      setSaved(p);
      invalidate('/api/company', '/api/ws/me', '/api/projects');
      if (person) onClose();
    } catch (err) { toast((err as Error).message, 'error'); }
  };
  const remove = async () => {
    if (!saved || !confirm(t('wt.deletePerson', { name: saved.name }))) return;
    await api(`/api/company/people/${saved.id}`, { method: 'DELETE' }).catch(() => {});
    invalidate('/api/company', '/api/ws/me');
    onClose();
  };
  return (
    <Modal open onClose={onClose}>
      <ModalHead icon={<UserPlus />} title={person ? person.name : t('wt.addPerson')} text={t('wt.personLead')} onClose={onClose} />
      <form style={{ display: 'grid', gap: 10 }} onSubmit={save}>
        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" autoFocus placeholder={t('ws.inviteName')} value={v.name} maxLength={40} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} />
          <input className="input grow" placeholder={t('wt.jobTitle')} value={v.title} maxLength={60} onChange={(e) => setV((x) => ({ ...x, title: e.target.value }))} />
        </div>
        <Segmented size="sm" value={v.role} onChange={(r) => setV((x) => ({ ...x, role: r }))} options={[{ value: 'member', label: t('wt.roleMember') }, { value: 'admin', label: t('wt.roleAdmin') }]} />
        {!!company.departments.length && <>
          <span className="small faint">{t('wt.depts')}</span>
          <div className="wt-checks">{company.departments.map((d) => <button type="button" key={d.id} className={`wt-check${v.departmentIds.includes(d.id) ? ' on' : ''}`} onClick={() => toggle('departmentIds', d.id)}><span className="wt-dot" style={{ background: d.color }} />{d.name}</button>)}</div>
        </>}
        <span className="small faint">{t('wt.access')}</span>
        <div className="wt-checks">{company.workspaces.map((w) => <button type="button" key={w.id} className={`wt-check${v.projectIds.includes(w.id) ? ' on' : ''}`} onClick={() => toggle('projectIds', w.id)}>{v.projectIds.includes(w.id) ? <Check size={13} /> : <Plus size={13} />}{w.name}</button>)}</div>
        <div className="row" style={{ gap: 8 }}>
          {saved && <button type="button" className="btn ghost" onClick={remove}><Trash2 size={14} />{t('common.delete')}</button>}
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.close')}</button>
          <button className="btn primary" disabled={!v.name.trim()}><Save size={14} />{saved ? t('common.save') : t('wt.addPerson')}</button>
        </div>
      </form>
      {saved && link && (
        <div className="ws-invite">
          <div className="grow" style={{ minWidth: 0, display: 'grid', gap: 8 }}>
            <b>{t('ws.linkFor', { name: saved.name })}</b>
            <div className="share-link"><Link2 size={14} /><span className="truncate mono small grow">{link}</span>
              <button type="button" className="btn ghost icon sm" onClick={() => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })}>{copied ? <Check /> : <Copy />}</button>
            </div>
            <span className="small faint">{t('wt.oneKey')}</span>
          </div>
          {qr && <img src={qr} alt="QR" className="ws-qr" />}
        </div>
      )}
    </Modal>
  );
}
