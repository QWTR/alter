// The live preview next to a chat: the page builds itself as the AI types it (via the preview kit inside the frame),
// a code ticker shows the lines being written, and elements can be picked and sent to the chat.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, Code2, ExternalLink, MousePointerClick, RotateCw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Draft, Preview } from '../api';
import { useT } from '../i18n';
import { softSpring } from './ui';

export interface Pick {
  id: string;
  selector: string;
  label: string;
  text: string;
  html: string;
  file: string;
}

interface Frame { k: number; src: string; shown: boolean }

/** Someone else in an online session, as the page shows them. */
export interface RemoteInPage { cid: string; name: string; color: string; cursor: { sel: string; fx: number; fy: number } | null; picks: string[] }

const baseName = (f: string) => f.split(/[\\/]/).pop() ?? f;

/** Tiny highlighter for the ticker (tags, attributes, strings, CSS punctuation). */
function hl(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(<\/?[\w-]+|\/?>)|("[^"]*"?|'[^']*'?)|([\w-:@]+)(?==)|(\/\*.*?(?:\*\/|$)|<!--.*?(?:-->|$))|([{}();:])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const cls = m[1] ? 'tk-tag' : m[2] ? 'tk-str' : m[3] ? 'tk-attr' : m[4] ? 'tk-com' : 'tk-pun';
    out.push(<span key={m.index} className={cls}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function LivePreview({
  preview, reloadKey, draft, busy, step, picking, picks, onPicking, onPick, onUnpick, onReload, onClose, remote = [], onPointer, onAsk,
}: {
  /** Phone: write what to change right under the page (the chat composer is hidden behind the full-screen preview). */
  onAsk?: (text: string) => void;
  remote?: RemoteInPage[];
  onPointer?: (p: { sel: string; fx: number; fy: number } | null) => void;
  preview: Preview;
  reloadKey: number;
  draft: Draft | null;
  busy: boolean;
  step: string;
  picking: boolean;
  picks: Pick[];
  onPicking: (on: boolean) => void;
  onPick: (p: Pick) => void;
  onUnpick: (id: string) => void;
  onReload: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [frames, setFrames] = useState<Frame[]>([]);
  const seq = useRef(0);
  const iframes = useRef(new Map<number, HTMLIFrameElement>());
  const ready = useRef(new Set<number>());
  const latest = useRef(new Map<string, Draft & { at: number }>());
  const [showCode, setShowCode] = useState(true);
  const cb = useRef({ onPick, onUnpick, onPicking, picking, onPointer, remote });
  cb.current = { onPick, onUnpick, onPicking, picking, onPointer, remote };
  const label = t('preview.writingTag');

  // a new frame per reload, faded in over the old one when it has loaded (no white flash)
  useEffect(() => {
    const k = ++seq.current;
    setFrames((f) => [...f.filter((x) => x.shown).slice(-1), { k, src: `${preview.url}?v=${reloadKey}`, shown: false }]);
  }, [preview.url, reloadKey]);
  const newest = frames[frames.length - 1]?.k;
  const win = () => (newest && ready.current.has(newest) ? iframes.current.get(newest)?.contentWindow : null) ?? null;

  const postDraft = (w: Window, d: Draft) => {
    if (d.kind === 'html') {
      if (d.url === preview.url) w.postMessage({ t: 'draft', html: d.content, done: d.done, label }, '*');
    } else w.postMessage({ t: 'css', name: baseName(d.file), css: d.content }, '*');
  };

  useEffect(() => {
    if (!draft) return;
    latest.current.set(draft.file, { ...draft, at: Date.now() });
    const w = win();
    if (w) postDraft(w, draft);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.alter !== 1) return;
      const hit = [...iframes.current.entries()].find(([, f]) => f.contentWindow === ev.source);
      if (!hit) return;
      const [k, frame] = hit;
      const w = frame.contentWindow!;
      if (d.t === 'ready') {
        ready.current.add(k);
        // catch the new frame up: what is still being typed (or just finished), and the picking mode
        const now = Date.now();
        for (const x of [...latest.current.values()].sort((a, b) => (a.kind === 'html' ? -1 : 1) - (b.kind === 'html' ? -1 : 1))) {
          if (!x.done || now - x.at < 2500) postDraft(w, x);
        }
        if (cb.current.picking) w.postMessage({ t: 'pick', on: true }, '*');
        if (cb.current.remote.length) w.postMessage({ t: 'remote', list: cb.current.remote }, '*');
      } else if (d.t === 'picked') {
        cb.current.onPick({ id: `${k}-${d.id}`, selector: String(d.selector), label: String(d.label), text: String(d.text ?? ''), html: String(d.html ?? ''), file: preview.file });
      } else if (d.t === 'unpicked') cb.current.onUnpick(`${k}-${d.id}`);
      else if (d.t === 'pickOff') cb.current.onPicking(false);
      else if (d.t === 'pointer') cb.current.onPointer?.(typeof d.sel === 'string' ? { sel: d.sel, fx: Number(d.fx) || 0, fy: Number(d.fy) || 0 } : null);
    };
    addEventListener('message', onMsg);
    return () => removeEventListener('message', onMsg);
  }, [preview.url, preview.file]); // eslint-disable-line react-hooks/exhaustive-deps

  // picking mode + building glow follow the chat state
  useEffect(() => {
    for (const k of ready.current) iframes.current.get(k)?.contentWindow?.postMessage({ t: 'pick', on: picking }, '*');
  }, [picking, newest]);
  useEffect(() => {
    if (!busy) for (const k of ready.current) iframes.current.get(k)?.contentWindow?.postMessage({ t: 'building', on: false }, '*');
  }, [busy]);
  // other people's cursors and picks
  const remoteKey = JSON.stringify(remote);
  useEffect(() => {
    for (const k of ready.current) iframes.current.get(k)?.contentWindow?.postMessage({ t: 'remote', list: remote }, '*');
  }, [remoteKey, newest]); // eslint-disable-line react-hooks/exhaustive-deps
  // chips removed in the chat → markers removed in the page
  const prevPicks = useRef<string[]>([]);
  useEffect(() => {
    const ids = picks.map((p) => p.id);
    for (const id of prevPicks.current) {
      if (ids.includes(id)) continue;
      const [k, local] = [Number(id.split('-')[0]), id.split('-').slice(1).join('-')];
      iframes.current.get(k)?.contentWindow?.postMessage({ t: 'unpick', id: local }, '*');
    }
    prevPicks.current = ids;
  }, [picks]);

  const shown = (k: number) => {
    setFrames((f) => f.map((x) => (x.k === k ? { ...x, shown: true } : x)));
    setTimeout(() => {
      setFrames((f) => {
        const keep = f.filter((x) => x.k >= k);
        for (const x of f) if (x.k < k) { iframes.current.delete(x.k); ready.current.delete(x.k); }
        return keep;
      });
    }, 450);
  };

  // the code being typed right now (or a moment ago)
  const [, tick] = useState(0);
  useEffect(() => {
    if (!draft?.done) return;
    const id = setTimeout(() => tick((n) => n + 1), 1800);
    return () => clearTimeout(id);
  }, [draft]);
  const typing = draft && (!draft.done || Date.now() - (latest.current.get(draft.file)?.at ?? 0) < 1700) ? draft : null;
  const code = useMemo(() => {
    if (!typing) return null;
    const lines = typing.content.replace(/\s+$/, '').split('\n');
    const from = Math.max(0, lines.length - 9);
    return { from, lines: lines.slice(from), total: lines.length, kb: (typing.content.length / 1024).toFixed(1) };
  }, [typing]);

  return (
    <motion.aside className="preview-pane" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={softSpring}>
      <div className="preview-head">
        <span className={`status-dot ${busy ? 'warn live' : 'ok'}`} />
        <b className="truncate grow">{t('preview.title')} · {baseName(preview.file)}</b>
        <button className={`btn sm${picking ? ' primary' : ' ghost'}`} onClick={() => onPicking(!picking)} title={t('preview.pickHint')}>
          <MousePointerClick />{t('preview.pick')}{picks.length ? ` · ${picks.length}` : ''}
        </button>
        <button className={`btn ghost icon sm${showCode ? ' on' : ''}`} title={t('preview.code')} onClick={() => setShowCode((v) => !v)}><Code2 /></button>
        <button className="btn ghost icon sm" title={t('preview.reload')} onClick={onReload}><RotateCw /></button>
        <a className="btn ghost icon sm" title={t('preview.external')} href={`${location.origin}${preview.url}`} target="_blank" rel="noreferrer"><ExternalLink /></a>
        <button className="btn ghost icon sm" title={t('common.close')} onClick={onClose}><X /></button>
      </div>
      <div className={`preview-frame${picking ? ' picking' : ''}`}>
        {busy && <div className="preview-progress" />}
        <div className="preview-stage">
          {frames.map((f) => (
            // sandboxed without same-origin: a generated page can't reach ALTTER's session
            <iframe
              key={f.k}
              ref={(el) => { if (el) iframes.current.set(f.k, el); }}
              src={f.src}
              className={f.shown ? 'shown' : ''}
              onLoad={() => shown(f.k)}
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              title="preview"
            />
          ))}
        </div>
        <AnimatePresence>
          {picking && (
            <motion.div className="pick-hint" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <MousePointerClick size={14} /> {t('preview.pickHint')}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showCode && typing && code && (
            <motion.div className="code-ticker" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18 }} transition={softSpring}>
              <div className="ct-head">
                {!typing.done ? <span className="spinner" /> : <span className="status-dot ok" />}
                <b className="truncate">{t(typing.done ? 'preview.written' : 'preview.writing', { file: baseName(typing.file) })}</b>
                <span className="faint">{code.total} · {code.kb} KB</span>
              </div>
              <pre>
                {code.lines.map((l, i) => (
                  <div key={code.from + i} className="ct-line">
                    <span className="ln">{code.from + i + 1}</span>
                    <code>{hl(l)}{i === code.lines.length - 1 && !typing.done && <span className="caret" />}</code>
                  </div>
                ))}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
        {busy && !typing && step && <div className="preview-badge"><span className="spinner" />{step}</div>}
      </div>
      {onAsk && <PreviewAsk picks={picks} picking={picking} busy={busy} onUnpick={onUnpick} onPicking={onPicking} onAsk={onAsk} />}
    </motion.aside>
  );
}

/** The phone's own composer under the preview: picked elements as chips, then "what to change". */
function PreviewAsk({ picks, picking, busy, onUnpick, onPicking, onAsk }: { picks: Pick[]; picking: boolean; busy: boolean; onUnpick: (id: string) => void; onPicking: (on: boolean) => void; onAsk: (text: string) => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    onAsk(v);
    setText('');
    onPicking(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  return (
    <form className="preview-ask" onSubmit={submit}>
      {picks.length > 0 && (
        <div className="preview-ask-picks">
          {picks.map((p) => (
            <button type="button" key={p.id} className="pick-chip" onClick={() => onUnpick(p.id)} title={t('common.remove')}>
              <span className="truncate">{p.label}</span><X size={12} />
            </button>
          ))}
        </div>
      )}
      <div className="preview-ask-row">
        <button type="button" className={`btn icon${picking ? ' primary' : ''}`} onClick={() => onPicking(!picking)} aria-label={t('preview.pick')}><MousePointerClick /></button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={picks.length ? t('preview.askPicked', { n: picks.length }) : picking ? t('preview.tapHint') : t('preview.ask')} enterKeyHint="send" />
        <button className="btn primary icon" disabled={!text.trim() || busy} aria-label={t('common.send')}>{busy ? <span className="spinner" /> : <ArrowUp />}</button>
      </div>
    </form>
  );
}
