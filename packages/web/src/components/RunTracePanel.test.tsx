import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';

import { RunTracePanel } from './RunTracePanel';

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
    status: 'approved',
    nextExpectedState: 're-sync-state',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  },
];

describe('RunTracePanel', () => {
  test('shows all runs when no artifact is selected', () => {
    const html = renderToStaticMarkup(<RunTracePanel runs={runs} />);

    expect(html).toContain('run-1');
  });

  test('filters runs by the selected artifact', () => {
    const html = renderToStaticMarkup(<RunTracePanel runs={runs} selectedArtifact={artifact} />);

    expect(html).toContain('run-1');
    expect(html).toContain('re-sync-state');
  });

  test('shows an empty state when no run matches', () => {
    const other: ArtifactSummary = { ...artifact, targetId: 'chapter-other' };
    const html = renderToStaticMarkup(<RunTracePanel runs={runs} selectedArtifact={other} />);

    expect(html).toContain('暂无关联运行记录');
  });
});
