import type { BootstrapPath } from '../types';
export interface StageDefinition {
  id: string;
  path: BootstrapPath;
  label: string;
  description: string;
  isTerminal: boolean;
}

export interface NewBookStageDefinition extends StageDefinition {
  path: 'new-book';
}

export interface ImportStageDefinition extends StageDefinition {
  path: 'import';
}

export type AnyStageDefinition = NewBookStageDefinition | ImportStageDefinition;

const NEW_BOOK_STAGES: readonly NewBookStageDefinition[] = [
  {
    id: 'market-research' as const,
    path: 'new-book',
    label: 'Market Research',
    description: 'Analyze market trends and target audience',
    isTerminal: false,
  },
  {
    id: 'inspiration-dialogue' as const,
    path: 'new-book',
    label: 'Inspiration Dialogue',
    description: 'Five rounds of guided dialogue to develop core concept',
    isTerminal: false,
  },
  {
    id: 'project-brief' as const,
    path: 'new-book',
    label: 'Project Brief',
    description: 'Generate and confirm project positioning',
    isTerminal: false,
  },
  {
    id: 'world-foundation' as const,
    path: 'new-book',
    label: 'World Foundation',
    description: 'Define core world constraints and rules',
    isTerminal: false,
  },
  {
    id: 'story-blueprint' as const,
    path: 'new-book',
    label: 'Story Blueprint',
    description: 'Create main arc and cross-volume commitments',
    isTerminal: false,
  },
  {
    id: 'volume-outlines' as const,
    path: 'new-book',
    label: 'Volume Outlines',
    description: 'Generate outlines for all planned volumes',
    isTerminal: false,
  },
  {
    id: 'chapter-outline-batch' as const,
    path: 'new-book',
    label: 'Chapter Outline Batch',
    description: 'Generate and confirm first batch of chapter outlines',
    isTerminal: false,
  },
];

const IMPORT_STAGES: readonly ImportStageDefinition[] = [
  {
    id: 'import-scan' as const,
    path: 'import',
    label: 'Import Scan',
    description: 'Analyze existing Markdown directory structure',
    isTerminal: false,
  },
  {
    id: 'import-mapping' as const,
    path: 'import',
    label: 'Import Mapping',
    description: 'Confirm file mappings to canonical artifacts',
    isTerminal: false,
  },
  {
    id: 'import-confirmation' as const,
    path: 'import',
    label: 'Import Confirmation',
    description: 'Finalize and create canonical workspace',
    isTerminal: false,
  },
  {
    id: 'import-health-report' as const,
    path: 'import',
    label: 'Import Health Report',
    description: 'Review gaps and missing content',
    isTerminal: false,
  },
];

export function getStageDefinition(stageId: string, path: BootstrapPath): AnyStageDefinition | undefined {
  if (path === 'new-book') {
    return NEW_BOOK_STAGES.find((s) => s.id === stageId);
  }
  if (path === 'import') {
    return IMPORT_STAGES.find((s) => s.id === stageId);
  }
  return undefined;
}

export function getStagesForPath(path: BootstrapPath): readonly AnyStageDefinition[] {
  if (path === 'new-book') {
    return NEW_BOOK_STAGES;
  }
  if (path === 'import') {
    return IMPORT_STAGES;
  }
  return [];
}

export function isValidStageForPath(stageId: string, path: BootstrapPath): boolean {
  return getStageDefinition(stageId, path) !== undefined;
}

export function getNextStageId(currentStageId: string, path: BootstrapPath): string | undefined {
  const stages = getStagesForPath(path);
  const currentIndex = stages.findIndex((s) => s.id === currentStageId);
  if (currentIndex === -1 || currentIndex === stages.length - 1) {
    return undefined;
  }
  return stages[currentIndex + 1]!.id;
}

export function getFirstStageId(path: BootstrapPath): string | undefined {
  const stages = getStagesForPath(path);
  return stages[0]?.id;
}

export function isLastStage(stageId: string, path: BootstrapPath): boolean {
  const stages = getStagesForPath(path);
  return stages.length > 0 && stages[stages.length - 1]!.id === stageId;
}
