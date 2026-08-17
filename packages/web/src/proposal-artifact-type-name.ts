import type { ProposalArtifactType } from '@novel-enginner/services/domain/values';

const PROPOSAL_ARTIFACT_TYPE_NAMES = {
  'project-brief': '项目简介',
  'world-foundation': '世界观基石',
  'story-blueprint': '故事蓝图',
  'world-change': '世界观变更',
  'volume-outline': '卷纲',
  'chapter-outline': '章节细纲',
  'chapter-manuscript': '正文章节',
  'character-update': '角色更新',
  'faction-update': '势力更新',
  'location-update': '地点更新',
  'tech-rule-update': '技术规则更新',
  'fact-update': '事实更新',
  'relationship-update': '关系更新',
  'resource-update': '资源更新',
} satisfies Record<ProposalArtifactType, string>;

export function getProposalArtifactTypeName(artifactType: ProposalArtifactType): string {
  return PROPOSAL_ARTIFACT_TYPE_NAMES[artifactType];
}