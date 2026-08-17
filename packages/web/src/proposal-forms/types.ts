import type { ProposalArtifactType } from '@novel-enginner/services/domain/values';

export type ProposalFormFieldType = 'text' | 'textarea' | 'list' | 'number' | 'select' | 'rows';

export interface ProposalFormRowColumn {
  readonly name: string;
  readonly label: string;
  readonly type: 'text' | 'list';
  readonly placeholder?: string;
}

export interface ProposalFormField {
  readonly name: string;
  readonly label: string;
  readonly type: ProposalFormFieldType;
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly defaultValue?: string | number;
  /** Rows (arrays of objects) render one repeatable row per column spec, e.g. `sceneSkeleton`. */
  readonly columns?: readonly ProposalFormRowColumn[];
}

/**
 * Per-artifact-type authoring contract. Each artifact type gets its OWN spec (and
 * therefore its own web entry/form) instead of sharing a generic input: the fields
 * mirror the domain schema so the form collects exactly what the service needs.
 */
export interface ProposalFormSpec {
  readonly artifactType: ProposalArtifactType;
  readonly title: string;
  readonly targetIdLabel: string;
  readonly targetIdPlaceholder: string;
  /** Heading for the prose section the author fills in (e.g. `档案`). */
  readonly bodySection: string;
  readonly bodyLabel?: string;
  readonly bodyPlaceholder?: string;
  readonly fields: readonly ProposalFormField[];
  /** `true` for chapter-manuscript, whose prose is authored as `# Scene <id>` blocks. */
  readonly scenes?: boolean;
}

export interface AuthorArtifactFormValues {
  readonly targetId: string;
  readonly fields: Record<string, unknown>;
  readonly body: string;
  /** For manuscript: parsed `{ sceneId: prose }` entries. */
  readonly scenes: Record<string, string>;
}
