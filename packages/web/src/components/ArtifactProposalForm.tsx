import { TextField } from '@mui/material';

import type { ProposalArtifactType } from '@novel-enginner/services/domain/values';

type ArtifactProposalFormProps = {
  readonly artifactType: ProposalArtifactType;
  readonly targetId: string;
  readonly onTargetIdChange: (targetId: string) => void;
};

type ArtifactProposalFormSpec = {
  readonly label: string;
  readonly placeholder: string;
  readonly helpText?: string;
};

const ARTIFACT_PROPOSAL_FORM_SPECS = {
  'project-brief': { label: '项目简介 ID', placeholder: 'project-brief', helpText: '创作定位、读者承诺与研究约束。' },
  'world-foundation': { label: '世界观基石 ID', placeholder: 'world-foundation', helpText: '世界硬规则，依赖已批准的项目简介。' },
  'story-blueprint': { label: '故事蓝图 ID', placeholder: 'story-blueprint', helpText: '全书主线与跨卷承诺，依赖项目简介和世界观基石。' },
  'world-change': { label: '世界观变更 ID', placeholder: 'world-change', helpText: '影响分析与跨聚合 patch set。' },
  'volume-outline': { label: '卷 ID', placeholder: 'volume-001', helpText: '卷级目标、阶段与伏笔回收计划。' },
  'chapter-outline': { label: '章节细纲 ID', placeholder: 'chapter-0001-outline', helpText: '章节结构、场景骨架与情绪曲线。' },
  'chapter-manuscript': { label: '正文 ID', placeholder: 'chapter-0001-manuscript', helpText: '必须基于已批准的章节细纲。' },
  'character-update': { label: '角色 ID', placeholder: 'char-mira', helpText: '仅更新角色的可变状态与知识账本。' },
  'faction-update': { label: '势力 ID', placeholder: 'faction-harbor-wardens', helpText: '势力目标、资源与关系引用。' },
  'location-update': { label: '地点 ID', placeholder: 'location-harbor', helpText: '地点访问规则、风险与控制者。' },
  'tech-rule-update': { label: '技术规则 ID', placeholder: 'tech-tide-clock', helpText: '技术前置、成本、上限与允许效果。' },
  'fact-update': { label: '事实 ID', placeholder: 'fact-tide-lock', helpText: '共享事实、来源与可见性。' },
  'relationship-update': { label: '关系 ID', placeholder: 'rel-mira-warden', helpText: '跨实体关系的唯一权威来源。' },
  'resource-update': { label: '资源 ID', placeholder: 'res-brass-key', helpText: '资源所有者、持有者与类型。' },
} satisfies Record<ProposalArtifactType, ArtifactProposalFormSpec>;

export function ArtifactProposalForm({ artifactType, targetId, onTargetIdChange }: ArtifactProposalFormProps) {
  const formSpec = ARTIFACT_PROPOSAL_FORM_SPECS[artifactType];

  return (
    <TextField
      size="small"
      label={formSpec.label}
      aria-label={formSpec.label}
      value={targetId}
      onChange={(event) => onTargetIdChange(event.target.value)}
      placeholder={formSpec.placeholder}
      helperText={formSpec.helpText}
    />
  );
}