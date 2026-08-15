import { generateWorldState } from '../agent/world-builder';
import { createDefaultModelProvider } from '../agent/provider';
import { persistCanonicalDraft } from '../persistence/operations';
import { createBootstrapArtifactDraft } from '../runtime/canonical-draft';
import { inngest } from './inngest-client';
import { createPersistedProposal, synchronizeWorkflowWorkspace } from './inngest-functions';

export const projectBriefFunction = inngest.createFunction(
  { id: 'project-brief-workflow', name: 'Project Brief Workflow', concurrency: { limit: 1, key: 'event.data.bookId' }, retries: 2 },
  { event: 'novel/project-brief.requested' },
  async ({ event, step }) => {
    const { workspaceId, bookId, targetId, intent, runId } = event.data;
    const canonicalVersion = await step.run('re-sync-state', async () =>
      synchronizeWorkflowWorkspace({ workspaceId, bookId, requestedBy: event.data.requestedBy, runId }));
    const generated = await step.run('generate-project-brief', async () => generateWorldState({
      artifactType: 'project-brief', targetId, canonicalContext: `workspace=${workspaceId}; book=${bookId}`,
      instructions: 'Return only complete canonical Markdown for state/book/project-brief.md with every required ProjectBrief frontmatter field.',
    }, createDefaultModelProvider()));
    const proposalResult = await step.run('create-proposal', async () => createPersistedProposal({
      workspaceId, bookId, artifactType: 'project-brief', targetId, intent, parentRunId: runId, canonicalVersion,
    }));
    await step.run('persist-canonical-draft', async () => persistCanonicalDraft({
      draft: createBootstrapArtifactDraft({ proposalId: proposalResult.created.proposalId, artifactType: 'project-brief', content: generated.text }),
      proposal: proposalResult.created,
    }));
    return { proposalId: proposalResult.created.proposalId, status: proposalResult.created.status, workspaceId, bookId, targetId };
  },
);

export const worldFoundationFunction = inngest.createFunction(
  { id: 'world-foundation-workflow', name: 'World Foundation Workflow', concurrency: { limit: 1, key: 'event.data.bookId' }, retries: 2 },
  { event: 'novel/world-foundation.requested' },
  async ({ event, step }) => {
    const { workspaceId, bookId, targetId, intent, runId } = event.data;
    const canonicalVersion = await step.run('re-sync-state', async () => synchronizeWorkflowWorkspace({ workspaceId, bookId, requestedBy: event.data.requestedBy, runId }));
    const generated = await step.run('generate-world-foundation', async () => generateWorldState({ artifactType: 'world-foundation', targetId, canonicalContext: `workspace=${workspaceId}; book=${bookId}`, instructions: 'Return only complete canonical Markdown for state/world/world-foundation.md with every required WorldFoundation frontmatter field.' }, createDefaultModelProvider()));
    const proposalResult = await step.run('create-proposal', async () => createPersistedProposal({ workspaceId, bookId, artifactType: 'world-foundation', targetId, intent, parentRunId: runId, canonicalVersion }));
    await step.run('persist-canonical-draft', async () => persistCanonicalDraft({ draft: createBootstrapArtifactDraft({ proposalId: proposalResult.created.proposalId, artifactType: 'world-foundation', content: generated.text }), proposal: proposalResult.created }));
    return { proposalId: proposalResult.created.proposalId, status: proposalResult.created.status, workspaceId, bookId, targetId };
  },
);

export const storyBlueprintFunction = inngest.createFunction(
  { id: 'story-blueprint-workflow', name: 'Story Blueprint Workflow', concurrency: { limit: 1, key: 'event.data.bookId' }, retries: 2 },
  { event: 'novel/story-blueprint.requested' },
  async ({ event, step }) => {
    const { workspaceId, bookId, targetId, intent, runId } = event.data;
    const canonicalVersion = await step.run('re-sync-state', async () => synchronizeWorkflowWorkspace({ workspaceId, bookId, requestedBy: event.data.requestedBy, runId }));
    const generated = await step.run('generate-story-blueprint', async () => generateWorldState({ artifactType: 'story-blueprint', targetId, canonicalContext: `workspace=${workspaceId}; book=${bookId}`, instructions: 'Return only complete canonical Markdown for state/book/story-blueprint.md with every required StoryBlueprint frontmatter field.' }, createDefaultModelProvider()));
    const proposalResult = await step.run('create-proposal', async () => createPersistedProposal({ workspaceId, bookId, artifactType: 'story-blueprint', targetId, intent, parentRunId: runId, canonicalVersion }));
    await step.run('persist-canonical-draft', async () => persistCanonicalDraft({ draft: createBootstrapArtifactDraft({ proposalId: proposalResult.created.proposalId, artifactType: 'story-blueprint', content: generated.text }), proposal: proposalResult.created }));
    return { proposalId: proposalResult.created.proposalId, status: proposalResult.created.status, workspaceId, bookId, targetId };
  },
);
