import type {
  BeliefRecord,
  Character,
  ChapterOutline,
  Faction,
  Location,
  PlotClue,
  Relationship,
  TechRule,
} from '../domain/schema';
import type { CanonicalEntitySnapshot, WorkspaceSnapshot } from '../workspace/sync-engine';

import type { DerivedGraph, GraphEdge, GraphEdgeType, GraphNode, GraphNodeKind, SearchDocument } from './types';

function hashText(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (Math.imul(31, hash) + content.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
}

function entitiesOfKind(
  snapshot: WorkspaceSnapshot,
  kind: CanonicalEntitySnapshot['kind'],
): readonly CanonicalEntitySnapshot[] {
  return [...snapshot.entities.values()].filter((entity) => entity.kind === kind);
}

function pushNode(nodes: GraphNode[], node: GraphNode): void {
  nodes.push(node);
}

function pushEdge(
  edges: GraphEdge[],
  seenEdgeIds: Set<string>,
  type: GraphEdgeType,
  sourceId: string,
  targetId: string,
  provenanceRef?: string,
): void {
  const id = `edge:${type}:${sourceId}:${targetId}`;
  if (seenEdgeIds.has(id)) {
    return;
  }
  seenEdgeIds.add(id);
  edges.push(
    provenanceRef === undefined
      ? { id, type, sourceId, targetId }
      : { id, type, sourceId, targetId, provenanceRef },
  );
}

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

function deriveCharacterNodesAndEdges(
  snapshot: WorkspaceSnapshot,
  nodes: GraphNode[],
  edges: GraphEdge[],
  seenEdgeIds: Set<string>,
): void {
  for (const entity of entitiesOfKind(snapshot, 'character')) {
    const character = entity.data as Character;
    pushNode(nodes, {
      id: character.id,
      kind: 'Character',
      label: character.name,
      sourceRef: entity.path,
      canonicalKind: 'character',
    });

    const ledger: readonly BeliefRecord[] = character.knowledgeLedger ?? [];
    for (const record of ledger) {
      const edgeType: GraphEdgeType = record.beliefState === 'misunderstood' ? 'misunderstands' : 'knows';
      pushEdge(edges, seenEdgeIds, edgeType, character.id, record.factId, record.sourceRef);
    }
  }
}

function deriveFactionNodesAndEdges(
  snapshot: WorkspaceSnapshot,
  nodes: GraphNode[],
  edges: GraphEdge[],
  seenEdgeIds: Set<string>,
): void {
  for (const entity of entitiesOfKind(snapshot, 'faction')) {
    const faction = entity.data as Faction;
    pushNode(nodes, {
      id: faction.id,
      kind: 'Faction',
      label: faction.name,
      sourceRef: entity.path,
      canonicalKind: 'faction',
    });
    for (const characterId of faction.knownByCharacters) {
      pushEdge(edges, seenEdgeIds, 'knows', characterId, faction.id, entity.path);
    }
  }
}

function deriveLocationNodesAndEdges(
  snapshot: WorkspaceSnapshot,
  nodes: GraphNode[],
  edges: GraphEdge[],
  seenEdgeIds: Set<string>,
): void {
  for (const entity of entitiesOfKind(snapshot, 'location')) {
    const location = entity.data as Location;
    pushNode(nodes, {
      id: location.id,
      kind: 'Location',
      label: location.name,
      sourceRef: entity.path,
      canonicalKind: 'location',
    });
    if (location.parentLocation !== undefined) {
      pushEdge(edges, seenEdgeIds, 'located-in', location.id, location.parentLocation, entity.path);
    }
    if (location.controlFaction !== undefined) {
      pushEdge(edges, seenEdgeIds, 'controls', location.controlFaction, location.id, entity.path);
    }
  }
}

function deriveTechRuleNodes(snapshot: WorkspaceSnapshot, nodes: GraphNode[]): void {
  for (const entity of entitiesOfKind(snapshot, 'tech-rule')) {
    const techRule = entity.data as TechRule;
    pushNode(nodes, {
      id: techRule.id,
      kind: 'TechRule',
      label: techRule.name,
      sourceRef: entity.path,
      canonicalKind: 'tech-rule',
    });
  }
}

function derivePlotClueEdges(
  clue: PlotClue,
  entityPath: string,
  edges: GraphEdge[],
  seenEdgeIds: Set<string>,
): void {
  for (const characterId of clue.knownByCharacterIds) {
    pushEdge(edges, seenEdgeIds, 'knows', characterId, clue.id, entityPath);
  }
  for (const characterId of clue.misledCharacterIds) {
    pushEdge(edges, seenEdgeIds, 'misunderstands', characterId, clue.id, entityPath);
  }
  for (const dependencyId of clue.dependencyClueIds) {
    pushEdge(edges, seenEdgeIds, 'depends-on', clue.id, dependencyId, entityPath);
  }
  for (const conflictId of clue.conflictClueIds) {
    pushEdge(edges, seenEdgeIds, 'conflicts-with', clue.id, conflictId, entityPath);
  }
}

function derivePlotClueNodesAndEdges(
  snapshot: WorkspaceSnapshot,
  nodes: GraphNode[],
  edges: GraphEdge[],
  seenEdgeIds: Set<string>,
): void {
  for (const entity of entitiesOfKind(snapshot, 'plot-clue')) {
    const clue = entity.data as PlotClue;
    pushNode(nodes, {
      id: clue.id,
      kind: 'PlotClue',
      label: clue.title,
      sourceRef: entity.path,
      canonicalKind: 'plot-clue',
    });
    derivePlotClueEdges(clue, entity.path, edges, seenEdgeIds);
  }
}

function deriveChapterOutlineSceneEdges(
  scene: ChapterOutline['sceneSkeleton'][number],
  entityPath: string,
  edges: GraphEdge[],
  seenEdgeIds: Set<string>,
): void {
  pushEdge(edges, seenEdgeIds, 'located-in', scene.id, scene.locationId, entityPath);
  for (const characterId of scene.participantCharacterIds) {
    pushEdge(edges, seenEdgeIds, 'knows', characterId, scene.id, entityPath);
  }
}

function deriveChapterOutlineEdges(
  outline: ChapterOutline,
  chapterNodeId: string,
  entityPath: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  seenEdgeIds: Set<string>,
): void {
  linkClueIds(edges, seenEdgeIds, chapterNodeId, outline.introduceClueIds ?? [], 'introduces', entityPath);
  linkClueIds(edges, seenEdgeIds, chapterNodeId, outline.activeClueIds ?? [], 'advances', entityPath);
  linkClueIds(edges, seenEdgeIds, chapterNodeId, outline.resolveClueIds ?? [], 'resolves', entityPath);
  for (const scene of outline.sceneSkeleton) {
    pushNode(nodes, {
      id: scene.id,
      kind: 'Scene',
      label: scene.purpose,
      sourceRef: entityPath,
      canonicalKind: 'chapter-outline',
    });
    deriveChapterOutlineSceneEdges(scene, entityPath, edges, seenEdgeIds);
  }
}

function linkClueIds(
  edges: GraphEdge[],
  seenEdgeIds: Set<string>,
  chapterNodeId: string,
  clueIds: readonly string[],
  relation: 'introduces' | 'advances' | 'resolves',
  entityPath: string,
): void {
  for (const clueId of clueIds) {
    pushEdge(edges, seenEdgeIds, relation, chapterNodeId, clueId, entityPath);
  }
}

function deriveChapterOutlineNodesAndEdges(
  snapshot: WorkspaceSnapshot,
  nodes: GraphNode[],
  edges: GraphEdge[],
  seenEdgeIds: Set<string>,
): void {
  for (const entity of entitiesOfKind(snapshot, 'chapter-outline')) {
    const outline = entity.data as ChapterOutline;
    const chapterNodeId = outline.id;
    pushNode(nodes, {
      id: chapterNodeId,
      kind: 'Chapter',
      label: outline.displayTitle ?? outline.id,
      sourceRef: entity.path,
      canonicalKind: 'chapter-outline',
    });
    deriveChapterOutlineEdges(outline, chapterNodeId, entity.path, nodes, edges, seenEdgeIds);
  }
}

function deriveRelationshipEdges(
  snapshot: WorkspaceSnapshot,
  edges: GraphEdge[],
  seenEdgeIds: Set<string>,
): void {
  for (const entity of entitiesOfKind(snapshot, 'relationship')) {
    const relationship = entity.data as Relationship;
    const type = mapRelationType(relationship.relationType);
    pushEdge(edges, seenEdgeIds, type, relationship.sourceRef, relationship.targetRef, entity.path);
  }
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
function buildSearchDocuments(nodes: readonly GraphNode[]): readonly SearchDocument[] {
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
  return documents;
}

/**
 * Rebuilds the derived graph + search scaffold entirely from a canonical
 * WorkspaceSnapshot (src/workspace/sync-engine.ts). This function is pure and
 * deterministic: the same snapshot always yields the same graph, so the graph
 * layer never needs to be treated as a second source of truth (per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.1).
 */
export function buildDerivedGraph(snapshot: WorkspaceSnapshot): DerivedGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenEdgeIds = new Set<string>();

  deriveCharacterNodesAndEdges(snapshot, nodes, edges, seenEdgeIds);
  deriveFactionNodesAndEdges(snapshot, nodes, edges, seenEdgeIds);
  deriveLocationNodesAndEdges(snapshot, nodes, edges, seenEdgeIds);
  deriveTechRuleNodes(snapshot, nodes);
  derivePlotClueNodesAndEdges(snapshot, nodes, edges, seenEdgeIds);
  deriveChapterOutlineNodesAndEdges(snapshot, nodes, edges, seenEdgeIds);
  deriveRelationshipEdges(snapshot, edges, seenEdgeIds);

  return {
    builtFromSnapshotId: snapshot.snapshotId,
    nodes,
    edges,
    searchDocuments: buildSearchDocuments(nodes),
  };
}
