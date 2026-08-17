import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';

import { SystemOperationsPanel } from './system-operations';

Object.assign(globalThis, {
  window: { location: { pathname: '/app', search: '' } },
});

const artifact: ArtifactSummary = {
  artifactType: 'chapter-outline',
  targetId: 'chapter-1',
  canonicalStatus: 'clean',
  activeProposalId: 'prop-1',
  proposalStatus: 'commit-blocked',
  updatedAt: '2026-08-13T00:00:00.000Z',
};

describe('SystemOperationsPanel', () => {
  test('renders workspace sync and graph rebuild commands', () => {
    const html = renderToStaticMarkup(
      <SystemOperationsPanel workspaceId="ws-1" bookId="book-1" selectedArtifact={undefined} />,
    );

    expect(html).toContain('系统操作');
    expect(html).toContain('同步工作区');
    expect(html).toContain('重建剧情图谱');
  });

  test('adds proposal commands when an artifact is selected', () => {
    const html = renderToStaticMarkup(
      <SystemOperationsPanel workspaceId="ws-1" bookId="book-1" selectedArtifact={artifact} />,
    );

    expect(html).toContain('生成提案');
    expect(html).toContain('重新生成提案');
  });
});
