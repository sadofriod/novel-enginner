import { describe, expect, test } from 'bun:test';

import {
  CapabilityRegistryParseError,
  parseCapabilityRegistry,
} from './registry-parse';

const REGISTRY = `---
capabilities:
  - id: cloakbrowser
    type: mcp
    enabled: true
    allowedAgents: [world-builder]
    applicableArtifactTypes: [chapter-outline]
  - id: style-skill
    type: skill
    visibility: restricted
    applicableArtifactTypes: []
---
`;

describe('parseCapabilityRegistry', () => {
  test('parses registered capabilities with defaults for omitted fields', () => {
    const result = parseCapabilityRegistry(REGISTRY);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'cloakbrowser',
      type: 'mcp',
      enabled: true,
      visibility: 'public',
      allowedAgents: ['world-builder'],
      applicableArtifactTypes: ['chapter-outline'],
    });
    expect(result[1]).toEqual({
      id: 'style-skill',
      type: 'skill',
      enabled: true,
      visibility: 'restricted',
      allowedAgents: [],
      applicableArtifactTypes: [],
    });
  });

  test('enabled defaults to true when the field is omitted', () => {
    const [entry] = parseCapabilityRegistry(`---
capabilities:
  - id: plain
    type: mcp
---
`);
    expect(entry?.enabled).toBe(true);
  });

  test('honours an explicit enabled: false', () => {
    const [entry] = parseCapabilityRegistry(`---
capabilities:
  - id: disabled-cap
    type: mcp
    enabled: false
---
`);
    expect(entry?.enabled).toBe(false);
  });

  test('returns an empty list for empty input', () => {
    expect(parseCapabilityRegistry('')).toEqual([]);
    expect(parseCapabilityRegistry('   ')).toEqual([]);
  });

  test('returns an empty list when the document has no capabilities list', () => {
    expect(parseCapabilityRegistry('---\nsome: other\n---')).toEqual([]);
  });

  test('throws CapabilityRegistryParseError when an entry has an invalid type', () => {
    expect(() => parseCapabilityRegistry(`---
capabilities:
  - id: bad
    type: plugin
---
`)).toThrow(CapabilityRegistryParseError);
  });

  test('throws CapabilityRegistryParseError when an entry is missing its id', () => {
    expect(() => parseCapabilityRegistry(`---
capabilities:
  - type: mcp
---
`)).toThrow(CapabilityRegistryParseError);
  });

  test('throws CapabilityRegistryParseError for unknown allowedAgents values', () => {
    expect(() => parseCapabilityRegistry(`---
capabilities:
  - id: bad-role
    type: skill
    allowedAgents: [unknown-role]
---
`)).toThrow(CapabilityRegistryParseError);
  });

  test('throws CapabilityRegistryParseError for malformed YAML', () => {
    expect(() => parseCapabilityRegistry('---\ncapabilities: [unclosed\n---')).toThrow(
      CapabilityRegistryParseError,
    );
  });
});
