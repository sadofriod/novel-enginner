import type { BeliefRecord, Character } from '../../domain/schema';
import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import type { GraphEdgeType, GraphNode, GraphEdge } from '../types';

import { entitiesOfKind, type EntityGraphSlice } from './graph-util';

export function deriveCharacterGraph(snapshot: WorkspaceSnapshot): EntityGraphSlice {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const entity of entitiesOfKind(snapshot, 'character')) {
    const character = entity.data as Character;
    nodes.push({
      id: character.id,
      kind: 'Character',
      label: character.name,
      sourceRef: entity.path,
      canonicalKind: 'character',
    });

    const ledger: readonly BeliefRecord[] = character.knowledgeLedger ?? [];
    for (const record of ledger) {
      const edgeType: GraphEdgeType = record.beliefState === 'misunderstood' ? 'misunderstands' : 'knows';
      edges.push({
        id: `edge:${edgeType}:${character.id}:${record.factId}`,
        type: edgeType,
        sourceId: character.id,
        targetId: record.factId,
        provenanceRef: record.sourceRef,
      });
    }
  }

  return { nodes, edges };
}
