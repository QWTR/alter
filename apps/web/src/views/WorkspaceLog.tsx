// The workspace log: who sent which prompt to the AI, who moved a task, edited a document, drew on the board —
// everything in this workspace, with the time, newest first.
import { Bot, FileText, KanbanSquare, MessageSquare, PenTool, Receipt, UserCheck, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, connectEvents, invalidate, useData } from '../api';
import { MemberDot } from '../components/Presence';
import { useT } from '../i18n';
import type { WsCtx } from './WorkspaceTools';

interface Entry { id: number; at: string; actor: { id: string; name: string; color: string }; action: string; detail: string; ref: string | null }
const GROUPS = ['all', 'chat', 'task', 'doc', 'sale', 'board', 'member'] as const;
const ICON: Record<string, typeof Bot> = { chat: MessageSquare, agent: Bot, task: KanbanSquare, doc: FileText, sale: Receipt, board: PenTool, member: UserCheck, rules: Zap };

/** "add:rect, write:Plan, clear" → "dodał(a) prostokąt, napisał(a) „Plan”, wyczyścił(a) tablicę" */
function boardWords(detail: string, t: ReturnType<typeof useT>): string {
  return detail.split(', ').map((p) => {
    const [k, ...rest] = p.split(':');
    const v = rest.join(':');
    const what = () => t(`wb.n.${v}` as any);
    if (k === 'add') return t('wbl.add', { x: what() });
    if (k === 'chg') return t('wbl.chg', { x: what() });
    if (k === 'del') return t('wbl.del', { x: what() });
    if (k === 'write') return t('wbl.write', { x: v });
    if (k === 'clear') return t('wbl.clear');
    return p;
  }).join(', ');
}

export function LogPane({ c }: { c: WsCtx }) {
  const t = useT();
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('all');
  const [who, setWho] = useState('');
  const params = new URLSearchParams(c.q.slice(1));
  if (group !== 'all') params.set('action', group);
  if (who) params.set('who', who);
  const key = `/api/ws/log?${params}`;
  const { data } = useData<Entry[]>(key, 6000);
  const [older, setOlder] = useState<Entry[]>([]);
  const [end, setEnd] = useState(false);
  useEffect(() => { setOlder([]); setEnd(false); }, [key]);
  // the owner hears about new lines at once; members refresh every few seconds
  useEffect(() => (c.isOwner ? connectEvents((type) => { if (type === 'wslog.added') invalidate(key); }) : undefined), [key, c.isOwner]);
  const all = useMemo(() => [...(data ?? []), ...older.filter((o) => !(data ?? []).some((d) => d.id === o.id))], [data, older]);
  const more = async () => {
    const last = all[all.length - 1];
    if (!last) return;
    const p = new URLSearchParams(params);
    p.set('before', String(last.id));
    const l = await api<Entry[]>(`/api/ws/log?${p}`).catch(() => []);
    setOlder((o) => [...o, ...l]);
    if (l.length < 200) setEnd(true);
  };
  const people = [{ id: 'owner', name: c.owner.name }, ...c.members.map((m) => ({ id: `p:${m.id}`, name: m.name }))];
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  let lastDay = '';

  return (
    <div className="wt-pane wl">
      <div className="wt-bar">
        <div className="wl-groups">
          {GROUPS.map((g) => <button key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{t(`wl.g.${g}`)}</button>)}
        </div>
        <span className="grow" />
        <select className="input sm" value={who} onChange={(e) => setWho(e.target.value)} aria-label={t('wl.who')}>
          <option value="">{t('wl.everyone')}</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {data && !all.length && <p className="small faint" style={{ textAlign: 'center', margin: '40px 0' }}>{t('wl.empty')}</p>}
      {!data && <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><span className="spinner" /></div>}
      <ol className="wl-list">
        {all.map((e) => {
          const d = day(e.at);
          const head = d !== lastDay ? ((lastDay = d), <li key={'d' + e.id} className="wl-day">{d}</li>) : null;
          const kind = e.action.split('.')[0];
          const Icon = ICON[kind] ?? Zap;
          return [
            head,
            <li key={e.id} className={`wl-row wl-${kind}`}>
              <time className="wl-time" dateTime={e.at} title={new Date(e.at).toLocaleString()}>{new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time>
              <MemberDot name={e.actor.name} color={e.actor.color} size={26} />
              <div className="wl-body">
                <div className="wl-line"><b>{e.actor.name}</b> <span className="wl-act"><Icon size={13} />{t(`wl.a.${e.action}` as any)}</span></div>
                {e.detail && <div className={`wl-detail${e.action === 'chat.prompt' ? ' prompt' : ''}`}>{e.action === 'board.edit' ? boardWords(e.detail, t) : e.detail}</div>}
              </div>
            </li>,
          ];
        })}
      </ol>
      {all.length >= 200 && !end && <button className="btn sm" style={{ alignSelf: 'center' }} onClick={more}>{t('wl.more')}</button>}
    </div>
  );
}
