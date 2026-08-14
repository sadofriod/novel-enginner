import { describe, expect, test } from 'bun:test';

import { approveMapping, createMapping, updateEntry, validateMapping } from './import-mapper';

describe('bootstrap import mapper', () => {
  test('creates and validates mapping entries', () => {
    const mapping = createMapping([
      { sourcePath: 'project-brief.md', detectedKind: 'project-brief', canonicalTarget: 'state/book/project-brief.md', confidence: 0.9 },
    ]);
    expect(validateMapping(mapping)).toBe(true);
    const next = updateEntry(mapping, 'project-brief.md', { canonicalTarget: 'state/book/project-brief.md', confidence: 1 });
    expect(next.summary).toContain('updated');
    const approved = approveMapping(next);
    expect(approved.approved).toBe(true);
  });
});
