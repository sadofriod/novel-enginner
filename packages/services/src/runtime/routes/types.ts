export type RuntimeRouteMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RouteApi {
  handleRoot(): Response;
  handleApp(request: Request): Response;
  handleWebCommandAction(request: Request): Promise<Response>;
  handleWebSystemCommand(request: Request): Promise<Response>;
  handlePostCommand(request: Request): Promise<Response>;
  handleGetCommand(commandId: string): Response;
  handleListRuns(): Response | Promise<Response>;
  handleListArtifacts(): Response;
  handleListBootstrapSessions(): Response | Promise<Response>;
  handleGetBootstrapConfig(): Response;
  handleGetBootstrapSession(sessionId: string): Response | Promise<Response>;
  handleGetBootstrapSessionRevisions(sessionId: string): Response | Promise<Response>;
  handleGetBootstrapSessionEvidence(sessionId: string): Response | Promise<Response>;
  handleGetRun(runId: string): Response;
  handleGetArtifact(artifactType: string, targetId: string): Response;
  handleGetOverrideAudit(overrideAuditId: string): Promise<Response>;
  handleGetWorkspaceTree(): Promise<Response>;
  handleGetWorkspaceEntity(kind: string, id: string): Promise<Response>;
  handleGetGraph(): Response;
  handleSearch(request: Request): Promise<Response>;
  handleSyncCommand(syncIntent: string, request: Request): Promise<Response>;
  handleSyntheticReviewOutcome(request: Request): Promise<Response>;
  handleListProposalThreads(proposalId: string): Promise<Response>;
  handleGetProposalChain(proposalId: string): Promise<Response>;
  handleCreateProposalThread(proposalId: string, request: Request): Promise<Response>;
  handleAddThreadComment(threadId: string, request: Request): Promise<Response>;
  handleResolveThread(threadId: string, request: Request): Promise<Response>;
  handleUnresolveThread(threadId: string): Promise<Response>;
  handleEditComment(commentId: string, request: Request): Promise<Response>;
  handleDeleteComment(commentId: string): Promise<Response>;
}

export interface RuntimeRouteContext {
  readonly api: RouteApi;
  readonly request: Request;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
}

export interface RuntimeRouteDefinition {
  readonly method: RuntimeRouteMethod;
  readonly pattern: string;
  readonly handle: (context: RuntimeRouteContext) => Response | Promise<Response>;
}
