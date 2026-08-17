import { describe, expect, test } from 'bun:test';

import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import { deriveTechRuleGraph } from './tech-rule';

function snapshotWith(techRuleData: Record<string, unknown>): WorkspaceSnapshot {
  return {
    snapshotId: 'snap-test',
    entities: new Map([
      [
        'state/tech-rules/rule.md',
        { path: 'state/tech-rules/rule.md', kind: 'tech-rule', data: techRuleData, contentHash: 'h' },
      ],
    ]),
  };
}

describe('deriveTechRuleGraph', () => {
  test('derives a TechRule node with the rule name as label', () => {
    const result = deriveTechRuleGraph(snapshotWith({ id: 'rule-1', name: 'Tide Clock' }));

    expect(result.nodes).toEqual([
      {
        id: 'rule-1',
        kind: 'TechRule',
        label: 'Tide Clock',
        sourceRef: 'state/tech-rules/rule.md',
        canonicalKind: 'tech-rule',
      },
    ]);
  });

  test('never derives edges', () => {
    const result = deriveTechRuleGraph(snapshotWith({ id: 'rule-1', name: 'Tide Clock' }));
    expect(result.edges).toEqual([]);
  });
});
