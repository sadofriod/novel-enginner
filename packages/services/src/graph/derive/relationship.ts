import type { Relationship } from '../../domain/schema';
import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import type { GraphEdge, GraphEdgeType } from '../types';

import { entitiesOfKind, type EntityGraphSlice } from './graph-util';

/**
 * Maps a canonical `relationship.relationType` free-text value onto one of the
 * recommended edge types from
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.3. Unknown
 * values fall back to `relates-to` rather than being dropped, since the
 * relationship record itself remains the canonical authority.
 */
function mapRelationType(relationType: string): GraphEdgeType {
  const normalized = relationType.trim().toLowerCase();
  const known: readonly GraphEdgeType[] = [
    'introduces',
    'advances',
    'resolves',
    'knows',
    'misunderstands',
    'controls',
    'located-in',
    'depends-on',
    'conflicts-with',
    'uses-tech',
  ];
  const match = known.find((candidate) => candidate === normalized);
  return match ?? 'relates-to';
}

export function deriveRelationshipGraph(snapshot: WorkspaceSnapshot): EntityGraphSlice {
  const edges: GraphEdge[] = [];

  for (const entity of entitiesOfKind(snapshot, 'relationship')) {
    const relationship = entity.data as Relationship;
    const type = mapRelationType(relationship.relationType);
    edges.push({
      id: `edge:${type}:${relationship.sourceRef}:${relationship.targetRef}`,
      type,
      sourceId: relationship.sourceRef,
      targetId: relationship.targetRef,
      provenanceRef: entity.path,
    });
  }

  return { nodes: [], edges };
}
