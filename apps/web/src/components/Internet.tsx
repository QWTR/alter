// Settings → Internet: reach this ALTTER from anywhere under an https address (quick link, your own VPS, or Cloudflare).
import { AnimatePresence, motion } from 'motion/react';
import { Check, Cloud, Copy, Download, Globe, Loader2, Plug, Power, Server, Zap } from 'lucide-react';
import { useState } from 'react';
import { api, invalidate, useData } from '../api';
import { useT } from '../i18n';
import { Field, Segmented, Switch, toast } from './ui';

type Mode = 'quick' | 'relay' | 'cloudflare';
interface Remote {
  mode: Mode; auto: boolean; relayUrl: string; cfHostname: string; hasRelayKey: boolean; hasCfToken: boolean;
  status: { running: boolean; url: string | null; error?: string; stage?: string };
}

export function InternetCard() {
  const t = useT();
  const { data } = useData<Remote>('/api/remote', 4000);
  const [busy, setBusy] = useState(false);
  const [host, setHost] = useState('');
  const [relayUrl, setRelayUrl] = useState<string | null>(null);
  const [relayKey, setRelayKey] = useState('');
  const [cfHost, setCfHost] = useState<string | null>(null);
  const [cfToken, setCfToken] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  if (!data) return <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>;

  const st = data.status;
  const save = async (patch: Record<string, unknown>) => {
    await api('/api/remote', { method: 'PUT', body: patch });
    invalidate('/api/remote');
  };
  const connect = async () => {
    setBusy(true);
    setErr('');
    try {
      if (data.mode === 'relay' && (relayUrl !== null || relayKey)) await save({ relayUrl: relayUrl ?? undefined, relayKey: relayKey || undefined });
      if (data.mode === 'cloudflare' && (cfHost !== null || cfToken)) await save({ cfHostname: cfHost ?? undefined, cfToken: cfToken || undefined });
      const r = await api<{ url: string | null; error?: string }>('/api/tunnel', { method: 'POST' });
      if (!r.url) setErr(r.error ?? 'error');
      invalidate('/api/remote');
      invalidate('/api/tunnel');
      invalidate('/api/status');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    await api('/api/tunnel', { method: 'DELETE' });
    invalidate('/api/remote');
    invalidate('/api/tunnel');
  };
  const downloadScript = async () => {
    try {
      const r = await api<{ url: string; script: string }>('/api/remote/vps', { method: 'POST', body: { host } });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r.script], { type: 'text/plain' }));
      a.download = 'alter-relay-setup.ps1';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setRelayUrl(r.url);
      invalidate('/api/remote');
      toast(t('net.scriptReady'), 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const copy = () => st.url && navigator.clipboard?.writeText(st.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); });
  const errText = err === 'missing' ? t('net.err.missing') : err === 'download' ? t('net.err.download') : err === 'key' ? t('net.err.key') : err === 'offline' ? t('net.err.offline') : err === 'config' ? t('net.err.config') : err ? t('net.err.other', { e: err }) : '';

  return (
    <div className="card net-card">
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className={`net-orb${st.url ? ' on' : st.running ? ' wait' : ''}`}><Globe /></div>
        <div className="grow">
          <h3>{t('net.title')}</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>{t('net.lead')}</p>
        </div>
      </div>

      <AnimatePresence>
        {st.url && (
          <motion.div className="net-live" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <span className="dot-live" />
            <code className="truncate grow">{st.url}</code>
            <button className="btn ghost icon sm" onClick={copy} title={t('common.copy')}>{copied ? <Check /> : <Copy />}</button>
            <button className="btn sm" onClick={disconnect}><Power />{t('net.disconnect')}</button>
          </motion.div>
        )}
      </AnimatePresence>

      <Segmented<Mode>
        value={data.mode}
        onChange={(m) => save({ mode: m })}
        options={[
          { value: 'quick', label: t('net.mode.quick'), icon: Zap },
          { value: 'relay', label: t('net.mode.relay'), icon: Server },
          { value: 'cloudflare', label: t('net.mode.cloudflare'), icon: Cloud },
        ]}
      />

      <AnimatePresence mode="wait">
        <motion.div key={data.mode} className="net-body" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
          {data.mode === 'quick' && <p className="small muted">{t('net.quick.lead')}</p>}
          {data.mode === 'relay' && (
            <>
              <p className="small muted">{t('net.relay.lead')}</p>
              <ol className="net-steps">
                <li>
                  <span>{t('net.relay.s1')}</span>
                  <div className="row" style={{ gap: 8 }}>
                    <input className="input grow" placeholder="203.0.113.7 / alter.mojadomena.pl" value={host} onChange={(e) => setHost(e.target.value)} />
                    <button className="btn" disabled={!host.trim()} onClick={downloadScript}><Download />{t('net.relay.download')}</button>
                  </div>
                </li>
                <li><span>{t('net.relay.s2')}</span></li>
                <li><span>{t('net.relay.s3')}</span></li>
              </ol>
              <div className="net-grid">
                <Field label={t('net.relay.url')}>
                  <input className="input" placeholder="https://1-2-3-4.sslip.io" value={relayUrl ?? data.relayUrl} onChange={(e) => setRelayUrl(e.target.value)} />
                </Field>
                <Field label={t('net.relay.key')}>
                  <input className="input" type="password" placeholder={data.hasRelayKey ? '••••••••  ' + t('net.saved') : ''} value={relayKey} onChange={(e) => setRelayKey(e.target.value)} />
                </Field>
              </div>
            </>
          )}
          {data.mode === 'cloudflare' && (
            <>
              <p className="small muted">{t('net.cf.lead')}</p>
              <div className="net-grid">
                <Field label={t('net.cf.host')}>
                  <input className="input" placeholder="alter.mojadomena.pl" value={cfHost ?? data.cfHostname} onChange={(e) => setCfHost(e.target.value)} />
                </Field>
                <Field label={t('net.cf.token')}>
                  <input className="input" type="password" placeholder={data.hasCfToken ? '••••••••  ' + t('net.saved') : 'eyJh…'} value={cfToken} onChange={(e) => setCfToken(e.target.value)} />
                </Field>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {errText && <div className="net-err small">{errText}</div>}

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div className="row small" style={{ gap: 8 }}>
          <Switch on={data.auto} onChange={(v) => save({ auto: v })} label={t('net.auto')} />
          <span style={{ cursor: 'pointer' }} onClick={() => save({ auto: !data.auto })}>{t('net.auto')}</span>
        </div>
        {!st.url && (
          <button className="btn primary" disabled={busy || (st.running && !st.error)} onClick={connect}>
            {busy || (st.running && !st.error) ? <Loader2 className="spin" /> : <Plug />}
            {busy || st.running ? (st.stage === 'download' ? t('net.downloading') : t('net.connecting')) : t('net.connect')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Settings → Internet: a whole ALTTER on your own Windows VPS, on 24/7 (watches projects, pushes to the phone). */
export function ServerCard() {
  const t = useT();
  const { data } = useData<{ ready: boolean }>('/api/server/package');
  const [host, setHost] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const download = async () => {
    setBusy(true);
    try {
      const r = await api<{ url: string; script: string }>('/api/server/package', { method: 'POST', body: { host } });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r.script], { type: 'text/plain' }));
      a.download = 'altter-server-setup.ps1';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setUrl(r.url);
      toast(t('srv.ready'), 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  if (data && !data.ready) return null;
  return (
    <motion.div className="card net-card srv-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className="net-orb srv-orb"><Server /></div>
        <div className="grow">
          <h3>{t('srv.title')}</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>{t('srv.lead')}</p>
        </div>
      </div>
      <ol className="net-steps">
        <li>
          <span>{t('srv.s1')}</span>
          <div className="row" style={{ gap: 8 }}>
            <input className="input grow" placeholder={t('srv.hostPh')} value={host} onChange={(e) => setHost(e.target.value)} />
            <button className="btn primary" disabled={busy} onClick={download}>{busy ? <Loader2 className="spin" /> : <Download />}{t('srv.download')}</button>
          </div>
        </li>
        <li><span>{t('srv.s2')}</span></li>
        <li><span>{t('srv.s3')}</span></li>
        <li><span>{t('srv.s4')}</span></li>
      </ol>
      {url && <div className="net-live"><span className="dot-live" /><code className="truncate grow">{url}</code></div>}
      <p className="faint small" style={{ margin: 0 }}>{t('srv.note')}</p>
    </motion.div>
  );
}
