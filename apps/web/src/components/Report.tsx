// "Report a problem": the user writes what went wrong, sees exactly what is sent (scrubbed of tokens, paths and
// emails), and the ALTTER repair server triages it, fixes it with AI and ships an update. Also lists my reports.
import { Bug, CheckCircle2, ChevronDown, Clock, Lightbulb, MessageCircle, Palette, Send, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, useData } from '../api';
import { ago, useT } from '../i18n';
import { Modal, ModalHead, Segmented, Switch, toast } from './ui';

// errors in this page — attached (scrubbed by the core) when the user sends a report
const clientErrors: string[] = [];
const keep = (s: string) => {
  clientErrors.push(`${new Date().toISOString().slice(11, 19)} ${s}`.slice(0, 500));
  if (clientErrors.length > 20) clientErrors.shift();
};
window.addEventListener('error', (e) => keep(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => keep(`unhandled: ${(e.reason as Error)?.message ?? String(e.reason)}`));

/** Opens the report window from anywhere: window.dispatchEvent(new Event('alter:report')). */
export const openReport = () => window.dispatchEvent(new Event('alter:report'));

type Kind = 'bug' | 'ui' | 'idea' | 'other';
interface Sent { id: string; kind: Kind; title: string; at: string; status?: string; fixedIn?: string | null; note?: string }

export function ReportHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener('alter:report', on);
    return () => window.removeEventListener('alter:report', on);
  }, []);
  return <ReportModal open={open} onClose={() => setOpen(false)} />;
}

function ReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT() as unknown as (k: string, v?: Record<string, unknown>) => string;
  const [kind, setKind] = useState<Kind>('bug');
  const [text, setText] = useState('');
  const [tech, setTech] = useState(true);
  const [preview, setPreview] = useState<unknown>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const body = () => ({ kind, text, includeTech: tech, route: location.hash, screen: `${innerWidth}x${innerHeight}`, clientErrors });

  useEffect(() => {
    if (!open || !showPreview) return;
    const id = setTimeout(() => api('/api/report/preview', { method: 'POST', body: body() }).then(setPreview).catch(() => {}), 250);
    return () => clearTimeout(id);
  }, [open, showPreview, kind, text, tech]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setBusy(true);
    try {
      await api('/api/report', { method: 'POST', body: body() });
      toast(t('rep.sent'), 'ok');
      setText('');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalHead icon={<Bug />} title={t('rep.title')} text={t('rep.lead')} onClose={onClose} />
      <div style={{ display: 'grid', gap: 14 }}>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'bug', label: t('rep.k.bug'), icon: Bug },
            { value: 'ui', label: t('rep.k.ui'), icon: Palette },
            { value: 'idea', label: t('rep.k.idea'), icon: Lightbulb },
            { value: 'other', label: t('rep.k.other'), icon: MessageCircle },
          ]}
        />
        <textarea className="input" rows={6} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t(`rep.ph.${kind}`)} style={{ resize: 'vertical' }} />
        <div className="row" style={{ gap: 10 }}>
          <Switch on={tech} onChange={setTech} label={t('rep.tech')} />
          <span className="grow small">{t('rep.tech')}</span>
          <button type="button" className="btn ghost sm" onClick={() => setShowPreview((v) => !v)}>
            {t('rep.preview')}
            <ChevronDown style={{ transform: showPreview ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
          </button>
        </div>
        {showPreview && <pre className="rep-preview">{preview ? JSON.stringify(preview, null, 2) : '…'}</pre>}
        <p className="faint small" style={{ margin: 0 }}>{t('rep.privacy')}</p>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn primary" disabled={busy || text.trim().length < 8} onClick={send}>
          {busy ? <span className="spinner" /> : <Send />}
          {t('rep.send')}
        </button>
      </div>
    </Modal>
  );
}

const STATUS: Record<string, { icon: typeof Bug; tone: string }> = {
  released: { icon: CheckCircle2, tone: 'ok' },
  merged: { icon: CheckCircle2, tone: 'ok' },
  rejected: { icon: XCircle, tone: 'muted' },
  duplicate: { icon: XCircle, tone: 'muted' },
};

/** "My reports" — what happened to what I sent (fixed in 0.15.2, waiting for review, …). */
export function MyReports() {
  const t = useT() as unknown as (k: string, v?: Record<string, unknown>) => string;
  const { data } = useData<{ reports: Sent[] }>('/api/reports', 60_000);
  const list = data?.reports ?? [];
  return (
    <div className="card" style={{ textAlign: 'left' }}>
      <div className="row" style={{ marginBottom: list.length ? 12 : 0, gap: 12, flexWrap: 'wrap' }}>
        <div className="grow">
          <b>{t('rep.title')}</b>
          <div className="muted small">{t('rep.cardLead')}</div>
        </div>
        <button className="btn primary" onClick={openReport}><Bug />{t('rep.open')}</button>
      </div>
      {list.length > 0 && (
        <div className="rep-list">
          {list.map((r) => {
            const s = STATUS[r.status ?? ''] ?? { icon: Clock, tone: 'accent' };
            const Icon = s.icon;
            return (
              <div key={r.id} className="rep-item">
                <Icon className={`rep-ico ${s.tone}`} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="rep-title">{r.title}</div>
                  <div className="faint small">
                    {t(`rep.st.${r.status ?? 'new'}`)}
                    {r.fixedIn ? ` · ${t('rep.fixedIn', { v: r.fixedIn })}` : ''} · {ago(r.at)}
                  </div>
                  {r.note && <div className="muted small">{r.note}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
