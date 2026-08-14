export interface HealthCheckIssue {
  type:
    | 'missing-project-brief'
    | 'missing-world-foundation'
    | 'missing-story-blueprint'
    | 'missing-volume-outline'
    | 'missing-chapter-outline'
    | 'broken-references'
    | 'missing-references';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  affectedItems?: readonly string[];
  suggestions?: readonly string[];
}

export interface ImportHealthReport {
  id: string;
  sessionId: string;
  generatedAt: Date;
  issues: readonly HealthCheckIssue[];
  statistics: {
    projectBriefReady: boolean;
    worldFoundationReady: boolean;
    storyBlueprintReady: boolean;
    volumeOutlinesReady: boolean;
    chapterOutlinesReady: number; // Count of chapters with outlines
    brokenReferencesCount: number;
    totalIssuesCount: number;
    criticalIssuesCount: number;
    warningIssuesCount: number;
  };
  prioritySequence: readonly {
    step: number;
    type: string;
    reason: string;
  }[];
}

/**
 * Generates health report after import completion.
 * Identifies gaps and suggests priority fixes for canonical artifacts.
 */
export class BootstrapHealthReportGenerator {
  /**
   * Analyze imported content structure and generate health report.
   * Returns issues and priority-ordered suggestions for gap closure.
   */
  generateReport(sessionId: string, mappedContent: {
    hasProjectBrief: boolean;
    hasWorldFoundation: boolean;
    hasStoryBlueprint: boolean;
    volumeCount: number;
    chapterOutlinesCount: number;
    brokenReferences: readonly string[];
    missingReferences: readonly string[];
  }): ImportHealthReport {
    const issuesList: HealthCheckIssue[] = [];

    this.collectCoreArtifactIssues(issuesList, mappedContent);
    this.collectStructureIssues(issuesList, mappedContent);
    this.collectReferenceIssues(issuesList, mappedContent);

    const prioritySequence = this.generatePrioritySequence(mappedContent);
    const statistics = this.calculateStatistics(issuesList, mappedContent);

    return {
      id: `health-${Date.now()}`,
      sessionId,
      generatedAt: new Date(),
      issues: issuesList,
      statistics,
      prioritySequence,
    };
  }

  private collectCoreArtifactIssues(
    issues: HealthCheckIssue[],
    mappedContent: {
      hasProjectBrief: boolean;
      hasWorldFoundation: boolean;
      hasStoryBlueprint: boolean;
    },
  ): void {
    if (!mappedContent.hasProjectBrief) {
      issues.push({
        type: 'missing-project-brief',
        severity: 'critical',
        description:
          'No project-brief found in imported content. This is essential for book positioning and market scope.',
        suggestions: [
          'Create a new project-brief during the bootstrap process',
          'Author should define genres, target audience, and reader promise',
        ],
      });
    }

    if (!mappedContent.hasWorldFoundation) {
      issues.push({
        type: 'missing-world-foundation',
        severity: 'critical',
        description:
          'No world-foundation found. Essential for verifying world rules and constraints.',
        suggestions: [
          'Define core world constraints and immutable rules',
          'Document reality mode, tone, and capability system',
        ],
      });
    }

    if (!mappedContent.hasStoryBlueprint) {
      issues.push({
        type: 'missing-story-blueprint',
        severity: 'warning',
        description:
          'No story-blueprint found. Useful for tracking main arc and cross-volume commitments.',
        suggestions: [
          'Create story-blueprint to document protagonist arc and central conflict',
          'Define cross-volume commitments and resolution direction',
        ],
      });
    }
  }

  private collectStructureIssues(
    issues: HealthCheckIssue[],
    mappedContent: {
      volumeCount: number;
      chapterOutlinesCount: number;
    },
  ): void {
    if (mappedContent.volumeCount === 0) {
      issues.push({
        type: 'missing-volume-outline',
        severity: 'warning',
        description: 'No volume outlines detected. At least volume-1 outline is needed to proceed.',
        suggestions: [
          'Import or create outlines for planned volumes',
          'Minimum: volume-1 outline must be present and approved',
        ],
      });
    }

    if (mappedContent.chapterOutlinesCount === 0) {
      issues.push({
        type: 'missing-chapter-outline',
        severity: 'warning',
        description: 'No chapter outlines found. Create first batch of chapter outlines for volume-1.',
        suggestions: [
          'Generate chapter-outline-batch after volume-1 approval',
          'Minimum: First 3 chapters should have outlines',
        ],
      });
    }
  }

  private collectReferenceIssues(
    issues: HealthCheckIssue[],
    mappedContent: {
      brokenReferences: readonly string[];
      missingReferences: readonly string[];
    },
  ): void {
    if (mappedContent.brokenReferences.length > 0) {
      issues.push({
        type: 'broken-references',
        severity: 'warning',
        description: `Found ${mappedContent.brokenReferences.length} broken cross-references in imported content.`,
        affectedItems: mappedContent.brokenReferences.slice(0, 10),
        suggestions: [
          'Review and repair cross-references during content organization phase',
          'Consider using references/imported/ folder for content needing manual review',
        ],
      });
    }

    if (mappedContent.missingReferences.length > 0) {
      issues.push({
        type: 'missing-references',
        severity: 'info',
        description:
          `Found ${mappedContent.missingReferences.length} references to external content that cannot be auto-linked.`,
        affectedItems: mappedContent.missingReferences.slice(0, 5),
        suggestions: [
          'Manually organize referenced materials in references/ folder',
          'Update references in canonical content to point to imported copies',
        ],
      });
    }
  }

  private calculateStatistics(
    issues: readonly HealthCheckIssue[],
    mappedContent: {
      hasProjectBrief: boolean;
      hasWorldFoundation: boolean;
      hasStoryBlueprint: boolean;
      volumeCount: number;
      chapterOutlinesCount: number;
      brokenReferences: readonly string[];
    },
  ): ImportHealthReport['statistics'] {
    return {
      projectBriefReady: mappedContent.hasProjectBrief,
      worldFoundationReady: mappedContent.hasWorldFoundation,
      storyBlueprintReady: mappedContent.hasStoryBlueprint,
      volumeOutlinesReady: mappedContent.volumeCount > 0,
      chapterOutlinesReady: mappedContent.chapterOutlinesCount,
      brokenReferencesCount: mappedContent.brokenReferences.length,
      totalIssuesCount: issues.length,
      criticalIssuesCount: issues.filter((i) => i.severity === 'critical').length,
      warningIssuesCount: issues.filter((i) => i.severity === 'warning').length,
    };
  }

  private generatePrioritySequence(
    mappedContent: {
      hasProjectBrief: boolean;
      hasWorldFoundation: boolean;
      hasStoryBlueprint: boolean;
      volumeCount: number;
      chapterOutlinesCount: number;
    },
  ): readonly { step: number; type: string; reason: string }[] {
    const sequence: { step: number; type: string; reason: string }[] = [];
    let step = 1;

    step = this.addProjectBriefSequence(sequence, step, mappedContent);
    step = this.addWorldFoundationSequence(sequence, step, mappedContent);
    step = this.addStoryBlueprintSequence(sequence, step, mappedContent);
    step = this.addVolumeOutlinesSequence(sequence, step, mappedContent);
    this.addChapterOutlinesSequence(sequence, step, mappedContent);

    return sequence;
  }

  private addProjectBriefSequence(
    sequence: { step: number; type: string; reason: string }[],
    currentStep: number,
    mappedContent: { hasProjectBrief: boolean },
  ): number {
    if (!mappedContent.hasProjectBrief) {
      sequence.push({
        step: currentStep,
        type: 'create-project-brief',
        reason: 'Required for book positioning; blocks all other phases',
      });
      return currentStep + 1;
    }
    return currentStep;
  }

  private addWorldFoundationSequence(
    sequence: { step: number; type: string; reason: string }[],
    currentStep: number,
    mappedContent: { hasWorldFoundation: boolean },
  ): number {
    if (!mappedContent.hasWorldFoundation) {
      sequence.push({
        step: currentStep,
        type: 'create-world-foundation',
        reason: 'Required for world rules validation; blocks story-blueprint',
      });
      return currentStep + 1;
    }
    return currentStep;
  }

  private addStoryBlueprintSequence(
    sequence: { step: number; type: string; reason: string }[],
    currentStep: number,
    mappedContent: { hasStoryBlueprint: boolean },
  ): number {
    if (!mappedContent.hasStoryBlueprint) {
      sequence.push({
        step: currentStep,
        type: 'create-story-blueprint',
        reason: 'Needed for main arc and cross-volume commitments',
      });
      return currentStep + 1;
    }
    return currentStep;
  }

  private addVolumeOutlinesSequence(
    sequence: { step: number; type: string; reason: string }[],
    currentStep: number,
    mappedContent: { volumeCount: number },
  ): number {
    if (mappedContent.volumeCount === 0) {
      sequence.push({
        step: currentStep,
        type: 'create-volume-outlines',
        reason: 'Minimum volume-1 outline required; enables chapter outline generation',
      });
      return currentStep + 1;
    }
    return currentStep;
  }

  private addChapterOutlinesSequence(
    sequence: { step: number; type: string; reason: string }[],
    currentStep: number,
    mappedContent: { chapterOutlinesCount: number },
  ): void {
    if (mappedContent.chapterOutlinesCount === 0) {
      sequence.push({
        step: currentStep,
        type: 'create-chapter-outlines',
        reason: 'Generate first batch of chapter outlines after volume-1 approval',
      });
    }
  }

  /**
   * Determine if bootstrap can proceed to ready-to-write.
   * Requires: project-brief, volume-1 outline, first chapter outline.
   */
  canProceedToWriting(report: ImportHealthReport): {
    canProceed: boolean;
    blockers: readonly string[];
  } {
    const blockers: string[] = [];

    if (!report.statistics.projectBriefReady) {
      blockers.push('project-brief must be created or imported');
    }

    if (!report.statistics.volumeOutlinesReady) {
      blockers.push('At least volume-1 outline must be present');
    }

    if (report.statistics.chapterOutlinesReady === 0) {
      blockers.push('At least first chapter outline must be present');
    }

    return {
      canProceed: blockers.length === 0,
      blockers,
    };
  }
}
