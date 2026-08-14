import type { BootstrapEvidenceData } from '../types';

export interface MarketResearchInput {
  targetGenre: string;
  targetAudience: string;
  marketScope: string;
}

export interface TrendReport {
  id: string;
  collectedAt: Date;
  trends: readonly Trend[];
  summary: string;
}

export interface Trend {
  topic: string;
  evidence: readonly string[]; // Evidence IDs
  readingPreference: string;
  competitionLevel: string;
}

export interface DialogueRound {
  roundNumber: 1 | 2 | 3 | 4 | 5;
  prompt: string;
  authorResponse?: string;
  generatedInsights?: string;
}

export interface InspirationDialogueData {
  rounds: readonly DialogueRound[];
  trendReport?: TrendReport;
  keyDecisions: Record<string, string>;
}

/**
 * Orchestrates market research and five rounds of inspiration dialogue.
 * Each round's completion creates an immutable bootstrap revision.
 */
export class BootstrapResearchOrchestrator {
  /**
   * Generate initial trend report from market research input.
   * Integrates with MarketResearchPort (server-side only, not Web).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generateTrendReport(_input: MarketResearchInput): Promise<TrendReport> {
    // Placeholder: actual implementation delegates to MarketResearchPort
    // which performs browser-based research via Puppeteer/Playwright
    // _input contains: targetGenre, targetAudience, marketScope
    return {
      id: `trend-${Date.now()}`,
      collectedAt: new Date(),
      trends: [],
      summary: '',
    };
  }

  /**
   * Initialize dialogue rounds for new-book flow.
   * Each round has fixed objectives but dynamic follow-up questions.
   */
  initializeDialogueRounds(): readonly DialogueRound[] {
    return [
      {
        roundNumber: 1,
        prompt: 'Describe your target genre, intended audience, and reading promise to them.',
      },
      {
        roundNumber: 2,
        prompt: 'What is your core creative premise? Describe your protagonist and the opening hook.',
      },
      {
        roundNumber: 3,
        prompt: 'What is the central conflict? Who or what opposes your protagonist? What emotional journey do you want readers to experience?',
      },
      {
        roundNumber: 4,
        prompt: 'How does your work differentiate in the market? Which trends will you embrace or reject? What content boundaries will you set?',
      },
      {
        roundNumber: 5,
        prompt: 'How long will your work be? What serialization format works best? What key assumptions need validation before launch?',
      },
    ];
  }

  /**
   * Validate that all key decisions are made before moving to project-brief.
   * These are required for proposal generation.
   */
  validateKeyDecisions(decisions: Record<string, string>): {
    valid: boolean;
    missingFields: readonly string[];
  } {
    const required = [
      'genre',
      'targetAudience',
      'readerPromise',
      'corePremise',
      'protagonist',
      'openingHook',
      'centralConflict',
      'opposition',
      'emotionalJourney',
      'differentiation',
      'marketTrendTakeaway',
      'contentBoundaries',
      'format',
      'serialization',
      'keyAssumptions',
    ];

    const missing = required.filter((field) => !decisions[field] || decisions[field].trim().length === 0);

    return {
      valid: missing.length === 0,
      missingFields: missing,
    };
  }

  /**
   * Extract cleaned summary from evidence for copyright safety.
   * Removes directly copied content and keeps only abstract insights.
   */
  extractCleanedSummary(evidence: BootstrapEvidenceData): string | undefined {
    // Placeholder: actual implementation sanitizes against copyrighted content
    return evidence.cleanedSummary;
  }

  /**
   * Generate project-brief proposal from dialogue rounds.
   * Combines market research, dialogue responses, and key decisions.
   */
  async generateProjectBriefProposal(
    dialogueData: InspirationDialogueData,
    evidenceIds: readonly string[],
  ): Promise<{
    title: string;
    genres: readonly string[];
    targetAudience: string;
    readerPromise: string;
    corePremise: string;
    openingHook: string;
    contentBoundaries: string;
    marketScope: string;
    sourceResearchEvidenceIds: readonly string[];
  }> {
    const decisions = dialogueData.keyDecisions;

    return {
      title: this.extractDecision(decisions, 'title', 'Untitled Work'),
      genres: this.extractGenres(decisions),
      targetAudience: this.extractDecision(decisions, 'targetAudience', ''),
      readerPromise: this.extractDecision(decisions, 'readerPromise', ''),
      corePremise: this.extractDecision(decisions, 'corePremise', ''),
      openingHook: this.extractDecision(decisions, 'openingHook', ''),
      contentBoundaries: this.extractDecision(decisions, 'contentBoundaries', ''),
      marketScope: this.extractDecision(decisions, 'marketScope', ''),
      sourceResearchEvidenceIds: evidenceIds,
    };
  }

  private extractDecision(decisions: Record<string, string>, key: string, defaultValue: string): string {
    return decisions[key] || defaultValue;
  }

  private extractGenres(decisions: Record<string, string>): readonly string[] {
    return (decisions['genre'] || '')
      .split(',')
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
  }
}

