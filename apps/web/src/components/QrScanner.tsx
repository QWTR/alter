// Full-screen QR scanner (phone camera): used to pair a phone by pointing it at the code on the computer.
// Uses the browser's own BarcodeDetector when there is one (fast, native) and jsQR otherwise (loaded only then).
import { AnimatePresence, motion } from 'motion/react';
import { X, ScanLine, Flashlight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';

/** Is a camera scanner possible here at all (secure page + camera API)? */
export const canScanQr = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && isSecureContext;

type Detect = (v: HTMLVideoElement, c: HTMLCanvasElement) => Promise<string | null>;

async function makeDetector(): Promise<Detect> {
  const BD = (window as any).BarcodeDetector;
  if (BD) {
    try {
      const formats: string[] = (await BD.getSupportedFormats?.()) ?? ['qr_code'];
      if (formats.includes('qr_code')) {
        const det = new BD({ formats: ['qr_code'] });
        return async (v) => {
          const r = await det.detect(v);
          return r[0]?.rawValue ?? null;
        };
      }
    } catch {}
  }
  const { default: jsQR } = await import('jsqr');
  return async (v, c) => {
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) return null;
    // scan the middle square at a modest size: fast enough on any phone
    const side = Math.min(w, h), size = Math.min(640, side);
    c.width = size; c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(v, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
    const img = g.getImageData(0, 0, size, size);
    return jsQR(img.data, size, size, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  };
}

export function QrScanner({ open, onClose, onResult, hint }: { open: boolean; onClose: () => void; onResult: (text: string) => boolean | void; hint?: string }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const [torch, setTorch] = useState<{ on: boolean; track: MediaStreamTrack } | null>(null);
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stop = false;
    let timer = 0;
    setError('');
    setWrong(false);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
        if (stop) return stream.getTracks().forEach((x) => x.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        const track = stream.getVideoTracks()[0];
        if ((track.getCapabilities?.() as any)?.torch) setTorch({ on: false, track });
        const detect = await makeDetector();
        const tick = async () => {
          if (stop) return;
          try {
            const text = await detect(v, canvas.current!);
            if (text) {
              navigator.vibrate?.(40);
              if (onResult(text) !== false) return; // accepted → the parent closes us
              setWrong(true);
              setTimeout(() => setWrong(false), 1600);
            }
          } catch {}
          timer = window.setTimeout(tick, 180);
        };
        tick();
      } catch (e) {
        const name = (e as Error).name;
        setError(name === 'NotAllowedError' ? t('qr.denied') : name === 'NotFoundError' ? t('qr.noCamera') : (e as Error).message);
      }
    })();
    return () => {
      stop = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((x) => x.stop());
      setTorch(null);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTorch = async () => {
    if (!torch) return;
    const on = !torch.on;
    await torch.track.applyConstraints({ advanced: [{ torch: on } as any] }).catch(() => {});
    setTorch({ ...torch, on });
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="qr-scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <video ref={video} playsInline muted />
          <canvas ref={canvas} hidden />
          <div className="qr-scan-shade">
            <motion.div className={`qr-scan-frame${wrong ? ' wrong' : ''}`} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
              <i /><i /><i /><i />
              {!error && <span className="qr-scan-line" />}
            </motion.div>
          </div>
          <div className="qr-scan-top">
            <button type="button" className="qr-scan-btn" onClick={onClose} aria-label={t('common.close')}><X /></button>
            {torch && <button type="button" className={`qr-scan-btn${torch.on ? ' on' : ''}`} onClick={toggleTorch} aria-label="torch"><Flashlight /></button>}
          </div>
          <div className="qr-scan-text">
            {error ? <b className="qr-scan-err">{error}</b> : <><ScanLine size={18} /><span>{wrong ? t('qr.wrong') : hint ?? t('qr.hint')}</span></>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
