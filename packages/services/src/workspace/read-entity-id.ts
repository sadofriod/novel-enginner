import { parseCanonicalMarkdown } from './markdown';

/**
 * Reads the stable `id` from a canonical Markdown file's frontmatter, or `undefined`
 * when the content is not parseable as canonical markdown or carries no id.
 */
export function readEntityIdFromMarkdown(content: string): string | undefined {
  try {
    const frontmatter = parseCanonicalMarkdown(content).frontmatter as Record<string, unknown>;
    const id = frontmatter['id'];
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}
