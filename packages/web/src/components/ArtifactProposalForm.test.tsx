import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { ArtifactProposalForm } from './ArtifactProposalForm';

const FORM_EXPECTATIONS = [
  ['project-brief', '项目简介 ID', 'project-brief'],
  ['world-foundation', '世界观基石 ID', 'world-foundation'],
  ['story-blueprint', '故事蓝图 ID', 'story-blueprint'],
  ['world-change', '世界观变更 ID', 'world-change'],
  ['volume-outline', '卷 ID', 'volume-001'],
  ['chapter-outline', '章节细纲 ID', 'chapter-0001-outline'],
  ['chapter-manuscript', '正文 ID', 'chapter-0001-manuscript'],
  ['character-update', '角色 ID', 'char-mira'],
  ['faction-update', '势力 ID', 'faction-harbor-wardens'],
  ['location-update', '地点 ID', 'location-harbor'],
  ['tech-rule-update', '技术规则 ID', 'tech-tide-clock'],
  ['fact-update', '事实 ID', 'fact-tide-lock'],
  ['relationship-update', '关系 ID', 'rel-mira-warden'],
  ['resource-update', '资源 ID', 'res-brass-key'],
] as const;

describe('ArtifactProposalForm', () => {
  test.each(FORM_EXPECTATIONS)('renders the documented target form for %s', (artifactType, label, placeholder) => {
    const html = renderToStaticMarkup(
      <ArtifactProposalForm artifactType={artifactType} targetId="" onTargetIdChange={() => undefined} />,
    );

    expect(html).toContain(label);
    expect(html).toContain(`placeholder="${placeholder}"`);
  });

  test('states that a manuscript proposal requires an approved outline', () => {
    const html = renderToStaticMarkup(
      <ArtifactProposalForm artifactType="chapter-manuscript" targetId="" onTargetIdChange={() => undefined} />,
    );

    expect(html).toContain('必须基于已批准的章节细纲');
  });
});