import { describe, expect, test } from 'bun:test';

import { capabilitiesOf } from './capability-registry-view';

describe('capabilitiesOf', () => {
  test('extracts capability records from registry frontmatter', () => {
    const capabilities = capabilitiesOf({
      capabilities: [
        { id: 'cloakbrowser', type: 'mcp', enabled: true, visibility: 'restricted', allowedAgents: ['world-builder'], applicableArtifactTypes: [] },
        { id: 'craft', type: 'skill', enabled: false },
      ],
    });

    expect(capabilities).toHaveLength(2);
    expect(capabilities[0]?.id).toBe('cloakbrowser');
    expect(capabilities[1]?.enabled).toBe(false);
  });

  test('returns an empty list when frontmatter is absent or malformed', () => {
    expect(capabilitiesOf(undefined)).toEqual([]);
    expect(capabilitiesOf({ capabilities: 'not-an-array' })).toEqual([]);
  });
});
