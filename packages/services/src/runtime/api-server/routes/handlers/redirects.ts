import { redirectResponse } from '../../transport/http';

import type { RouteHandlerDeps } from './context';

export interface RedirectHandlers {
  readonly handleRoot: () => Response;
  readonly handleApp: (request: Request) => Response;
}

export function createRedirectHandlers(deps: RouteHandlerDeps): RedirectHandlers {
  const { logger } = deps;

  function handleRoot(): Response {
    return redirectResponse(process.env['WEB_APP_URL'] ?? 'http://localhost:3001/app');
  }

  function handleApp(request: Request): Response {
    const targetUrl = new URL(process.env['WEB_APP_URL'] ?? 'http://localhost:3001/app');
    new URL(request.url).searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));
    logger.debug({ targetUrl: targetUrl.toString() }, 'Redirecting to web app');
    return redirectResponse(targetUrl.toString());
  }

  return { handleRoot, handleApp };
}
