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
/* eslint-disable complexity */

import { EventSchemas, Inngest } from 'inngest';
import type { CommandEnvelope } from '../domain';

type InngestEnvironment = Readonly<Record<string, string | undefined>>;

export function resolveInngestClientOptions(
  env: InngestEnvironment = process.env,
): { readonly eventKey?: string; readonly baseUrl?: string } {
  const eventKey = env['INNGEST_EVENT_KEY']?.trim();
  const baseUrl = env['INNGEST_BASE_URL']?.trim();
  return {
    ...(eventKey === undefined || eventKey === '' ? {} : { eventKey }),
    ...(baseUrl === undefined || baseUrl === '' ? {} : { baseUrl }),
  };
}

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
      runId: string;
      canonicalVersion?: string;
    };
  };
  'novel/project-brief.requested': {
    data: {
      workspaceId: string;
      bookId: string;
      targetId: string;
      intent: 'propose' | 'regenerate';
      requestedBy: string;
      idempotencyKey: string;
      runId: string;
      canonicalVersion?: string;
    };
  };
  'novel/world-foundation.requested': {
    data: {
      workspaceId: string;
      bookId: string;
      targetId: string;
      intent: 'propose' | 'regenerate';
      requestedBy: string;
      idempotencyKey: string;
      runId: string;
      canonicalVersion?: string;
    };
  };
  'novel/story-blueprint.requested': {
    data: {
      workspaceId: string;
      bookId: string;
      targetId: string;
      intent: 'propose' | 'regenerate';
      requestedBy: string;
      idempotencyKey: string;
      runId: string;
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
      runId: string;
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
      runId: string;
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
      runId: string;
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
  ...resolveInngestClientOptions(),
  schemas: new EventSchemas().fromRecord<NovelEvents>(),
});

export async function dispatchCommandToInngest(
  envelope: CommandEnvelope,
  canonicalVersion?: string,
  runId?: string,
): Promise<void> {
  if (envelope.artifactType !== undefined) {
    await dispatchArtifactCommand(envelope, canonicalVersion, runId);
    return;
  }

  await dispatchSystemCommand(envelope);
}

async function dispatchArtifactCommand(
  envelope: CommandEnvelope,
  canonicalVersion?: string,
  runId?: string,
): Promise<void> {
  if (envelope.targetId === undefined || runId === undefined) {
    return;
  }

  const data = {
    workspaceId: envelope.workspaceId,
    bookId: envelope.bookId,
    targetId: envelope.targetId,
    intent: envelope.intent === 'regenerate' ? 'regenerate' : 'propose',
    requestedBy: envelope.requestedBy,
    idempotencyKey: envelope.idempotencyKey,
    runId,
    ...(canonicalVersion !== undefined ? { canonicalVersion } : {}),
  } as const;

  const eventNameByArtifact: Readonly<Record<string, string>> = {
    'project-brief': 'novel/project-brief.requested',
    'world-foundation': 'novel/world-foundation.requested',
    'story-blueprint': 'novel/story-blueprint.requested',
    'chapter-outline': 'novel/chapter-outline.requested',
    'chapter-manuscript': 'novel/chapter-manuscript.requested',
    'volume-outline': 'novel/volume-outline.requested',
    'world-change': 'novel/world-change.requested',
  };

  const eventName = eventNameByArtifact[envelope.artifactType ?? ''];
  if (eventName === undefined) {
    return;
  }

  await inngest.send({ name: eventName, data } as never);
}

async function dispatchSystemCommand(envelope: CommandEnvelope): Promise<void> {
  if (envelope.systemTaskType !== 'rebuild-graph') {
    return;
  }

  await inngest.send({
    name: 'novel/sync.rebuild-graph',
    data: { workspaceId: envelope.workspaceId, bookId: envelope.bookId },
  });
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
