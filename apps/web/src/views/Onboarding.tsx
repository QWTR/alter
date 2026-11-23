import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, FolderOpen, Link2, Plus, Smartphone, Sparkles, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { api, invalidate, useData, type Status, type Template } from '../api';
import { useDescribeSchedule } from '../components/schedule';
import { ProviderCard, useProviders } from '../components/providers';
import { Field, Logo, Orb, Segmented, ease, softSpring, spring } from '../components/ui';
import { LANGS, getLang, setLang, useT, type Key } from '../i18n';

const STEPS = ['welcome', 'ai', 'you', 'team', 'phone', 'done'] as const;
type Step = (typeof STEPS)[number];

export function Onboarding({ status, onDone }: { status: Status; onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState<Step>('welcome');
  const [dir, setDir] = useState(1);
  const [name, setName] = useState(status.settings.userName ?? '');
  const [about, setAbout] = useState('');
  const [day, setDay] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [team, setTeam] = useState<string[]>(['morning-brief', 'evening-review']);
  const [saving, setSaving] = useState(false);
  const idx = STEPS.indexOf(step);

  const go = (to: Step) => {
    setDir(STEPS.indexOf(to) > idx ? 1 : -1);
    setStep(to);
  };
  const next = () => go(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  const back = () => go(STEPS[Math.max(idx - 1, 0)]);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api('/api/onboarding', { method: 'POST', body: { userName: name, about, day, sources, agents: team, language: getLang() } });
      invalidate('/api/agents', '/api/status', '/api/memories', '/api/projects');
      go('done');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className="onb" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.02, transition: { duration: 0.4, ease } }}>
      <Aurora />
      <div className="onb-inner">
        {step !== 'welcome' && step !== 'done' && (
          <div className="onb-progress">
            {STEPS.slice(1, -1).map((s, i) => (
              <i key={s}>
                <motion.b initial={false} animate={{ scaleX: i < idx ? 1 : 0 }} transition={{ duration: 0.4, ease }} />
              </i>
            ))}
          </div>
        )}
        <AnimatePresence mode="wait" custom={dir}>
          <motion.section
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40, filter: 'blur(6px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: dir * -40, filter: 'blur(6px)', transition: { duration: 0.18 } }}
            transition={{ duration: 0.38, ease }}
          >
            {step === 'welcome' && <Welcome onNext={next} />}
            {step === 'ai' && <ConnectAI onNext={next} onBack={back} />}
            {step === 'you' && (
              <div>
                <h1 className="gradient-text">{t('onb.you.title')}</h1>
                <p className="lead">{t('onb.you.lead')}</p>
                <div className="card" style={{ padding: 24 }}>
                  <Field label={t('onb.you.name')}>
                    <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field label={t('onb.you.about')}>
                    <textarea className="textarea" rows={2} placeholder={t('onb.you.aboutPh')} value={about} onChange={(e) => setAbout(e.target.value)} />
                  </Field>
                  <Field label={<>{t('onb.you.day')} <span className="faint">· {t('common.optional')}</span></>}>
                    <textarea className="textarea" rows={2} placeholder={t('onb.you.dayPh')} value={day} onChange={(e) => setDay(e.target.value)} />
                  </Field>
                </div>
                <Sources value={sources} onChange={setSources} />
                <Foot onBack={back} onNext={next} />
              </div>
            )}
            {step === 'team' && <Team selected={team} setSelected={setTeam} onBack={back} onNext={status.lanUrls.length ? next : finish} saving={saving} />}
            {step === 'phone' && <Phone onBack={back} onNext={finish} saving={saving} />}
            {step === 'done' && <Done name={name} onEnter={onDone} />}
          </motion.section>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/** Folders and links the user works on: imported as projects and read one by one in the background. */
function Sources({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const [picking, setPicking] = useState(false);
  const add = (src: string) => {
    const v = src.trim().replace(/^"(.*)"$/, '$1');
    if (v && !value.includes(v)) onChange([...value, v]);
    setText('');
  };
  const pick = async () => {
    setPicking(true);
    try {
      const r = await api<{ path: string | null }>('/api/pick-folder', { method: 'POST' });
      if (r.path) add(r.path);
    } catch {
      /* no native picker here (e.g. on the phone): typing a path still works */
    } finally {
      setPicking(false);
    }
  };
  return (
    <div className="card onb-sources" style={{ padding: 24, marginTop: 14 }}>
      <div className="row" style={{ gap: 8, marginBottom: 4 }}><Sparkles size={16} /><b>{t('onb.src.title')}</b> <span className="faint small">· {t('common.optional')}</span></div>
      <p className="small muted" style={{ margin: '0 0 14px' }}>{t('onb.src.hint')}</p>
      <AnimatePresence initial={false}>
        {value.map((v) => (
          <motion.div key={v} className="src-chip" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
            {/^https?:|^git@/i.test(v) ? <Link2 size={15} /> : <FolderOpen size={15} />}
            <span className="truncate grow">{v}</span>
            <button className="btn ghost icon sm" onClick={() => onChange(value.filter((x) => x !== v))} aria-label="Remove"><X /></button>
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="row" style={{ gap: 8, marginTop: value.length ? 10 : 0, flexWrap: 'wrap' }}>
        <input className="input grow" style={{ minWidth: 180 }} value={text} placeholder={t('onb.src.ph')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(text)} />
        <button className="btn" onClick={() => add(text)} disabled={!text.trim()}><Plus />{t('onb.src.add')}</button>
        <button className="btn" onClick={pick} disabled={picking}>{picking ? <span className="spinner" /> : <FolderOpen />}{t('onb.src.pick')}</button>
      </div>
    </div>
  );
}

function Aurora() {
  return (
    <div className="onb-aurora">
      <motion.i style={{ width: 620, height: 620, background: '#6a4cff', top: '-18%', left: '-10%' }} animate={{ x: [0, 80, 0], y: [0, 40, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.i style={{ width: 520, height: 520, background: '#1fb6ff', bottom: '-20%', right: '-8%', opacity: 0.32 }} animate={{ x: [0, -60, 0], y: [0, -50, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.i style={{ width: 380, height: 380, background: '#ff5c9a', top: '40%', left: '55%', opacity: 0.18 }} animate={{ x: [0, 40, -30, 0], y: [0, -30, 20, 0] }} transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }} />
    </div>
  );
}

function Foot({ onBack, onNext, nextLabel, disabled, saving, extra }: { onBack?: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean; saving?: boolean; extra?: React.ReactNode }) {
  const t = useT();
  return (
    <div className="onb-foot">
      {onBack ? <button className="btn ghost" onClick={onBack}><ArrowLeft />{t('common.back')}</button> : <span />}
      <div className="row">
        {extra}
        <motion.button className="btn primary lg" onClick={onNext} disabled={disabled || saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          {saving ? <span className="spinner" /> : null}
          {nextLabel ?? t('common.continue')}
          <ArrowRight />
        </motion.button>
      </div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const t = useT();
  const [lang, setL] = useState(getLang());
  const choose = (id: string) => {
    setL(id as typeof lang);
    setLang(id);
    api('/api/settings', { method: 'PUT', body: { language: id } }).catch(() => {});
  };
  return (
    <div style={{ textAlign: 'center' }}>
      <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ ...softSpring, delay: 0.1 }} style={{ display: 'inline-block', marginBottom: 26, filter: 'drop-shadow(0 20px 50px rgba(124,92,255,.45))' }}>
        <Logo size={104} animated />
      </motion.div>
      <motion.h1 className="gradient-text" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5, ease }}>
        {t('onb.welcome.title')}
      </motion.h1>
      <motion.p className="lead" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5, ease }}>
        {t('onb.welcome.lead')}
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5, ease }}>
        <div className="small muted" style={{ marginBottom: 12 }}>{t('onb.welcome.lang')}</div>
        <div className="lang-grid">
          {LANGS.map((l, i) => (
            <motion.button key={l.id} className={`lang-btn${lang === l.id ? ' active' : ''}`} onClick={() => choose(l.id)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.04 }} whileTap={{ scale: 0.97 }}>
              <b>{l.native}</b>
              <span>{l.english}</span>
              {lang === l.id && (
                <motion.span layoutId="lang-check" className="check" style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: 99, background: 'var(--accent)', display: 'grid', placeItems: 'center', color: '#fff' }} transition={spring}>
                  <Check size={12} />
                </motion.span>
              )}
            </motion.button>
          ))}
        </div>
      </motion.div>
      <motion.div style={{ marginTop: 34 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
        <motion.button className="btn primary lg" onClick={onNext} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          {t('onb.welcome.start')}
          <ArrowRight />
        </motion.button>
      </motion.div>
    </div>
  );
}

function ConnectAI({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const t = useT();
  const { data: providers } = useProviders();
  const real = (providers ?? []).filter((p) => p.id !== 'demo');
  const connected = real.filter((p) => p.connected);
  const autoTested = useMemo(() => new Set<string>(), []);

  // installed but never tested → test automatically so the user sees a real answer, not a guess
  useEffect(() => {
    for (const p of real) {
      if (p.installed && !p.health && !autoTested.has(p.id)) {
        autoTested.add(p.id);
        api(`/api/providers/${p.id}/test`, { method: 'POST' }).then(() => invalidate('/api/providers')).catch(() => {});
      }
    }
  }, [real, autoTested]);

  return (
    <div>
      <h1 className="gradient-text">{t('onb.ai.title')}</h1>
      <p className="lead">{t('onb.ai.lead')}</p>
      <div style={{ display: 'grid', gap: 12 }}>
        {real.map((p, i) => <ProviderCard key={p.id} p={p} index={i} />)}
      </div>
      <p className="small muted" style={{ marginTop: 16, textAlign: 'center' }}>{t('conn.explain')}</p>
      <AnimatePresence>
        {connected.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ textAlign: 'center', color: 'var(--ok)', fontWeight: 550, marginTop: 10 }}>
            {t('onb.ai.ready', { name: (connected.find((p) => p.isDefault) ?? connected[0]).name })}
          </motion.div>
        )}
      </AnimatePresence>
      <Foot onBack={onBack} onNext={onNext} extra={!connected.length && <button className="btn ghost" onClick={onNext}>{t('common.skip')}</button>} disabled={!connected.length} />
    </div>
  );
}

function Team({ selected, setSelected, onBack, onNext, saving }: { selected: string[]; setSelected: (s: string[]) => void; onBack: () => void; onNext: () => void; saving: boolean }) {
  const t = useT();
  const describe = useDescribeSchedule();
  const { data: templates } = useData<Template[]>('/api/agents/templates');
  const [cat, setCat] = useState<'all' | Template['category']>('all');
  const list = (templates ?? []).filter((x) => !x.monitor && (cat === 'all' || x.category === cat));
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div>
      <h1 className="gradient-text">{t('onb.team.title')}</h1>
      <p className="lead">{t('onb.team.lead')}</p>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <Segmented value={cat} onChange={setCat} options={(['all', 'daily', 'work', 'creative', 'automation'] as const).map((c) => ({ value: c, label: t(`agents.cat.${c}` as Key) }))} />
      </div>
      <motion.div layout className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        <AnimatePresence mode="popLayout">
          {list.map((tp, i) => {
            const on = selected.includes(tp.templateId);
            return (
              <motion.button
                layout
                key={tp.templateId}
                className={`char${on ? ' selected' : ''}`}
                onClick={() => toggle(tp.templateId)}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ ...spring, delay: i * 0.03 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
              >
                <AnimatePresence>
                  {on && (
                    <motion.span className="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring}>
                      <Check />
                    </motion.span>
                  )}
                </AnimatePresence>
                <Orb avatar={tp.avatar} size={52} />
                <div>
                  <h3>{t(`tpl.${tp.templateId}.name` as Key)}</h3>
                  <p style={{ marginTop: 4 }}>{t(`tpl.${tp.templateId}.desc` as Key)}</p>
                </div>
                <div className="foot">
                  <span className="badge">{describe(tp.schedule ?? 'manual')}</span>
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </motion.div>
      <Foot onBack={onBack} onNext={onNext} saving={saving} extra={<span className="muted small">{t('onb.team.selected', { n: selected.length })}</span>} />
    </div>
  );
}

function Phone({ onBack, onNext, saving }: { onBack: () => void; onNext: () => void; saving: boolean }) {
  const t = useT();
  const [pair, setPair] = useState<{ code: string; urls: string[] } | null>(null);
  const [qr, setQr] = useState('');
  useEffect(() => {
    api('/api/pair/start', { method: 'POST' }).then(async (p) => {
      setPair(p);
      if (p.urls[0]) setQr(await QRCode.toDataURL(p.urls[0], { margin: 0, width: 220, color: { dark: '#0b0a12', light: '#ffffff' } }));
    });
  }, []);
  return (
    <div style={{ textAlign: 'center' }}>
      <motion.div initial={{ rotate: -10, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={softSpring} style={{ display: 'inline-grid', placeItems: 'center', width: 64, height: 64, borderRadius: 20, background: 'var(--accent-soft)', color: 'var(--accent-strong)', marginBottom: 18 }}>
        <Smartphone size={30} />
      </motion.div>
      <h1 className="gradient-text">{t('onb.phone.title')}</h1>
      <p className="lead">{t('onb.phone.lead')}</p>
      {pair && (
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={softSpring} className="card" style={{ display: 'inline-grid', gap: 14, justifyItems: 'center', padding: 26 }}>
          {qr && <div className="qr"><img src={qr} width={200} height={200} alt="QR" /></div>}
          <div className="code-big">{pair.code}</div>
          <div className="small muted mono">{pair.urls[0]}</div>
        </motion.div>
      )}
      <p className="small faint" style={{ marginTop: 14 }}>{t('onb.phone.later')}</p>
      <Foot onBack={onBack} onNext={onNext} saving={saving} />
    </div>
  );
}

function Done({ name, onEnter }: { name: string; onEnter: () => void }) {
  const t = useT();
  return (
    <div style={{ textAlign: 'center', paddingTop: 20 }}>
      <div style={{ position: 'relative', display: 'inline-block', marginBottom: 26 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.span
            key={i}
            style={{ position: 'absolute', left: '50%', top: '50%', width: 8, height: 8, borderRadius: 3, background: ['#8b74ff', '#5ad7ff', '#ff5c9a', '#3ddc97'][i % 4] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos((i / 12) * Math.PI * 2) * 110, y: Math.sin((i / 12) * Math.PI * 2) * 110, opacity: 0, scale: 0.4, rotate: 180 }}
            transition={{ duration: 1.1, ease, delay: 0.25 }}
          />
        ))}
        <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} style={{ filter: 'drop-shadow(0 20px 60px rgba(124,92,255,.55))' }}>
          <Logo size={112} />
        </motion.div>
      </div>
      <motion.h1 className="gradient-text" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        {t('onb.done.title')}{name ? `, ${name}` : ''}
      </motion.h1>
      <motion.p className="lead" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        {t('onb.done.lead')}
      </motion.p>
      <motion.button className="btn primary lg" onClick={onEnter} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
        <Sparkles />
        {t('onb.done.enter')}
      </motion.button>
    </div>
  );
}
