import { describe, expect, test } from 'bun:test';

import { reSyncState } from '../../workspace/sync-engine';
import { buildDerivedGraph } from './build';

const CHARACTER_MARKDOWN = `---
id: char-lin-mo
name: 林默
status: active
coreMotivation: 逃离天鹅座引力阱
worldview: engineering-pragmatist
techLevel: tier-3
knowledgeLedger:
  - factId: fact-diode-origin-001
    beliefState: known
    sourceRef: scene-0041-terminal-breach
    chapterAcquired: 41
    visibility: actor-known
    confidence: 0.92
  - factId: fact-false-lead-002
    beliefState: misunderstood
    sourceRef: scene-0038-forged-log
    chapterAcquired: 38
    visibility: actor-known
    confidence: 0.4
---

# Summary

角色当前阶段为技术驱动型求生者。
`;

const FACT_MARKDOWN = `---
id: fact-diode-origin-001
statement: 二极管来自旧灯塔
sourceRef: scene-0041-terminal-breach
visibility: actor-known
status: active
---
`;

const FALSE_LEAD_FACT_MARKDOWN = `---
id: fact-false-lead-002
statement: 伪造日志中的错误来源
sourceRef: scene-0038-forged-log
visibility: actor-known
status: active
---
`;

const RESOURCE_MARKDOWN = `---
id: res-relay-key
name: 中继钥匙
resourceType: physical
ownerRef: faction-relay-syndicate
holderRef: faction-relay-syndicate
status: active
---
`;

const VOLUME_MARKDOWN = `---
id: volume-001
title: 第一卷
status: active
sequenceNumber: 1
goal: 找到二极管来源
stage: rising-action
chapterRoster:
  - chapter-0041-outline
targetChapterCount: 1
requiredCluePayoffs:
  - clue-diode-origin
milestones: []
---
`;

const FACTION_MARKDOWN = `---
id: faction-relay-syndicate
name: 中继辛迪加
type: paramilitary
goal: 垄断跳跃门维护权
resourceIds:
  - res-relay-key
relationshipIds: []
knownByCharacters:
  - char-lin-mo
status: active
---

# Summary

盘踞在中继站的武装维护团体。
`;

const LOCATION_MARKDOWN = `---
id: location-relay-station-9
name: 第九中继站
type: station
controlFaction: faction-relay-syndicate
hazards: []
accessRules: []
status: active
---

# Summary

废弃跳跃门的核心中继站。
`;

const PLOT_CLUE_MARKDOWN = `---
id: clue-diode-origin
title: 二极管起源
introducedInChapter: 41
currentStatus: active
resolveTargetVolume: volume-001
readerVisibility: reader-known
knownByCharacterIds:
  - char-lin-mo
misledCharacterIds: []
dependencyClueIds: []
conflictClueIds: []
---

# Summary

关于核心元件来源的伏笔。
`;

const CHAPTER_OUTLINE_MARKDOWN = `---
id: chapter-0041-outline
chapterNumber: 41
volumeId: volume-001
chapterType: action
chapterTypeTags:
  - action
status: draft
targetWordCount: 3000
introduceClueIds:
  - clue-diode-origin
sceneSkeleton:
  - id: scene-0041-terminal-breach
    purpose: 突破终端防御
    locationId: location-relay-station-9
    participantCharacterIds:
      - char-lin-mo
emotionCurveStageIds:
  - stage-1
  - stage-2
  - stage-3
  - stage-4
---

# Summary

林默突破中继站终端防御，发现二极管来源。
`;

function buildSnapshot() {
  const files = [
    { path: 'state/characters/char-lin-mo.md', content: CHARACTER_MARKDOWN },
    { path: 'state/facts/fact-diode-origin-001.md', content: FACT_MARKDOWN },
    { path: 'state/facts/fact-false-lead-002.md', content: FALSE_LEAD_FACT_MARKDOWN },
    { path: 'state/resources/res-relay-key.md', content: RESOURCE_MARKDOWN },
    { path: 'state/volumes/volume-001.md', content: VOLUME_MARKDOWN },
    { path: 'state/factions/faction-relay-syndicate.md', content: FACTION_MARKDOWN },
    { path: 'state/locations/location-relay-station-9.md', content: LOCATION_MARKDOWN },
    { path: 'state/plot-clues/clue-diode-origin.md', content: PLOT_CLUE_MARKDOWN },
    { path: 'state/chapters/chapter-0041-outline.md', content: CHAPTER_OUTLINE_MARKDOWN },
  ];
  const result = reSyncState(files);
  expect(result.errors).toEqual([]);
  return result.snapshot;
}

describe('buildDerivedGraph', () => {
  test('derives nodes for every recognized canonical kind', () => {
    const graph = buildDerivedGraph(buildSnapshot());
    const nodeKindsById = new Map(graph.nodes.map((node) => [node.id, node.kind]));

    expect(nodeKindsById.get('char-lin-mo')).toBe('Character');
    expect(nodeKindsById.get('faction-relay-syndicate')).toBe('Faction');
    expect(nodeKindsById.get('location-relay-station-9')).toBe('Location');
    expect(nodeKindsById.get('clue-diode-origin')).toBe('PlotClue');
    expect(nodeKindsById.get('chapter-0041-outline')).toBe('Chapter');
    expect(nodeKindsById.get('scene-0041-terminal-breach')).toBe('Scene');
  });

  test('derives knows/misunderstands edges from the knowledge ledger using stable factIds', () => {
    const graph = buildDerivedGraph(buildSnapshot());

    const knowsEdge = graph.edges.find(
      (edge) => edge.type === 'knows' && edge.sourceId === 'char-lin-mo' && edge.targetId === 'fact-diode-origin-001',
    );
    const misunderstandsEdge = graph.edges.find(
      (edge) =>
        edge.type === 'misunderstands' && edge.sourceId === 'char-lin-mo' && edge.targetId === 'fact-false-lead-002',
    );

    expect(knowsEdge).toBeDefined();
    expect(misunderstandsEdge).toBeDefined();
  });

  test('derives controls/located-in edges from location fields', () => {
    const graph = buildDerivedGraph(buildSnapshot());

    expect(
      graph.edges.some(
        (edge) =>
          edge.type === 'controls' &&
          edge.sourceId === 'faction-relay-syndicate' &&
          edge.targetId === 'location-relay-station-9',
      ),
    ).toBe(true);
  });

  test('derives introduces edge from chapter outline to plot clue', () => {
    const graph = buildDerivedGraph(buildSnapshot());

    expect(
      graph.edges.some(
        (edge) =>
          edge.type === 'introduces' &&
          edge.sourceId === 'chapter-0041-outline' &&
          edge.targetId === 'clue-diode-origin',
      ),
    ).toBe(true);
  });

  test('produces summary-shaped search documents, never manuscript body text', () => {
    const graph = buildDerivedGraph(buildSnapshot());
    const doc = graph.searchDocuments.find((candidate) => candidate.nodeId === 'char-lin-mo');

    expect(doc).toBeDefined();
    expect(doc?.text).toBe('Character: 林默');
    expect(doc?.text.length).toBeLessThan(200);
  });

  test('is deterministic and rebuildable from the same snapshot', () => {
    const snapshot = buildSnapshot();
    const first = buildDerivedGraph(snapshot);
    const second = buildDerivedGraph(snapshot);

    expect(second.nodes).toEqual(first.nodes);
    expect(second.edges).toEqual(first.edges);
    expect(second.searchDocuments).toEqual(first.searchDocuments);
  });

  test('carries the source snapshot id so freshness can be checked without a second store', () => {
    const snapshot = buildSnapshot();
    const graph = buildDerivedGraph(snapshot);
    expect(graph.builtFromSnapshotId).toBe(snapshot.snapshotId);
  });
});
