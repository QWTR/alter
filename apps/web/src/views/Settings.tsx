import { isNativeApp, toStartPage } from '../native';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Cpu, Database, Puzzle, ExternalLink, Globe, Info, Laptop, Moon, MousePointer2, RotateCcw, Server, ShieldCheck, Smartphone, Square, Sun, Unplug, type LucideIcon } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api, forgetToken, invalidate, setCached, useData, type Device, type Status, type UsageSummary } from '../api';
import { fmtTokens } from '../components/ProviderPicker';
import { ProviderCard, useProviders } from '../components/providers';
import { InternetCard, ServerCard } from '../components/Internet';
import { NotificationsCard } from '../components/Notifications';
import { PluginsTab } from '../components/Plugins';
import { MyReports } from '../components/Report';
import { Field, Logo, PageHead, Segmented, Switch, Tabs, spring, stagger, toast } from '../components/ui';
import { ago, formatTime, LANGS, setLang, useT } from '../i18n';
import { navigate, useRoute } from '../router';

type Tab = 'general' | 'ai' | 'plugins' | 'devices' | 'internet' | 'data' | 'about';


export function SettingsView() {
  const t = useT();
  const route = useRoute();
  const tab = (route.query.get('tab') as Tab) || 'general';
  const { data: status } = useData<Status>('/api/status');
  const isComputer = status?.you.kind === 'computer';
  const tabs: { value: Tab; label: string; icon: LucideIcon }[] = [
    { value: 'general', label: t('settings.general'), icon: Laptop },
    { value: 'ai', label: t('settings.ai'), icon: Cpu },
    ...(isComputer ? [{ value: 'plugins' as Tab, label: t('plugins.tab'), icon: Puzzle }] : []),
    { value: 'devices', label: t('settings.devices'), icon: Smartphone },
    ...(isComputer ? [{ value: 'internet' as Tab, label: t('net.tab'), icon: Globe }] : []),
    { value: 'data', label: t('settings.data'), icon: Database },
    { value: 'about', label: t('settings.about'), icon: Info },
  ];

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <PageHead title={t('settings.title')} />
      <Tabs value={tab} onChange={(v) => navigate(`/settings?tab=${v}`, true)} tabs={tabs} />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={{ duration: 0.2 }}>
          {status && tab === 'general' && <General status={status} />}
          {tab === 'ai' && <AiTab />}
          {isComputer && tab === 'plugins' && <PluginsTab />}
          {status && tab === 'devices' && <Devices isComputer={isComputer} status={status} />}
          {isComputer && tab === 'internet' && <div style={{ display: 'grid', gap: 16 }}><InternetCard /><ServerCard /></div>}
          {status && tab === 'data' && <DataTab status={status} />}
          {status && tab === 'about' && <About status={status} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

async function saveSettings(patch: Record<string, unknown>) {
  setCached<Status>('/api/status', (s) => (s ? { ...s, settings: { ...s.settings, ...patch } } : s!));
  await api('/api/settings', { method: 'PUT', body: patch });
}

// [id, dark preview (bg, panel, accent), light preview (bg, panel, accent)]
const PALETTES: [string, [string, string, string], [string, string, string]][] = [
  ['violet', ['#0b0a12', '#1a1927', '#8b74ff'], ['#f5f4fa', '#ffffff', '#6d55f0']],
  ['ocean', ['#080c14', '#151d2c', '#4c9dff'], ['#f3f6fb', '#ffffff', '#1f6fe0']],
  ['emerald', ['#070d0b', '#142019', '#2fd08f'], ['#f3f8f5', '#ffffff', '#0f9a63']],
  ['sunset', ['#0f0a08', '#231915', '#ff8a4c'], ['#faf5f1', '#ffffff', '#e0601f']],
  ['rose', ['#0f080c', '#23161e', '#ff5c9a'], ['#fbf3f6', '#ffffff', '#d93a7a']],
  ['graphite', ['#0b0b0c', '#1b1b1e', '#c9ccd6'], ['#f5f5f6', '#ffffff', '#2b2d33']],
  ['midnight', ['#000000', '#121219', '#8b74ff'], ['#fafafa', '#ffffff', '#6d55f0']],
];

function ThemePicker() {
  const t = useT() as unknown as (k: string) => string;
  const [palette, setPalette] = useState(() => {
    try {
      return localStorage.getItem('alter.palette') || 'violet';
    } catch {
      return 'violet';
    }
  });
  const light = document.documentElement.dataset.theme === 'light';
  const pick = (v: string) => {
    setPalette(v);
    try {
      localStorage.setItem('alter.palette', v);
    } catch {}
    (window as any).__applyTheme?.();
  };
  return (
    <div className="theme-grid" role="radiogroup">
      {PALETTES.map(([id, dark, lite]) => {
        const [bg, panel, accent] = light ? lite : dark;
        return (
          <button key={id} role="radio" aria-checked={palette === id} className={`theme-card${palette === id ? ' on' : ''}`} onClick={() => pick(id)}>
            <span className="theme-prev" style={{ background: bg }}>
              <i style={{ background: panel }} />
              <b style={{ background: light ? '#000' : '#fff' }} />
              <em style={{ background: accent }} />
            </span>
            <span className="theme-name">
              {t(`settings.palette.${id}`)}
              {palette === id && <Check />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function General({ status }: { status: Status }) {
  const t = useT();
  const [name, setName] = useState(status.settings.userName);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('alter.theme') || 'system';
    } catch {
      return 'system';
    }
  });
  const pickTheme = (v: string) => {
    setTheme(v);
    try {
      localStorage.setItem('alter.theme', v);
    } catch {}
    (window as any).__applyTheme?.();
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <motion.div className="card" {...stagger(0)}>
        <Field label={t('settings.language')} hint={t('settings.languageHint')}>
          <div className="lang-grid">
            {LANGS.map((l) => (
              <button
                key={l.id}
                className={`lang-btn${status.settings.language === l.id ? ' active' : ''}`}
                onClick={() => {
                  setLang(l.id);
                  saveSettings({ language: l.id });
                }}
              >
                <b>{l.native}</b>
                <span>{l.english}</span>
              </button>
            ))}
          </div>
        </Field>
      </motion.div>
      <motion.div className="card" {...stagger(1)}>
        <Field label={t('settings.name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== status.settings.userName && saveSettings({ userName: name.trim() }).then(() => toast(t('common.saved'), 'ok'))} />
        </Field>
        <Field label={t('settings.theme')}>
          <Segmented
            value={theme}
            onChange={pickTheme}
            options={[
              { value: 'system', label: t('settings.theme.system'), icon: Laptop },
              { value: 'dark', label: t('settings.theme.dark'), icon: Moon },
              { value: 'light', label: t('settings.theme.light'), icon: Sun },
            ]}
          />
        </Field>
        <Field label={t('settings.palette')} hint={t('settings.paletteHint')}>
          <ThemePicker />
        </Field>
      </motion.div>
      {status.you.kind === 'computer' && <HandsCard />}
      {status.you.kind === 'computer' && (
        <motion.div className="card row" {...stagger(3)}>
          <div className="grow">
            <b>{t('onb.welcome.title')}</b>
          </div>
          <button className="btn" onClick={() => window.dispatchEvent(new Event('alter:onboarding'))}><RotateCcw />{t('settings.rerun')}</button>
        </motion.div>
      )}
    </div>
  );
}

/** Computer use: the AI may move the mouse and type — asked for in any chat with Full control. */
function HandsCard() {
  const t = useT();
  const { data } = useData<{ enabled: boolean; supported: boolean; agents: { id: string; name: string; color: string; action: string }[] }>('/api/hands', 3000);
  if (!data?.supported) return null;
  const enable = async (on: boolean) => {
    await api('/api/hands', { method: 'PUT', body: { enabled: on } });
    invalidate('/api/hands');
  };
  const stop = async () => {
    await api('/api/hands/stop', { method: 'POST' });
    invalidate('/api/hands');
  };
  return (
    <motion.div className="card hands-set" {...stagger(2)}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="menu-ic" style={{ background: 'color-mix(in srgb, #ff9a3d 18%, transparent)', color: '#ff9a3d', width: 36, height: 36 }}><MousePointer2 size={18} /></div>
        <div className="grow">
          <b>{t('hands.enable')}</b>
          <p className="small muted" style={{ margin: '4px 0 0' }}>{t('hands.chatHint')}</p>
          <p className="small faint" style={{ margin: '6px 0 0', display: 'flex', gap: 6, alignItems: 'center' }}><ShieldCheck size={14} />{t('hands.safety')}</p>
        </div>
        <Switch on={data.enabled} onChange={enable} label={t('hands.enable')} />
      </div>
      {data.agents.length > 0 && (
        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
          {data.agents.map((a) => <span key={a.id} className="hands-agent small"><span className="dot" style={{ background: a.color }} /><b>{a.name}</b><span className="muted truncate">{a.action || '…'}</span></span>)}
          <span className="grow" />
          <button className="btn danger sm" onClick={stop}><Square size={12} fill="currentColor" />{t('hands.stopAll')}</button>
        </div>
      )}
    </motion.div>
  );
}

function AiTab() {
  const t = useT();
  const { data: providers } = useProviders();
  const { data: status } = useData<Status>('/api/status');
  const { data: usage } = useData<UsageSummary>('/api/usage', 10_000);
  const real = (providers ?? []).filter((p) => p.id !== 'demo');
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10));
  const max = Math.max(1, ...days.map((d) => (usage?.daily ?? []).filter((r) => r.day === d).reduce((a, r) => a + r.input + r.output, 0)));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="muted" style={{ margin: '0 0 6px' }}>{t('conn.explain')}</p>
      {real.map((p, i) => <ProviderCard key={p.id} p={p} index={i} />)}

      <h2 className="section" style={{ marginTop: 18 }}>{t('usage.title')}<span className="line" /></h2>
      <div className="card">
        <div className="usage-bars">
          {days.map((d, i) => {
            const rows = (usage?.daily ?? []).filter((r) => r.day === d);
            const total = rows.reduce((a, r) => a + r.input + r.output, 0);
            return (
              <div key={d} className="usage-col" title={`${d} · ${fmtTokens(total)}`}>
                <div className="usage-stack">
                  {real.map((p) => {
                    const r = rows.find((x) => x.provider === p.id);
                    if (!r) return null;
                    return <motion.span key={p.id} className={`seg seg-${p.id}`} initial={{ height: 0 }} animate={{ height: `${((r.input + r.output) / max) * 100}%` }} transition={{ delay: i * 0.02, duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />;
                  })}
                </div>
                <span className="faint">{d.slice(8)}</span>
              </div>
            );
          })}
        </div>
        <div className="usage-legend">
          {real.map((p) => {
            const u = usage?.byProvider[p.id];
            const l = usage?.limits.find((x) => x.provider === p.id);
            return (
              <div key={p.id} className="row" style={{ gap: 10 }}>
                <span className={`legend-dot seg-${p.id}`} />
                <b style={{ minWidth: 70 }}>{p.name}</b>
                <span className="small muted grow">
                  {u ? t('usage.line', { today: u.today.runs, tokensToday: fmtTokens(u.today.input + u.today.output), month: fmtTokens(u.input + u.output) }) : t('usage.none')}
                </span>
                {l && <span className="badge danger">{t('picker.limited')}{l.until ? ` · ${t('picker.resets', { time: formatTime(l.until, false) })}` : ''}</span>}
              </div>
            );
          })}
        </div>
        <p className="small faint" style={{ margin: '12px 0 0' }}>{t('usage.note')}</p>
      </div>

      <div className="card">
        <Field label={t('usage.onLimit')} hint={t('usage.onLimitHint')}>
          <Segmented
            value={status?.settings.onLimit ?? 'ask'}
            onChange={(onLimit) => saveSettings({ onLimit })}
            options={[
              { value: 'ask', label: t('usage.ask') },
              { value: 'switch', label: t('usage.switch') },
            ]}
          />
        </Field>
      </div>
    </div>
  );
}

function Devices({ isComputer, status }: { isComputer: boolean; status: Status }) {
  const t = useT();
  const { data: devices } = useData<Device[]>('/api/devices');
  const [pair, setPair] = useState<{ code: string; urls: string[]; expiresAt: string } | null>(null);
  const [qr, setQr] = useState('');

  const start = async () => {
    const p = await api('/api/pair/start', { method: 'POST' });
    setPair(p);
    setQr(p.urls[0] ? await QRCode.toDataURL(p.urls[0], { margin: 0, width: 220, color: { dark: '#0b0a12', light: '#ffffff' } }) : '');
  };
  useEffect(() => {
    if (!pair) return;
    const id = setTimeout(() => setPair(null), new Date(pair.expiresAt).getTime() - Date.now());
    return () => clearTimeout(id);
  }, [pair]);

  const revoke = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return;
    setCached<Device[]>('/api/devices', (l) => (l ?? []).filter((d) => d.id !== id));
    await api(`/api/devices/${id}`, { method: 'DELETE' });
    invalidate('/api/devices');
  };

  if (!isComputer)
    return (
      <div style={{ display: 'grid', gap: 16 }}>
      {isNativeApp && (
        <div className="card row">
          <Server />
          <div className="grow">
            <b>{t('app.server')}</b>
            <div className="small muted mono truncate">{location.origin}</div>
          </div>
          <button className="btn" onClick={() => toStartPage('pick')}>{t('app.changeServer')}</button>
        </div>
      )}
      <NotificationsCard />
      <div className="card row">
        <Smartphone />
        <div className="grow">{t('settings.thisDevice', { name: status.you.name ?? '' })}</div>
        <button
          className="btn danger"
          onClick={() => {
            forgetToken();
            location.reload();
          }}
        >
          <Unplug />
          {t('settings.disconnectThis')}
        </button>
      </div>
      </div>
    );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <NotificationsCard />
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <h3>{t('settings.pair')}</h3>
            <p className="muted small" style={{ margin: '4px 0 0' }}>{t('settings.pairLead')}</p>
          </div>
          {!pair && <button className="btn primary" onClick={start}><Smartphone />{t('settings.pair')}</button>}
        </div>
        <AnimatePresence>
          {pair && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
              <div className="row" style={{ gap: 24, marginTop: 18, flexWrap: 'wrap' }}>
                {qr && <motion.div className="qr" initial={{ scale: 0.8, rotate: -4 }} animate={{ scale: 1, rotate: 0 }} transition={spring}><img src={qr} width={180} height={180} alt="QR" /></motion.div>}
                <div style={{ display: 'grid', gap: 8 }}>
                  <span className="small muted">{t('settings.pairCode')}</span>
                  <div className="code-big">{pair.code}</div>
                  <span className="small faint">{t('settings.pairValid')}</span>
                  {pair.urls.map((u) => <span key={u} className="small mono muted">{u}</span>)}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="list">
        {devices && !devices.length && <p className="muted">{t('settings.noDevices')}</p>}
        <AnimatePresence initial={false}>
          {(devices ?? []).map((d, i) => (
            <motion.div key={d.id} layout className="list-row" {...stagger(i)}>
              <Smartphone size={18} />
              <div className="grow">
                <b>{d.name}</b>
                <div className="small faint">{t('settings.pairedAgo', { time: ago(d.pairedAt) })}{d.lastSeen ? ` · ${t('settings.lastSeen', { time: ago(d.lastSeen) })}` : ''}</div>
              </div>
              <button className="btn sm" onClick={() => revoke(d.id)}>{t('settings.revoke')}</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DataTab({ status }: { status: Status }) {
  const t = useT();
  const open = (p: string) => navigator.clipboard?.writeText(p).then(() => toast(t('common.copied'), 'ok'));
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card row">
        <div className="grow">
          <b>{t('settings.learning')}</b>
          <div className="small muted">{t('settings.learningHint')}</div>
        </div>
        <Switch on={status.settings.learning} onChange={(learning) => saveSettings({ learning })} />
      </div>
      <div className="card row">
        <div className="grow">
          <b>{t('settings.usageStats')}</b>
          <div className="small muted">{t('settings.usageStatsHint')}</div>
        </div>
        <Switch on={status.settings.usageStats !== false} onChange={(usageStats) => saveSettings({ usageStats })} />
      </div>
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        {[
          { label: t('settings.dataPath'), path: status.paths.data },
          { label: t('settings.projectsPath'), path: status.paths.projects },
        ].map((x) => (
          <div key={x.label} className="row">
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small muted">{x.label}</div>
              <div className="mono truncate">{x.path}</div>
            </div>
            <button className="btn sm" onClick={() => open(x.path)}>{t('common.copy')}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function About({ status }: { status: Status }) {
  const t = useT();
  return (
    <div style={{ display: 'grid', gap: 16 }}>
    <motion.div className="card" style={{ textAlign: 'center', padding: 36 }} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <div style={{ display: 'inline-block', filter: 'drop-shadow(0 16px 40px rgba(124,92,255,.45))' }}>
        <Logo size={72} animated />
      </div>
      <h2 style={{ margin: '14px 0 4px' }}>ALTTER</h2>
      <div className="muted">{t('settings.version', { v: status.version })}</div>
      <div className="faint small" style={{ marginTop: 4 }}>{t('settings.openSource')}</div>
      <a className="btn" style={{ marginTop: 18 }} href="https://github.com/QWTR/alter" target="_blank" rel="noreferrer">
        <ExternalLink />
        GitHub
      </a>
    </motion.div>
    {status.you.kind === 'computer' && <MyReports />}
    </div>
  );
}
