/**
 * Inngest client singleton for the novel-enginner workspace service.
 *
 * One workspace maps to one Bun service instance and one Inngest namespace
 * (docs/architecture/modules/07-api-events-and-runtime.md §7.8). The client
 * and `serve` handler are intentionally kept in this file so every Inngest
 * function just imports `inngest` from here.
 *
 * Event catalogue mirrors docs/architecture/modules/07-api-events-and-runtime.md §7.7.
 */
import { EventSchemas, Inngest } from 'inngest';
import type { CommandEnvelope } from '../domain';

// ---------------------------------------------------------------------------
// Event map — gives Inngest full type-checking for every published event.
// ---------------------------------------------------------------------------

export type NovelEvents = {
  'novel/chapter-outline.requested': {
    data: {
      workspaceId: string;
      bookId: string;
      targetId: string;
      intent: 'propose' | 'regenerate';
      requestedBy: string;
      idempotencyKey: string;
      canonicalVersion?: string;
    };
  };
  'novel/chapter-manuscript.requested': {
    data: {
      workspaceId: string;
      bookId: string;
      targetId: string;
      intent: 'propose' | 'regenerate';
      requestedBy: string;
      idempotencyKey: string;
      canonicalVersion?: string;
    };
  };
  'novel/volume-outline.requested': {
    data: {
      workspaceId: string;
      bookId: string;
      targetId: string;
      intent: 'propose' | 'regenerate';
      requestedBy: string;
      idempotencyKey: string;
      canonicalVersion?: string;
    };
  };
  'novel/world-change.requested': {
    data: {
      workspaceId: string;
      bookId: string;
      targetId: string;
      intent: 'propose' | 'regenerate';
      requestedBy: string;
      idempotencyKey: string;
      canonicalVersion?: string;
    };
  };
  'novel/sync.rebuild-graph': {
    data: { workspaceId: string; bookId: string };
  };
  'novel/sync.reindex-state': {
    data: { workspaceId: string; bookId: string };
  };
  'novel/review.synthetic-requested': {
    data: {
      workspaceId: string;
      bookId: string;
      artifactType: string;
      targetId: string;
      editedFilePath: string;
      editedText?: string;
      proposalId?: string;
    };
  };
};

/** Singleton Inngest client. Lazily resolved so import is safe in test environments. */
export const inngest = new Inngest({
  id: 'novel-enginner',
  schemas: new EventSchemas().fromRecord<NovelEvents>(),
});

export async function dispatchCommandToInngest(
  envelope: CommandEnvelope,
  canonicalVersion?: string,
): Promise<void> {
  if (envelope.artifactType !== undefined) {
    if (envelope.targetId === undefined) {
      return;
    }
    const data = {
        workspaceId: envelope.workspaceId,
        bookId: envelope.bookId,
        targetId: envelope.targetId,
        intent: envelope.intent === 'regenerate' ? 'regenerate' : 'propose',
        requestedBy: envelope.requestedBy,
        idempotencyKey: envelope.idempotencyKey,
        ...(canonicalVersion !== undefined ? { canonicalVersion } : {}),
      } as const;
    if (envelope.artifactType === 'chapter-outline') {
      await inngest.send({ name: 'novel/chapter-outline.requested', data });
    } else if (envelope.artifactType === 'chapter-manuscript') {
      await inngest.send({ name: 'novel/chapter-manuscript.requested', data });
    } else if (envelope.artifactType === 'volume-outline') {
      await inngest.send({ name: 'novel/volume-outline.requested', data });
    } else if (envelope.artifactType === 'world-change') {
      await inngest.send({ name: 'novel/world-change.requested', data });
    }
    return;
  }

  if (envelope.systemTaskType === 'rebuild-graph') {
    await inngest.send({
      name: 'novel/sync.rebuild-graph',
      data: { workspaceId: envelope.workspaceId, bookId: envelope.bookId },
    });
  }
}

export async function dispatchSyntheticReviewToInngest(input: {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly artifactType: string;
  readonly targetId: string;
  readonly editedFilePath: string;
  readonly editedText?: string;
  readonly proposalId?: string;
}): Promise<void> {
  await inngest.send({
    name: 'novel/review.synthetic-requested',
    data: {
      workspaceId: input.workspaceId,
      bookId: input.bookId,
      artifactType: input.artifactType,
      targetId: input.targetId,
      editedFilePath: input.editedFilePath,
      ...(input.editedText !== undefined ? { editedText: input.editedText } : {}),
      ...(input.proposalId !== undefined ? { proposalId: input.proposalId } : {}),
    },
  });
}
