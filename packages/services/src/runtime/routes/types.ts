export type RuntimeRouteMethod = 'GET' | 'POST';

export interface RouteApi {
  handleRoot(): Response;
  handleApp(request: Request): Response;
  handleWebCommandAction(request: Request): Promise<Response>;
  handlePostCommand(request: Request): Promise<Response>;
  handleGetCommand(commandId: string): Response;
  handleListRuns(): Response;
  handleListArtifacts(): Response;
  handleGetRun(runId: string): Response;
  handleGetArtifact(artifactType: string, targetId: string): Response;
  handleRunStream(runId: string, request: Request): Response;
  handleSyncCommand(syncIntent: string, request: Request): Promise<Response>;
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
