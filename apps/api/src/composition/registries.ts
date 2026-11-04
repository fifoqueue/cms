import { taxonomyDefinitionSchema, fieldDefinitionSchema } from '@cms/sdk';
import { patternContributionSchema } from '@cms/sdk/plugin';
import type { PatternContributions } from '@cms/sdk/plugin';
import { createCaptcha } from '#api/composition/security';
import { createImages } from '#api/composition/media';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { HealthChecks } from '#api/domain/tools/health-checks';
import { SlotRegistry } from '#api/plugin-runtime/slot-registry';
import { WidgetRegistry } from '#api/plugin-runtime/widget-registry';
import { AdminPageRegistry } from '#api/plugin-runtime/admin-page-registry';
import { DashboardWidgetRegistry } from '#api/plugin-runtime/dashboard-widget-registry';
import { PluginRouteRegistry } from '#api/plugin-runtime/route-registry';
import { EmbedRegistry } from '#api/plugin-runtime/embed-registry';
import { BlockRegistry } from '#api/plugin-runtime/block-registry';
import { ProviderRegistry } from '#api/plugin-runtime/provider-registry';
import { PermalinkTokenRegistry } from '#api/domain/permalinks/token-registry';
import { DefinitionRegistry } from '#api/domain/content/definition-registry';
import { BUILTIN_TAXONOMIES } from '#api/domain/taxonomy/taxonomy-types';
import { BUILTIN_TYPES } from '#api/domain/content/content-types';
import { ContentTypeRegistry } from '#api/domain/content/content-type-registry';
import { MenuTypeRegistry } from '#api/plugin-runtime/menu-type-registry';
import { coreMenuTypes } from '#api/domain/appearance/menu-types';
import { createThemeContributions } from '#api/plugin-runtime/discovery-providers';
import { EraserRegistry } from '#api/domain/privacy/eraser-registry';
import { ExporterRegistry } from '#api/domain/privacy/exporter-registry';
import { ShortcodeRegistry } from '#api/domain/tools/shortcode-registry';
import { RuntimeShortcodes } from '#api/domain/content/shortcodes';
import { CommentCheckers } from '#api/domain/comments/comment-checkers';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { RoleRegistry } from '#api/domain/users/role-registry';
import { ProfileFields } from '#api/domain/users/profile-fields';
import { CapabilityRegistry } from '#api/domain/users/capability-registry';
import { StorageDrivers } from '#api/domain/media/storage-drivers';
import type { Logger } from '#api/shared/logger';

export const createRegistries = ({
  timeoutMs,
  logger,
  publicCache,
}: {
  timeoutMs: number;
  logger: Logger;
  publicCache: ConstructorParameters<typeof HookBus>[0]['publicCache'];
}) => {
  const hooks = new HookBus({ timeoutMs, logger, publicCache });
  const healthChecks = new HealthChecks(timeoutMs);
  const slotRegistry = new SlotRegistry({ timeoutMs, logger });
  const widgetRegistry = new WidgetRegistry({ timeoutMs, logger });
  const pluginPages = new AdminPageRegistry({ timeoutMs, logger });
  const dashboardWidgets = new DashboardWidgetRegistry({
    timeoutMs,
    logger,
    hooks,
  });
  const pluginRoutes = new PluginRouteRegistry();
  const embedRegistry = new EmbedRegistry({ timeoutMs, logger });
  const permalinkTokens = new PermalinkTokenRegistry(timeoutMs);
  const blockRegistry = new BlockRegistry({ timeoutMs, logger, hooks });
  const patternContributions = new ProviderRegistry<null, PatternContributions>(
    patternContributionSchema,
    { timeoutMs, logger },
  );
  const taxonomyRegistry = new DefinitionRegistry(
    taxonomyDefinitionSchema,
    BUILTIN_TAXONOMIES,
  );
  const fieldRegistry = new DefinitionRegistry(fieldDefinitionSchema);
  const contentTypeRegistry = new ContentTypeRegistry(BUILTIN_TYPES);
  const { captchaProviders } = createCaptcha(timeoutMs, logger);
  const privacyErasers = new EraserRegistry({ timeoutMs, logger });
  const privacyExporters = new ExporterRegistry(timeoutMs);
  const importShortcodes = new ShortcodeRegistry(timeoutMs);
  const shortcodes = new RuntimeShortcodes(timeoutMs);
  const menuItemTypes = new MenuTypeRegistry({ timeoutMs, logger });

  for (const [key, provider] of Object.entries(coreMenuTypes))
    menuItemTypes.registerCore(key, provider);
  const themeContributions = createThemeContributions({ timeoutMs, logger });
  const roleDefaults = new RoleRegistry();
  const profileFields = new ProfileFields();
  const capabilities = new CapabilityRegistry();
  const { mediaProcessors, imageSizes } = createImages(timeoutMs, logger);
  const storageDrivers = new StorageDrivers(logger, timeoutMs);
  const commentCheckers = new CommentCheckers(timeoutMs);
  const authentication = new SignInRegistry({ timeoutMs, logger });

  return {
    hooks,
    roleExists: (key: string) => roleDefaults.has(key),
    healthChecks,
    slotRegistry,
    widgetRegistry,
    pluginPages,
    dashboardWidgets,
    pluginRoutes,
    embedRegistry,
    permalinkTokens,
    blockRegistry,
    patternContributions,
    taxonomyRegistry,
    fieldRegistry,
    contentTypeRegistry,
    captchaProviders,
    privacyErasers,
    privacyExporters,
    importShortcodes,
    shortcodes,
    menuItemTypes,
    themeContributions,
    roleDefaults,
    profileFields,
    capabilities,
    mediaProcessors,
    imageSizes,
    storageDrivers,
    commentCheckers,
    authentication,
  };
};
