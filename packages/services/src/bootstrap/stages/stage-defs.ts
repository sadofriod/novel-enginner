import type { BootstrapPath, BootstrapStage, NewBookStage, ImportStage } from '../types';

const newBookStages: readonly NewBookStage[] = [
  'market-research',
  'inspiration-dialogue',
  'project-brief',
  'world-foundation',
  'story-blueprint',
  'volume-outlines',
  'chapter-outline-batch',
] as const;

const importStages: readonly ImportStage[] = [
  'import-scan',
  'import-mapping',
  'import-confirmation',
  'import-health-report',
] as const;

const stageMap: Readonly<Record<BootstrapPath, readonly BootstrapStage[]>> = {
  'new-book': newBookStages,
  import: importStages,
};

export function getStagesForPath(path: BootstrapPath): readonly BootstrapStage[] {
  return stageMap[path];
}

export function getStageDefinition(path: BootstrapPath, stageId: BootstrapStage): { readonly id: BootstrapStage; readonly path: BootstrapPath; readonly title: string } {
  const title = stageId.replace(/-/g, ' ');
  return { id: stageId, path, title };
}

export function isValidStageForPath(path: BootstrapPath, stageId: BootstrapStage): boolean {
  return getStagesForPath(path).includes(stageId);
}

export function getFirstStageId(path: BootstrapPath): BootstrapStage {
  return getStagesForPath(path)[0] ?? 'market-research';
}

export function getNextStageId(path: BootstrapPath, stageId: BootstrapStage): BootstrapStage | undefined {
  const stages = getStagesForPath(path);
  const currentIndex = stages.indexOf(stageId);
  return currentIndex >= 0 && currentIndex < stages.length - 1 ? stages[currentIndex + 1] : undefined;
}

export function isLastStage(path: BootstrapPath, stageId: BootstrapStage): boolean {
  const stages = getStagesForPath(path);
  return stages[stages.length - 1] === stageId;
}
