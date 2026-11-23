// When something an automation watches breaks (or gets fixed), ALTTER says so where you can answer:
// a message in that agent's alert chat (with a card: fix it / find the cause / check again)
// plus a notification on every phone that turned them on. Tapping "Fix" on the phone sends
// "fix it" into that chat with full control — the same as typing it.
import { randomUUID } from 'node:crypto';
import { get, now, run } from './db.ts';
import { emit } from './events.ts';
import { loadConfig } from './config.ts';
import { notifyPhones } from './push.ts';

export const ALERT_FENCE = 'alter-alert';

export interface AlertInfo {
  agentId: string;
  name: string;
  kind: 'fail' | 'ok' | 'report' | 'error';
  target?: string;
  message: string;
  autoFix?: boolean;
}

const T: Record<string, Record<string, string>> = {
  en: { fail: '⚠️ {name} is down', ok: '✅ {name} works again', report: '🛠️ {name}: report', error: '❌ {name}: the agent failed', fix: 'Fix it', open: 'Open', fixing: 'Fixing it on its own…', chat: '🔔 {name}' },
  pl: { fail: '⚠️ {name} nie działa', ok: '✅ {name} znowu działa', report: '🛠️ {name}: raport', error: '❌ {name}: agent nie dał rady', fix: 'Napraw', open: 'Otwórz', fixing: 'Naprawiam sam…', chat: '🔔 {name}' },
  de: { fail: '⚠️ {name} ist ausgefallen', ok: '✅ {name} läuft wieder', report: '🛠️ {name}: Bericht', error: '❌ {name}: Agent gescheitert', fix: 'Reparieren', open: 'Öffnen', fixing: 'Repariere selbst…', chat: '🔔 {name}' },
  es: { fail: '⚠️ {name} no funciona', ok: '✅ {name} vuelve a funcionar', report: '🛠️ {name}: informe', error: '❌ {name}: el agente falló', fix: 'Arreglar', open: 'Abrir', fixing: 'Arreglándolo solo…', chat: '🔔 {name}' },
  fr: { fail: '⚠️ {name} est en panne', ok: '✅ {name} remarche', report: '🛠️ {name} : rapport', error: '❌ {name} : l’agent a échoué', fix: 'Réparer', open: 'Ouvrir', fixing: 'Je répare tout seul…', chat: '🔔 {name}' },
  uk: { fail: '⚠️ {name} не працює', ok: '✅ {name} знову працює', report: '🛠️ {name}: звіт', error: '❌ {name}: агент не впорався', fix: 'Виправити', open: 'Відкрити', fixing: 'Виправляю сам…', chat: '🔔 {name}' },
};
const tr = (k: string, name = '') => ((T[loadConfig().language] ?? T.en)[k] ?? T.en[k]).replace('{name}', name);

/** The chat where this agent's alerts land (created on the first one). */
export function alertConversation(agent: { id: string; name: string; projectId: string | null; access: string }): string {
  const row = get<{ id: string }>(`SELECT id FROM conversations WHERE agent_id = ? AND title LIKE '🔔%' ORDER BY updated_at DESC LIMIT 1`, agent.id);
  if (row) return row.id;
  const id = randomUUID();
  const ts = now();
  run(
    'INSERT INTO conversations (id, title, provider, project_id, access, agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, tr('chat', agent.name).slice(0, 60), null, agent.projectId, agent.access === 'chat' ? 'read' : agent.access, agent.id, ts, ts,
  );
  return id;
}

/** Posts the alert into the agent's chat and to the phones. */
export async function postAlert(agent: { id: string; name: string; projectId: string | null; access: string }, info: Omit<AlertInfo, 'agentId' | 'name'>): Promise<void> {
  const convId = alertConversation(agent);
  const full: AlertInfo = { agentId: agent.id, name: agent.name, ...info, message: info.message.slice(0, 4000) };
  const card = info.kind === 'report' ? '' : '```' + ALERT_FENCE + '\n' + JSON.stringify({ ...full, message: full.message.slice(0, 600) }) + '\n```';
  const text = info.kind === 'report' ? `**${tr('report', agent.name)}**\n\n${full.message}` : card;
  run('INSERT INTO messages (conversation_id, role, content, provider, created_at) VALUES (?, ?, ?, ?, ?)', convId, 'assistant', text, null, now());
  run('UPDATE conversations SET updated_at = ? WHERE id = ?', now(), convId);
  emit('conversation.updated', { id: convId });
  emit('alert', { ...full, conversationId: convId });
  const title = tr(info.kind, agent.name);
  const body = info.kind === 'fail' && info.autoFix ? `${info.message}\n${tr('fixing')}` : info.message.replace(/[#*`>_]/g, '').replace(/\s+/g, ' ').trim();
  await notifyPhones({
    title,
    body: body.slice(0, 300),
    url: `/agents/${agent.id}/${convId}`,
    tag: `alert-${agent.id}`,
    level: info.kind === 'fail' || info.kind === 'error' ? 'error' : info.kind === 'ok' ? 'ok' : 'info',
    actions: info.kind === 'fail' && !info.autoFix ? [{ action: 'fix', title: tr('fix') }, { action: 'open', title: tr('open') }] : [{ action: 'open', title: tr('open') }],
  }).catch(() => {});
}
