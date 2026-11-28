// Deterministic saved answer for preview UI tests; does not invoke an AI provider.
process.env.ALTER_HOME = 'G:/ALTTER-Repair/altter-plan-test-data';
const { run, get, now } = await import('../packages/core/src/db.ts');
const id = 'night-shift-page-preview';
if (!get('SELECT id FROM conversations WHERE id = ?', id)) {
  const stamp = now();
  run('INSERT INTO conversations (id,title,provider,created_at,updated_at,access) VALUES (?,?,?,?,?,?)', id, 'Local page preview demo', null, stamp, stamp, 'read');
  run('INSERT INTO messages (conversation_id,role,content,provider,created_at) VALUES (?,?,?,?,?)', id, 'assistant', 'Local test page: G:/ALTTER-Repair/altter-plan-test-data/workspace/page-demo.html', null, stamp);
}
console.log('Saved page-preview fixture ready');
