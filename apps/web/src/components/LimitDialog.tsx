// Shown when the chosen subscription ran out: switch to another connected AI (once or always) or wait.
import { motion } from 'motion/react';
import { ArrowRight, Clock, Gauge } from 'lucide-react';
import { useState } from 'react';
import { api, invalidate } from '../api';
import { formatTime, useT } from '../i18n';
import { Modal, ModalHead, ProviderMark, Switch, stagger } from './ui';

export interface LimitHit { provider: string; until: string | null; alternatives: { id: string; name: string }[]; text: string }

export function LimitDialog({ hit, name, onClose, onSwitch }: { hit: LimitHit | null; name: (id: string) => string; onClose: () => void; onSwitch: (id: string) => void }) {
  const t = useT();
  const [always, setAlways] = useState(false);
  const go = async (id: string) => {
    if (always) {
      await api('/api/settings', { method: 'PUT', body: { onLimit: 'switch' } });
      invalidate('/api/status');
    }
    onSwitch(id);
  };
  return (
    <Modal open={!!hit} onClose={onClose}>
      {hit && (
        <>
          <ModalHead
            icon={<div className="pulse-ring fail"><Gauge /></div>}
            title={t('limit.title', { name: name(hit.provider) })}
            text={hit.until ? t('limit.until', { time: formatTime(hit.until) }) : t('limit.lead')}
            onClose={onClose}
          />
          {hit.alternatives.length ? (
            <>
              <div className="list" style={{ marginBottom: 14 }}>
                {hit.alternatives.map((a, i) => (
                  <motion.button key={a.id} className="list-row" onClick={() => go(a.id)} {...stagger(i)} whileHover={{ x: 3 }}>
                    <ProviderMark id={a.id} name={a.name} size={34} />
                    <b className="grow">{t('limit.switchTo', { name: a.name })}</b>
                    <ArrowRight size={16} />
                  </motion.button>
                ))}
              </div>
              <div className="row small" style={{ gap: 10 }}>
                <Switch on={always} onChange={setAlways} />
                <span className="muted">{t('limit.always')}</span>
              </div>
            </>
          ) : (
            <p className="muted">{t('limit.none')}</p>
          )}
          <div className="modal-foot">
            <button className="btn ghost" onClick={onClose}><Clock />{t('limit.wait')}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
