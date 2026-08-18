/**
 * Rebuilds an optimized artifact's canonical Markdown so the optimize pipeline
 * always produces a reviewable proposal draft, even when the model returns plain
 * prose instead of a fully-formed canonical file (common with local models).
 *
 * Strategy:
 * 1. If the model output already parses as canonical Markdown, prefer it as-is.
 * 2. Otherwise preserve the original canonical shell (frontmatter + scene anchors)
 *    and inject the optimized body, so the draft always passes schema validation.
 */
import { parseCanonicalMarkdown, serializeCanonicalMarkdown, type ParsedCanonicalMarkdown } from '../workspace/markdown';

function tryParseCanonical(raw: string): ParsedCanonicalMarkdown | undefined {
  try {
    return parseCanonicalMarkdown(raw);
  } catch {
    return undefined;
  }
}

/** Builds draft content from the original canonical file and the model's output. */
export function buildOptimizedDraftContent(originalContent: string, optimizedText: string): string {
  const text = optimizedText.trim();
  if (tryParseCanonical(text) !== undefined) {
    return text;
  }
  const shell = tryParseCanonical(originalContent);
  if (shell === undefined) {
    return text;
  }
  const scenes = new Map(shell.scenes);
  const sections = new Map(shell.sections);
  if (scenes.size > 0) {
    const firstAnchor = scenes.keys().next().value as string;
    scenes.set(firstAnchor, text);
  } else {
    sections.set('正文', text);
  }
  return serializeCanonicalMarkdown({ frontmatter: shell.frontmatter, sections, scenes });
}
