import { describe, expect, test } from 'bun:test';

import { canProceedToWriting, generatePrioritySequence, generateReport } from './health-report';

describe('bootstrap health report', () => {
  test('reports missing artifacts and readiness', () => {
    const report = generateReport(['project-brief', 'world-foundation'], ['state/chapters/chapter-1.md']);
    expect(report.ready).toBe(false);
    expect(report.prioritySequence).toContain('project-brief');
    expect(canProceedToWriting(report)).toBe(false);
  });

  test('returns a safe priority sequence', () => {
    expect(generatePrioritySequence(['world-foundation', 'project-brief', 'project-brief'])).toEqual(['world-foundation', 'project-brief']);
  });

  test('flags copied files that fail canonical validation as not ready', () => {
    const report = generateReport([], [], [
      { path: 'state/book/project-brief.md', reason: 'Frontmatter for "state/book/project-brief.md" failed validation.' },
    ]);

    expect(report.ready).toBe(false);
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: 'invalid-state/book/project-brief.md',
        severity: 'error',
      }),
    ]);
    expect(canProceedToWriting(report)).toBe(false);
  });
});
