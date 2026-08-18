import { describe, expect, test } from 'bun:test';

import { createChapterManuscriptDraft } from './canonical-draft';
import { buildOptimizedDraftContent } from './optimize-draft';

const ORIGINAL_MANUSCRIPT = `---
id: chapter-0001
chapterNumber: 1
volumeId: volume-001
basedOnOutlineId: chapter-0001-outline
status: draft
displayTitle: 修复师的日常
basedOnCanonicalVersion: snap-0001
sceneAnchorIds:
  - scene-chapter-0001-source
---

# Scene scene-chapter-0001-source

原始正文段落：凯蹲在老周的旧货摊前。
`;

const LLM_PLAIN_PROSE = '凯走进旧货市场，手指划过废弃的生物电极组件。空气中弥漫着金属锈蚀的气味。\n\n"这根校准线还能用？"凯拿起线缆问道。\n\n老周眯眼看了看，伸出三根手指。';

const LLM_FULL_CANONICAL = `---
id: chapter-0001
chapterNumber: 1
volumeId: volume-001
basedOnOutlineId: chapter-0001-outline
status: draft
displayTitle: 修复师的日常
basedOnCanonicalVersion: snap-0001
sceneAnchorIds:
  - scene-chapter-0001-source
---

# Scene scene-chapter-0001-source

模型完整输出的优化正文。
`;

describe('buildOptimizedDraftContent', () => {
  test('wraps plain-prose model output in the original canonical shell', () => {
    const result = buildOptimizedDraftContent(ORIGINAL_MANUSCRIPT, LLM_PLAIN_PROSE);
    expect(result.startsWith('---')).toBe(true);
    expect(result).toContain('id: chapter-0001');
    expect(result).toContain('volumeId: volume-001');
    expect(result).toContain('# Scene scene-chapter-0001-source');
    expect(result).toContain(LLM_PLAIN_PROSE);
  });

  test('wrapped plain-prose output validates as a chapter manuscript draft', () => {
    const result = buildOptimizedDraftContent(ORIGINAL_MANUSCRIPT, LLM_PLAIN_PROSE);
    const draft = createChapterManuscriptDraft({
      proposalId: 'proposal-probe',
      targetId: 'chapter-0001',
      content: result,
    });
    expect(draft.relativePath).toBe('manuscript/volume-001/chapter-0001.md');
  });

  test('prefers a fully-formed canonical model output as-is', () => {
    const result = buildOptimizedDraftContent(ORIGINAL_MANUSCRIPT, LLM_FULL_CANONICAL);
    expect(result).toBe(LLM_FULL_CANONICAL.trim());
  });

  test('returns the model output when the original shell is unavailable', () => {
    const result = buildOptimizedDraftContent('# old\n', LLM_PLAIN_PROSE);
    expect(result).toBe(LLM_PLAIN_PROSE);
  });
});
