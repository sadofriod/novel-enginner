import { describe, test, expect } from 'bun:test';
import {
  getStageDefinition,
  getStagesForPath,
  isValidStageForPath,
  getNextStageId,
  getFirstStageId,
  isLastStage,
  type NewBookStageDefinition,
  type ImportStageDefinition,
} from './stage-defs';

describe('Stage Definitions', () => {
  test('retrieves stage definitions by path and id', () => {
    const stage = getStageDefinition('market-research', 'new-book');
    expect(stage).toBeDefined();
    expect(stage?.id).toBe('market-research');
    expect(stage?.path).toBe('new-book');
  });

  test('returns undefined for invalid stage id', () => {
    const stage = getStageDefinition('invalid-stage', 'new-book');
    expect(stage).toBeUndefined();
  });

  test('returns all stages for new-book path', () => {
    const stages = getStagesForPath('new-book');
    expect(stages.length).toBe(7);
    expect(stages[0]?.id).toBe('market-research');
    expect(stages[stages.length - 1]?.id).toBe('chapter-outline-batch');
  });

  test('returns all stages for import path', () => {
    const stages = getStagesForPath('import');
    expect(stages.length).toBe(4);
    expect(stages[0]?.id).toBe('import-scan');
    expect(stages[stages.length - 1]?.id).toBe('import-health-report');
  });

  test('validates stage for path', () => {
    expect(isValidStageForPath('market-research', 'new-book')).toBe(true);
    expect(isValidStageForPath('import-scan', 'import')).toBe(true);
    expect(isValidStageForPath('market-research', 'import')).toBe(false);
    expect(isValidStageForPath('import-scan', 'new-book')).toBe(false);
  });

  test('gets next stage id in sequence', () => {
    const next = getNextStageId('market-research', 'new-book');
    expect(next).toBe('inspiration-dialogue');

    const nextAfterSecond = getNextStageId('inspiration-dialogue', 'new-book');
    expect(nextAfterSecond).toBe('project-brief');
  });

  test('returns undefined for last stage', () => {
    const next = getNextStageId('chapter-outline-batch', 'new-book');
    expect(next).toBeUndefined();

    const importNext = getNextStageId('import-health-report', 'import');
    expect(importNext).toBeUndefined();
  });

  test('gets first stage id for path', () => {
    expect(getFirstStageId('new-book')).toBe('market-research');
    expect(getFirstStageId('import')).toBe('import-scan');
  });

  test('identifies last stage correctly', () => {
    expect(isLastStage('chapter-outline-batch', 'new-book')).toBe(true);
    expect(isLastStage('market-research', 'new-book')).toBe(false);

    expect(isLastStage('import-health-report', 'import')).toBe(true);
    expect(isLastStage('import-scan', 'import')).toBe(false);
  });

  test('stage definitions have consistent structure', () => {
    const newBookStages = getStagesForPath('new-book');
    newBookStages.forEach((stage) => {
      expect(stage.path).toBe('new-book');
      expect(stage.label).toBeDefined();
      expect(stage.label.length).toBeGreaterThan(0);
      expect(stage.description).toBeDefined();
      expect(stage.description.length).toBeGreaterThan(0);
      expect(stage.isTerminal).toBe(false);
    });

    const importStages = getStagesForPath('import');
    importStages.forEach((stage) => {
      expect(stage.path).toBe('import');
      expect(stage.label).toBeDefined();
      expect(stage.label.length).toBeGreaterThan(0);
      expect(stage.description).toBeDefined();
      expect(stage.description.length).toBeGreaterThan(0);
      expect(stage.isTerminal).toBe(false);
    });
  });
});
