import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';

import { RunControlPanel } from './run-control';

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

const runs: readonly RunRecord[] = [
  {
    runId: 'run-1',
    commandId: 'cmd-1',
    workspaceId: 'workspace-1',
    bookId: 'book-1',
    artifactType: 'chapter-outline',
    targetId: 'chapter-1',
    status: 'running',
    nextExpectedState: 'proposal-pending',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  },
];

describe('RunControlPanel', () => {
  test('renders run control actions for a selected artifact', () => {
    const html = renderToStaticMarkup(
      <RunControlPanel runs={runs} selectedArtifact={artifact} workspaceId="ws-1" bookId="book-1" />,
    );

    expect(html).toContain('运行控制');
    expect(html).toContain('run-1');
    expect(html).toContain('恢复');
    expect(html).toContain('重试');
    expect(html).toContain('中止');
  });

  test('shows an empty state when there are no controllable runs', () => {
    const html = renderToStaticMarkup(
      <RunControlPanel runs={[]} selectedArtifact={undefined} workspaceId="ws-1" bookId="book-1" />,
    );

    expect(html).toContain('没有可控制的运行');
  });
});
