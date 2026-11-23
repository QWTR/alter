// "Build your own agent": a 3-step wizard with a live, animated robot preview.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Dices, Eye, FolderOpen, MessageCircle, Terminal } from 'lucide-react';
import { useState } from 'react';
import { api, invalidate, useData, type Access, type Agent, type Avatar, type Project, type ProviderStatus } from '../api';
import { useT, type Key } from '../i18n';
import { ANTENNAS, EYES, MOUTHS, Robot } from './Robot';
import { ScheduleEditor } from './schedule';
import { Field, ICON_KEYS, ICONS, Modal, PALETTE_KEYS, PALETTES, ProviderMark, softSpring, spring, toast } from './ui';

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const randomAvatar = (): Avatar => ({ palette: pick(PALETTE_KEYS), icon: pick(ICON_KEYS), eyes: pick(EYES), antenna: pick(ANTENNAS), mouth: pick(MOUTHS) });

export function AgentCreator({ open, onClose, projectId, onCreated }: { open: boolean; onClose: () => void; projectId?: string | null; onCreated?: (a: Agent) => void }) {
  return (
    <Modal open={open} onClose={onClose} wide>
      {open && <Wizard onClose={onClose} projectId={projectId} onCreated={onCreated} />}
    </Modal>
  );
}

function Wizard({ onClose, projectId, onCreated }: { onClose: () => void; projectId?: string | null; onCreated?: (a: Agent) => void }) {
  const t = useT();
  const { data: providers } = useData<ProviderStatus[]>('/api/providers');
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [avatar, setAvatar] = useState<Avatar>(randomAvatar);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [provider, setProvider] = useState('default');
  const [access, setAccess] = useState<Access>('chat');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const { data: projects } = useData<Project[]>('/api/projects');
  const [project, setProject] = useState<string | null>(projectId ?? null);
  const [importing, setImporting] = useState(false);
  const [schedule, setSchedule] = useState('manual');
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const real = (providers ?? []).filter((p) => p.id !== 'demo');
  const ai = provider === 'default' ? real.find((p) => p.isDefault) : real.find((p) => p.id === provider);
  // a folder from disk becomes a project (and gets read once in the background)
  const pickFolder = async () => {
    setImporting(true);
    try {
      const r = await api<{ path: string | null }>('/api/pick-folder', { method: 'POST' });
      if (!r.path) return;
      const p = await api<Project>('/api/projects/import', { method: 'POST', body: { source: r.path } });
      invalidate('/api/projects');
      setProject(p.id);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const go = (d: number) => {
    setDir(d);
    setStep((s) => s + d);
  };
  const create = async () => {
    setBusy(true);
    try {
      const a = await api<Agent>('/api/agents', {
        method: 'POST',
        body: { name: name.trim(), instructions: role.trim(), description: role.trim().split(/[.\n]/)[0].slice(0, 120), avatar, provider, model, effort, access, schedule, projectId: project, enabled: true, learns: true },
      });
      invalidate('/api/agents', '/api/projects');
      toast(t('creator.created', { name: a.name }), 'ok', <Robot avatar={a.avatar} size={26} still />);
      onClose();
      onCreated?.(a);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const steps = [t('creator.step.look'), t('creator.step.role'), t('creator.step.when')];
  const canNext = step === 0 ? !!name.trim() : step === 1 ? role.trim().length > 5 : true;

  return (
    <div className="creator">
      <div className="creator-stage" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ ['--glow' as any]: PALETTES[avatar.palette] }}>
        <motion.div key={`${avatar.eyes}${avatar.antenna}${avatar.mouth}`} initial={{ scale: 0.85, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 14 }}>
          <Robot avatar={avatar} size={168} running={hover || busy} />
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.div key={name || 'unnamed'} className="creator-name" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            {name || t('creator.unnamed')}
          </motion.div>
        </AnimatePresence>
        <div className="small faint">{providers && (provider === 'default' ? t('conn.default') : real.find((p) => p.id === provider)?.name)} · {t(`access.${access}` as Key)}</div>
        <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => setAvatar(randomAvatar())}><Dices />{t('creator.random')}</button>
      </div>

      <div className="creator-form">
        <div className="creator-steps">
          {steps.map((s, i) => (
            <div key={s} className={`cstep${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}>
              <span>{i + 1}</span>
              {s}
              {i === step && <motion.i layoutId="cstep" transition={spring} />}
            </div>
          ))}
        </div>

        <div className="creator-body">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir} initial={{ opacity: 0, x: 24 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 * dir, transition: { duration: 0.12 } }} transition={softSpring}>
              {step === 0 && (
                <>
                  <Field label={t('agents.name')}><input className="input" value={name} placeholder={t('creator.namePh')} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} /></Field>
                  <Field label={t('projects.color')}>
                    <div className="color-pick">
                      {PALETTE_KEYS.map((k) => <motion.button type="button" key={k} className={avatar.palette === k ? 'active' : ''} style={{ background: PALETTES[k] }} onClick={() => setAvatar({ ...avatar, palette: k })} whileTap={{ scale: 0.88 }} />)}
                    </div>
                  </Field>
                  <div className="grid-3">
                    {([['creator.eyes', 'eyes', EYES], ['creator.antenna', 'antenna', ANTENNAS], ['creator.mouth', 'mouth', MOUTHS]] as const).map(([label, key, opts]) => (
                      <Field key={key} label={t(label)}>
                        <div className="face-pick">
                          {opts.map((o) => (
                            <button type="button" key={o} className={avatar[key] === o ? 'active' : ''} onClick={() => setAvatar({ ...avatar, [key]: o })} title={o}>
                              <Robot avatar={{ ...avatar, [key]: o }} size={34} still />
                            </button>
                          ))}
                        </div>
                      </Field>
                    ))}
                  </div>
                  <Field label={t('creator.emblem')}>
                    <div className="icon-pick">
                      {ICON_KEYS.map((k) => {
                        const I = ICONS[k];
                        return <button type="button" key={k} className={avatar.icon === k ? 'active' : ''} onClick={() => setAvatar({ ...avatar, icon: k })}><I /></button>;
                      })}
                    </div>
                  </Field>
                </>
              )}
              {step === 1 && (
                <>
                  <Field label={t('creator.role')} hint={t('creator.roleHint')}>
                    <textarea className="textarea" rows={5} value={role} placeholder={t('agents.instructionsPh')} onChange={(e) => setRole(e.target.value)} autoFocus />
                  </Field>
                  <Field label={t('creator.ai')}>
                    <div className="ai-pick">
                      {[{ id: 'default', name: t('conn.default'), connected: true, installed: true } as Partial<ProviderStatus>, ...real].map((p) => (
                        <motion.button type="button" key={p.id} className={`option${provider === p.id ? ' selected' : ''}`} onClick={() => { setProvider(p.id!); setModel(''); setEffort(''); }} disabled={!p.installed} whileTap={{ scale: 0.97 }}>
                          {p.id === 'default' ? <Robot avatar={avatar} size={30} still /> : <ProviderMark id={p.id!} name={p.name!} size={30} />}
                          <div>
                            <b>{p.name}</b>
                            <p>{p.id === 'default' ? t('creator.aiDefault') : p.connected ? t('conn.connected') : p.installed ? t('conn.untested') : t('conn.notInstalled')}</p>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </Field>
                  <Field label={t('creator.project')} hint={t('creator.projectHint')}>
                    <div className="proj-pick">
                      <button type="button" className={!project ? 'active' : ''} onClick={() => setProject(null)}>{t('creator.noProject')}</button>
                      {(projects ?? []).map((p) => (
                        <button type="button" key={p.id} className={project === p.id ? 'active' : ''} onClick={() => setProject(p.id)}>
                          <span className="dot" style={{ background: PALETTES[p.color] ?? PALETTES.violet }} />
                          {p.name}
                        </button>
                      ))}
                      <button type="button" onClick={pickFolder} disabled={importing}>{importing ? <span className="spinner" /> : <FolderOpen size={14} />}{t('creator.pickFolder')}</button>
                    </div>
                  </Field>
                  {ai && (ai.models.length > 0 || ai.efforts.length > 0) && (
                    <div className="grid-2">
                      {ai.models.length > 0 && (
                        <Field label={`${t('picker.model')} · ${ai.name}`}>
                          <div className="tune-row" style={{ padding: 0 }}>
                            {[{ id: '', label: t('picker.defaultModel') }, ...ai.models].map((m) => <button type="button" key={m.id} className={model === m.id ? 'active' : ''} onClick={() => setModel(m.id)}>{m.label}</button>)}
                          </div>
                        </Field>
                      )}
                      {ai.efforts.length > 0 && (
                        <Field label={t('picker.effort')}>
                          <div className="tune-row" style={{ padding: 0 }}>
                            {['', ...ai.efforts].map((e) => <button type="button" key={e} className={effort === e ? 'active' : ''} onClick={() => setEffort(e)}>{e ? t(`effort.${e}` as Key) : t('picker.defaultModel')}</button>)}
                          </div>
                        </Field>
                      )}
                    </div>
                  )}
                  <Field label={t('agents.access')} hint={access === 'full' ? t('auto.fullWarn') : t(`chat.access.${access}Hint` as Key)}>
                    <div className="ai-pick">
                      {([['chat', MessageCircle], ['read', Eye], ['full', Terminal]] as const).map(([a, I]) => (
                        <motion.button type="button" key={a} className={`option${access === a ? ' selected' : ''}`} onClick={() => setAccess(a)} whileTap={{ scale: 0.97 }}>
                          <I />
                          <div><b>{t(`access.${a}` as Key)}</b></div>
                        </motion.button>
                      ))}
                    </div>
                  </Field>
                </>
              )}
              {step === 2 && (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>{t('creator.whenLead')}</p>
                  <Field label={t('agents.schedule')}><ScheduleEditor value={schedule} onChange={setSchedule} /></Field>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="modal-foot">
          {step > 0 ? <button className="btn ghost" onClick={() => go(-1)}><ArrowLeft />{t('common.back')}</button> : <button className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>}
          <span className="grow" />
          {step < 2 ? (
            <button className="btn primary" disabled={!canNext} onClick={() => go(1)}>{t('common.continue')}<ArrowRight /></button>
          ) : (
            <button className="btn primary" disabled={busy} onClick={create}>{busy && <span className="spinner" />}{t('creator.create')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
