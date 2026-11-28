import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandSummary } from '../../../apps/web/src/commandSummary.ts';

test('Windows shell commands reveal the task, not System32', () => {
  assert.equal(commandSummary('"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command "git status --short"'), 'git status --short');
  assert.equal(commandSummary('C:\\Windows\\System32\\cmd.exe /d /s /c "npm run build"'), 'npm run build');
  assert.equal(commandSummary('pwsh -Command "Get-Content README.md"'), 'Get-Content README.md');
});

test('retain task arguments, shell syntax, and distinct commands', () => {
  assert.equal(commandSummary('"C:\\Program Files\\nodejs\\node.exe" scripts/render.mjs --output film.mp4'), 'node.exe scripts/render.mjs --output film.mp4');
  assert.equal(commandSummary('git diff --stat && npm test'), 'git diff --stat && npm test');
  assert.notEqual(commandSummary('powershell -Command "git status"'), commandSummary('powershell -Command "npm test"'));
  assert.equal(commandSummary(''), '');
  assert.equal(commandSummary('/usr/bin/node render.mjs'), 'node render.mjs');
});
