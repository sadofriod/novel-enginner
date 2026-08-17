export interface SearchResultItem {
  readonly documentId: string;
  readonly nodeId: string;
  readonly kind: string;
  readonly sourceRef: string;
  readonly text: string;
  readonly similarity: number;
}

export interface SearchQueryOptions {
  readonly workspaceId: string;
  readonly bookId?: string;
  readonly limit?: number;
  readonly kinds?: readonly string[];
}

export type SearchWorkspace = (query: string, options: SearchQueryOptions) => Promise<readonly SearchResultItem[]>;
