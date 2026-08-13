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
import { Inngest } from 'inngest';

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
    };
  };
};

/** Singleton Inngest client. Lazily resolved so import is safe in test environments. */
export const inngest = new Inngest<NovelEvents>({
  id: 'novel-enginner',
});
