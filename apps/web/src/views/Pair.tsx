import { motion } from 'motion/react';
import { ArrowRight, QrCode } from 'lucide-react';
import { useState } from 'react';
import { savePairedToken } from '../api';
import { QrScanner, canScanQr } from '../components/QrScanner';
import { Field, Logo, Toasts, softSpring, toast } from '../components/ui';
import { useT } from '../i18n';

export function PairView({ onPaired }: { onPaired: () => void }) {
  const t = useT();
  const [code, setCode] = useState(location.hash.match(/pair=(\d{6})/)?.[1] ?? '');
  const [name, setName] = useState(/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'My device');
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(false);

  const claim = async (c: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/pair/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c, name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      savePairedToken(data.token);
      history.replaceState(null, '', '/');
      onPaired();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void claim(code);
  };

  /** The QR on the computer holds its address + "#pair=123456": take the code and pair right away. */
  const scanned = (text: string) => {
    const c = text.match(/pair=(\d{6})/)?.[1] ?? (/^\d{6}$/.test(text.trim()) ? text.trim() : null);
    if (!c) return false;
    setScan(false);
    setCode(c);
    void claim(c);
    return true;
  };

  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 20 }}>
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} style={{ width: 'min(400px, 100%)', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', marginBottom: 20, filter: 'drop-shadow(0 16px 40px rgba(124,92,255,.45))' }}>
          <Logo size={76} animated />
        </div>
        <h1 style={{ fontSize: 26, margin: '0 0 8px', letterSpacing: '-0.02em' }}>{t('pair.title')}</h1>
        <p className="muted" style={{ margin: '0 0 24px' }}>{t('pair.lead')}</p>
        <div className="card" style={{ textAlign: 'left', padding: 22 }}>
          <Field label={t('pair.code')}>
            <input className="input mono" style={{ fontSize: 24, letterSpacing: '.4em', textAlign: 'center' }} inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
          </Field>
          <Field label={t('pair.name')}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button className="btn primary lg" style={{ width: '100%' }} disabled={busy || code.length !== 6}>
            {busy && <span className="spinner" />}
            {t('pair.connect')}
            <ArrowRight />
          </button>
          {canScanQr() && (
            <>
              <div className="pair-or"><span>{t('qr.or')}</span></div>
              <button type="button" className="btn lg" style={{ width: '100%' }} onClick={() => setScan(true)} disabled={busy}>
                <QrCode />
                {t('qr.scan')}
              </button>
            </>
          )}
        </div>
      </motion.form>
      <QrScanner open={scan} onClose={() => setScan(false)} onResult={scanned} hint={t('qr.pairHint')} />
      <Toasts />
    </div>
  );
}
