import type { Book, ProjectBrief } from '../../domain/schema-types';
import { serializeCanonicalMarkdown } from '../../workspace/markdown';

const INITIAL_BOOK_SNAPSHOT_ID = 'snap-0001';

export interface BootstrapInitialFile {
  readonly path: 'state/book/book.md' | 'state/book/project-brief.md';
  readonly content: string;
}

export interface BootstrapInitialFiles {
  readonly book: BootstrapInitialFile;
  readonly projectBrief: BootstrapInitialFile;
}

/**
 * Builds the `Book` canonical entity that the project-brief approval must create
 * atomically (docs/architecture/modules/11-bootstrap-and-onboarding.md §11.3):
 * `planning` status, empty anchor lists, and a default chapter-type policy.
 */
export function buildInitialBook(brief: ProjectBrief, latestCanonicalVersion: string): Book {
  return {
    id: brief.bookId,
    title: brief.title,
    status: 'planning',
    latestCanonicalVersion,
    globalPromises: [],
    globalConstraints: [],
    defaultChapterTypePolicy: { maxConsecutiveSamePrimaryType: 1 },
  };
}

/**
 * Serializes the first canonical workspace for a new book: `state/book/book.md` and
 * `state/book/project-brief.md` (with the brief marked `approved`), so the bootstrap
 * approval can commit both files and re-sync into the first snapshot in one step.
 */
export function buildBootstrapInitialFiles(brief: ProjectBrief): BootstrapInitialFiles {
  const book = buildInitialBook(brief, INITIAL_BOOK_SNAPSHOT_ID);
  const approvedBrief: ProjectBrief = { ...brief, status: 'approved' };

  return {
    book: {
      path: 'state/book/book.md',
      content: serializeCanonicalMarkdown({ frontmatter: book }),
    },
    projectBrief: {
      path: 'state/book/project-brief.md',
      content: serializeCanonicalMarkdown({ frontmatter: approvedBrief }),
    },
  };
}
