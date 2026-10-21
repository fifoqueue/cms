import type { PluginRoute } from '@cms/sdk/plugin';
import { Elysia } from 'elysia';
import type { AnyElysia } from 'elysia';
import type { PluginRouteRegistry } from '../plugin-runtime/route-registry';
import { isolate } from '../shared/isolate';
import type { Logger } from '../shared/logger';
import { apiErrors } from './app';
import type { Authenticator } from './request';
import { currentUser } from './request';
import { errorResponse } from './respond';

export interface PluginGatewayDeps {
  auth: Authenticator;
  routes: PluginRouteRegistry;
  timeoutMs: number;
  logger: Logger;
}

const BASE = '/api/plugins';

/**
 * Serves `/api/plugins/<id>/...` from the routes a plugin registered. Inactive plugins have none.
 *
 * Elysia cannot unregister a route, so each plugin's routes are compiled into their own Elysia
 * instance, rebuilt whenever the registry's list for that plugin changes.
 */
export class PluginGateway {
  private readonly compiled = new WeakMap<readonly PluginRoute[], AnyElysia>();

  constructor(private readonly deps: PluginGatewayDeps) {}

  handle(pluginId: string, request: Request): Promise<Response> | Response {
    const declared = this.deps.routes.list(pluginId);

    if (declared.length === 0)
      return errorResponse(404, 'not_found', 'Route not found');

    return this.compile(pluginId, declared).handle(request);
  }

  private compile(pluginId: string, declared: readonly PluginRoute[]) {
    const cached = this.compiled.get(declared);

    if (cached) return cached;

    const app = new Elysia({ prefix: `${BASE}/${pluginId}` }).use(
      apiErrors(this.deps.logger),
    );
    const seen = new Set<string>();

    for (const route of declared) {
      const key = `${route.method} ${route.path}`;

      if (seen.has(key)) continue; // The first registration wins.

      seen.add(key);
      app.route(
        route.method,
        route.path,
        ({ request, params }) =>
          this.run(pluginId, route, request, { ...params }),
        { parse: 'none' },
      );
    }

    this.compiled.set(declared, app);

    return app;
  }

  private async run(
    pluginId: string,
    route: PluginRoute,
    request: Request,
    params: Record<string, string>,
  ) {
    const { auth, timeoutMs, logger } = this.deps;
    const user = await currentUser(auth, request);

    if (route.access === 'admin' && !user)
      return errorResponse(401, 'unauthorized', 'Authentication required');

    const result = await isolate(
      () => route.handler({ request, url: new URL(request.url), params, user }),
      timeoutMs,
    );

    if (result.ok && result.value instanceof Response) return result.value;

    logger.warn(
      `Plugin "${pluginId}" route failed: ${result.ok ? 'handler did not return a Response' : result.error.message}`,
    );

    return errorResponse(
      502,
      'plugin_error',
      'The plugin failed to handle this request',
    );
  }
}
