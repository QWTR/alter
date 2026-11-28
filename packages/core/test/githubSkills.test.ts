import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const home = mkdtempSync(join(tmpdir(), 'altter-skills-test-'));
process.env.ALTER_HOME = home;
const { parseGitHubSource, safePath, previewGitHubSkills, installGitHubSkill } = await import('../src/githubSkills.ts');
const { listSkills, skillsText } = await import('../src/skills.ts');
const sha = 'a'.repeat(40);

test('only GitHub HTTPS URLs and Windows-safe package paths are accepted', () => {
  assert.equal(parseGitHubSource('https://github.com/example/skills/tree/main/packs').path, 'packs');
  for (const url of ['http://github.com/a/b', 'https://evil.test/a/b', 'https://user@github.com/a/b', 'https://github.com/a/b/tree/main/x%5Cy']) assert.throws(() => parseGitHubSource(url));
  for (const path of ['../secret', '/absolute', 'x/../y', 'C:/secret', 'x\\y', 'a/NUL.txt', 'a/file.']) assert.equal(safePath(path), false, path);
  assert.ok(safePath('scripts/render.mjs'));
});

test('select, preview, install pinned files, preserve legacy skills and reload provenance without running scripts', async () => {
  const realFetch = globalThis.fetch;
  const files: Record<string,string> = {
    'packs/report/SKILL.md': '---\nname: Report helper\ndescription: Write a useful report\n---\nAlways start a report with findings. Read references/style.md.',
    'packs/report/references/style.md': 'Use short sentences.',
    'packs/report/scripts/never-run.mjs': `require('fs').writeFileSync(${JSON.stringify(join(home,'EXECUTED'))},'bad')`,
    'packs/other/SKILL.md': '---\nname: Other\n---\nOther instructions.',
  };
  const seen: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);seen.push(url);
    if (url.endsWith('/repos/example/skills')) return Response.json({ default_branch:'main' });
    if (url.includes('/commits/')) return Response.json({ sha });
    if (url.includes('/git/trees/')) return Response.json({ truncated:false, tree:Object.entries(files).map(([path,body])=>({ path,type:'blob',mode:'100644',size:body.length })) });
    const path = url.split(`/${sha}/`)[1];if (files[path]) return new Response(files[path]);
    throw Error('Unexpected request: '+url);
  }) as typeof fetch;
  try {
    const source='https://github.com/example/skills';
    const choices=await previewGitHubSkills(source);assert.equal(choices.packages.length,2);assert.equal(choices.body,undefined);
    const preview=await previewGitHubSkills(source,'packs/report/SKILL.md',sha);assert.ok(preview.body?.includes('Always start'));assert.equal(preview.files?.length,3);
    const installed=await installGitHubSkill(source,'packs/report/SKILL.md',sha);
    assert.ok(readFileSync(join(home,'skills',installed.id,'references/style.md'),'utf8').includes('short sentences'));
    assert.equal(existsSync(join(home,'EXECUTED')),false);
    writeFileSync(join(home,'skills','legacy.md'),'---\nname: Legacy\n---\nOriginal instructions');
    const skills=listSkills();assert.ok(skills.some(s=>s.id==='legacy'));assert.equal(skills.find(s=>s.id===installed.id)?.source?.sha,sha);
    assert.ok(skillsText([installed.id]).includes('Always start a report with findings'));
    assert.ok(seen.filter(s=>s.includes('raw.githubusercontent.com')).every(s=>s.includes('/'+sha+'/')));
    await assert.rejects(installGitHubSkill(source,'packs/report/SKILL.md',sha),/already installed/);
    await assert.rejects(previewGitHubSkills(source,'../bad',sha),/Select/);
  } finally { globalThis.fetch=realFetch; }
});
