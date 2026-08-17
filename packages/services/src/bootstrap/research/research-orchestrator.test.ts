import { describe, expect, test } from 'bun:test';

import { ProjectBriefSchema } from '../domain/canonical-artifacts';

import { extractCleanedSummary, generateProjectBriefProposal, generateTrendReport, initializeDialogueRounds, validateKeyDecisions } from './research-orchestrator';

describe('bootstrap research orchestrator', () => {
  test('initializes five rounds of dialogue', () => {
    expect(initializeDialogueRounds()).toHaveLength(5);
  });

  test('validates required decisions', () => {
    expect(validateKeyDecisions({ genre: 'Sci-fi', targetAudience: 'teens', readerPromise: 'thrill', corePremise: 'test', openingHook: 'hook', contentBoundaries: 'abc', format: 'serial' })).toBe(true);
    expect(validateKeyDecisions({ genre: 'Sci-fi' })).toBe(false);
  });

  test('cleans and summarizes trend text', () => {
    const summary = extractCleanedSummary('A '.repeat(200) + 'market summary');
    expect(summary.endsWith('...')).toBe(true);
  });

  test('builds a trend report and proposal', () => {
    const report = generateTrendReport([{ title: 'Trend 1', summary: 'Readers want nuanced conflict and soft worldbuilding.' }]);
    expect(report).toContain('Trend 1');
    const proposal = generateProjectBriefProposal({
      bookId: 'book-nova-run',
      decisions: { title: 'Nova Run', genre: 'Sci-fi, Space Opera', targetAudience: 'young adults', readerPromise: 'high stakes tension', corePremise: 'a field engineer rediscovers memory', openingHook: 'the sky falls apart', contentBoundaries: 'no fanfic tropes', format: 'serial' },
      sourceResearchEvidenceIds: ['evidence-trend-1'],
      assumptionIds: ['assumption-001'],
    });
    expect(proposal.status).toBe('draft');
    expect(proposal.genres).toContain('Sci-fi');
  });

  test('generates a project brief that satisfies the ProjectBriefSchema contract', () => {
    const proposal = generateProjectBriefProposal({
      bookId: 'book-nova-run',
      decisions: { title: 'Nova Run', genre: 'Sci-fi, Space Opera', targetAudience: 'young adults', readerPromise: 'high stakes tension', corePremise: 'a field engineer rediscovers memory', openingHook: 'the sky falls apart', contentBoundaries: 'no fanfic tropes', format: 'serial', marketScope: '中文网络连载市场' },
      sourceResearchEvidenceIds: ['evidence-trend-1'],
      assumptionIds: ['assumption-001'],
      id: 'project-brief-nova-run',
    });

    const parsed = ProjectBriefSchema.parse(proposal);
    expect(parsed).toEqual(proposal);
    expect(parsed.bookId).toBe('book-nova-run');
    expect(parsed.marketScope).toBe('中文网络连载市场');
    expect(parsed.sourceResearchEvidenceIds).toEqual(['evidence-trend-1']);
    expect(parsed.assumptionIds).toEqual(['assumption-001']);
  });

  test('falls back to stable defaults for missing brief decisions', () => {
    const proposal = generateProjectBriefProposal({ bookId: 'book-nova-run', decisions: {} });
    const parsed = ProjectBriefSchema.parse(proposal);
    expect(parsed.bookId).toBe('book-nova-run');
    expect(parsed.marketScope.length).toBeGreaterThan(0);
    expect(parsed.sourceResearchEvidenceIds).toEqual([]);
    expect(parsed.assumptionIds).toEqual([]);
  });
});
