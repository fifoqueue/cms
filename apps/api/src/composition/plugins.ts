import type { createRegistries } from '#api/composition/registries';
import type { createRepositories } from '#api/composition/repositories';
import { PluginSettings } from '#api/plugin-runtime/plugin-settings';
import { PluginContextFactory } from '#api/plugin-runtime/plugin-context-factory';
import { PluginHost } from '#api/plugin-runtime/plugin-host';
import { PluginJobs } from '#api/domain/jobs/plugin-jobs';
import { FsPluginPackageStore } from '#api/infra/plugins/fs-package-store';
import { dynamicImportLoader } from '#api/infra/plugins/module-loader';
import {
  httpsUpdateFeed,
  semverPolicy,
  systemClock,
  tiptapRenderer,
} from '#api/infra/system';
import { consoleLogger } from '#api/shared/logger';
import type { Logger } from '#api/shared/logger';

type Context = ConstructorParameters<typeof PluginContextFactory>[0];
type Input = Omit<ReturnType<typeof createRegistries>, 'roleExists'> &
  Pick<
    Awaited<ReturnType<typeof createRepositories>>,
    'pluginData' | 'pluginState'
  > & {
    mailTransports: Context['mailTransports'];
    jobs: ConstructorParameters<typeof PluginJobs>[0];
    sealedJobs: ConstructorParameters<typeof PluginJobs>[1];
    sitemaps: Context['sitemaps'];
    searchEngines: Context['searchEngines'];
    authUsers: Context['users'];
    scheduler: Context['scheduler'];
    reader: Context['content'];
    publicCache: ConstructorParameters<typeof PluginHost>[0]['publicCache'];
    directory: string;
    version: string;
    logger: Logger;
    timeoutMs: number;
  };

export const createPlugins = ({
  translations,
  roleDefaults,
  profileFields,
  captchaProviders,
  privacyErasers,
  privacyExporters,
  importShortcodes,
  shortcodes,
  contentTypeRegistry,
  permalinkTokens,
  taxonomyRegistry,
  fieldRegistry,
  capabilities,
  menuItemTypes,
  themeContributions,
  patternContributions,
  storageDrivers,
  healthChecks,
  mediaProcessors,
  imageSizes,
  commentCheckers,
  authentication,
  hooks,
  slotRegistry,
  widgetRegistry,
  embedRegistry,
  blockRegistry,
  pluginPages,
  dashboardWidgets,
  pluginRoutes,
  pluginData,
  pluginState,
  mailTransports,
  jobs,
  sealedJobs,
  sitemaps,
  searchEngines,
  authUsers,
  scheduler,
  reader,
  publicCache,
  directory,
  version,
  logger,
  timeoutMs,
}: Input) => {
  const pluginSettings = new PluginSettings(pluginData, hooks);
  const contexts = new PluginContextFactory({
    translations,
    roles: roleDefaults,
    profileFields,
    captchaProviders,
    privacyErasers,
    privacyExporters,
    importShortcodes,
    shortcodes,
    contentTypes: contentTypeRegistry,
    permalinkTokens,
    taxonomies: taxonomyRegistry,
    fields: fieldRegistry,
    capabilities,
    menuItemTypes,
    themeContributions,
    patterns: patternContributions,
    patternRenderer: tiptapRenderer,
    mailTransports,
    storageDrivers,
    jobs: new PluginJobs(jobs, sealedJobs, systemClock),
    healthChecks,
    sitemaps,
    searchEngines,
    mediaProcessors,
    imageSizes,
    commentCheckers,
    authentication,
    users: authUsers,
    hooks,
    slots: slotRegistry,
    widgets: widgetRegistry,
    embeds: embedRegistry,
    blocks: blockRegistry,
    scheduler,
    pages: pluginPages,
    dashboardWidgets,
    routes: pluginRoutes,
    data: pluginData,
    settings: pluginSettings,
    content: reader,
    logger: (pluginId) => consoleLogger(`plugin:${pluginId}`),
  });
  const plugins = new PluginHost({
    publicCache,
    hooks,
    state: pluginState,
    packages: new FsPluginPackageStore(directory),
    loader: dynamicImportLoader,
    contexts,
    settings: pluginSettings,
    versions: semverPolicy(version),
    updates: httpsUpdateFeed,
    logger,
    timeoutMs,
  });

  return { contexts, plugins, list: () => plugins.list() };
};
