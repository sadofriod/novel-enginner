/**
 * Inngest function definitions for the novel-enginner workflow pipeline, per
 * docs/architecture/modules/04-workflows-and-agents.md §4.1-§4.2. Aggregates the
 * per-workflow Inngest adapters (one per file) so the runtime imports a single
 * stable surface.
 */
export * from './inngest-foundation-functions';
export * from './inngest-review-functions';
export * from './inngest-shared';
export * from './inngest-chapter-outline';
export * from './inngest-chapter-manuscript';
export * from './inngest-volume-outline';
export * from './inngest-world-change';

import { chapterManuscriptFunction } from './inngest-chapter-manuscript';
import { chapterOutlineFunction } from './inngest-chapter-outline';
import { projectBriefFunction, storyBlueprintFunction, worldFoundationFunction } from './inngest-foundation-functions';
import { rebuildGraphFunction, syntheticReviewFunction } from './inngest-review-functions';
import { volumeOutlineFunction } from './inngest-volume-outline';
import { worldChangeFunction } from './inngest-world-change';

export const inngestFunctions = [projectBriefFunction, worldFoundationFunction, storyBlueprintFunction, chapterOutlineFunction, chapterManuscriptFunction, volumeOutlineFunction, worldChangeFunction, syntheticReviewFunction, rebuildGraphFunction] as const;
