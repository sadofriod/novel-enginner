/* eslint-disable complexity */
import { MarkdownContractError, parseCanonicalMarkdown } from '../markdown';
import { resolveLayoutRuleForPath } from '../layout';

import type { CanonicalEntitySnapshot, WorkspaceFileInput } from './types';

function hashContent(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (Math.imul(31, hash) + content.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
}

function parseCanonicalJson(file: WorkspaceFileInput): unknown {
  try {
    return JSON.parse(file.content) as unknown;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new MarkdownContractError(`Failed to parse JSON for "${file.path}": ${message}`);
  }
}

export function validateCanonicalFile(file: WorkspaceFileInput): CanonicalEntitySnapshot {
  const rule = resolveLayoutRuleForPath(file.path);
  if (rule === undefined) {
    throw new MarkdownContractError(`Path "${file.path}" does not match any canonical layout rule.`);
  }

  const isJson = file.path.endsWith('.json');
  const parsedMarkdown = isJson ? undefined : parseCanonicalMarkdown(file.content);
  const payload = isJson ? parseCanonicalJson(file) : parsedMarkdown?.frontmatter;
  const result = rule.schema.safeParse(payload);
  if (!result.success) {
    throw new MarkdownContractError(
      `Frontmatter for "${file.path}" failed ${rule.kind} schema validation: ${result.error.message}`,
    );
  }

  if (!isJson && rule.kind === 'chapter-manuscript' && parsedMarkdown !== undefined) {
    const frontmatter = result.data as { sceneAnchorIds?: readonly string[] };
    const declaredIds = frontmatter.sceneAnchorIds ?? [];
    const bodySceneIds = new Set(parsedMarkdown.scenes.keys());

    const missing = declaredIds.filter((id) => !bodySceneIds.has(id));
    const extra = [...bodySceneIds].filter((id) => !declaredIds.includes(id));

    if (missing.length > 0 || extra.length > 0) {
      const details: string[] = [];
      if (missing.length > 0) {
        details.push(`missing body anchors: ${missing.join(', ')}`);
      }
      if (extra.length > 0) {
        details.push(`undeclared body anchors: ${extra.join(', ')}`);
      }
      throw new MarkdownContractError(
        `Scene anchor mismatch in "${file.path}": ${details.join('; ')}.`,
      );
    }
  }

  return {
    path: file.path,
    kind: rule.kind,
    data: result.data,
    contentHash: hashContent(file.content),
  };
}
