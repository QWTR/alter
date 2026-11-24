// Someone else's ALTTER (a workspace or a shared chat you joined), shown inside this window next to your own
// sidebar — never a second window. The page runs in a sandboxed frame from its own origin, so it cannot touch
// this app; it stays loaded while you look at other screens, so coming back is instant.
import { ArrowLeft, ExternalLink, RotateCw, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { navigate } from '../router';
import { joinedWorkspaces } from './Join';

/** Only http(s) pages with a share / workspace hash are opened here. */
function safe(u: string | null): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return /^https?:$/.test(x.protocol) && /^#\/[sw]\/[\w-]{10,}/.test(x.hash) ? x.href : null;
  } catch {
    return null;
  }
}
/** One frame per place (origin + workspace/chat), whatever name the link carried. */
const keyOf = (u: string) => { const x = new URL(u); return x.origin + '/' + x.hash.split('/').slice(0, 3).join('/'); };

export function VisitHost({ active }: { active: string | null }) {
  const t = useT();
  const url = safe(active);
  const [open, setOpen] = useState<{ key: string; url: string; n: number }[]>([]);
  useEffect(() => {
    if (!url) return;
    const k = keyOf(url);
    setOpen((l) => (l.some((x) => x.key === k) ? l : [...l, { key: k, url, n: 0 }].slice(-4)));
  }, [url]);
  if (!open.length && !url) return null;
  const cur = url ? keyOf(url) : null;
  const shown = open.find((x) => x.key === cur);
  const host = url ? new URL(url).host : '';
  const name = url ? joinedWorkspaces().find((j) => keyOf(j.url) === cur)?.name ?? host : '';
  const close = () => {
    setOpen((l) => l.filter((x) => x.key !== cur));
    navigate('/workspace');
  };
  return (
    <div className="visit" style={url ? undefined : { display: 'none' }}>
      {url && (
        <div className="visit-bar">
          <button className="btn ghost icon sm" onClick={() => navigate('/workspace')} title={t('ws.leave')}><ArrowLeft size={16} /></button>
          <span className="visit-ic"><Users size={14} /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="truncate">{name}</b>
            <span className="small faint truncate">{host}</span>
          </div>
          <button className="btn ghost icon sm" title={t('visit.reload')} onClick={() => setOpen((l) => l.map((x) => (x.key === cur ? { ...x, n: x.n + 1 } : x)))}><RotateCw size={15} /></button>
          <a className="btn ghost icon sm" href={url} target="_blank" rel="noreferrer" title={t('visit.browser')}><ExternalLink size={15} /></a>
          <button className="btn ghost icon sm" onClick={close} title={t('common.close')}><X size={16} /></button>
        </div>
      )}
      {open.map((x) => (
        <iframe
          key={x.key + ':' + x.n}
          className="visit-frame"
          src={x.url}
          title={x.key}
          style={x === shown ? undefined : { display: 'none' }}
          allow="clipboard-read; clipboard-write; microphone; camera; fullscreen; autoplay"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
        />
      ))}
    </div>
  );
}
