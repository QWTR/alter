import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, CircleDashed, Globe, Network, Pause, Play, Plus, Radar, RefreshCw, ShieldAlert, SquareTerminal, Trash2, TriangleAlert, Wifi, Wrench, FileSearch } from 'lucide-react';
import { useState } from 'react';
import { api, invalidate, setCached, useData, type Agent, type MonitorType, type Project, type Template } from '../api';
import { agentName, RunHistory } from '../components/agentKit';
import { Drawer, Empty, Field, Modal, ModalHead, PageHead, spring, stagger, toast } from '../components/ui';
import { ago, formatTime, useT, type Key } from '../i18n';

const TYPES: { id: MonitorType; icon: typeof Globe; ph: string }[] = [
  { id: 'http', icon: Globe, ph: 'https://example.com/health' },
  { id: 'tcp', icon: Network, ph: 'my-server.com:22' },
  { id: 'ping', icon: Wifi, ph: '192.168.1.10' },
  { id: 'command', icon: SquareTerminal, ph: 'docker ps --filter name=api --filter status=running -q | findstr .' },
];

export function AutomationsView() {
  const t = useT();
  const { data: agents } = useData<Agent[]>('/api/agents', 5000);
  const [wizard, setWizard] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const monitors = (agents ?? []).filter((a) => a.monitor);
  const selected = monitors.find((a) => a.id === open);

  return (
    <div className="page">
      <PageHead title={t('auto.title')} lead={t('auto.lead')} actions={<button className="btn primary" onClick={() => setWizard(true)}><Plus />{t('auto.new')}</button>} />
      {agents && !monitors.length ? (
        <Empty icon={Radar} title={t('auto.empty.title')} text={t('auto.empty.lead')} action={<button className="btn primary" onClick={() => setWizard(true)}><Plus />{t('auto.new')}</button>} />
      ) : (
        <div className="list">
          {monitors.map((a, i) => <MonitorRow key={a.id} a={a} i={i} onOpen={() => setOpen(a.id)} />)}
        </div>
      )}
      <Wizard open={wizard} onClose={() => setWizard(false)} />
      <Drawer open={!!selected} onClose={() => setOpen(null)}>{selected && <MonitorDetail a={selected} onClose={() => setOpen(null)} />}</Drawer>
    </div>
  );
}

function StatusRing({ status }: { status: 'ok' | 'fail' | 'unknown' }) {
  return (
    <div className={`pulse-ring ${status}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={status} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring} style={{ display: 'grid' }}>
          {status === 'ok' ? <CircleCheck /> : status === 'fail' ? <TriangleAlert /> : <CircleDashed />}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function useCheck(a: Agent) {
  const [busy, setBusy] = useState(false);
  return [
    busy,
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setBusy(true);
      try {
        await api(`/api/agents/${a.id}/check`, { method: 'POST' });
        invalidate('/api/agents');
      } finally {
        setBusy(false);
      }
    },
  ] as const;
}

function MonitorRow({ a, i, onOpen }: { a: Agent; i: number; onOpen: () => void }) {
  const t = useT();
  const s = a.monitorState?.status ?? 'unknown';
  const [busy, check] = useCheck(a);
  const T = TYPES.find((x) => x.id === a.monitor!.type)!;
  return (
    <motion.div layout className={`monitor-row ${s}`} onClick={onOpen} {...stagger(i)} style={{ opacity: a.enabled ? 1 : 0.55 }}>
      <StatusRing status={s} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <b className="truncate">{agentName(a, t)}</b>
          {a.running && <span className="badge warn"><span className="status-dot warn live" />{t('agents.running')}</span>}
        </div>
        <div className="small muted row truncate" style={{ gap: 6 }}>
          <T.icon size={13} />
          <span className="mono truncate">{a.monitor!.target}</span>
        </div>
      </div>
      <div className="monitor-meta small">
        <b className={`st-${s}`}>{t(`auto.status.${s}` as Key)}</b>
        <span className="faint">
          {a.monitorState?.lastCheck ? t('auto.lastCheck', { time: ago(a.monitorState.lastCheck) }) : t('sched.everyMin', { n: a.monitor!.everyMinutes })}
          {a.monitorState?.latencyMs != null && s === 'ok' ? ` · ${a.monitorState.latencyMs} ms` : ''}
        </span>
      </div>
      <span className="badge" title={a.monitor!.autoFix ? t('auto.fixHint') : t('auto.reportHint')}>
        {a.monitor!.autoFix ? <Wrench /> : <FileSearch />}
        {a.monitor!.autoFix ? t('auto.fix') : t('auto.report')}
      </span>
      <motion.button className="btn sm icon" onClick={check} disabled={busy} title={t('auto.checkNow')} whileTap={{ scale: 0.9 }}>
        <RefreshCw className={busy ? 'spin' : ''} />
      </motion.button>
    </motion.div>
  );
}

function MonitorDetail({ a, onClose }: { a: Agent; onClose: () => void }) {
  const t = useT();
  const s = a.monitorState?.status ?? 'unknown';
  const [busy, check] = useCheck(a);
  const [every, setEvery] = useState(a.monitor!.everyMinutes);
  const patch = async (body: Partial<Agent>) => {
    setCached<Agent[]>('/api/agents', (l) => (l ?? []).map((x) => (x.id === a.id ? { ...x, ...body } : x)));
    await api(`/api/agents/${a.id}`, { method: 'PUT', body });
    invalidate('/api/agents');
  };
  return (
    <div>
      <div className="row" style={{ gap: 16, marginBottom: 16, alignItems: 'flex-start' }}>
        <StatusRing status={s} />
        <div className="grow">
          <h2 style={{ margin: '2px 0 4px', fontSize: 20 }}>{agentName(a, t)}</h2>
          <div className="mono small muted">{a.monitor!.target}</div>
        </div>
      </div>
      <div className={`card status-card ${s}`} style={{ marginBottom: 16 }}>
        <b className={`st-${s}`}>{t(`auto.status.${s}` as Key)}</b>
        {a.monitorState?.since && <span className="faint small"> · {t('auto.since', { time: formatTime(a.monitorState.since) })}</span>}
        {a.monitorState?.message && <div className="small muted mono" style={{ marginTop: 6, wordBreak: 'break-word' }}>{a.monitorState.message}</div>}
      </div>
      <div className="row" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={() => check()} disabled={busy}>{busy ? <span className="spinner" /> : <RefreshCw />}{t('auto.checkNow')}</button>
        <button className="btn" onClick={() => patch({ enabled: !a.enabled })}>{a.enabled ? <><Pause />{t('agents.pause')}</> : <><Play />{t('agents.resume')}</>}</button>
        <span className="grow" />
        <button
          className="btn ghost icon danger"
          onClick={async () => {
            if (!confirm(t('agents.deleteConfirm'))) return;
            await api(`/api/agents/${a.id}`, { method: 'DELETE' });
            invalidate('/api/agents');
            onClose();
          }}
        >
          <Trash2 />
        </button>
      </div>
      <div className="grid-2">
        <Field label={t('auto.every')}>
          <div className="row">
            <input className="input" type="number" min={1} max={1440} value={every} onChange={(e) => setEvery(Number(e.target.value))} onBlur={() => every !== a.monitor!.everyMinutes && patch({ monitor: { ...a.monitor!, everyMinutes: Math.max(1, every) } })} style={{ width: 100 }} />
            <span className="muted">{t('auto.minutes')}</span>
          </div>
        </Field>
        <Field label={t('auto.onFail')}>
          <FixPicker value={a.monitor!.autoFix} onChange={(autoFix) => patch({ monitor: { ...a.monitor!, autoFix }, access: autoFix ? 'full' : 'read' })} compact />
        </Field>
      </div>
      <h2 className="section" style={{ marginTop: 10 }}>{t('agents.history')}<span className="line" /></h2>
      <RunHistory agentId={a.id} />
    </div>
  );
}

function FixPicker({ value, onChange, compact }: { value: boolean; onChange: (v: boolean) => void; compact?: boolean }) {
  const t = useT();
  return (
    <div className={compact ? 'row' : 'grid-2'} style={{ gap: 10 }}>
      {[
        { v: true, icon: Wrench, title: t('auto.fix'), hint: t('auto.fixHint') },
        { v: false, icon: FileSearch, title: t('auto.report'), hint: t('auto.reportHint') },
      ].map((o) => (
        <motion.button type="button" key={String(o.v)} className={`option${value === o.v ? ' selected' : ''}`} onClick={() => onChange(o.v)} whileTap={{ scale: 0.98 }}>
          <o.icon />
          <div>
            <b>{o.title}</b>
            {!compact && <p>{o.hint}</p>}
          </div>
        </motion.button>
      ))}
    </div>
  );
}

function Wizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose}>
      <ModalHead icon={<div className="pulse-ring ok"><Radar /></div>} title={t('auto.new')} text={t('auto.empty.lead')} onClose={onClose} />
      {open && <WizardForm onDone={onClose} />}
    </Modal>
  );
}

function WizardForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const { data: templates } = useData<Template[]>('/api/agents/templates');
  const { data: projects } = useData<Project[]>('/api/projects');
  const [type, setType] = useState<MonitorType>('http');
  const [target, setTarget] = useState('');
  const [name, setName] = useState('');
  const [every, setEvery] = useState(5);
  const [autoFix, setAutoFix] = useState(false);
  const [extra, setExtra] = useState('');
  const [projectId, setProjectId] = useState('');
  const [test, setTest] = useState<{ ok: boolean; message: string; latencyMs?: number } | 'busy' | null>(null);
  const [busy, setBusy] = useState(false);
  const T = TYPES.find((x) => x.id === type)!;

  const runTest = async () => {
    setTest('busy');
    try {
      setTest(await api('/api/monitor/test', { method: 'POST', body: { type, target } }));
    } catch (err) {
      setTest({ ok: false, message: (err as Error).message });
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const tpl = templates?.find((x) => x.templateId === 'server-guard');
      await api('/api/agents', {
        method: 'POST',
        body: {
          templateId: 'server-guard',
          name: name.trim() || target.replace(/^https?:\/\//, '').slice(0, 40),
          instructions: [tpl?.instructions, extra.trim()].filter(Boolean).join('\n\nExtra instructions from the user:\n'),
          monitor: { type, target: target.trim(), everyMinutes: Math.max(1, every), autoFix },
          access: autoFix ? 'full' : 'read',
          projectId: projectId || null,
          avatar: { palette: 'lime', icon: 'server' },
        },
      });
      invalidate('/api/agents', '/api/projects');
      toast(t('common.saved'), 'ok');
      onDone();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={create}>
      <div className="type-grid">
        {TYPES.map((x) => (
          <motion.button type="button" key={x.id} className={`option${type === x.id ? ' selected' : ''}`} onClick={() => { setType(x.id); setTest(null); }} whileTap={{ scale: 0.97 }}>
            <x.icon />
            <div>
              <b>{t(`auto.type.${x.id}` as Key)}</b>
              <p>{t(`auto.type.${x.id}Hint` as Key)}</p>
            </div>
          </motion.button>
        ))}
      </div>
      <Field label={t('auto.target')}>
        <div className="row">
          <input className="input mono grow" value={target} placeholder={T.ph} onChange={(e) => { setTarget(e.target.value); setTest(null); }} required />
          <button type="button" className="btn" onClick={runTest} disabled={!target.trim() || test === 'busy'}>{test === 'busy' ? <span className="spinner" /> : <Play />}{t('auto.testNow')}</button>
        </div>
        <AnimatePresence>
          {test && test !== 'busy' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
              <div className={`test-result ${test.ok ? 'ok' : 'fail'}`}>
                {test.ok ? <CircleCheck /> : <TriangleAlert />}
                <span className="grow">{test.ok ? t('auto.status.ok') : t('auto.status.fail')} · {test.message}</span>
                {test.latencyMs != null && <span className="faint">{test.latencyMs} ms</span>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Field>
      <div className="grid-2">
        <Field label={t('auto.name')}><input className="input" value={name} placeholder={t('auto.namePh')} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('auto.every')}>
          <div className="row">
            <input className="input" type="number" min={1} max={1440} value={every} onChange={(e) => setEvery(Number(e.target.value))} style={{ width: 100 }} />
            <span className="muted">{t('auto.minutes')}</span>
          </div>
        </Field>
      </div>
      <Field label={t('auto.onFail')}><FixPicker value={autoFix} onChange={setAutoFix} /></Field>
      <AnimatePresence>
        {autoFix && (
          <motion.div className="warn-box" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <ShieldAlert />
            <span>{t('auto.fullWarn')}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <Field label={<>{t('auto.extra')} <span className="faint">({t('common.optional')})</span></>}>
        <textarea className="textarea" rows={3} value={extra} placeholder={t('auto.extraPh')} onChange={(e) => setExtra(e.target.value)} />
      </Field>
      {!!projects?.length && (
        <Field label={t('agents.project')}>
          <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('chat.noProject')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}
      <div className="modal-foot">
        <button className="btn primary" disabled={busy || !target.trim()}>{busy && <span className="spinner" />}{t('common.create')}</button>
      </div>
    </form>
  );
}
