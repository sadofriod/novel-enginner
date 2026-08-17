/* eslint-disable complexity, max-lines-per-function */

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

import type { ArtifactSummary, CommandRecord, RunRecord } from '@novel-enginner/services/runtime/store';
import type { CommandResult } from '@novel-enginner/services/runtime/command-handler';
import type { BootstrapEvidence, BootstrapRevision, BootstrapSession } from '@novel-enginner/services/bootstrap/types';
import type { OverrideAudit } from '@novel-enginner/services/domain/schema';
import type { BootstrapConfig, CommandInput, SyncCommandInput } from './api-client';

type CreateBootstrapSessionInput = {
  readonly path: 'new-book' | 'import';
  readonly bookName?: string;
  readonly config?: BootstrapConfig;
};

type CreateBootstrapSessionResult = {
  readonly result: CommandResult;
  readonly sessionId: string;
};

type ApiTags = 'Artifact' | 'Run' | 'BootstrapSession' | 'BootstrapConfig' | 'Command';

export const controlApi = createApi({
  reducerPath: 'controlApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Artifact', 'Run', 'BootstrapSession', 'BootstrapConfig', 'Command'] satisfies readonly ApiTags[],
  endpoints: (builder) => ({
    listArtifacts: builder.query<readonly ArtifactSummary[], void>({
      query: () => '/artifacts',
      providesTags: [{ type: 'Artifact', id: 'LIST' }],
    }),
    getArtifact: builder.query<ArtifactSummary | undefined, { readonly artifactType: string; readonly targetId: string }>({
      query: ({ artifactType, targetId }) => `/artifacts/${artifactType}/${targetId}`,
      providesTags: (_result, _error, input) => [{ type: 'Artifact', id: `${input.artifactType}:${input.targetId}` }],
    }),
    listRuns: builder.query<readonly RunRecord[], void>({
      query: () => '/runs',
      providesTags: [{ type: 'Run', id: 'LIST' }],
    }),
    getRun: builder.query<RunRecord | undefined, string>({
      query: (runId) => `/runs/${runId}`,
      providesTags: (_result, _error, runId) => [{ type: 'Run', id: runId }],
    }),
    getCommand: builder.query<CommandRecord | undefined, string>({
      query: (commandId) => `/commands/${commandId}`,
      providesTags: (_result, _error, commandId) => [{ type: 'Command', id: commandId }],
    }),
    getOverrideAudit: builder.query<OverrideAudit | undefined, string>({
      query: (overrideAuditId) => `/audits/override/${overrideAuditId}`,
    }),
    getBootstrapConfig: builder.query<BootstrapConfig, void>({
      query: () => '/bootstrap-config',
      providesTags: ['BootstrapConfig'],
    }),
    listBootstrapSessions: builder.query<readonly BootstrapSession[], void>({
      query: () => '/bootstrap-sessions',
      providesTags: [{ type: 'BootstrapSession', id: 'LIST' }],
    }),
    getBootstrapSession: builder.query<BootstrapSession | undefined, string>({
      query: (sessionId) => `/bootstrap-sessions/${sessionId}`,
      providesTags: (_result, _error, sessionId) => [{ type: 'BootstrapSession', id: sessionId }],
    }),
    listBootstrapRevisions: builder.query<readonly BootstrapRevision[], string>({
      query: (sessionId) => `/bootstrap-sessions/${sessionId}/revisions`,
    }),
    listBootstrapEvidence: builder.query<readonly BootstrapEvidence[], string>({
      query: (sessionId) => `/bootstrap-sessions/${sessionId}/evidence`,
    }),
    submitCommand: builder.mutation<CommandResult, CommandInput>({
      query: (input) => ({ url: '/commands', method: 'POST', body: input }),
      invalidatesTags: ['Artifact', 'Run', 'BootstrapSession', 'BootstrapConfig'],
    }),
    submitSync: builder.mutation<CommandResult, { readonly intent: 're-sync-state' | 'rebuild-graph'; readonly input: SyncCommandInput }>({
      query: ({ intent, input }) => ({ url: `/sync/${intent}`, method: 'POST', body: input }),
      invalidatesTags: ['Artifact', 'Run', 'BootstrapSession', 'BootstrapConfig'],
    }),
    createBootstrapSession: builder.mutation<CreateBootstrapSessionResult, CreateBootstrapSessionInput>({
      async queryFn(input, _queryApi, _extraOptions, baseQuery) {
        const sessionId = crypto.randomUUID();
        const commandInput: CommandInput = {
          workspaceId: input.config?.workspaceId ?? 'workspace-local',
          bookId: input.config?.bookId ?? 'book-local',
          systemTaskType: 'create-bootstrap-session',
          intent: 'create-bootstrap-session',
          requestedBy: 'author-local',
          approvalMode: 'manual',
          idempotencyKey: `bootstrap-create-${sessionId}`,
          sessionId,
          path: input.path,
          ...(input.bookName === undefined ? {} : { bookName: input.bookName }),
        };
        const response = await baseQuery({ url: '/commands', method: 'POST', body: commandInput });
        if (response.error !== undefined) {
          return { error: response.error };
        }
        return { data: { result: response.data as CommandResult, sessionId } };
      },
      invalidatesTags: ['BootstrapSession', 'BootstrapConfig'],
    }),
  }),
});

export const {
  useListArtifactsQuery,
  useGetArtifactQuery,
  useListRunsQuery,
  useGetRunQuery,
  useGetCommandQuery,
  useGetOverrideAuditQuery,
  useGetBootstrapConfigQuery,
  useListBootstrapSessionsQuery,
  useGetBootstrapSessionQuery,
  useListBootstrapRevisionsQuery,
  useListBootstrapEvidenceQuery,
  useSubmitCommandMutation,
  useSubmitSyncMutation,
  useCreateBootstrapSessionMutation,
} = controlApi;
