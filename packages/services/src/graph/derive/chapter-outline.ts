import type { ChapterOutline } from '../../domain/schema';
import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import type { GraphNode, GraphEdge } from '../types';

import { entitiesOfKind, type EntityGraphSlice } from './graph-util';

function linkClueIds(
  edges: GraphEdge[],
  chapterNodeId: string,
  clueIds: readonly string[],
  relation: 'introduces' | 'advances' | 'resolves',
  entityPath: string,
): void {
  for (const clueId of clueIds) {
    edges.push({
      id: `edge:${relation}:${chapterNodeId}:${clueId}`,
      type: relation,
      sourceId: chapterNodeId,
      targetId: clueId,
      provenanceRef: entityPath,
    });
  }
}

function deriveChapterOutlineSceneEdges(
  scene: ChapterOutline['sceneSkeleton'][number],
  entityPath: string,
  edges: GraphEdge[],
): void {
  edges.push({
    id: `edge:located-in:${scene.id}:${scene.locationId}`,
    type: 'located-in',
    sourceId: scene.id,
    targetId: scene.locationId,
    provenanceRef: entityPath,
  });
  for (const characterId of scene.participantCharacterIds) {
    edges.push({
      id: `edge:knows:${characterId}:${scene.id}`,
      type: 'knows',
      sourceId: characterId,
      targetId: scene.id,
      provenanceRef: entityPath,
    });
  }
}

function deriveChapterOutlineEdges(
  outline: ChapterOutline,
  chapterNodeId: string,
  entityPath: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): void {
  linkClueIds(edges, chapterNodeId, outline.introduceClueIds ?? [], 'introduces', entityPath);
  linkClueIds(edges, chapterNodeId, outline.activeClueIds ?? [], 'advances', entityPath);
  linkClueIds(edges, chapterNodeId, outline.resolveClueIds ?? [], 'resolves', entityPath);
  for (const scene of outline.sceneSkeleton) {
    nodes.push({
      id: scene.id,
      kind: 'Scene',
      label: scene.purpose,
      sourceRef: entityPath,
      canonicalKind: 'chapter-outline',
    });
    deriveChapterOutlineSceneEdges(scene, entityPath, edges);
  }
}

export function deriveChapterOutlineGraph(snapshot: WorkspaceSnapshot): EntityGraphSlice {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const entity of entitiesOfKind(snapshot, 'chapter-outline')) {
    const outline = entity.data as ChapterOutline;
    const chapterNodeId = outline.id;
    nodes.push({
      id: chapterNodeId,
      kind: 'Chapter',
      label: outline.displayTitle ?? outline.id,
      sourceRef: entity.path,
      canonicalKind: 'chapter-outline',
    });
    deriveChapterOutlineEdges(outline, chapterNodeId, entity.path, nodes, edges);
  }

  return { nodes, edges };
}
