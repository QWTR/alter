// "Join someone": open another person's shared ALTTER chat inside this app (desktop window / phone app),
// from a pasted link or by scanning the QR code in their Share popover. No browser needed.
import { ScanLine, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useData, type Status } from '../api';
import { useT } from '../i18n';
import { isNativeApp } from '../native';
import { navigate } from '../router';
import { QrScanner, canScanQr } from './QrScanner';
import { Field, Modal, ModalHead } from './ui';

declare global { interface Window { alterDesktop?: { openSession?: (url: string) => void } } }

/** A share link is "<host>/#/s/<token>" (http on the same Wi‑Fi, https through the internet). */
export function parseShareLink(text: string): string | null {
  const raw = text.trim().match(/https?:\/\/\S+/i)?.[0] ?? text.trim();
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !/^#\/[sw]\/[\w-]{10,}/.test(u.hash)) return null;
  return `${u.origin}/${u.hash}`;
}

/** Opens the shared chat in this app: its own window on the computer, in place in the phone app.
 *  `name` (your name in ALTTER) goes along, so the others see who joined without typing it. */
/** Workspaces you joined from this ALTTER (their invite link), shown in the sidebar and on Home. */
export interface Joined { url: string; name: string; at: number }
export function joinedWorkspaces(): Joined[] {
  try { return JSON.parse(localStorage.getItem('altter.joined') ?? '[]'); } catch { return []; }
}
export function forgetWorkspace(url: string) {
  try { localStorage.setItem('altter.joined', JSON.stringify(joinedWorkspaces().filter((j) => j.url !== url))); } catch {}
}
function rememberWorkspace(u: URL) {
  const m = u.hash.match(/^#\/w\/([\w-]{10,})(?:\/(.*))?/);
  if (!m) return;
  const url = `${u.origin}/#/w/${m[1]}`;
  let name = u.host;
  try { if (m[2]) name = decodeURIComponent(m[2]); } catch {}
  try { localStorage.setItem('altter.joined', JSON.stringify([{ url, name, at: Date.now() }, ...joinedWorkspaces().filter((j) => j.url !== url)].slice(0, 12))); } catch {}
}

export function openSession(link: string, name?: string) {
  const u = new URL(link);
  rememberWorkspace(u);
  const url = `${u.origin}/${name?.trim() ? `?as=${encodeURIComponent(name.trim().slice(0, 40))}` : ''}${u.hash}`;
  if (isNativeApp) return location.assign(url); // the phone app's guest view has a "back to my ALTTER" button
  // computer (app or browser): inside this window, next to your own sidebar — never a second window
  navigate(`/visit?u=${encodeURIComponent(url)}`);
}

export function JoinButton({ className = 'btn', label = true }: { className?: string; label?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title={t('join.title')}><UserPlus size={15} />{label && t('join.button')}</button>
      <JoinModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function JoinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [scan, setScan] = useState(false);
  const { data: status } = useData<Status>('/api/status');
  const go = (value: string) => {
    const url = parseShareLink(value);
    if (!url) { setErr(t('join.bad')); return false; }
    setErr('');
    setText('');
    onClose();
    openSession(url, status?.settings.userName);
    return true;
  };
  const scanned = (v: string) => {
    if (!parseShareLink(v)) return false; // not a share code: the scanner flashes and keeps looking
    setScan(false);
    go(v);
    return true;
  };
  return (
    <>
      <Modal open={open} onClose={onClose}>
        <ModalHead icon={<UserPlus />} title={t('join.title')} text={t('join.lead')} onClose={onClose} />
        <form onSubmit={(e) => { e.preventDefault(); go(text); }}>
          <Field label={t('join.link')}>
            <input className="input" autoFocus={!isNativeApp} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://…/#/w/…" value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} />
          </Field>
          {err && <p className="small" style={{ color: 'var(--danger, #e66767)', margin: '-4px 0 8px' }}>{err}</p>}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
            {canScanQr() && <button type="button" className="btn" onClick={() => setScan(true)}><ScanLine size={15} />{t('join.scan')}</button>}
            <span className="grow" />
            <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
            <button className="btn primary" disabled={!text.trim()}>{t('join.open')}</button>
          </div>
        </form>
      </Modal>
      <QrScanner open={scan} onClose={() => setScan(false)} onResult={scanned} hint={t('join.scanHint')} />
    </>
  );
}
