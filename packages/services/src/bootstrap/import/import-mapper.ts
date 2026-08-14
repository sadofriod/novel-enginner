export interface ImportMappingEntry {
  sourceFilePath: string;
  targetCanonicalKind: 'project-brief' | 'world-foundation' | 'story-blueprint' | 'volume' | 'chapter' | 'reference';
  targetPath?: string; // e.g., "state/book/project-brief.md" for project-brief
  volumeNumber?: number; // for volume/chapter mappings
  chapterNumber?: number;
  confidence: number;
  requiresManualReview: boolean;
  reviewNotes?: string;
}

export interface ImportMapping {
  id: string;
  createdAt: Date;
  authorApproved: boolean;
  approvedAt?: Date;
  entries: readonly ImportMappingEntry[];
  statistics: {
    totalFiles: number;
    mappedCount: number;
    pendingReviewCount: number;
    referencesCount: number;
  };
}

/**
 * Manages mapping of source files to canonical artifact types.
 * Preserves author control: no writes to canonical until explicit confirmation.
 */
export class BootstrapImportMapper {
  /**
   * Create initial mapping from scan suggestions.
   * All entries start as provisional until author review.
   */
  createMapping(suggestions: {
    projectBriefMapping?: string;
    worldFoundationMapping?: string;
    storyBlueprintMapping?: string;
    volumeMappings: readonly { volumeNumber: number; filePath: string }[];
    unmappableFiles: readonly string[];
  }): ImportMapping {
    const entries: ImportMappingEntry[] = [];

    this.addCoreArtifactMappings(entries, suggestions);
    this.addVolumeMappings(entries, suggestions.volumeMappings);
    this.addReferenceMappings(entries, suggestions.unmappableFiles);

    return {
      id: `mapping-${Date.now()}`,
      createdAt: new Date(),
      authorApproved: false,
      entries,
      statistics: {
        totalFiles: entries.length,
        mappedCount: entries.filter((e) => e.targetCanonicalKind !== 'reference').length,
        pendingReviewCount: entries.filter((e) => e.requiresManualReview).length,
        referencesCount: entries.filter((e) => e.targetCanonicalKind === 'reference').length,
      },
    };
  }

  private addCoreArtifactMappings(
    entries: ImportMappingEntry[],
    suggestions: {
      projectBriefMapping?: string;
      worldFoundationMapping?: string;
      storyBlueprintMapping?: string;
    },
  ): void {
    // Add project-brief mapping
    if (suggestions.projectBriefMapping) {
      entries.push({
        sourceFilePath: suggestions.projectBriefMapping,
        targetCanonicalKind: 'project-brief',
        targetPath: 'state/book/project-brief.md',
        confidence: 0.9,
        requiresManualReview: false,
      });
    }

    // Add world-foundation mapping
    if (suggestions.worldFoundationMapping) {
      entries.push({
        sourceFilePath: suggestions.worldFoundationMapping,
        targetCanonicalKind: 'world-foundation',
        targetPath: 'state/world/world-foundation.md',
        confidence: 0.85,
        requiresManualReview: false,
      });
    }

    // Add story-blueprint mapping
    if (suggestions.storyBlueprintMapping) {
      entries.push({
        sourceFilePath: suggestions.storyBlueprintMapping,
        targetCanonicalKind: 'story-blueprint',
        targetPath: 'state/book/story-blueprint.md',
        confidence: 0.8,
        requiresManualReview: true,
        reviewNotes: 'Verify structure matches story-blueprint schema',
      });
    }
  }

  private addVolumeMappings(
    entries: ImportMappingEntry[],
    volumeMappings: readonly { volumeNumber: number; filePath: string }[],
  ): void {
    for (const vm of volumeMappings) {
      entries.push({
        sourceFilePath: vm.filePath,
        targetCanonicalKind: 'volume',
        targetPath: `volumes/volume-${vm.volumeNumber}/outline.md`,
        volumeNumber: vm.volumeNumber,
        confidence: 0.75,
        requiresManualReview: true,
        reviewNotes: 'Author should verify volume content and structure',
      });
    }
  }

  private addReferenceMappings(
    entries: ImportMappingEntry[],
    unmappableFiles: readonly string[],
  ): void {
    for (const ref of unmappableFiles) {
      entries.push({
        sourceFilePath: ref,
        targetCanonicalKind: 'reference',
        targetPath: `references/imported/${ref.split('/').pop()}`,
        confidence: 0.2,
        requiresManualReview: true,
        reviewNotes: 'Unclear mapping - will be placed in references for manual organization',
      });
    }
  }

  /**
   * Update a mapping entry after author review.
   * Author can change target paths, reject mappings, or provide context.
   */
  updateEntry(
    mapping: ImportMapping,
    sourceFile: string,
    updates: Partial<ImportMappingEntry>,
  ): ImportMapping {
    const entryIndex = mapping.entries.findIndex((e) => e.sourceFilePath === sourceFile);
    if (entryIndex === -1) {
      return mapping;
    }

    const updated = [...mapping.entries];
    updated[entryIndex] = {
      ...updated[entryIndex]!,
      ...updates,
      sourceFilePath: sourceFile, // Preserve original
    };

    return {
      ...mapping,
      entries: updated,
      statistics: this.recalculateStatistics(updated),
    };
  }

  /**
   * Mark mapping as approved by author.
   * After approval, system will proceed with canonical workspace creation.
   */
  approveMapping(mapping: ImportMapping): ImportMapping {
    return {
      ...mapping,
      authorApproved: true,
      approvedAt: new Date(),
    };
  }

  /**
   * Validate mapping completeness before workspace creation.
   * Ensures all core artifacts are mapped.
   */
  validateMapping(mapping: ImportMapping): {
    valid: boolean;
    issues: readonly string[];
  } {
    const issues: string[] = [];

    // At least one core artifact is needed
    const hasCoreArtifact = mapping.entries.some(
      (e) =>
        e.targetCanonicalKind === 'project-brief' ||
        e.targetCanonicalKind === 'world-foundation' ||
        e.targetCanonicalKind === 'story-blueprint',
    );

    if (!hasCoreArtifact) {
      issues.push('At least one core artifact (project-brief, world-foundation, or story-blueprint) must be mapped');
    }

    // Check for unmapped high-confidence entries
    const unmapped = mapping.entries.filter(
      (e) => e.targetCanonicalKind === 'reference' && e.confidence > 0.7,
    );
    if (unmapped.length > 0) {
      issues.push(`${unmapped.length} high-confidence entries are still marked as reference`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  private recalculateStatistics(entries: readonly ImportMappingEntry[]) {
    return {
      totalFiles: entries.length,
      mappedCount: entries.filter((e) => e.targetCanonicalKind !== 'reference').length,
      pendingReviewCount: entries.filter((e) => e.requiresManualReview).length,
      referencesCount: entries.filter((e) => e.targetCanonicalKind === 'reference').length,
    };
  }
}
