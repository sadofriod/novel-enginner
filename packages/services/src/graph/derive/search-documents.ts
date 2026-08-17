import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import type { GraphNode, GraphNodeKind, SearchDocument } from '../types';

import { entitiesOfKind } from './graph-util';

function hashText(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (Math.imul(31, hash) + content.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
}

const SUMMARY_ELIGIBLE_KINDS: ReadonlySet<GraphNodeKind> = new Set([
  'Character',
  'Faction',
  'Location',
  'PlotClue',
  'Chapter',
]);

/**
 * Builds the summary-layer search documents that would be sent to the vector
 * index, per docs/architecture/modules/08-graph-search-and-capabilities.md §8.4:
 * only summary-shaped text, never full manuscript body text.
 */
export function buildSearchDocuments(
  snapshot: WorkspaceSnapshot,
  nodes: readonly GraphNode[],
): readonly SearchDocument[] {
  const documents: SearchDocument[] = [];
  for (const node of nodes) {
    if (!SUMMARY_ELIGIBLE_KINDS.has(node.kind)) {
      continue;
    }
    const text = `${node.kind}: ${node.label}`;
    documents.push({
      id: `doc:${node.id}`,
      kind: node.kind,
      nodeId: node.id,
      sourceRef: node.sourceRef,
      text,
      contentHash: hashText(text),
    });
  }
  for (const entity of entitiesOfKind(snapshot, 'planning-anchor')) {
    const data = entity.data as { id: string; title: string };
    const text = `PlanningAnchor: ${data.title}`;
    documents.push({
      id: `doc:${data.id}`,
      kind: 'PlanningAnchor',
      nodeId: data.id,
      sourceRef: entity.path,
      text,
      contentHash: hashText(text),
    });
  }
  return documents;
}
