import type { PlotClue } from '../../domain/schema';
import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import type { GraphNode, GraphEdge } from '../types';

import { entitiesOfKind, type EntityGraphSlice } from './graph-util';

function pushClueRelation(
  edges: GraphEdge[],
  type: 'knows' | 'misunderstands' | 'depends-on' | 'conflicts-with',
  sourceId: string,
  targetId: string,
  entityPath: string,
): void {
  edges.push({
    id: `edge:${type}:${sourceId}:${targetId}`,
    type,
    sourceId,
    targetId,
    provenanceRef: entityPath,
  });
}

function derivePlotClueEdges(
  clue: PlotClue,
  entityPath: string,
  edges: GraphEdge[],
): void {
  for (const characterId of clue.knownByCharacterIds) {
    pushClueRelation(edges, 'knows', characterId, clue.id, entityPath);
  }
  for (const characterId of clue.misledCharacterIds) {
    pushClueRelation(edges, 'misunderstands', characterId, clue.id, entityPath);
  }
  for (const dependencyId of clue.dependencyClueIds) {
    pushClueRelation(edges, 'depends-on', clue.id, dependencyId, entityPath);
  }
  for (const conflictId of clue.conflictClueIds) {
    pushClueRelation(edges, 'conflicts-with', clue.id, conflictId, entityPath);
  }
}

export function derivePlotClueGraph(snapshot: WorkspaceSnapshot): EntityGraphSlice {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const entity of entitiesOfKind(snapshot, 'plot-clue')) {
    const clue = entity.data as PlotClue;
    nodes.push({
      id: clue.id,
      kind: 'PlotClue',
      label: clue.title,
      sourceRef: entity.path,
      canonicalKind: 'plot-clue',
    });
    derivePlotClueEdges(clue, entity.path, edges);
  }

  return { nodes, edges };
}
