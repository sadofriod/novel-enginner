import { describe, expect, test } from 'bun:test';

import { parseCanonicalMarkdown, serializeCanonicalMarkdown } from './index';

const VALID_CHARACTER_MARKDOWN = `---
id: char-lin-mo
name: 林默
status: active
coreMotivation: 逃离天鹅座引力阱
worldview: engineering-pragmatist
techLevel: tier-3
---

# Summary

角色当前阶段为技术驱动型求生者。

# Notes

这里允许记录不参与强校验的人类备注。
`;

describe('canonical markdown round-trip', () => {
  test('parses frontmatter and body sections', () => {
    const parsed = parseCanonicalMarkdown(VALID_CHARACTER_MARKDOWN);
    expect((parsed.frontmatter as { id: string }).id).toBe('char-lin-mo');
    expect(parsed.sections.get('Summary')).toContain('技术驱动型求生者');
    expect(parsed.sections.get('Notes')).toContain('人类备注');
  });

  test('serializes back to a parseable document preserving frontmatter fields', () => {
    const parsed = parseCanonicalMarkdown(VALID_CHARACTER_MARKDOWN);
    const serialized = serializeCanonicalMarkdown({
      frontmatter: parsed.frontmatter,
      sections: parsed.sections,
    });
    const reparsed = parseCanonicalMarkdown(serialized);
    expect(reparsed.frontmatter).toEqual(parsed.frontmatter);
    expect(reparsed.sections.get('Summary')).toBe(parsed.sections.get('Summary'));
  });

  test('parses scene heading anchors distinctly from regular sections', () => {
    const doc = `---\nid: chapter-0042\nchapterNumber: 42\nvolumeId: volume-001\nbasedOnOutlineId: chapter-0042-outline\nstatus: approved\nbasedOnCanonicalVersion: snap-001\nsceneAnchorIds:\n  - scene-0042-lab-entry\n---\n\n# Scene scene-0042-lab-entry\n\n林默贴着残损实验室外墙向前摸进。\n`;
    const parsed = parseCanonicalMarkdown(doc);
    expect(parsed.scenes.get('scene-0042-lab-entry')).toContain('林默');
    expect(parsed.sections.size).toBe(0);
  });

  test('rejects markdown without a closed frontmatter block', () => {
    expect(() => parseCanonicalMarkdown('no frontmatter here')).toThrow();
  });
});
