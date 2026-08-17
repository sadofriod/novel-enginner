import type { ProposalArtifactType } from '@novel-enginner/services/domain/values';

import type { BootstrapConfig, CommandInput } from '../api-types';

export function resolveWorkspace(config: BootstrapConfig | undefined): { readonly workspaceId: string; readonly bookId: string } {
  return config === undefined
    ? { workspaceId: 'workspace-local', bookId: 'book-local' }
    : { workspaceId: config.workspaceId, bookId: config.bookId };
}

export function buildAuthorProposeInput(
  config: BootstrapConfig | undefined,
  type: ProposalArtifactType,
  payload: Record<string, unknown>,
): CommandInput {
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

function optionalBody(payload: Record<string, unknown>): { readonly sections?: Record<string, string>; readonly scenes?: Record<string, string> } {
  const sections = payload['sections'] as Record<string, string> | undefined;
  const scenes = payload['scenes'] as Record<string, string> | undefined;
  return {
    ...(sections === undefined ? {} : { sections }),
    ...(scenes === undefined ? {} : { scenes }),
  };
}
