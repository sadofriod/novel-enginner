import { describe, expect, test } from 'bun:test';

import {
  fromBootstrapEvidenceRow,
  toBootstrapEvidenceCreateInput,
  toBootstrapRevisionCreateInput,
  toBootstrapSessionCreateInput,
} from './prisma-session-repository';

describe('Bootstrap Prisma repository mappings', () => {
  test('maps an optional bootstrap session into Prisma input without inventing a book id', () => {
    const input = toBootstrapSessionCreateInput({
      id: 'bootstrap-session-001',
      workspaceId: 'workspace-001',
      path: 'new-book',
      status: 'drafting',
      currentStage: 'market-research',
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    });

    expect(input).toMatchObject({
      sessionId: 'bootstrap-session-001',
      workspaceId: 'workspace-001',
      stage: 'market-research',
    });
    expect(input.bookId).toBeUndefined();
  });

  test('sets revision expiry to thirty days after its immutable snapshot', () => {
    const input = toBootstrapRevisionCreateInput({
      id: 'revision-001',
      sessionId: 'bootstrap-session-001',
      stage: 'inspiration-dialogue',
      createdAt: '2026-08-15T00:00:00.000Z',
      summary: 'Round one',
    });

    expect(new Date(input.expiresAt).toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(input.authorInput).toEqual({ summary: 'Round one' });
  });

  test('requires evidence provenance and preserves copyright fields', () => {
    expect(() => toBootstrapEvidenceCreateInput({
      id: 'evidence-001',
      sessionId: 'bootstrap-session-001',
      url: 'https://example.test/source',
      title: 'Source',
      collectedAt: '2026-08-15T00:00:00.000Z',
      cleanedSummary: 'Clean summary',
      license: 'cc-by',
      copyrightBoundary: 'allowed',
      status: 'approved',
    })).toThrow('requires a revisionId');

    const row = {
      evidenceId: 'evidence-001',
      revisionId: 'revision-001',
      url: 'https://example.test/source',
      title: 'Source',
      collectedAt: new Date('2026-08-15T00:00:00.000Z'),
      cleanedSummary: 'Clean summary',
      licenseScope: 'attribution-required',
      copyrightBoundary: 'allowed',
      status: 'approved',
    } as Parameters<typeof fromBootstrapEvidenceRow>[0];
    expect(fromBootstrapEvidenceRow(row, 'bootstrap-session-001')).toMatchObject({
      license: 'cc-by',
      copyrightBoundary: 'allowed',
      status: 'approved',
    });
  });
});