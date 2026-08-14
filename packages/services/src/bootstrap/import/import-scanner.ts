export interface FileEntry {
  path: string;
  filename: string;
  extension: string;
  size: number;
  isDirectory: boolean;
  children?: readonly FileEntry[];
}

export interface EntityRecognitionResult {
  type: 'project-brief' | 'world-foundation' | 'story-blueprint' | 'volume' | 'chapter' | 'reference' | 'unknown';
  confidence: number;
  suggestedMapping?: string;
  reason: string;
}

export interface FileScanResult {
  path: string;
  recognition: EntityRecognitionResult;
  diagnostics: readonly string[];
}

export interface ImportScanData {
  sourceDirectory: string;
  scannedAt: Date;
  totalFiles: number;
  files: readonly FileScanResult[];
  suggestions: {
    projectBriefMapping?: string;
    worldFoundationMapping?: string;
    storyBlueprintMapping?: string;
    volumeMappings: readonly { volumeNumber: number; filePath: string }[];
    unmappableFiles: readonly string[];
  };
}

/**
 * Scans existing Markdown directory structure for import flow.
 * Performs entity recognition and provides mapping suggestions.
 */
export class BootstrapImportScanner {
  /**
   * Recursively scan directory structure.
   * Returns flattened list of files with entity type recognition.
   */
  async scanDirectory(sourceDir: string): Promise<ImportScanData> {
    // Placeholder: actual implementation reads filesystem
    // and performs entity recognition on Markdown files
    return {
      sourceDirectory: sourceDir,
      scannedAt: new Date(),
      totalFiles: 0,
      files: [],
      suggestions: {
        volumeMappings: [],
        unmappableFiles: [],
      },
    };
  }

  /**
   * Recognize entity type from filename and content.
   * Looks for patterns like "project-brief", "world-foundation", "volume-X", "chapter-X".
   */
  recognizeEntity(_filePath: string, filename: string): EntityRecognitionResult {
    const lowerName = filename.toLowerCase();
    return this.recognizeByPattern(lowerName);
  }

  private recognizeByPattern(lowerName: string): EntityRecognitionResult {
    // Try each pattern recognizer in order
    const recognizers: Array<() => EntityRecognitionResult | undefined> = [
      () => this.tryProjectBrief(lowerName),
      () => this.tryWorldFoundation(lowerName),
      () => this.tryStoryBlueprint(lowerName),
      () => this.tryVolumePattern(lowerName),
      () => this.tryChapterPattern(lowerName),
    ];

    for (const recognizer of recognizers) {
      const result = recognizer();
      if (result) {
        return result;
      }
    }

    // Default to reference
    return {
      type: 'reference',
      confidence: 0.3,
      reason: 'No clear entity type recognized',
    };
  }

  private tryProjectBrief(lowerName: string): EntityRecognitionResult | undefined {
    if (this.isProjectBrief(lowerName)) {
      return {
        type: 'project-brief',
        confidence: 0.9,
        reason: 'Filename matches project-brief pattern',
      };
    }
    return undefined;
  }

  private tryWorldFoundation(lowerName: string): EntityRecognitionResult | undefined {
    if (this.isWorldFoundation(lowerName)) {
      return {
        type: 'world-foundation',
        confidence: 0.85,
        reason: 'Filename matches world-foundation pattern',
      };
    }
    return undefined;
  }

  private tryStoryBlueprint(lowerName: string): EntityRecognitionResult | undefined {
    if (this.isStoryBlueprint(lowerName)) {
      return {
        type: 'story-blueprint',
        confidence: 0.75,
        reason: 'Filename suggests story structure document',
      };
    }
    return undefined;
  }

  private tryVolumePattern(lowerName: string): EntityRecognitionResult | undefined {
    return this.detectVolumePattern(lowerName);
  }

  private tryChapterPattern(lowerName: string): EntityRecognitionResult | undefined {
    return this.detectChapterPattern(lowerName);
  }

  private isProjectBrief(lowerName: string): boolean {
    return (
      lowerName.includes('project-brief') ||
      lowerName.includes('project brief') ||
      lowerName.includes('brief')
    );
  }

  private isWorldFoundation(lowerName: string): boolean {
    return (
      lowerName.includes('world-foundation') ||
      lowerName.includes('world foundation') ||
      lowerName.includes('world-building')
    );
  }

  private isStoryBlueprint(lowerName: string): boolean {
    return (
      lowerName.includes('story-blueprint') ||
      lowerName.includes('story blueprint') ||
      lowerName.includes('outline') ||
      lowerName.includes('structure')
    );
  }

  private detectVolumePattern(lowerName: string): EntityRecognitionResult | undefined {
    const volumeMatch = lowerName.match(/(?:volume|vol|book|v)\.?\s*-?\s*(\d+)/);
    if (volumeMatch && volumeMatch[1]) {
      return {
        type: 'volume',
        confidence: 0.8,
        suggestedMapping: `volume-${volumeMatch[1]}`,
        reason: 'Filename contains volume number',
      };
    }
    return undefined;
  }

  private detectChapterPattern(lowerName: string): EntityRecognitionResult | undefined {
    const chapterMatch = lowerName.match(/(?:chapter|ch|chap)\.?\s*-?\s*(\d+)/);
    if (chapterMatch && chapterMatch[1]) {
      return {
        type: 'chapter',
        confidence: 0.8,
        suggestedMapping: `chapter-${chapterMatch[1]}`,
        reason: 'Filename contains chapter number',
      };
    }
    return undefined;
  }

  /**
   * Analyze content for additional diagnostics.
   * Checks for frontmatter, structure, and common issues.
   */
  analyzeMdContent(content: string): readonly string[] {
    const diagnostics: string[] = [];

    // Check for frontmatter
    if (!content.trim().startsWith('---')) {
      diagnostics.push('Missing YAML frontmatter');
    }

    // Check for headings
    if (!content.includes('#')) {
      diagnostics.push('No heading structure found');
    }

    // Check for empty content
    if (content.trim().length < 50) {
      diagnostics.push('Content is too short');
    }

    return diagnostics;
  }

  /**
   * Build mapping suggestions from recognized entities.
   */
  buildMappingSuggestions(results: readonly FileScanResult[]): {
    projectBriefMapping?: string;
    worldFoundationMapping?: string;
    storyBlueprintMapping?: string;
    volumeMappings: readonly { volumeNumber: number; filePath: string }[];
    unmappableFiles: readonly string[];
  } {
    const projectBriefs = results.filter((r) => r.recognition.type === 'project-brief');
    const worldFoundations = results.filter((r) => r.recognition.type === 'world-foundation');
    const storyBlueprints = results.filter((r) => r.recognition.type === 'story-blueprint');
    const volumes = results.filter((r) => r.recognition.type === 'volume');
    const unknowns = results.filter((r) => r.recognition.type === 'unknown');

    const volumeMappings = volumes.map((v) => {
      const suggestedMapping = v.recognition.suggestedMapping || '';
      const match = suggestedMapping.match(/volume-(\d+)/);
      return {
        volumeNumber: parseInt(match?.[1] || '0'),
        filePath: v.path,
      };
    });

    const suggestions: {
      projectBriefMapping?: string;
      worldFoundationMapping?: string;
      storyBlueprintMapping?: string;
      volumeMappings: readonly { volumeNumber: number; filePath: string }[];
      unmappableFiles: readonly string[];
    } = {
      volumeMappings: volumeMappings.sort((a, b) => a.volumeNumber - b.volumeNumber),
      unmappableFiles: unknowns.map((u) => u.path),
    };

    if (projectBriefs[0]) {
      suggestions.projectBriefMapping = projectBriefs[0].path;
    }
    if (worldFoundations[0]) {
      suggestions.worldFoundationMapping = worldFoundations[0].path;
    }
    if (storyBlueprints[0]) {
      suggestions.storyBlueprintMapping = storyBlueprints[0].path;
    }

    return suggestions;
  }
}
