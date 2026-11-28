import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameSkillSource } from '../../../apps/web/src/skillCatalog.ts';

test('installed skill detection recognizes repository, tree and blob source URLs', () => {
  assert.equal(sameSkillSource('https://github.com/Anthropics/skills.git', 'https://github.com/anthropics/skills/tree/main/skills/frontend-design'), true);
  assert.equal(sameSkillSource('https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md', 'https://github.com/anthropics/skills'), true);
  assert.equal(sameSkillSource('https://github.com/other/skills', 'https://github.com/anthropics/skills'), false);
  assert.equal(sameSkillSource('https://example.com/anthropics/skills', 'https://github.com/anthropics/skills'), false);
  assert.equal(sameSkillSource('bad url', 'another bad url'), false);
});
