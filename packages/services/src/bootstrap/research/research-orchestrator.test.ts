import { describe, test, expect } from 'bun:test';
import { BootstrapResearchOrchestrator, type DialogueRound } from './research-orchestrator';

describe('BootstrapResearchOrchestrator', () => {
  const orchestrator = new BootstrapResearchOrchestrator();

  test('initializes 5 dialogue rounds with fixed objectives', () => {
    const rounds = orchestrator.initializeDialogueRounds();
    expect(rounds.length).toBe(5);

    const roundNumbers = rounds.map((r) => r.roundNumber);
    expect(roundNumbers).toEqual([1, 2, 3, 4, 5]);

    rounds.forEach((round) => {
      expect(round.prompt).toBeDefined();
      expect(round.prompt.length).toBeGreaterThan(0);
      expect(round.authorResponse).toBeUndefined();
      expect(round.generatedInsights).toBeUndefined();
    });
  });

  test('validates key decisions completeness', () => {
    const completeDecisions = {
      genre: 'Science Fiction',
      targetAudience: 'Adult readers',
      readerPromise: 'Epic space opera adventure',
      corePremise: 'First contact with alien civilization',
      protagonist: 'Captain Jane',
      openingHook: 'Discovering the signal',
      centralConflict: 'Peaceful vs aggressive aliens',
      opposition: 'Unknown alien forces',
      emotionalJourney: 'Fear to understanding',
      differentiation: 'Hard sci-fi with character focus',
      marketTrendTakeaway: 'Space opera is trending',
      contentBoundaries: 'No explicit violence',
      format: 'Novel',
      serialization: 'Single release',
      keyAssumptions: 'Aliens speak English',
    };

    const result = orchestrator.validateKeyDecisions(completeDecisions);
    expect(result.valid).toBe(true);
    expect(result.missingFields.length).toBe(0);
  });

  test('identifies missing key decisions', () => {
    const incompleteDecisions = {
      genre: 'Science Fiction',
      targetAudience: '',
      // missing many fields
    };

    const result = orchestrator.validateKeyDecisions(incompleteDecisions);
    expect(result.valid).toBe(false);
    expect(result.missingFields.length).toBeGreaterThan(0);
    expect(result.missingFields).toContain('targetAudience');
    expect(result.missingFields).toContain('readerPromise');
  });

  test('extracts cleaned summary from evidence', () => {
    const evidence = {
      evidenceId: 'ev-1',
      revisionId: 'rev-1',
      url: 'https://example.com',
      title: 'Sci-Fi Trends 2024',
      collectedAt: new Date(),
      cleanedSummary: 'Space opera gaining popularity',
      licenseScope: 'permissive' as const,
      createdAt: new Date(),
    };

    const summary = orchestrator.extractCleanedSummary(evidence);
    expect(summary).toBe('Space opera gaining popularity');
  });

  test('handles missing cleaned summary in evidence', () => {
    const evidence = {
      evidenceId: 'ev-2',
      revisionId: 'rev-1',
      url: 'https://example.com',
      title: 'Sci-Fi Trends 2024',
      collectedAt: new Date(),
      cleanedSummary: undefined,
      licenseScope: 'attribution-required' as const,
      createdAt: new Date(),
    };

    const summary = orchestrator.extractCleanedSummary(evidence);
    expect(summary).toBeUndefined();
  });

  test('generates project-brief proposal from dialogue data', async () => {
    const dialogueData = {
      rounds: orchestrator.initializeDialogueRounds(),
      keyDecisions: {
        genre: 'Mystery',
        targetAudience: 'Adult mystery fans',
        readerPromise: 'Gripping detective story',
        corePremise: 'Unsolved cold case reopened',
        protagonist: 'Detective Sarah',
        openingHook: 'Body discovered in lake',
        centralConflict: 'Justice vs cover-up',
        opposition: 'Corrupt officials',
        emotionalJourney: 'Determination to truth',
        differentiation: 'Psychological depth',
        marketTrendTakeaway: 'Dark mysteries trending',
        contentBoundaries: 'Realistic crime, no graphic descriptions',
        format: 'Novel',
        serialization: 'Single release',
        keyAssumptions: 'Small town setting works',
        title: 'The Cold Case',
        marketScope: 'North American mystery readers',
      },
    };

    const proposal = await orchestrator.generateProjectBriefProposal(
      dialogueData,
      ['ev-1', 'ev-2'],
    );

    expect(proposal.title).toBe('The Cold Case');
    expect(proposal.genres).toContain('Mystery');
    expect(proposal.targetAudience).toBe('Adult mystery fans');
    expect(proposal.readerPromise).toBe('Gripping detective story');
    expect(proposal.corePremise).toBe('Unsolved cold case reopened');
    expect(proposal.openingHook).toBe('Body discovered in lake');
    expect(proposal.contentBoundaries).toBe('Realistic crime, no graphic descriptions');
    expect(proposal.sourceResearchEvidenceIds).toContain('ev-1');
    expect(proposal.sourceResearchEvidenceIds).toContain('ev-2');
  });
});
