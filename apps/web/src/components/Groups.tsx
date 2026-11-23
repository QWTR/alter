// A group of agents you can @mention as one ("@Marketing" → everyone in it gets the task, the lead puts it together).
import { motion } from 'motion/react';
import { Check, Crown, Trash2, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { api, invalidate, type Agent, type AgentGroup } from '../api';
import { useT } from '../i18n';
import { agentName } from './agentKit';
import { Robot } from './Robot';
import { Field, Modal, ModalHead, toast } from './ui';

export function GroupEditor({ group, agents, onClose }: { group: AgentGroup | null; agents: Agent[]; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [members, setMembers] = useState<string[]>(group?.members ?? []);
  const [lead, setLead] = useState<string | null>(group?.lead ?? null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const save = async () => {
    setBusy(true);
    try {
      await api('/api/groups', { method: 'POST', body: { id: group?.id, name: name.replace(/^@/, ''), description, members, lead: lead && members.includes(lead) ? lead : members[0] } });
      invalidate('/api/groups');
      toast(t('groups.saved', { name }), 'ok');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!group || !confirm(t('common.confirmDelete'))) return;
    await api(`/api/groups/${group.id}`, { method: 'DELETE' });
    invalidate('/api/groups');
    onClose();
  };

  return (
    <Modal open onClose={onClose}>
      <ModalHead icon={<UsersRound />} title={group ? t('groups.edit') : t('groups.new')} text={t('groups.lead')} onClose={onClose} />
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label={t('groups.name')}>
          <div className="input-prefix">
            <span>@</span>
            <input className="input" value={name} maxLength={40} autoFocus placeholder={t('groups.namePh')} onChange={(e) => setName(e.target.value.replace(/^@/, ''))} />
          </div>
        </Field>
        <Field label={t('groups.what')}>
          <input className="input" value={description} maxLength={200} placeholder={t('groups.whatPh')} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t('groups.pick')} hint={t('groups.leadHint')}>
          <div className="group-pick">
            {agents.map((a, i) => {
              const on = members.includes(a.id);
              const isLead = on && (lead ?? members[0]) === a.id;
              return (
                <motion.button key={a.id} type="button" className={`group-member${on ? ' on' : ''}`} onClick={() => toggle(a.id)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} whileTap={{ scale: 0.97 }}>
                  <Robot avatar={a.avatar} size={30} still={!on} />
                  <span className="grow truncate">{agentName(a, t)}</span>
                  {on && (
                    <span role="button" tabIndex={0} className={`lead-btn${isLead ? ' on' : ''}`} title={t('groups.makeLead')} onClick={(e) => { e.stopPropagation(); setLead(a.id); }}>
                      <Crown size={13} />
                    </span>
                  )}
                  <span className={`check${on ? ' on' : ''}`}>{on && <Check size={13} />}</span>
                </motion.button>
              );
            })}
          </div>
        </Field>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {group ? <button className="btn ghost danger" onClick={remove}><Trash2 />{t('common.delete')}</button> : <span />}
          <button className="btn primary" disabled={busy || !name.trim() || members.length < 1} onClick={save}><Check />{t('common.save')}</button>
        </div>
      </div>
    </Modal>
  );
}
