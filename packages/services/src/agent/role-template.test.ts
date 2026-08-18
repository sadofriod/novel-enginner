import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadRoleTemplate, resolveAgentDefinitionPath, stripAgentFrontmatter } from './role-template';

describe('stripAgentFrontmatter', () => {
  test('keeps the body and drops the leading frontmatter block', () => {
    const raw = [
      '---',
      'name: Drafter',
      'tools: [read]',
      '---',
      '你是小说创作工作流中的 Drafter 系统角色。',
      '',
      '## 职责',
      '- 生成正文。',
    ].join('\n');
    expect(stripAgentFrontmatter(raw)).toBe('你是小说创作工作流中的 Drafter 系统角色。\n\n## 职责\n- 生成正文。');
  });
});

describe('loadRoleTemplate', () => {
  test('loads the role template body from agents/<role>.agent.md', async () => {
    const root = await mkdtemp('/tmp/novel-role-template-');
    await mkdir(join(root, 'agents'), { recursive: true });
    await writeFile(join(root, 'agents/drafter.agent.md'), '---\nname: Drafter\n---\n你是正文生成者。\n');
    try {
      expect(await loadRoleTemplate(root, 'drafter')).toBe('你是正文生成者。');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('returns undefined when the agent definition file is missing', async () => {
    const root = await mkdtemp('/tmp/novel-role-template-');
    try {
      expect(await loadRoleTemplate(root, 'reviewer')).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('resolves the documented agents/ directory layout', () => {
    expect(resolveAgentDefinitionPath('/workspace', 'update-actor')).toBe('/workspace/agents/update-actor.agent.md');
  });
});
