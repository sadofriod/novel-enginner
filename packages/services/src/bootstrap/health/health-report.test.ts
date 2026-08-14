import { describe, test, expect } from 'bun:test';
import { BootstrapHealthReportGenerator } from './health-report';

describe('BootstrapHealthReportGenerator', () => {
  const generator = new BootstrapHealthReportGenerator();

  test('identifies missing project-brief', () => {
    const report = generator.generateReport('session-1', {
      hasProjectBrief: false,
      hasWorldFoundation: true,
      hasStoryBlueprint: true,
      volumeCount: 1,
      chapterOutlinesCount: 5,
      brokenReferences: [],
      missingReferences: [],
    });

    const projectBriefIssue = report.issues.find((i) => i.type === 'missing-project-brief');
    expect(projectBriefIssue).toBeDefined();
    expect(projectBriefIssue?.severity).toBe('critical');
  });

  test('identifies missing world-foundation', () => {
    const report = generator.generateReport('session-1', {
      hasProjectBrief: true,
      hasWorldFoundation: false,
      hasStoryBlueprint: true,
      volumeCount: 1,
      chapterOutlinesCount: 5,
      brokenReferences: [],
      missingReferences: [],
    });

    const worldIssue = report.issues.find((i) => i.type === 'missing-world-foundation');
    expect(worldIssue).toBeDefined();
    expect(worldIssue?.severity).toBe('critical');
  });

  test('identifies missing story-blueprint as warning', () => {
    const report = generator.generateReport('session-1', {
      hasProjectBrief: true,
      hasWorldFoundation: true,
      hasStoryBlueprint: false,
      volumeCount: 1,
      chapterOutlinesCount: 5,
      brokenReferences: [],
      missingReferences: [],
    });

    const storyIssue = report.issues.find((i) => i.type === 'missing-story-blueprint');
    expect(storyIssue).toBeDefined();
    expect(storyIssue?.severity).toBe('warning');
  });

  test('identifies missing volume outlines', () => {
    const report = generator.generateReport('session-1', {
      hasProjectBrief: true,
      hasWorldFoundation: true,
      hasStoryBlueprint: true,
      volumeCount: 0,
      chapterOutlinesCount: 0,
      brokenReferences: [],
      missingReferences: [],
    });

    const volumeIssue = report.issues.find((i) => i.type === 'missing-volume-outline');
    expect(volumeIssue).toBeDefined();
    expect(volumeIssue?.severity).toBe('warning');
  });

  test('identifies missing chapter outlines', () => {
    const report = generator.generateReport('session-1', {
      hasProjectBrief: true,
      hasWorldFoundation: true,
      hasStoryBlueprint: true,
      volumeCount: 1,
      chapterOutlinesCount: 0,
      brokenReferences: [],
      missingReferences: [],
    });

    const chapterIssue = report.issues.find((i) => i.type === 'missing-chapter-outline');
    expect(chapterIssue).toBeDefined();
    expect(chapterIssue?.severity).toBe('warning');
  });

  test('identifies broken references', () => {
    const report = generator.generateReport('session-1', {
      hasProjectBrief: true,
      hasWorldFoundation: true,
      hasStoryBlueprint: true,
      volumeCount: 1,
      chapterOutlinesCount: 5,
      brokenReferences: ['ref-1.md', 'ref-2.md', 'ref-3.md'],
      missingReferences: [],
    });

    const refIssue = report.issues.find((i) => i.type === 'broken-references');
    expect(refIssue).toBeDefined();
    expect(refIssue?.severity).toBe('warning');
    expect(refIssue?.affectedItems?.length).toBe(3);
  });

  test('identifies missing external references', () => {
    const report = generator.generateReport('session-1', {
      hasProjectBrief: true,
      hasWorldFoundation: true,
      hasStoryBlueprint: true,
      volumeCount: 1,
      chapterOutlinesCount: 5,
      brokenReferences: [],
      missingReferences: ['external-1', 'external-2'],
    });

    const missingRefIssue = report.issues.find((i) => i.type === 'missing-references');
    expect(missingRefIssue).toBeDefined();
    expect(missingRefIssue?.severity).toBe('info');
  });

  test('calculates correct statistics for healthy import', () => {
    const report = generator.generateReport('session-1', {
      hasProjectBrief: true,
      hasWorldFoundation: true,
      hasStoryBlueprint: true,
      volumeCount: 3,
      chapterOutlinesCount: 10,
      brokenReferences: [],
      missingReferences: [],
    });

    expect(report.statistics.projectBriefReady).toBe(true);
    expect(report.statistics.worldFoundationReady).toBe(true);
    expect(report.statistics.storyBlueprintReady).toBe(true);
    expect(report.statistics.volumeOutlinesReady).toBe(true);
    expect(report.statistics.chapterOutlinesReady).toBe(10);
    expect(report.statistics.totalIssuesCount).toBe(0);
    expect(report.statistics.criticalIssuesCount).toBe(0);
  });

  test('generates priority sequence for fixes', () => {
    const report = generator.generateReport('session-1', {
      hasProjectBrief: false,
      hasWorldFoundation: false,
      hasStoryBlueprint: false,
      volumeCount: 0,
      chapterOutlinesCount: 0,
      brokenReferences: [],
      missingReferences: [],
    });

    expect(report.prioritySequence.length).toBeGreaterThan(0);
    expect(report.prioritySequence[0]?.type).toBe('create-project-brief');
    expect(report.prioritySequence[0]?.step).toBe(1);
  });

  test('prioritizes project-brief before world-foundation', () => {
    const report = generator.generateReport('session-1', {
      hasProjectBrief: false,
      hasWorldFoundation: false,
      hasStoryBlueprint: true,
      volumeCount: 1,
      chapterOutlinesCount: 1,
      brokenReferences: [],
      missingReferences: [],
    });

    const projectBriefStep = report.prioritySequence.find((p) => p.type === 'create-project-brief');
    const worldFoundationStep = report.prioritySequence.find((p) => p.type === 'create-world-foundation');

    expect(projectBriefStep).toBeDefined();
    expect(worldFoundationStep).toBeDefined();
    expect(projectBriefStep!.step).toBeLessThan(worldFoundationStep!.step);
  });

  test('determines when bootstrap can proceed to writing', () => {
    const healthyReport = generator.generateReport('session-1', {
      hasProjectBrief: true,
      hasWorldFoundation: true,
      hasStoryBlueprint: true,
      volumeCount: 1,
      chapterOutlinesCount: 1,
      brokenReferences: [],
      missingReferences: [],
    });

    const canProceed1 = generator.canProceedToWriting(healthyReport);
    expect(canProceed1.canProceed).toBe(true);
    expect(canProceed1.blockers.length).toBe(0);

    const unhealthyReport = generator.generateReport('session-1', {
      hasProjectBrief: false,
      hasWorldFoundation: true,
      hasStoryBlueprint: true,
      volumeCount: 0,
      chapterOutlinesCount: 0,
      brokenReferences: [],
      missingReferences: [],
    });

    const canProceed2 = generator.canProceedToWriting(unhealthyReport);
    expect(canProceed2.canProceed).toBe(false);
    expect(canProceed2.blockers.length).toBeGreaterThan(0);
  });

  test('report contains suggestions for fixing issues', () => {
    const report = generator.generateReport('session-1', {
      hasProjectBrief: false,
      hasWorldFoundation: true,
      hasStoryBlueprint: true,
      volumeCount: 1,
      chapterOutlinesCount: 1,
      brokenReferences: [],
      missingReferences: [],
    });

    const projectBriefIssue = report.issues.find((i) => i.type === 'missing-project-brief');
    expect(projectBriefIssue?.suggestions).toBeDefined();
    expect(projectBriefIssue?.suggestions!.length).toBeGreaterThan(0);
  });
});
