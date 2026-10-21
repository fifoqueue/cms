import { PublishedContentReader } from '../../src/domain/content/public-content';
import { HookBus } from '../../src/plugin-runtime/hook-bus';
import { PluginContextFactory } from '../../src/plugin-runtime/plugin-context-factory';
import { PluginHost } from '../../src/plugin-runtime/plugin-host';
import { PluginSettings } from '../../src/plugin-runtime/plugin-settings';
import { PluginRouteRegistry } from '../../src/plugin-runtime/route-registry';
import { SlotRegistry } from '../../src/plugin-runtime/slot-registry';
import {
  MemoryBundles,
  MemoryContentRepository,
  MemoryPluginData,
  MemoryPluginState,
  recordingLogger,
} from './memory';

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
  const routes = new PluginRouteRegistry();
  const settings = new PluginSettings(data);
  const contexts = new PluginContextFactory({
    hooks,
    slots,
    routes,
    data,
    settings,
    content: new PublishedContentReader(new MemoryContentRepository()),
    logger: () => logger,
  });
  const host = new PluginHost({
    state,
    packages: bundles,
    loader: bundles,
    contexts,
    settings,
    logger,
    timeoutMs,
  });
  return { host, hooks, slots, routes, data, state, bundles, storage, lines };
};
