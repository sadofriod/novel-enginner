import { describe, expect, test } from 'bun:test';

import { createOptimizeProposal } from './optimize-proposal';

describe('createOptimizeProposal', () => {
  test('builds a pending-approval proposal marked as LLM-generated', () => {
    const proposal = createOptimizeProposal({
      artifactType: 'chapter-outline',
      targetId: 'chapter-0001-outline',
      runId: 'run-optimize-001',
      snapshotId: 'snap-0001',
    });

    expect(proposal).toMatchObject({
      proposalId: 'proposal-run-optimize-001',
      artifactType: 'chapter-outline',
      targetId: 'chapter-0001-outline',
      status: 'pending-approval',
      intent: 'optimize',
      origin: 'generated',
      basedOnCanonicalVersion: 'snap-0001',
      parentRunId: 'run-optimize-001',
    });
  });
});
