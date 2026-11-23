import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ALTER_HOME = mkdtempSync(join(tmpdir(), 'alter-test-'));

const { nextRun, isValidSchedule } = await import('../src/schedule.ts');
const { addMemory, listMemories, relevantMemories } = await import('../src/memory.ts');
const { createAgent, updateAgent } = await import('../src/agents.ts');

test('schedules', () => {
  const from = new Date('2026-11-23T10:00:00'); // Monday
  assert.equal(nextRun('daily 08:00', from)?.getDate(), 24);
  assert.equal(nextRun('daily 11:30', from)?.getHours(), 11);
  assert.equal(nextRun('every 30m', from)?.getTime(), from.getTime() + 30 * 60_000);
  const sat = new Date('2026-11-28T10:00:00');
  assert.equal(nextRun('weekdays 09:00', sat)?.getDay(), 1);
  assert.equal(nextRun('weekly fri 10:00', from)?.getDay(), 5);
  assert.equal(nextRun('manual', from), null);
  assert.ok(!isValidSchedule('whenever'));
  assert.ok(!isValidSchedule('daily 25:00'));
});

test('memory dedupes and retrieves by inflected words', () => {
  addMemory({ kind: 'routine', content: 'Codziennie rano sprawdza maile od klientów', importance: 4 });
  addMemory({ kind: 'routine', content: 'Codziennie rano sprawdza maile od klientów.', importance: 3 });
  addMemory({ kind: 'project', content: 'Robi rolki z animacjami dla marki odzieżowej' });
  assert.equal(listMemories({ kind: 'routine' }).length, 1);
  const hits = relevantMemories('napisz scenariusz rolki');
  assert.ok(hits.some((m) => m.content.includes('rolki')));
});

test('agents validate schedules and keep nextRunAt', () => {
  assert.throws(() => createAgent({ name: 'x', instructions: 'y', schedule: 'sometimes' }));
  const a = createAgent({ name: 'Brief', instructions: 'Morning brief', schedule: 'daily 08:00' });
  assert.ok(a.nextRunAt);
  const paused = updateAgent(a.id, { enabled: false })!;
  assert.equal(paused.nextRunAt, null);
});

test('automation proposals from chat', async () => {
  const { wantsAutomation, proposalsIn, acceptProposal } = await import('../src/proposals.ts');
  const { run, now } = await import('../src/db.ts');
  const { getAgent } = await import('../src/agents.ts');
  assert.ok(wantsAutomation('zrób mi automatyzację, która codziennie rano streszcza maile'));
  assert.ok(wantsAutomation('remind me every morning to drink water'));
  assert.ok(!wantsAutomation('jak się masz?'));
  const block = '```alter-automation\n{"name":"Poranek","instructions":"Streść maile","schedule":"daily 07:30","access":"full","icon":"sunrise","palette":"amber"}\n```';
  const text = `Proponuję tak:\n${block}\nMożna zmienić godzinę.`;
  assert.equal(proposalsIn(text)[0].proposal?.name, 'Poranek');
  run('INSERT INTO conversations (id, title, provider, project_id, access, agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'c1', 't', null, null, 'chat', null, now(), now());
  const id = Number(run('INSERT INTO messages (conversation_id, role, content, provider, created_at) VALUES (?, ?, ?, ?, ?)', 'c1', 'assistant', text, 'demo', now()).lastInsertRowid);
  const { agent, message } = acceptProposal('c1', id, 0, { schedule: 'weekdays 08:00' });
  assert.equal(getAgent(agent.id)?.schedule, 'weekdays 08:00');
  assert.equal(agent.access, 'full');
  assert.equal(proposalsIn(message.content)[0].proposal?.createdId, agent.id);
  assert.ok(message.content.endsWith('Można zmienić godzinę.'));
  assert.throws(() => acceptProposal('c1', id, 0));
});
