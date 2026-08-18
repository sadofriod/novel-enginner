---
capabilities:
  - id: cloakbrowser
    type: mcp
    enabled: true
    visibility: restricted
    allowedAgents:
      - world-builder
      - plot-planner
      - reviewer
    applicableArtifactTypes: []
  - id: world-builder
    type: agent
    enabled: true
    visibility: restricted
    applicableArtifactTypes:
      - world-foundation
      - story-blueprint
      - world-change
      - chapter-outline
  - id: plot-planner
    type: agent
    enabled: true
    visibility: restricted
    applicableArtifactTypes:
      - chapter-outline
      - volume-outline
  - id: actor
    type: agent
    enabled: true
    visibility: restricted
    applicableArtifactTypes:
      - chapter-outline
      - chapter-manuscript
  - id: update-actor
    type: agent
    enabled: true
    visibility: restricted
    applicableArtifactTypes:
      - chapter-manuscript
  - id: drafter
    type: agent
    enabled: true
    visibility: restricted
    applicableArtifactTypes:
      - chapter-manuscript
  - id: reviewer
    type: agent
    enabled: true
    visibility: restricted
    applicableArtifactTypes:
      - chapter-manuscript
      - chapter-outline
      - volume-outline
      - world-change
---

# Capability Registry

This file is the canonical authority for capability enablement, visibility, and
allowed-agent scope (docs/architecture/modules/08-graph-search-and-capabilities.md §8.5).

Other sources (`mcp.json`, skill/agent definitions, prompt packs) only supply
*discovered* facts such as version, source location, and configuration hash — they never
auto-enable a capability that is not declared here.
