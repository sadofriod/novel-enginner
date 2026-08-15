import { describe, expect, test } from 'bun:test';

import {
  CanonicalDraftValidationError,
  createValidatedCanonicalDraft,
  validateCanonicalDraftForProposal,
} from './canonical-draft';

const VALID_CHARACTER_MARKDOWN = `---
id: char-lin-mo
name: Lin Mo
status: active
coreMotivation: Survive the gravity well
worldview: engineering-pragmatist
techLevel: tier-3
---

# Summary

A technical survivor.
`;

describe('canonical draft validation', () => {
  test('creates a persistable draft from canonical Markdown that matches its layout', () => {
    const draft = createValidatedCanonicalDraft({
      proposalId: 'proposal-character-001',
      relativePath: 'state/characters/char-lin-mo.md',
      content: VALID_CHARACTER_MARKDOWN,
    });

    expect(draft).toEqual({
      proposalId: 'proposal-character-001',
      relativePath: 'state/characters/char-lin-mo.md',
      content: VALID_CHARACTER_MARKDOWN,
    });
  });

  test('rejects a draft whose path or frontmatter does not satisfy the canonical contract', () => {
    expect(() => createValidatedCanonicalDraft({
      proposalId: 'proposal-character-001',
      relativePath: 'references/character.md',
      content: VALID_CHARACTER_MARKDOWN,
    })).toThrow(CanonicalDraftValidationError);

    expect(() => createValidatedCanonicalDraft({
      proposalId: 'proposal-character-001',
      relativePath: 'state/characters/char-lin-mo.md',
      content: VALID_CHARACTER_MARKDOWN.replace('status: active', 'status: unknown'),
    })).toThrow(CanonicalDraftValidationError);
  });

  test('requires a draft to match its proposal artifact type and target id', () => {
    const draft = createValidatedCanonicalDraft({
      proposalId: 'proposal-character-001',
      relativePath: 'state/characters/char-lin-mo.md',
      content: VALID_CHARACTER_MARKDOWN,
    });

    expect(validateCanonicalDraftForProposal(draft, {
      artifactType: 'character-update',
      targetId: 'char-lin-mo',
    })).toEqual(draft);

    expect(() => validateCanonicalDraftForProposal(draft, {
      artifactType: 'character-update',
      targetId: 'char-other',
    })).toThrow(CanonicalDraftValidationError);

    expect(() => validateCanonicalDraftForProposal({
      ...draft,
      relativePath: 'state/characters/char-other.md',
    }, {
      artifactType: 'character-update',
      targetId: 'char-lin-mo',
    })).toThrow(CanonicalDraftValidationError);
  });
});
