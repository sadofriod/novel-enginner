import { describe, expect, test } from 'bun:test';

import { resolveSearchTarget } from './search-locate';

import type { SearchResultItem } from '../../api-types';

function result(kind: string, nodeId: string): SearchResultItem {
  return { documentId: `doc:${nodeId}`, nodeId, kind, sourceRef: `state/${kind}/${nodeId}.md`, text: 'x', similarity: 0.9 };
}

describe('resolveSearchTarget', () => {
  test('maps character search results to the canonical entity', () => {
    expect(resolveSearchTarget(result('Character', 'char-mira'))).toEqual({ kind: 'character', id: 'char-mira' });
  });

  test('maps chapter search results to the chapter outline', () => {
    expect(resolveSearchTarget(result('Chapter', 'chapter-0001-outline'))).toEqual({ kind: 'chapter-outline', id: 'chapter-0001-outline' });
  });

  test('returns undefined for kinds without a canonical target', () => {
    expect(resolveSearchTarget(result('Scene', 'scene-clock'))).toBeUndefined();
  });
});
