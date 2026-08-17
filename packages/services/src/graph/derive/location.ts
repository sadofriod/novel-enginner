import type { Location } from '../../domain/schema';
import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import type { GraphNode, GraphEdge } from '../types';

import { entitiesOfKind, type EntityGraphSlice } from './graph-util';

export function deriveLocationGraph(snapshot: WorkspaceSnapshot): EntityGraphSlice {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const entity of entitiesOfKind(snapshot, 'location')) {
    const location = entity.data as Location;
    nodes.push({
      id: location.id,
      kind: 'Location',
      label: location.name,
      sourceRef: entity.path,
      canonicalKind: 'location',
    });
    if (location.parentLocation !== undefined) {
      edges.push({
        id: `edge:located-in:${location.id}:${location.parentLocation}`,
        type: 'located-in',
        sourceId: location.id,
        targetId: location.parentLocation,
        provenanceRef: entity.path,
      });
    }
    if (location.controlFaction !== undefined) {
      edges.push({
        id: `edge:controls:${location.controlFaction}:${location.id}`,
        type: 'controls',
        sourceId: location.controlFaction,
        targetId: location.id,
        provenanceRef: entity.path,
      });
    }
  }

  return { nodes, edges };
}
