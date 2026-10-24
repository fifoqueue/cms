import { can } from '@cms/sdk';
import type { PluginRoute } from '@cms/sdk/plugin';
import { Elysia } from 'elysia';
import type { AnyElysia } from 'elysia';
import type { PluginRouteRegistry } from '#api/plugin-runtime/route-registry';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';
import { apiErrors } from '#api/http/app';
import type { Authenticator } from '#api/http/request';
import { currentUser } from '#api/http/request';
import { errorResponse } from '#api/http/respond';
import { Errors } from '#api/shared/errors';

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
      return errorResponse(404, 'not_found', Errors.RouteNotFound);

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
    if (!this.deps.routes.list(pluginId).includes(route))
      return errorResponse(404, 'not_found', Errors.RouteNotFound);

    if (route.access === 'admin' && !user)
      return errorResponse(401, 'unauthorized', Errors.AuthenticationRequired);

    if (route.access === 'admin' && user && !can(user, 'plugins.manage'))
      return errorResponse(403, 'forbidden', Errors.Forbidden);

    const result = await isolate(() => {
      if (!this.deps.routes.list(pluginId).includes(route))
        throw new Error(Errors.PluginInactive);
      return route.handler({
        request,
        url: new URL(request.url),
        params,
        user,
      });
    }, timeoutMs);

    // Preserve dispatched outcomes: a mutation may have committed before disposal.
    if (result.ok && result.value instanceof Response) {
      if (route.access === 'admin' || user) {
        const response = new Response(result.value.body, result.value);
        response.headers.set('cache-control', 'private, no-store');
        return response;
      }
      return result.value;
    }

    logger.warn(
      `Plugin "${pluginId}" route failed: ${result.ok ? 'handler did not return a Response' : result.error.message}`,
    );

    return errorResponse(502, 'plugin_error', Errors.PluginRouteFailed);
  }
}
