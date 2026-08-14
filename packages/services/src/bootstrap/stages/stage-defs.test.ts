import { describe, expect, test } from 'bun:test';

import { getFirstStageId, getNextStageId, getStagesForPath, isLastStage, isValidStageForPath } from './stage-defs';

describe('bootstrap stage definitions', () => {
  test('exposes the expected new-book and import stages', () => {
    expect(getStagesForPath('new-book')).toContain('market-research');
    expect(getStagesForPath('import')).toContain('import-scan');
  });

  test('validates stage membership and navigation', () => {
    expect(isValidStageForPath('new-book', 'project-brief')).toBe(true);
    expect(isValidStageForPath('import', 'world-foundation')).toBe(false);
    expect(getNextStageId('new-book', 'inspiration-dialogue')).toBe('project-brief');
    expect(getFirstStageId('import')).toBe('import-scan');
    expect(isLastStage('import', 'import-health-report')).toBe(true);
  });
});
