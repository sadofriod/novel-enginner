/**
 * Screenshot generation script.
 * Run: bun run scripts/gen-screenshots.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderControlConsolePage } from '../src/web/app/pages/ControlConsolePage';
import type { ArtifactSummary, RunRecord } from '../src/runtime/store';

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
    { artifactType: 'character-update', targetId: 'char-1', changeKind: 'update', summary: '更新角色状态' },
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

const artifact2: ArtifactSummary = {
  ...artifact,
  targetId: 'chapter-2',
  proposalStatus: 'draft',
  updatedAt: '2026-08-12T00:00:00.000Z',
  reviewerResult: undefined,
};

const approvedArtifact: ArtifactSummary = {
  ...artifact,
  proposalStatus: 'approved',
  canonicalStatus: 'clean',
};

const runs: readonly RunRecord[] = [
  {
    runId: 'run-1',
    commandId: 'cmd-1',
    workspaceId: 'ws-1',
    bookId: 'book-1',
    artifactType: 'chapter-outline',
    targetId: 'chapter-1',
    status: 'completed',
    nextExpectedState: 're-sync-state',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  },
];

const outDir = join(import.meta.dir, '../docs/images/user-guide');
mkdirSync(outDir, { recursive: true });

function renderPage(selectedArtifact: ArtifactSummary, allArtifacts: readonly ArtifactSummary[]): string {
  return renderControlConsolePage({
    artifacts: allArtifacts,
    runs,
    selectedArtifact,
    workspaceId: 'ws-demo',
    bookId: 'book-demo',
  });
}

const pages = [
  { name: 'control-console-overview', html: renderPage(artifact, [artifact, artifact2]) },
  { name: 'control-console-detail', html: renderPage(artifact, [artifact, artifact2]) },
  { name: 'control-console-approved', html: renderPage(approvedArtifact, [approvedArtifact, artifact2]) },
  { name: 'control-console-approved-detail', html: renderPage(approvedArtifact, [approvedArtifact, artifact2]) },
];

for (const { name, html } of pages) {
  const path = join(outDir, `${name}.html`);
  writeFileSync(path, html);
  console.log(`Written: ${path}`);
}

console.log('HTML files written. Run screenshot capture next.');
export { pages, outDir };
