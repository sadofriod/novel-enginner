import { describe, expect, test } from 'bun:test';

import { listCanonicalDirectories, resolveLayoutRuleForPath } from './layout';

describe('canonical workspace layout', () => {
  test('resolves the bootstrap canonical document paths', () => {
    expect(resolveLayoutRuleForPath('state/book/project-brief.md')?.kind).toBe('project-brief');
    expect(resolveLayoutRuleForPath('state/book/story-blueprint.md')?.kind).toBe('story-blueprint');
    expect(resolveLayoutRuleForPath('state/world/world-foundation.md')?.kind).toBe('world-foundation');
  });

  test('includes the bootstrap directories in the canonical directory list', () => {
    expect(listCanonicalDirectories()).toEqual(expect.arrayContaining(['state/book', 'state/world']));
  });

  test('recognizes the reviewer rules and vocabulary config directories', () => {
    expect(resolveLayoutRuleForPath('state/reviewer/rules.json')?.kind).toBe('reviewer-rules');
    expect(resolveLayoutRuleForPath('state/vocabularies/registry.json')?.kind).toBe('vocabulary-registry');
  });
});
