import type { Faction } from '../../domain/schema';
import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import type { GraphNode, GraphEdge } from '../types';

import { entitiesOfKind, type EntityGraphSlice } from './graph-util';

export function deriveFactionGraph(snapshot: WorkspaceSnapshot): EntityGraphSlice {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const entity of entitiesOfKind(snapshot, 'faction')) {
    const faction = entity.data as Faction;
    nodes.push({
      id: faction.id,
      kind: 'Faction',
      label: faction.name,
      sourceRef: entity.path,
      canonicalKind: 'faction',
    });
    for (const characterId of faction.knownByCharacters) {
      edges.push({
        id: `edge:knows:${characterId}:${faction.id}`,
        type: 'knows',
        sourceId: characterId,
        targetId: faction.id,
        provenanceRef: entity.path,
      });
    }
  }

  return { nodes, edges };
}
