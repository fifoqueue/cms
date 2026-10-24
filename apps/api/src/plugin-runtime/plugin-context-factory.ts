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
import type { HookBus } from '#api/plugin-runtime/hook-bus';
import type { PluginScope } from '#api/plugin-runtime/plugin-scope';
import type { PluginSettings } from '#api/plugin-runtime/plugin-settings';
import type { EmbedRegistry } from '#api/plugin-runtime/embed-registry';
import type { BlockRegistry } from '#api/plugin-runtime/block-registry';
import type { AdminPageRegistry } from '#api/plugin-runtime/admin-page-registry';
import type { DashboardWidgetRegistry } from '#api/plugin-runtime/dashboard-widget-registry';
import type {
  PluginDataRepository,
  TaskScheduler,
} from '#api/plugin-runtime/ports';
import { isolate } from '#api/shared/isolate';
import type { PluginRouteRegistry } from '#api/plugin-runtime/route-registry';
import type { SlotRegistry } from '#api/plugin-runtime/slot-registry';
import type { WidgetRegistry } from '#api/plugin-runtime/widget-registry';
import { Errors } from '#api/shared/errors';

export interface PluginContextServices {
  hooks: HookBus;
  slots: SlotRegistry;
  widgets: WidgetRegistry;
  embeds: EmbedRegistry;
  blocks: BlockRegistry;
  scheduler: TaskScheduler;
  pages: AdminPageRegistry;
  dashboardWidgets: DashboardWidgetRegistry;
  routes: PluginRouteRegistry;
  data: PluginDataRepository;
  settings: PluginSettings;
  content: ContentReader;
  logger: (pluginId: string) => PluginLogger;
}

const STORAGE_KEY = /^[\w.:-]{1,191}$/;
const TASK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Plugin tasks run at most this often. */
const MIN_TASK_INTERVAL_MS = 60_000;
/** A plugin task is abandoned (and logged) after this long. */
const TASK_TIMEOUT_MS = 60_000;

const checkKey = (key: string) => {
  if (!STORAGE_KEY.test(key))
    throw new Error(Errors.PluginStorageKeyInvalid(key));
  return key;
};

/** Builds the capabilities handed to `activate`. Every registration is tracked by the scope. */
export class PluginContextFactory {
  constructor(private readonly services: PluginContextServices) {}

  create(manifest: ResolvedManifest, scope: PluginScope): PluginContext {
    const {
      hooks,
      slots,
      widgets,
      embeds,
      blocks,
      scheduler,
      pages,
      dashboardWidgets,
      routes,
      data,
      settings,
      content,
      logger,
    } = this.services;
    const id = manifest.id;
    const hookRegistrar = hooks.registrar(id);
    const slotRegistrar = slots.registrar(id);
    const widgetRegistrar = widgets.registrar(id);
    const embedRegistrar = embeds.registrar(id);
    const blockRegistrar = blocks.registrar(id);
    const pageRegistrar = pages.registrar(id);
    const widgetBoxes = dashboardWidgets.registrar(id);
    const log = logger(id);
    const routeRegistrar = routes.registrar(id);

    return Object.freeze({
      pluginId: id,
      hooks: {
        on: <K extends ActionName>(name: K, handler: ActionHandler<K>) =>
          scope.track(() => hookRegistrar.on(name, handler)),
        filter: <K extends FilterName>(
          name: K,
          handler: FilterHandler<K>,
          priority?: number,
        ) => scope.track(() => hookRegistrar.filter(name, handler, priority)),
      },
      slots: {
        provide: (slot, renderer) =>
          scope.track(() => slotRegistrar.provide(slot, renderer)),
      },
      widgets: {
        provide: (key, widget) =>
          scope.track(() => widgetRegistrar.provide(key, widget)),
      },
      embeds: {
        register: (provider) =>
          scope.track(() => embedRegistrar.register(provider)),
      },
      blocks: {
        register: (key, block) =>
          scope.track(() => blockRegistrar.register(key, block)),
      },
      tasks: {
        every: (name, intervalMs, task) => {
          if (!TASK_NAME.test(name) || name.length > 64)
            throw new Error(Errors.PluginTaskNameInvalid(name));
          return scope.track(() =>
            scheduler.add({
              name: `plugin:${id}:${name}`,
              intervalMs: Math.max(MIN_TASK_INTERVAL_MS, intervalMs),
              run: async () => {
                const result = await isolate(
                  () => scope.run(task),
                  TASK_TIMEOUT_MS,
                );
                if (!result.ok)
                  log.warn(`task "${name}" failed: ${result.error.message}`);
              },
            }),
          );
        },
      },
      admin: {
        page: (key, page) => scope.track(() => pageRegistrar.page(key, page)),
        dashboardWidget: (key, widget) =>
          scope.track(() => widgetBoxes.dashboardWidget(key, widget)),
      },
      routes: { add: (route) => scope.track(() => routeRegistrar.add(route)) },
      settings: {
        get: (key) => scope.run(() => settings.value(manifest, key)),
        all: () => scope.run(() => settings.values(manifest)),
      },
      storage: {
        get: async <T>(key: string) =>
          (await scope.run(() => data.get(id, 'kv', checkKey(key)))) as
            T | undefined,
        set: (key, value) =>
          scope.run(() => data.set(id, 'kv', checkKey(key), value)),
        delete: (key) => scope.run(() => data.delete(id, 'kv', checkKey(key))),
        keys: () =>
          scope.run(async () => Object.keys(await data.entries(id, 'kv'))),
      },
      // Do not expose the concrete reader: it also implements private reads and unlock callbacks.
      content: Object.freeze<ContentReader>({
        list: (query) => scope.run(() => content.list(query)),
        getBySlug: (slug) => scope.run(() => content.getBySlug(slug)),
      }),
      logger: log,
    } satisfies PluginContext);
  }
}
