import { describe, expect, test } from 'bun:test';

import type { Proposal } from '../../../domain';
import { RuntimeStore } from '../../store';
import { loadProposalChain } from './chain';

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposalId: 'p3',
    artifactType: 'chapter-outline',
    targetId: 'chapter-x',
    status: 'pending-approval',
    intent: 'propose',
    origin: 'generated',
    basedOnCanonicalVersion: 'snap-1',
    parentRunId: 'run-x',
    ...overrides,
  };
}

describe('loadProposalChain', () => {
  test('loads the supersedes chain with draft content and threads per round', async () => {
    const store = new RuntimeStore();
    store.saveProposal(proposal({ supersedesProposalId: 'p2' }));
    store.saveProposal(proposal({ proposalId: 'p2', status: 'superseded', supersedesProposalId: 'p1' }));
    store.saveProposal(proposal({ proposalId: 'p1', status: 'superseded' }));
    store.saveCanonicalDraft({ proposalId: 'p3', relativePath: 'x.md', content: 'v3' });
    store.saveCanonicalDraft({ proposalId: 'p2', relativePath: 'x.md', content: 'v2' });
    store.saveReviewThread({
      threadId: 't1',
      proposalId: 'p2',
      field: 'content',
      side: 'R',
      lineNumber: 1,
      lineSnapshot: 's',
      isResolved: false,
      createdAt: 't',
    });

    const chain = await loadProposalChain({ store, persistenceEnabled: false, startProposalId: 'p3' });

    expect(chain.map((entry) => entry.proposalId)).toEqual(['p3', 'p2', 'p1']);
    expect(chain[0]?.content).toBe('v3');
    expect(chain[1]?.content).toBe('v2');
    expect(chain[1]?.threads).toHaveLength(1);
    expect(chain[2]?.content).toBeUndefined();
  });

  test('stops at the oldest round and tolerates a missing start proposal', async () => {
    const store = new RuntimeStore();
    store.saveProposal(proposal({ proposalId: 'p1', status: 'superseded' }));

    const chain = await loadProposalChain({ store, persistenceEnabled: false, startProposalId: 'missing' });
    expect(chain).toHaveLength(0);
  });
});
