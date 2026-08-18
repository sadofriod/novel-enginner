import type { Proposal } from '../domain';
import type { WorkspaceSnapshot } from '../workspace/sync-engine';
import type { ArtifactSummary, RuntimeStore } from './store';

const SEEDED_ARTIFACT: ArtifactSummary = {
  artifactType: 'chapter-outline',
  targetId: 'chapter-0042-outline',
  canonicalStatus: 'draft',
  activeProposalId: 'proposal-chapter-0042-001',
  proposalStatus: 'pending-approval',
  proposalDetail: {
    basedOnCanonicalVersion: 'snap-0001',
    diffs: [
      {
        field: 'displayTitle',
        canonical: '旧标题',
        proposed: '新标题',
        changed: true,
      },
    ],
  },
  bundledDiff: [
    {
      artifactType: 'character-update',
      targetId: 'char-lin-mo',
      changeKind: 'update',
      summary: '更新林默的短期目标与状态',
    },
  ],
  reviewerResult: {
    approved: true,
    totalScore: 92,
    overrideEligible: false,
    hardFailures: [],
    dimensionScores: {
      antiAiVoice: 92,
      webFictionPacing: 90,
      emotionCurve: 91,
      characterConsistency: 94,
      settingConsistency: 93,
      clueCausality: 92,
      readabilityLayout: 90,
      languageTexture: 94,
    },
    rewriteDirectives: ['保留悬念推进'],
  },
  derivedGraph: {
    status: 'ready',
    latestCanonicalVersion: 'snap-0001',
    graphSnapshotVersion: 'graph-snap-0001',
    nodes: [
      { id: 'chapter-0042-outline', label: '第 42 章', type: 'Chapter' },
      { id: 'char-lin-mo', label: '林默', type: 'Character' },
      { id: 'clue-core-001', label: '核心线索', type: 'PlotClue' },
    ],
    edges: [
      { source: 'chapter-0042-outline', target: 'char-lin-mo', type: 'introduces' },
      { source: 'chapter-0042-outline', target: 'clue-core-001', type: 'advances' },
    ],
  },
  updatedAt: '2026-08-14T00:00:00.000Z',
};

export function seedWebConsoleFixture(store: RuntimeStore): void {
  const proposal: Proposal = {
    proposalId: 'proposal-chapter-0042-001',
    artifactType: 'chapter-outline',
    targetId: 'chapter-0042-outline',
    status: 'pending-approval',
    intent: 'propose',
    origin: 'generated',
    basedOnCanonicalVersion: 'snap-0001',
    parentRunId: 'run-seed-001',
  };
  const snapshot: WorkspaceSnapshot = { snapshotId: proposal.basedOnCanonicalVersion, entities: new Map() };
  store.upsertArtifact(SEEDED_ARTIFACT);
  store.saveProposal(proposal);
  store.setLastKnownSnapshot('workspace-e2e', snapshot);
  store.saveRun({
    runId: 'run-seed-001',
    commandId: 'cmd-seed-001',
    workspaceId: 'workspace-e2e',
    bookId: 'book-e2e',
    artifactType: SEEDED_ARTIFACT.artifactType,
    targetId: SEEDED_ARTIFACT.targetId,
    status: 'waiting-approval',
    nextExpectedState: 'pending-approval',
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  });
}
