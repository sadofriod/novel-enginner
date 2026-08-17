import { describe, expect, test } from 'bun:test';

import { BookSchema } from '../../domain/schemas/canonical';
import { validateCanonicalFile } from '../../workspace/sync-engine';

import { type ProjectBrief, validateProjectBrief } from './canonical-artifacts';
import { buildBootstrapInitialFiles, buildInitialBook } from './book-init';

const BRIEF_INPUT = {
  id: 'project-brief-nova-run',
  bookId: 'book-nova-run',
  title: 'Nova Run',
  genres: ['科幻', '太空歌剧'],
  targetAudience: '青年读者',
  marketScope: '中文网络连载市场',
  readerPromise: '持续紧张感与情感共鸣',
  corePremise: '在压迫性的世界规则中追求自我选择',
  openingHook: '一场看似偶然的事件将主人公推向世界中心',
  contentBoundaries: ['不写出全篇大结局'],
  format: '连载长篇',
  sourceResearchEvidenceIds: ['evidence-trend-1'],
  assumptionIds: ['assumption-001'],
  status: 'draft',
};

const BRIEF: ProjectBrief = validateProjectBrief(BRIEF_INPUT);

describe('buildInitialBook', () => {
  test('builds a planning book bound to the project brief', () => {
    const book = buildInitialBook(BRIEF, 'snap-0001');

    const parsed = BookSchema.parse(book);
    expect(parsed).toEqual(book);
    expect(book.id).toBe('book-nova-run');
    expect(book.title).toBe('Nova Run');
    expect(book.status).toBe('planning');
    expect(book.latestCanonicalVersion).toBe('snap-0001');
    expect(book.globalPromises).toEqual([]);
    expect(book.globalConstraints).toEqual([]);
  });
});

describe('buildBootstrapInitialFiles', () => {
  test('serializes book.md and project-brief.md as valid canonical markdown', () => {
    const files = buildBootstrapInitialFiles(BRIEF);

    expect(files.book.path).toBe('state/book/book.md');
    expect(files.projectBrief.path).toBe('state/book/project-brief.md');

    const bookEntity = validateCanonicalFile({ path: files.book.path, content: files.book.content });
    expect(bookEntity.kind).toBe('book');
    expect((bookEntity.data as { title: string }).title).toBe('Nova Run');

    const briefEntity = validateCanonicalFile({ path: files.projectBrief.path, content: files.projectBrief.content });
    expect(briefEntity.kind).toBe('project-brief');
    expect((briefEntity.data as { bookId: string; status: string }).bookId).toBe('book-nova-run');
    expect((briefEntity.data as { status: string }).status).toBe('approved');
  });
});
