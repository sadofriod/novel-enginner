import type { TechRule } from '../../domain/schema';
import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import type { GraphNode } from '../types';

import { entitiesOfKind, type EntityGraphSlice } from './graph-util';

export function deriveTechRuleGraph(snapshot: WorkspaceSnapshot): EntityGraphSlice {
  const nodes: GraphNode[] = [];

  for (const entity of entitiesOfKind(snapshot, 'tech-rule')) {
    const techRule = entity.data as TechRule;
    nodes.push({
      id: techRule.id,
      kind: 'TechRule',
      label: techRule.name,
      sourceRef: entity.path,
      canonicalKind: 'tech-rule',
    });
  }

  return { nodes, edges: [] };
}
