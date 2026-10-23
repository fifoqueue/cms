import { PublishedContentReader } from '#api/domain/content/public-content';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { PluginContextFactory } from '#api/plugin-runtime/plugin-context-factory';
import { PluginHost } from '#api/plugin-runtime/plugin-host';
import { PluginSettings } from '#api/plugin-runtime/plugin-settings';
import { PluginRouteRegistry } from '#api/plugin-runtime/route-registry';
import { SlotRegistry } from '#api/plugin-runtime/slot-registry';
import { WidgetRegistry } from '#api/plugin-runtime/widget-registry';
import { EmbedRegistry } from '#api/plugin-runtime/embed-registry';
import { BlockRegistry } from '#api/plugin-runtime/block-registry';
import { AdminPageRegistry } from '#api/plugin-runtime/admin-page-registry';
import { DashboardWidgetRegistry } from '#api/plugin-runtime/dashboard-widget-registry';
import type { TaskScheduler } from '#api/plugin-runtime/ports';
import { semverPolicy } from '#api/infra/system';
import {
  MemoryBundles,
  MemoryContentRepository,
  MemoryPluginData,
  MemoryPluginState,
  recordingLogger,
} from '#test/support/memory';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';

export interface RuntimeStorage {
  data: MemoryPluginData;
  state: MemoryPluginState;
  bundles: MemoryBundles;
}

export const createStorage = (): RuntimeStorage => {
  const data = new MemoryPluginData();
  return {
    data,
    state: new MemoryPluginState(data),
    bundles: new MemoryBundles(),
  };
};

/** A fully wired plugin runtime on in-memory adapters. Pass `storage` again to simulate a restart. */
export const createRuntime = ({
  timeoutMs = 100,
  storage = createStorage(),
} = {}) => {
  const { logger, lines } = recordingLogger();
  const { data, state, bundles } = storage;
  const hooks = new HookBus({ timeoutMs, logger });
  const slots = new SlotRegistry({ timeoutMs, logger });
  const widgets = new WidgetRegistry({ timeoutMs, logger });
  const embeds = new EmbedRegistry({ timeoutMs, logger });
  const blocks = new BlockRegistry({ timeoutMs, logger });
  const pages = new AdminPageRegistry({ timeoutMs, logger });
  const dashboardWidgets = new DashboardWidgetRegistry({ timeoutMs, logger });
  /** Registered plugin tasks by name; tests run them directly. */
  const tasks = new Map<string, Parameters<TaskScheduler['add']>[0]>();
  const scheduler: TaskScheduler = {
    add: (task) => {
      tasks.set(task.name, task);
      return () => void tasks.delete(task.name);
    },
  };
  const routes = new PluginRouteRegistry();
  const settings = new PluginSettings(data);
  const contexts = new PluginContextFactory({
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
    content: new PublishedContentReader(
      new MemoryPublishedContentRepository(new MemoryContentRepository()),
    ),
    logger: () => logger,
  });
  /** Answers of plugin update addresses, by URL. */
  const feeds = new Map<string, unknown>();
  const host = new PluginHost({
    versions: semverPolicy('1.0.0'),
    updates: { read: async (url) => feeds.get(url) },
    state,
    packages: bundles,
    loader: bundles,
    contexts,
    settings,
    logger,
    timeoutMs,
  });
  return {
    host,
    hooks,
    slots,
    widgets,
    embeds,
    blocks,
    pages,
    dashboardWidgets,
    tasks,
    feeds,
    routes,
    data,
    state,
    bundles,
    storage,
    lines,
  };
};
