// Connect a built-in service with a key (ElevenLabs, Higgsfield, fal.ai…): the steps to get the key,
// a button that opens the right page, the fields, and a save that checks the key with the service.
// Used in Settings → Plugins and inline in the chat when ALTTER asks for it ([[altter:connect:<id>]]).
import { Check, ExternalLink, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { api, invalidate, useData } from '../api';
import { useT, type Key } from '../i18n';
import { Field, toast } from './ui';

export interface ConnectEntry {
  id: string; title: string; icon: string; color: string; homepage: string; keyUrl?: string; steps?: string[];
  keys?: { name: string; label: string; help?: string }[];
}

/** Step i of a plugin's "how to get the key", translated when the UI has it. */
export function useSteps(entry: ConnectEntry): string[] {
  const t = useT();
  return (entry.steps ?? []).map((s, i) => {
    const k = `plugins.steps.${entry.id}.${i + 1}` as Key;
    const v = t(k);
    return v === k ? s : v;
  });
}

export function ConnectKeyForm({ entry, onDone, compact }: { entry: ConnectEntry; onDone?: () => void; compact?: boolean }) {
  const t = useT();
  const steps = useSteps(entry);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/plugins', { method: 'POST', body: { catalogId: entry.id, keys: vals } });
      toast(t('plugins.installed', { name: entry.title }), 'ok');
      invalidate('/api/plugins');
      onDone?.();
    } catch (e) {
      const msg = (e as Error).message;
      setError(/not accepted/i.test(msg) ? t('plugins.keyRejected', { name: entry.title }) : t('plugins.keyError', { msg }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`connect-form${compact ? ' compact' : ''}`}>
      {steps.length > 0 && (
        <ol className="connect-steps">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
      {entry.keyUrl && (
        <a className="btn sm" href={entry.keyUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('plugins.openKeyPage', { name: entry.title })}</a>
      )}
      {entry.keys?.map((k) => (
        <Field key={k.name} label={k.label} hint={k.help}>
          <input className="input" type="password" autoComplete="off" spellCheck={false} value={vals[k.name] ?? ''} onChange={(e) => { setError(''); setVals((v) => ({ ...v, [k.name]: e.target.value.trim() })); }} onKeyDown={(e) => { if (e.key === 'Enter' && !entry.keys?.some((x) => !vals[x.name]?.trim())) void save(); }} />
        </Field>
      ))}
      {error ? <p className="small connect-error" role="alert">{error}</p> : <p className="small faint" style={{ margin: '2px 0 0' }}>{t('plugins.keysText')}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button className="btn primary sm" disabled={busy || entry.keys?.some((k) => !vals[k.name]?.trim())} onClick={save}>{busy ? <span className="spinner" /> : <KeyRound size={14} />}{t('plugins.connect')}</button>
      </div>
    </div>
  );
}

/** In the chat: ALTTER asked for a service (a voice-over needs ElevenLabs…). Connect it here, then continue. */
export function ConnectCard({ id, onContinue }: { id: string; onContinue?: (text: string) => void }) {
  const t = useT();
  const { data } = useData<{ installed: { catalogId?: string; enabled: boolean }[]; catalog: ConnectEntry[] }>('/api/plugins', 6000);
  const [done, setDone] = useState(false);
  const entry = data?.catalog.find((c) => c.id === id);
  if (!data || !entry) return null;
  const have = done || data.installed.some((p) => p.catalogId === id && p.enabled);
  return (
    <div className="connect-card">
      <div className="row" style={{ gap: 10 }}>
        <span className="connect-ic" style={{ color: entry.color, background: `color-mix(in srgb, ${entry.color} 16%, transparent)` }}><KeyRound size={16} /></span>
        <b className="grow">{have ? t('plugins.connectedName', { name: entry.title }) : t('plugins.connectName', { name: entry.title })}</b>
        {have && <Check size={16} className="ok-ic" />}
      </div>
      {have ? (
        onContinue && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn primary sm" onClick={() => onContinue(t('plugins.continueMsg', { name: entry.title }))}>{t('plugins.continue')}</button></div>
      ) : (
        <ConnectKeyForm entry={entry} compact onDone={() => { setDone(true); if (onContinue) onContinue(t('plugins.continueMsg', { name: entry.title })); }} />
      )}
    </div>
  );
}
