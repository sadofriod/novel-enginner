import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { ApprovalQueue, isActionableProposal } from './ApprovalQueue';

import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';

function summary(overrides: Partial<ArtifactSummary>): ArtifactSummary {
  return {
    artifactType: 'chapter-outline',
    targetId: 'chapter-0001-outline',
    ...overrides,
  };
}

describe('isActionableProposal', () => {
  test('is true only for an artifact backed by an actionable proposal', () => {
    expect(isActionableProposal(summary({ activeProposalId: 'proposal-1', proposalStatus: 'pending-approval' }))).toBe(true);
    expect(isActionableProposal(summary({ activeProposalId: 'proposal-1', proposalStatus: 'pending-review' }))).toBe(true);
    expect(isActionableProposal(summary({ activeProposalId: 'proposal-1', proposalStatus: 'commit-blocked' }))).toBe(true);
    expect(isActionableProposal(summary({ activeProposalId: 'proposal-1', proposalStatus: 'waiting-sync' }))).toBe(true);
  });

  test('is false when there is no backing proposal or the status is terminal/stale', () => {
    expect(isActionableProposal(summary({}))).toBe(false);
    expect(isActionableProposal(summary({ activeProposalId: 'proposal-1' }))).toBe(false);
    expect(isActionableProposal(summary({ proposalStatus: 'pending-approval' }))).toBe(false);
    expect(isActionableProposal(summary({ activeProposalId: 'proposal-1', proposalStatus: 'approved' }))).toBe(false);
    expect(isActionableProposal(summary({ activeProposalId: 'proposal-1', proposalStatus: 'rejected' }))).toBe(false);
    expect(isActionableProposal(summary({ activeProposalId: 'proposal-1', proposalStatus: 'exported' }))).toBe(false);
  });
});

describe('ApprovalQueue', () => {
  test('only lists artifacts backed by a real actionable proposal', () => {
    const artifacts: readonly ArtifactSummary[] = [
      summary({ targetId: 'chapter-0001-outline', activeProposalId: 'proposal-1', proposalStatus: 'pending-approval' }),
      summary({ targetId: 'chapter-0042-outline', proposalStatus: 'pending-approval' }), // stale: no backing proposal
      summary({ targetId: 'char-mira', activeProposalId: 'proposal-2', proposalStatus: 'approved' }), // terminal
    ];
    const markup = renderToStaticMarkup(
      <ApprovalQueue artifacts={artifacts} onSelect={() => undefined} />,
    );

    expect(markup).toContain('chapter-0001-outline');
    expect(markup).not.toContain('chapter-0042-outline');
    expect(markup).not.toContain('char-mira');
  });

  test('renders an empty state when nothing is actionable', () => {
    const markup = renderToStaticMarkup(
      <ApprovalQueue artifacts={[summary({ proposalStatus: 'pending-approval' })]} onSelect={() => undefined} />,
    );

    expect(markup).toContain('暂无待处理 proposal');
  });
});
