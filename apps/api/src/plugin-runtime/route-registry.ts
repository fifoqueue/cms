import type { PluginRoute, RouteRegistrar } from '@cms/sdk/plugin';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const NONE: readonly PluginRoute[] = [];

/**
 * The routes each plugin registered, in registration order. Paths are relative to
 * `/api/plugins/<plugin-id>`. Matching belongs to the HTTP layer; this class only holds declarations.
 */
export class PluginRouteRegistry {
  private readonly routes = new Map<string, readonly PluginRoute[]>();

  registrar(owner: string): RouteRegistrar {
    return {
      add: ({ method, path, access, handler }) => {
        if (!METHODS.has(method))
          throw new Error(`Unsupported method "${method}"`);
        if (access !== 'public' && access !== 'admin')
          throw new Error(`Unknown access "${access}"`);
        if (!path.startsWith('/'))
          throw new Error(`Route path "${path}" must start with "/"`);
        const route: PluginRoute = { method, path, access, handler };
        this.routes.set(owner, [...this.list(owner), route]);
        return () => {
          const rest = this.list(owner).filter((entry) => entry !== route);
          if (rest.length === 0) this.routes.delete(owner);
          else this.routes.set(owner, rest);
        };
      },
    };
  }

  /** The array is replaced on every change, so its identity can key a cache of compiled routes. */
  list(owner: string): readonly PluginRoute[] {
    return this.routes.get(owner) ?? NONE;
  }
}
