// Import what ChatGPT, Claude, Gemini or Copilot already know about you into ALTTER's memory:
// 1) copy a ready prompt and ask that AI, 2) paste its answer here (or drop its data export), 3) ALTTER keeps the facts.
import { Brain, Check, Copy, ExternalLink, FileUp, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, invalidate, type Memory } from '../api';
import { useT } from '../i18n';
import { Modal, ModalHead, toast } from './ui';

const SOURCES = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', color: '#10a37f' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new', color: '#d97757' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app', color: '#4285f4' },
  { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com/', color: '#7f5af0' },
  { id: 'other', name: '', url: '', color: '#868e96' },
] as const;
type Src = (typeof SOURCES)[number]['id'];
const MAX_FILE = 55 * 1024 * 1024;

export function MemoryImport({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: (n: number) => void }) {
  const t = useT();
  const [src, setSrc] = useState<Src>('chatgpt');
  const [text, setText] = useState('');
  const [file, setFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<Memory[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const s = SOURCES.find((x) => x.id === src)!;
  const prompt = t('mimp.prompt');

  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { toast(t('mimp.copyFail'), 'error'); }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE) return toast(t('mimp.tooBig'), 'error');
    setText(await f.text());
    setFile(f.name);
  };
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ added: Memory[] }>('/api/memories/import', { method: 'POST', body: { text, source: src } });
      setDone(r.added);
      invalidate('/api/memories', '/api/status');
      onDone?.(r.added.length);
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };
  const close = () => { onClose(); setTimeout(() => { setDone(null); setText(''); setFile(null); }, 250); };

  return (
    <Modal open={open} onClose={close} wide>
      <ModalHead icon={<Brain />} title={t('mimp.title')} text={t('mimp.lead')} onClose={close} />
      {done ? (
        <div className="mimp-done">
          <div className="mimp-ok"><Check size={18} />{t('mimp.done', { n: done.length })}</div>
          <ul className="mimp-list">{done.slice(0, 40).map((m) => <li key={m.id}><span className="faint small">{t(`memory.kind.${m.kind}` as any)}</span>{m.content}</li>)}</ul>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={close}>{t('common.close')}</button></div>
        </div>
      ) : (
        <div className="mimp">
          <div className="mimp-src" role="radiogroup">
            {SOURCES.map((x) => (
              <button key={x.id} role="radio" aria-checked={src === x.id} className={src === x.id ? 'on' : ''} onClick={() => setSrc(x.id)}>
                <span className="mimp-dot" style={{ background: x.color }} />{x.name || t('mimp.other')}
              </button>
            ))}
          </div>

          <div className="mimp-step">
            <b className="mimp-n">1</b>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="mimp-h">{s.name ? t('mimp.step1', { ai: s.name }) : t('mimp.step1other')}</div>
              <div className="mimp-prompt">{prompt}</div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t('mimp.copied') : t('mimp.copy')}</button>
                {s.url && <a className="btn sm ghost" href={s.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('mimp.open', { ai: s.name })}</a>}
              </div>
            </div>
          </div>

          <div className="mimp-step">
            <b className="mimp-n">2</b>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="mimp-h">{t('mimp.step2')}</div>
              {file ? (
                <div className="mimp-file"><FileUp size={15} /><span className="grow truncate">{file}</span><button className="btn ghost sm" onClick={() => { setFile(null); setText(''); }}>{t('common.remove')}</button></div>
              ) : (
                <textarea className="textarea" rows={6} placeholder={t('mimp.pastePh')} value={text} onChange={(e) => setText(e.target.value)}
                  onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }} />
              )}
              <div className="small faint" style={{ marginTop: 6 }}>
                {t('mimp.orFile')} <button className="linkish" onClick={() => fileRef.current?.click()}>{t('mimp.chooseFile')}</button>
                <input ref={fileRef} type="file" accept=".json,.txt,.md,application/json,text/plain" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span className="small faint">{t('mimp.private')}</span>
            <button className="btn primary" disabled={busy || text.trim().length < 10} onClick={run}>
              {busy ? <span className="spinner" /> : <Sparkles size={15} />}{busy ? t('mimp.working') : t('mimp.import')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
