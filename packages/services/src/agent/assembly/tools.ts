/**
 * Process tool registry for the intent-driven prompt assembly
 * (Batch C: provider tool calling + process-internal tools).
 *
 * V1 exposes three process-internal tools the model can call:
 * - `rag-search`: vector search over the summary layer (character/chapter/clue
 *   summaries), per docs/architecture/modules/08-graph-search-and-capabilities.md §8.4.
 * - `graph-query`: structural query over derived graph nodes/edges (§8.2-§8.3).
 * - `read-canonical`: read a canonical artifact by artifactType + targetId.
 *
 * Definitions are static; execution goes through injected ports so tests and
 * runtime can bind real vectorSearch/graph/canonical readers without coupling.
 */
import { z } from 'zod';

export const PROCESS_TOOL_NAMES = ['rag-search', 'graph-query', 'read-canonical'] as const;

export type ProcessToolName = (typeof PROCESS_TOOL_NAMES)[number];

export interface ToolDefinition {
  readonly name: ProcessToolName;
  readonly description: string;
  readonly parameterSchema: z.ZodTypeAny;
}

const ragSearchSchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.number().int().positive().max(20).optional(),
  })
  .readonly();

const graphQuerySchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.number().int().positive().max(50).optional(),
  })
  .readonly();

const readCanonicalSchema = z
  .object({
    artifactType: z.string().trim().min(1),
    targetId: z.string().trim().min(1),
  })
  .readonly();

export const PROCESS_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: 'rag-search',
    description: '向量检索摘要层文档（角色/章节/线索/地点摘要），补充当前任务缺失的上下文。',
    parameterSchema: ragSearchSchema,
  },
  {
    name: 'graph-query',
    description: '查询派生图谱的节点与边（角色-场景-伏笔-地点关系），回答结构性关联问题。',
    parameterSchema: graphQuerySchema,
  },
  {
    name: 'read-canonical',
    description: '读取 canonical 工件内容（按 artifactType + targetId），例如已审批细纲或角色档案。',
    parameterSchema: readCanonicalSchema,
  },
];

export function findToolDefinition(name: string): ToolDefinition | undefined {
  return PROCESS_TOOL_DEFINITIONS.find((tool) => tool.name === name);
}

/** Resolves only the known tool definitions for the selected ids. */
export function resolveToolDescriptions(names: readonly string[]): readonly ToolDefinition[] {
  return names
    .map(findToolDefinition)
    .filter((tool): tool is ToolDefinition => tool !== undefined);
}

export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export interface ToolExecutionDeps {
  readonly ragSearch: (input: { readonly query: string; readonly limit?: number }) => Promise<string>;
  readonly graphQuery: (input: { readonly query: string; readonly limit?: number }) => Promise<string>;
  readonly readCanonical: (input: { readonly artifactType: string; readonly targetId: string }) => Promise<string>;
}

function parseToolArgs(definition: ToolDefinition, args: unknown): unknown {
  try {
    return definition.parameterSchema.parse(args);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ToolExecutionError(`Invalid arguments for tool "${definition.name}": ${message}`);
  }
}

/** Validates args and dispatches to the matching execution port. */
export async function executeProcessTool(
  name: string,
  args: unknown,
  deps: ToolExecutionDeps,
): Promise<string> {
  const definition = findToolDefinition(name);
  if (definition === undefined) {
    throw new ToolExecutionError(`Unknown process tool: ${name}.`);
  }
  const input = parseToolArgs(definition, args);
  if (definition.name === 'rag-search') {
    return deps.ragSearch(input as { readonly query: string; readonly limit?: number });
  }
  if (definition.name === 'graph-query') {
    return deps.graphQuery(input as { readonly query: string; readonly limit?: number });
  }
  return deps.readCanonical(input as { readonly artifactType: string; readonly targetId: string });
}
