import type { BootstrapEvidence } from '../types';

export interface ResearchSource {
  readonly url: string;
  readonly title: string;
  readonly summary: string;
}

export interface ResearchSourcePolicy {
  readonly license: BootstrapEvidence['license'];
  readonly copyrightBoundary: BootstrapEvidence['copyrightBoundary'];
}

/**
 * Server-side restricted research boundary
 * (docs/architecture/modules/11-bootstrap-and-onboarding.md §11.3). Web clients must
 * never call a browser MCP directly; only this port, invoked by the service, may run
 * research and every returned source must carry a copyright/license policy.
 */
export interface MarketResearchPort {
  /** Performs a restricted market-research search and returns evidence-bearing sources. */
  readonly research: (topic: string) => Promise<readonly ResearchSource[]>;
  /** Applies the source/copyright policy to a source before it becomes evidence. */
  readonly evaluatePolicy: (source: ResearchSource) => ResearchSourcePolicy;
}

const PERMISSIVE_HOSTS: ReadonlySet<string> = new Set(['archive.org', 'wikipedia.org', 'creativecommons.org']);
const BLOCKED_HOSTS: ReadonlySet<string> = new Set(['example.com']);

/**
 * Deterministic source policy: permissive hosts are `allowed`, blocked hosts are
 * `blocked`, and everything else requires a human review before it can inform
 * canonical content.
 */
export function evaluateSourcePolicy(source: ResearchSource): ResearchSourcePolicy {
  let host = '';
  try {
    host = new URL(source.url).hostname;
  } catch {
    host = '';
  }
  if (BLOCKED_HOSTS.has(host)) {
    return { license: 'unknown', copyrightBoundary: 'blocked' };
  }
  if (PERMISSIVE_HOSTS.has(host)) {
    return { license: 'cc-by', copyrightBoundary: 'allowed' };
  }
  return { license: 'unknown', copyrightBoundary: 'review-required' };
}

export const defaultMarketResearchPort: MarketResearchPort = {
  research: async () => [],
  evaluatePolicy: evaluateSourcePolicy,
};
