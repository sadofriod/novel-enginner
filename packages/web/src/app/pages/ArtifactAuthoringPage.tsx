import { Link, useParams } from 'react-router-dom';

import type { ProposalArtifactType } from '@novel-enginner/services/domain/values';

import type { BootstrapConfig, CommandInput } from '../../api-types';
import { useGetBootstrapConfigQuery, useSubmitCommandMutation } from '../../control-api';
import type { ProposalFormField } from '../../proposal-forms/types';
import { ARTIFACT_FORM_SPECS } from '../../proposal-forms/artifact-form-specs';
import { ArtifactAuthoringForm } from '../../proposal-forms/ArtifactAuthoringForm';

const FIXED_TARGET_ID: Readonly<Partial<Record<ProposalArtifactType, string>>> = {
  'project-brief': 'project-brief',
  'world-foundation': 'world-foundation',
  'story-blueprint': 'story-blueprint',
};

function defaultFieldValue(field: ProposalFormField): unknown {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  return field.type === 'list' || field.type === 'rows' ? [] : '';
}

function initialFieldsFor(artifactType: ProposalArtifactType, bookId: string): Readonly<Record<string, unknown>> {
  const fields: Record<string, unknown> = {};
  const spec = ARTIFACT_FORM_SPECS[artifactType];
  for (const field of spec.fields) {
    fields[field.name] = field.name === 'bookId' ? bookId : defaultFieldValue(field);
  }
  return fields;
}

function resolveWorkspace(config: BootstrapConfig | undefined): { readonly workspaceId: string; readonly bookId: string } {
  return config === undefined
    ? { workspaceId: 'workspace-local', bookId: 'book-local' }
    : { workspaceId: config.workspaceId, bookId: config.bookId };
}

function optionalBody(payload: Record<string, unknown>): { readonly sections?: Record<string, string>; readonly scenes?: Record<string, string> } {
  const sections = payload['sections'] as Record<string, string> | undefined;
  const scenes = payload['scenes'] as Record<string, string> | undefined;
  return {
    ...(sections === undefined ? {} : { sections }),
    ...(scenes === undefined ? {} : { scenes }),
  };
}

function buildAuthorProposeInput(config: BootstrapConfig | undefined, type: ProposalArtifactType, payload: Record<string, unknown>): CommandInput {
  const workspace = resolveWorkspace(config);
  return {
    workspaceId: workspace.workspaceId,
    bookId: workspace.bookId,
    artifactType: type,
    targetId: typeof payload['targetId'] === 'string' ? payload['targetId'] : '',
    intent: 'propose',
    requestedBy: 'author-local',
    approvalMode: 'manual',
    idempotencyKey: `author-propose-${type}-${Date.now().toString(36)}`,
    frontmatter: payload['frontmatter'] as Record<string, unknown>,
    ...optionalBody(payload),
  };
}

type SubmitPayloadHandler = (payload: Record<string, unknown>) => Promise<{ readonly ok: boolean; readonly message: string }>;

export function ArtifactAuthoringPage() {
  const { artifactType } = useParams();
  const { data: config } = useGetBootstrapConfigQuery();
  const [submitCommand] = useSubmitCommandMutation();

  const type = artifactType ?? '';
  const handleSubmit: SubmitPayloadHandler = async (payload) => {
    const result = await submitCommand(buildAuthorProposeInput(config, type as ProposalArtifactType, payload)).unwrap();
    if (result.status !== 'accepted') {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: '✔ Proposal 已生成，等待审批。' };
  };

  return (
    <main style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 20px', display: 'grid', gap: '20px' }}>
      <Link to="/app" style={{ color: '#1565c0' }}>返回控制台</Link>
      <AuthoringBody type={type} config={config} onSubmit={handleSubmit} />
    </main>
  );
}

function AuthoringBody({ type, config, onSubmit }: { readonly type: string; readonly config: BootstrapConfig | undefined; readonly onSubmit: SubmitPayloadHandler }) {
  const spec = ARTIFACT_FORM_SPECS[type as ProposalArtifactType];
  if (spec === undefined || type === 'world-change') {
    return <UnknownTypePanel artifactType={type} />;
  }
  return (
    <ArtifactAuthoringForm
      spec={spec}
      defaultTargetId={FIXED_TARGET_ID[type as ProposalArtifactType] ?? ''}
      {...(config === undefined ? {} : { initialFields: initialFieldsFor(type as ProposalArtifactType, config.bookId) })}
      onSubmit={onSubmit}
    />
  );
}

function UnknownTypePanel({ artifactType }: { readonly artifactType: string }) {
  return (
    <>
      <h1>未知工件类型</h1>
      <p>“{artifactType}” 没有可用的独立编辑表单（world-change 是跨文件 patch，不在表单入口内）。</p>
    </>
  );
}
