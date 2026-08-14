import type { RuntimeRouteDefinition } from './types';

export interface MatchedRoute {
  readonly route: RuntimeRouteDefinition;
  readonly params: Readonly<Record<string, string>>;
}

export function matchRoute(
  routes: readonly RuntimeRouteDefinition[],
  method: string,
  pathname: string,
): MatchedRoute | undefined {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }
    const params = matchPattern(route.pattern, pathname);
    if (params !== undefined) {
      return { route, params };
    }
  }
  return undefined;
}

function matchPattern(pattern: string, pathname: string): Readonly<Record<string, string>> | undefined {
  const patternSegments = toSegments(pattern);
  const pathSegments = toSegments(pathname);
  if (patternSegments.length !== pathSegments.length) {
    return undefined;
  }

  const params: Record<string, string> = {};
  for (const [index, patternSegment] of patternSegments.entries()) {
    const matched = matchSegment(patternSegment, pathSegments[index]);
    if (matched === undefined) {
      return undefined;
    }
    if (matched.kind === 'param') {
      params[matched.name] = matched.value;
    }
  }
  return params;
}

function matchSegment(
  patternSegment: string,
  pathSegment: string | undefined,
): { kind: 'static' } | { kind: 'param'; name: string; value: string } | undefined {
  if (pathSegment === undefined) {
    return undefined;
  }
  if (!patternSegment.startsWith(':')) {
    return patternSegment === pathSegment ? { kind: 'static' } : undefined;
  }
  return {
    kind: 'param',
    name: patternSegment.slice(1),
    value: decodeURIComponent(pathSegment),
  };
}

function toSegments(pathname: string): readonly string[] {
  return pathname.split('/').filter((segment) => segment.length > 0);
}
