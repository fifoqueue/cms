import { pathToFileURL } from 'node:url';
import type { PluginModuleLoader } from '../../plugin-runtime/ports';

export const dynamicImportLoader: PluginModuleLoader = {
  async load(path) {
    const module = (await import(pathToFileURL(path).href)) as Record<
      string,
      unknown
    >;
    return module.plugin;
  },
};
