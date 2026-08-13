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
---

# Capability Registry

This file is the canonical authority for capability enablement, visibility, and
allowed-agent scope (docs/architecture/modules/08-graph-search-and-capabilities.md §8.5).

Other sources (`mcp.json`, skill/agent definitions, prompt packs) only supply
*discovered* facts such as version, source location, and configuration hash — they never
auto-enable a capability that is not declared here.
