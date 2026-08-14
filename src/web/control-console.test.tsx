import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import type { ArtifactSummary, RunRecord } from '../runtime/store';
import { ApprovalQueue } from './components/ApprovalQueue';
import { ArtifactDetail } from './components/ArtifactDetail';
import { ControlConsole, RunTracePanel } from './ControlConsole';
import { inlineEditCharCount, isWithinInlineEditLimit } from './inline-edit-guard';

const artifact: ArtifactSummary = {
  artifactType: 'chapter-outline',
  targetId: 'chapter-1',
  canonicalStatus: 'clean',
  activeProposalId: 'prop-1',
  proposalStatus: 'commit-blocked',
  updatedAt: '2026-08-13T00:00:00.000Z',
  proposalDetail: {
    basedOnCanonicalVersion: 'snap-1',
    diffs: [{ field: 'displayTitle', canonical: '旧标题', proposed: '新标题', changed: true }],
  },
  bundledDiff: [
    {
      artifactType: 'character-update',
      targetId: 'char-1',
      changeKind: 'update',
      summary: '更新角色状态',
    },
  ],
  reviewerResult: {
    approved: true,
    totalScore: 91,
    overrideEligible: false,
    hardFailures: [],
    dimensionScores: {
      antiAiVoice: 90,
      webFictionPacing: 90,
      emotionCurve: 90,
      characterConsistency: 92,
      settingConsistency: 91,
      clueCausality: 90,
      readabilityLayout: 89,
      languageTexture: 93,
    },
    rewriteDirectives: ['保持节奏'],
  },
  derivedGraph: {
    status: 'ready',
    latestCanonicalVersion: 'snap-1',
    graphSnapshotVersion: 'graph-1',
    nodes: [
      { id: 'chapter-1', label: '第一章', type: 'Chapter' },
      { id: 'char-1', label: '主角', type: 'Character' },
    ],
    edges: [{ source: 'chapter-1', target: 'char-1', type: 'introduces' }],
  },
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

describe('ApprovalQueue', () => {
  test('orders blocking items first', () => {
    const html = renderToStaticMarkup(
      <ApprovalQueue
        artifacts={[
          { ...artifact, proposalStatus: 'draft', updatedAt: '2026-08-12T00:00:00.000Z' },
          { ...artifact, proposalStatus: 'commit-blocked', updatedAt: '2026-08-13T00:00:00.000Z' },
        ]}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain('commit-blocked');
    expect(html).toContain('chapter-outline');
  });
});

describe('ControlConsole', () => {
  test('renders run trace and blocked banners', () => {
    const html = renderToStaticMarkup(
      <ControlConsole artifacts={[artifact]} runs={runs} onSelectArtifact={() => undefined} onAction={() => undefined} />,
    );

    expect(html).toContain('任务 / 审批队列');
    expect(html).toContain('运行追溯');
    expect(html).toContain('批准但未落盘');
    expect(html).toContain('Proposal 差异视图');
    expect(html).toContain('Reviewer 结果');
    expect(html).toContain('剧情图谱 / 派生状态');
  });

  test('RunTracePanel filters by selected artifact', () => {
    const html = renderToStaticMarkup(<RunTracePanel runs={runs} selectedArtifact={artifact} />);

    expect(html).toContain('run-1');
    expect(html).toContain('re-sync-state');
  });
});

describe('ArtifactDetail', () => {
  test('shows action buttons and inline edit guard metadata', () => {
    const html = renderToStaticMarkup(
      <ArtifactDetail artifact={artifact} onAction={() => undefined} pending />,
    );

    expect(html).toContain('approve');
    expect(html).toContain('override-approve');
    expect(html).toContain('delete');
    expect(html).toContain('短文本微修');
  });
});

describe('inline edit guard', () => {
  test('detects inline edit budget and char count', () => {
    expect(inlineEditCharCount('abc')).toBe(3);
    expect(isWithinInlineEditLimit('a'.repeat(200))).toBe(true);
    expect(isWithinInlineEditLimit('a'.repeat(201))).toBe(false);
  });
});
