// "Report a problem": the user writes what went wrong, sees exactly what is sent (scrubbed of tokens, paths and
// emails), and the ALTTER repair server triages it, fixes it with AI and ships an update. Also lists my reports.
import { Bug, CheckCircle2, ChevronDown, Clock, HelpCircle, Image as ImageIcon, ImagePlus, Lightbulb, MessageCircle, Palette, Paperclip, Send, X, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, invalidate, useData, type Status } from '../api';
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

const MAX_IMAGES = 4;
/** A screenshot made smaller before it is sent: max 1600 px, JPEG (PNG stays PNG when small, so text stays sharp). */
async function shrink(file: File): Promise<string | null> {
  if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const png = file.type === 'image/png' && file.size < 900_000 && k === 1 ? c.toDataURL('image/png') : '';
    return png || c.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  const [images, setImages] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const body = () => ({ kind, text, includeTech: tech, route: location.hash, screen: `${innerWidth}x${innerHeight}`, clientErrors, images });
  const addFiles = async (files: Iterable<File>) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    const out = (await Promise.all(list.map(shrink))).filter((x): x is string => !!x);
    setImages((cur) => {
      const next = [...cur, ...out].slice(0, MAX_IMAGES);
      if (cur.length + out.length > MAX_IMAGES) toast(t('rep.imgMax', { n: MAX_IMAGES }), 'info');
      return next;
    });
  };

  useEffect(() => {
    if (!open || !showPreview) return;
    const id = setTimeout(() => api('/api/report/preview', { method: 'POST', body: body() }).then(setPreview).catch(() => {}), 250);
    return () => clearTimeout(id);
  }, [open, showPreview, kind, text, tech, images.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setBusy(true);
    try {
      await api('/api/report', { method: 'POST', body: body() });
      // the list must show it at once, and the AI usually asks within a minute: check often for a few minutes
      fastUntil = Date.now() + 5 * 60_000;
      invalidate('/api/reports');
      toast(t('rep.sent'), 'ok');
      setText('');
      setImages([]);
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
      <div
        className={`rep-body${drag ? ' drag' : ''}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
      >
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
        <textarea className="input" rows={6} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t(`rep.ph.${kind}`)} style={{ resize: 'vertical' }}
          onPaste={(e) => {
            const files = [...e.clipboardData.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((f): f is File => !!f);
            if (files.length) { e.preventDefault(); void addFiles(files); }
          }}
        />
        <div className="rep-imgs">
          {images.map((src, i) => (
            <div key={i} className="rep-img">
              <img src={src} alt="" />
              <button type="button" className="rep-img-x" onClick={() => setImages((l) => l.filter((_, j) => j !== i))} aria-label={t('common.delete')}><X /></button>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <button type="button" className="rep-img-add" onClick={() => fileRef.current?.click()}>
              <ImagePlus />
              <span>{t('rep.addImg')}</span>
              <small>{t('rep.imgHint')}</small>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
        </div>
        {images.length > 0 && <p className="faint small" style={{ margin: 0 }}>{t('rep.imgPrivacy')}</p>}
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
  needs_info: { icon: HelpCircle, tone: 'warn' },
};

interface Msg { from: 'ai' | 'team' | 'user'; text: string; at: string; images?: number }
type Rep = Sent & { messages?: Msg[] };
/** The last message is a question nobody answered yet. */
const waiting = (r: Rep) => r.status === 'needs_info' && r.messages?.length && r.messages[r.messages.length - 1].from !== 'user';
/** While the fix is being made or shipped there is nothing to add; otherwise the reporter can always write more. */
const canWrite = (r: Rep) => !['fixing', 'review', 'merged', 'released'].includes(r.status ?? '');

function Thread({ r, onSent }: { r: Rep; onSent: () => void }) {
  const t = useT() as unknown as (k: string, v?: Record<string, unknown>) => string;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addFiles = async (files: Iterable<File>) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    const out = (await Promise.all(list.map(shrink))).filter((x): x is string => !!x);
    setImages((cur) => {
      if (cur.length + out.length > MAX_IMAGES) toast(t('rep.imgMax', { n: MAX_IMAGES }), 'info');
      return [...cur, ...out].slice(0, MAX_IMAGES);
    });
  };
  const send = async () => {
    setBusy(true);
    try {
      await api('/api/reports/reply', { method: 'POST', body: { id: r.id, text, images } });
      setText('');
      setImages([]);
      fastUntil = Date.now() + 5 * 60_000;
      toast(t('rep.replied'), 'ok');
      onSent();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rep-thread">
      {(r.messages ?? []).map((m, i) => (
        <div key={i} className={`rep-msg ${m.from}`}>
          <div className="rep-msg-who">{t(`rep.from.${m.from}`)} · {ago(m.at)}</div>
          {m.text && <div className="rep-msg-text">{m.text}</div>}
          {!!m.images && <div className="rep-msg-imgs"><ImageIcon /> {t('rep.imgCount', { n: m.images })}</div>}
        </div>
      ))}
      {canWrite(r) && (
        <div
          className={`rep-answer${drag ? ' drag' : ''}`}
          onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDrag(true); } }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
        >
          <textarea
            className="input"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={waiting(r) ? t('rep.answerPh') : t('rep.morePh')}
            onPaste={(e) => {
              const files = [...e.clipboardData.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((f): f is File => !!f);
              if (files.length) { e.preventDefault(); void addFiles(files); }
            }}
          />
          {images.length > 0 && (
            <div className="rep-imgs">
              {images.map((src, i) => (
                <div key={i} className="rep-img">
                  <img src={src} alt="" />
                  <button type="button" className="rep-img-x" onClick={() => setImages((l) => l.filter((_, j) => j !== i))} aria-label={t('common.delete')}><X /></button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()} disabled={images.length >= MAX_IMAGES} title={t('rep.imgHint')}>
              <Paperclip />
              {t('rep.attach')}
            </button>
            <span className="faint small grow rep-paste-hint">{t('rep.pasteHint')}</span>
            <button className="btn primary sm" disabled={busy || (text.trim().length < 2 && !images.length)} onClick={send}>
              {busy ? <span className="spinner" /> : <Send />}
              {t('rep.answer')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** After a report is sent, its status is checked every 20 s for a while (triage and questions come quickly). */
let fastUntil = 0;
let lastCheck = Date.now();
function useReportsPoll(slowMs: number) {
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() < fastUntil || Date.now() - lastCheck >= slowMs) {
        lastCheck = Date.now();
        invalidate('/api/reports');
      }
    }, 20_000);
    return () => clearInterval(id);
  }, [slowMs]);
}

/** "My reports" — what happened to what I sent (fixed in 0.15.2, a question from the AI, waiting for review, …). */
export function MyReports() {
  const t = useT() as unknown as (k: string, v?: Record<string, unknown>) => string;
  const { data } = useData<{ reports: Rep[] }>('/api/reports', 30_000);
  const reload = () => invalidate('/api/reports');
  useReportsPoll(60_000);
  const list = data?.reports ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const asking = list.find(waiting)?.id;
  useEffect(() => {
    if (asking) setOpen(asking);
  }, [asking]);
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
            const n = r.messages?.length ?? 0;
            const isOpen = open === r.id;
            return (
              <div key={r.id} className={`rep-item${waiting(r) ? ' ask' : ''}`}>
                <Icon className={`rep-ico ${s.tone}`} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <button type="button" className="rep-head" onClick={() => setOpen(isOpen ? null : r.id)} disabled={!n && !canWrite(r)}>
                    <div className="rep-title">{r.title}</div>
                    <div className="faint small">
                      {t(`rep.st.${r.status ?? 'new'}`)}
                      {r.fixedIn ? ` · ${t('rep.fixedIn', { v: r.fixedIn })}` : ''} · {ago(r.at)}
                      {n > 0 && <> · <MessageCircle className="rep-mini" /> {n}</>}
                    </div>
                  </button>
                  {r.note && !isOpen && <div className="muted small">{r.note}</div>}
                  {isOpen && <Thread r={r} onSent={reload} />}
                </div>
                {(n > 0 || canWrite(r)) && <ChevronDown className="rep-chev" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A small card when the repair server asks something about my report — answer right there. */
export function ReportQuestions() {
  const { data: status } = useData<Status>('/api/status', 15_000);
  return status?.you.kind === 'computer' ? <QuestionCard /> : null;
}
function QuestionCard() {
  const t = useT() as unknown as (k: string, v?: Record<string, unknown>) => string;
  const { data } = useData<{ reports: Rep[] }>('/api/reports', 5 * 60_000);
  const reload = () => invalidate('/api/reports');
  useReportsPoll(5 * 60_000);
  const [hidden, setHidden] = useState<string>(() => { try { return localStorage.getItem('alter.repAsk') ?? ''; } catch { return ''; } });
  // on Settings → About the reports list is on screen and answers right there
  const [onAbout, setOnAbout] = useState(() => /settings.*tab=about/.test(location.hash));
  useEffect(() => {
    const on = () => setOnAbout(/settings.*tab=about/.test(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const q = (data?.reports ?? []).find((r) => waiting(r) && `${r.id}:${r.messages!.length}` !== hidden);
  if (!q || onAbout) return null;
  const hide = () => {
    const k = `${q.id}:${q.messages!.length}`;
    setHidden(k);
    try { localStorage.setItem('alter.repAsk', k); } catch {}
  };
  return (
    <div className="rep-ask-card" role="dialog" aria-label={t('rep.askTitle')}>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <HelpCircle className="rep-ico warn" />
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{t('rep.askTitle')}</b>
          <div className="faint small rep-title">{q.title}</div>
        </div>
        <button className="btn ghost sm icon" onClick={hide} aria-label={t('common.close')}><X /></button>
      </div>
      <Thread r={q} onSent={() => { reload(); }} />
    </div>
  );
}
