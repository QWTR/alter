import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDraft, writeDraft } from '../../../apps/web/src/draftStore.ts';

test('drafts survive reopening, remain separate, and clear after send', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  writeDraft(storage, 'chat-a', 'Pierwszy szkic');
  writeDraft(storage, 'chat-b', 'Drugi szkic');
  assert.equal(readDraft(storage, 'chat-a'), 'Pierwszy szkic');
  writeDraft(storage, 'chat-a', '');
  assert.equal(readDraft(storage, 'chat-a'), '');
  assert.equal(readDraft(storage, 'chat-b'), 'Drugi szkic');
  assert.equal(values.size, 1);
});

test('storage failure does not break composing', () => {
  const unavailable = { getItem: () => { throw Error('disabled'); }, setItem: () => { throw Error('quota'); }, removeItem: () => { throw Error('disabled'); } };
  assert.equal(readDraft(unavailable, 'a'), '');
  assert.doesNotThrow(() => writeDraft(unavailable, 'a', 'text'));
  assert.doesNotThrow(() => writeDraft(undefined, 'a', ''));
});
