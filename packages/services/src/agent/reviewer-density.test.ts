import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_DESCRIPTION_DENSITY_CONFIG,
  detectDescriptionDensity,
  detectOutlineNarrativeFields,
  type DescriptionDensityConfig,
} from './reviewer-density';

const DENSE_PROSE = [
  '凯蹲在老周的旧货摊前，指尖划过一堆废弃的生物电极组件。',
  '细如发丝的金属导线在昏暗灯光下泛着暗淡银光，断裂处露出灰白的内芯。',
  '空气里混杂着金属锈蚀与旧电路板受潮的味道，还带着远处快餐店飘来的油脂气息。',
  '老周从一堆旧数据读取器后探出头，老花镜滑到了鼻尖，眯起眼盯着线缆看了很久。',
].join('\n\n');

const BALANCED_PROSE = [
  '“这根校准线还能用？”凯拿起一根半米长的黑色线缆，两端的数据接口已被磨得发亮。',
  '老周眯起眼，他意识到这不是普通的旧货——这是系统清洗前夜才会流出的规格。',
  '“三百五。”老周压低声音，“最近风声不太对，好几个熟面孔都不见了。”',
  '凯的手指在接口处停住。他明白这层意思：不是普通的风声紧，而是系统在清洗。',
  '“三百。”凯从口袋掏出皱巴巴的CP卡，拍在摊位上。',
].join('\n\n');

const NARRATIVE_PURPOSE_OUTLINE = `
sceneSkeleton:
  - id: scene-clock
    purpose: 凯走进老周的旧货摊，蹲下身子，指尖缓缓划过一堆废弃的生物电极组件，细如发丝的金属导线在昏暗灯光下泛着暗淡银光，断裂处露出灰白的内芯，空气中混杂着金属锈蚀与旧电路板受潮的味道。
    locationId: location-harbor
emotionCurve:
  - id: emotion-001
    summary: 凯站在摊位前，缓缓抬起头，目光落在远处快餐厅的霓虹灯牌上，心里默默想着这个任务到底要不要接，转身又看了一眼那些旧设备。
`;

const CONCISE_OUTLINE = `
sceneSkeleton:
  - id: scene-clock
    purpose: 凯发现码头大钟停摆。
    locationId: location-harbor
emotionCurve:
  - id: emotion-001
    summary: 凯决定接下任务。
`;

describe('detectDescriptionDensity (prose)', () => {
  test('flags a long run of consecutive pure action/scene paragraphs (signal 1)', () => {
    const config: DescriptionDensityConfig = {
      ...DEFAULT_DESCRIPTION_DENSITY_CONFIG,
      maxConsecutiveDescriptionParagraphs: 3,
      maxDescriptionParagraphRatio: 1.1, // disable ratio so only the run can trigger
    };
    expect(detectDescriptionDensity(DENSE_PROSE, config)).toBe(true);
  });

  test('does not flag prose that alternates dialogue, inner thought, and information', () => {
    expect(detectDescriptionDensity(BALANCED_PROSE, DEFAULT_DESCRIPTION_DENSITY_CONFIG)).toBe(false);
  });

  test('flags prose whose pure-description paragraph ratio exceeds the threshold (signal 2)', () => {
    const config: DescriptionDensityConfig = {
      ...DEFAULT_DESCRIPTION_DENSITY_CONFIG,
      maxConsecutiveDescriptionParagraphs: 99, // disable the run so only ratio can trigger
      maxDescriptionParagraphRatio: 0.5,
    };
    const mostlyDense = [
      '旧货摊的塑料棚顶漏下一道灰光，落在一堆废弃的数据读取器上。',
      '工作台边缘积了一层薄灰，几根散落的导线搭在铁盒边缘。',
      '墙角的密封金属箱排成一列，箱体上贴着泛黄的标签。',
      '“这根还能用？”凯拿起线缆问了一句。',
    ].join('\n\n');
    expect(detectDescriptionDensity(mostlyDense, config)).toBe(true);
  });

  test('empty or single-paragraph text never flags density', () => {
    expect(detectDescriptionDensity('', DEFAULT_DESCRIPTION_DENSITY_CONFIG)).toBe(false);
    expect(detectDescriptionDensity('凯蹲在旧货摊前。', DEFAULT_DESCRIPTION_DENSITY_CONFIG)).toBe(false);
  });
});

describe('detectOutlineNarrativeFields (outline)', () => {
  test('flags outline structural fields written as long narrative prose', () => {
    expect(detectOutlineNarrativeFields(NARRATIVE_PURPOSE_OUTLINE, DEFAULT_DESCRIPTION_DENSITY_CONFIG)).toBe(true);
  });

  test('passes concise structural fields that summarize instead of narrating', () => {
    expect(detectOutlineNarrativeFields(CONCISE_OUTLINE, DEFAULT_DESCRIPTION_DENSITY_CONFIG)).toBe(false);
  });

  test('passes outlines with no structural fields', () => {
    expect(detectOutlineNarrativeFields('# Outline\n仅此而已。', DEFAULT_DESCRIPTION_DENSITY_CONFIG)).toBe(false);
  });
});
