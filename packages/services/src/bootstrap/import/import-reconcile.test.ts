import { describe, expect, test } from 'bun:test';

import type { WorkspaceFileInput } from '../../workspace/sync-engine';

import { extractUnresolvedReferences, reconcileImportedWorkspace } from './import-reconcile';

function projectBriefFile(id: string): WorkspaceFileInput {
  return {
    path: 'state/book/project-brief.md',
    content: [
      '---',
      `id: ${id}`,
      'bookId: book-import-test',
      'title: 测试作品',
      'genres:',
      '  - 科幻',
      'targetAudience: 青年读者',
      'marketScope: 中文网络连载市场',
      'readerPromise: 持续紧张感',
      'corePremise: 在规则中追求自由',
      'openingHook: 开场事件',
      'contentBoundaries: []',
      'format: 连载长篇',
      'sourceResearchEvidenceIds: []',
      'assumptionIds: []',
      'status: approved',
      '---',
      '',
      '# 定位',
      '创作定位内容。',
    ].join('\n'),
  };
}

function worldFoundationFile(projectBriefRef: string): WorkspaceFileInput {
  return {
    path: 'state/world/world-foundation.md',
    content: [
      '---',
      'id: world-foundation-import-1',
      'bookId: book-import-test',
      'eraAndPrimarySetting: 星海纪元',
      'realityMode: hard',
      'tone: 冷峻',
      'capabilitySystem: 无超能力',
      'immutableRules: []',
      'socialOrder: 秩序',
      'narrativeProhibitions: []',
      'terminologyRefs: []',
      `projectBriefRef: ${projectBriefRef}`,
      'status: approved',
      '---',
      '',
      '# 世界观',
      '世界观最小硬规则。',
    ].join('\n'),
  };
}

describe('reconcileImportedWorkspace', () => {
  test('parses copied canonical files into a last-known-good snapshot', () => {
    const result = reconcileImportedWorkspace([projectBriefFile('project-brief-import-1')]);

    // Freshly copied files are new to the engine, so the workspace is `dirty`
    // (pending commit) rather than `clean`, but it has no parse or reference errors.
    expect(result.validity).toBe('dirty');
    expect(result.unresolvedReferences).toEqual([]);
    expect(result.snapshot.entities.size).toBe(1);
    expect(result.snapshot.entities.get('state/book/project-brief.md')).toMatchObject({
      kind: 'project-brief',
    });
    expect(result.readyToWrite).toBe(true);
  });

  test('diagnoses broken references across imported canonical files', () => {
    const result = reconcileImportedWorkspace([worldFoundationFile('project-brief-missing')]);

    expect(result.validity).toBe('invalid');
    expect(result.unresolvedReferences).toContain('project-brief-missing');
    expect(result.readyToWrite).toBe(false);
    expect(result.snapshot.entities.has('state/world/world-foundation.md')).toBe(false);
  });

  test('keeps an imported workspace ready when every reference resolves', () => {
    const result = reconcileImportedWorkspace([
      projectBriefFile('project-brief-import-2'),
      worldFoundationFile('project-brief-import-2'),
    ]);

    expect(result.validity).toBe('dirty');
    expect(result.unresolvedReferences).toEqual([]);
    expect(result.readyToWrite).toBe(true);
    expect(result.snapshot.entities.size).toBe(2);
  });

  test('extracts stable reference ids from sync-engine errors', () => {
    expect(extractUnresolvedReferences([
      { path: 'a.md', reason: 'Reference "missing-ref" in projectBriefRef does not resolve to a project-brief entity.' },
      { path: 'b.md', reason: 'Frontmatter for "b.md" failed validation.' },
    ])).toEqual(['missing-ref']);
  });
});
