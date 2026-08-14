import { describe, expect, test } from 'bun:test';

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
    const proposal = generateProjectBriefProposal({ title: 'Nova Run', genre: 'Sci-fi, Space Opera', targetAudience: 'young adults', readerPromise: 'high stakes tension', corePremise: 'a field engineer rediscovers memory', openingHook: 'the sky falls apart', contentBoundaries: 'no fanfic tropes', format: 'serial' });
    expect(proposal.status).toBe('draft');
    expect(proposal.genres).toContain('Sci-fi');
  });
});
