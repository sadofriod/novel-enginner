import type { ProposalFormField, ProposalFormRowColumn, ProposalFormSpec } from './types';

export interface SerializedAuthorArtifact {
  readonly frontmatter: Record<string, unknown>;
  readonly sections?: Record<string, string>;
  readonly scenes?: Record<string, string>;
}

function stringValue(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

function listValue(raw: unknown): readonly string[] | undefined {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string');
  }
  if (typeof raw === 'string') {
    const entries = raw.split(/[，,;；\n]/).map((entry) => entry.trim()).filter(Boolean);
    return entries.length === 0 ? undefined : entries;
  }
  return undefined;
}

function columnValue(column: ProposalFormRowColumn, record: Record<string, unknown>): unknown {
  return column.type === 'list' ? listValue(record[column.name]) : stringValue(record[column.name]);
}

function normalizeRow(field: ProposalFormField, row: unknown): readonly Record<string, unknown>[] {
  if (row === null || typeof row !== 'object') {
    return [];
  }
  const record = row as Record<string, unknown>;
  const out = (field.columns ?? []).reduce<Record<string, unknown>>((acc, column) => {
    const value = columnValue(column, record);
    return value === undefined ? acc : { ...acc, [column.name]: value };
  }, {});
  return Object.keys(out).length === 0 ? [] : [out];
}

function rowsValue(field: ProposalFormField, raw: unknown): readonly Record<string, unknown>[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const rows = raw.flatMap((row) => normalizeRow(field, row));
  return rows.length === 0 ? undefined : rows;
}

function numberValue(raw: unknown): number | undefined {
  if (raw === '') {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFieldValue(field: ProposalFormField, raw: unknown): unknown {
  if (field.type === 'number') {
    return numberValue(raw);
  }
  if (field.type === 'list') {
    return listValue(raw);
  }
  if (field.type === 'rows') {
    return rowsValue(field, raw);
  }
  return stringValue(raw);
}

function buildFrontmatter(spec: ProposalFormSpec, fields: Record<string, unknown>, targetId: string): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = { id: targetId };
  for (const field of spec.fields) {
    if (field.type === 'list') {
      // Canonical schemas require list fields to be present; empty means `[]`.
      frontmatter[field.name] = listValue(fields[field.name]) ?? [];
      continue;
    }
    const parsed = parseFieldValue(field, fields[field.name]);
    if (parsed !== undefined) {
      frontmatter[field.name] = parsed;
    }
  }
  return frontmatter;
}

function collectScenes(scenes: Record<string, string>): Record<string, string> | undefined {
  const sceneMap: Record<string, string> = {};
  for (const [id, content] of Object.entries(scenes)) {
    if (id.trim().length > 0 && content.trim().length > 0) {
      sceneMap[id.trim()] = content.trim();
    }
  }
  return Object.keys(sceneMap).length === 0 ? undefined : sceneMap;
}

/**
 * Serializes the per-artifact-type form state into the structured payload the
 * service uses to build canonical Markdown (`frontmatter` + prose `sections` +
 * `scenes`). `id` always mirrors the target id, and `status` comes from the spec's
 * field (defaulted so every draft satisfies its schema).
 */
export function serializeFormValues(
  spec: ProposalFormSpec,
  fields: Record<string, unknown>,
  targetId: string,
  body: string,
  scenes: Record<string, string> = {},
): SerializedAuthorArtifact {
  const frontmatter = buildFrontmatter(spec, fields, targetId);

  if (spec.scenes === true) {
    const sceneMap = collectScenes(scenes);
    if (sceneMap === undefined) {
      return { frontmatter };
    }
    return {
      frontmatter: { ...frontmatter, sceneAnchorIds: Object.keys(sceneMap) },
      scenes: sceneMap,
    };
  }

  const bodyText = body.trim();
  if (bodyText.length === 0) {
    return { frontmatter };
  }
  return { frontmatter, sections: { [spec.bodySection]: bodyText } };
}
