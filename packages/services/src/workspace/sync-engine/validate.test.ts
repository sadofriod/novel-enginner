import { describe, expect, test } from 'bun:test';

import { MarkdownContractError } from '../markdown';
import { validateCanonicalFile } from './validate';

const CHARACTER = `---
id: char-1
name: Hero
status: active
coreMotivation: survive
worldview: pragmatic
techLevel: tier-1
---

# Summary

A stable character.
`;

describe('validateCanonicalFile', () => {
  test('validates a canonical file and returns a snapshot with a content hash', () => {
    const result = validateCanonicalFile({ path: 'state/characters/char-1.md', content: CHARACTER });

    expect(result.path).toBe('state/characters/char-1.md');
    expect(result.kind).toBe('character');
    expect((result.data as { id: string }).id).toBe('char-1');
    expect(result.contentHash).toMatch(/^[0-9a-f]+$/);
  });

  test('throws for paths that do not match any canonical layout rule', () => {
    expect(() =>
      validateCanonicalFile({ path: 'state/README.md', content: '# hello' }),
    ).toThrow(MarkdownContractError);
  });

  test('throws when frontmatter fails schema validation', () => {
    const invalid = `---
id: char-1
status: not-a-real-status
---

# Summary

Broken.
`;
    expect(() =>
      validateCanonicalFile({ path: 'state/characters/char-1.md', content: invalid }),
    ).toThrow(MarkdownContractError);
  });
});
