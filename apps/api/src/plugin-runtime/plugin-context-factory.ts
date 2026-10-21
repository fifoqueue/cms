import type { ResolvedManifest } from '@cms/sdk';
import type {
  ActionHandler,
  ActionName,
  ContentReader,
  FilterHandler,
  FilterName,
  PluginContext,
  PluginLogger,
} from '@cms/sdk/plugin';
import type { HookBus } from './hook-bus';
import type { PluginScope } from './plugin-scope';
import type { PluginSettings } from './plugin-settings';
import type { PluginDataRepository } from './ports';
import type { PluginRouteRegistry } from './route-registry';
import type { SlotRegistry } from './slot-registry';

export interface PluginContextServices {
  hooks: HookBus;
  slots: SlotRegistry;
  routes: PluginRouteRegistry;
  data: PluginDataRepository;
  settings: PluginSettings;
  content: ContentReader;
  logger: (pluginId: string) => PluginLogger;
}

const STORAGE_KEY = /^[\w.:-]{1,191}$/;

const checkKey = (key: string) => {
  if (!STORAGE_KEY.test(key)) throw new Error(`Invalid storage key "${key}"`);
  return key;
};

/** Builds the capabilities handed to `activate`. Every registration is tracked by the scope. */
export class PluginContextFactory {
  constructor(private readonly services: PluginContextServices) {}

  create(manifest: ResolvedManifest, scope: PluginScope): PluginContext {
    const { hooks, slots, routes, data, settings, content, logger } =
      this.services;
    const id = manifest.id;
    const hookRegistrar = hooks.registrar(id);
    const slotRegistrar = slots.registrar(id);
    const routeRegistrar = routes.registrar(id);

    return Object.freeze({
      pluginId: id,
      hooks: {
        on: <K extends ActionName>(name: K, handler: ActionHandler<K>) =>
          scope.track(hookRegistrar.on(name, handler)),
        filter: <K extends FilterName>(
          name: K,
          handler: FilterHandler<K>,
          priority?: number,
        ) => scope.track(hookRegistrar.filter(name, handler, priority)),
      },
      slots: {
        provide: (slot, renderer) =>
          scope.track(slotRegistrar.provide(slot, renderer)),
      },
      routes: { add: (route) => scope.track(routeRegistrar.add(route)) },
      settings: {
        get: (key) => settings.value(manifest, key),
        all: () => settings.values(manifest),
      },
      storage: {
        get: async <T>(key: string) =>
          (await data.get(id, 'kv', checkKey(key))) as T | undefined,
        set: (key, value) => data.set(id, 'kv', checkKey(key), value),
        delete: (key) => data.delete(id, 'kv', checkKey(key)),
        keys: async () => Object.keys(await data.entries(id, 'kv')),
      },
      content,
      logger: logger(id),
    } satisfies PluginContext);
  }
}
