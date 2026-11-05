import type { createRepositories } from '#api/composition/repositories';
import type { createRegistries } from '#api/composition/registries';
import type { createContent } from '#api/composition/content';
import { SiteService } from '#api/domain/site/site-service';
import { ReadingService } from '#api/domain/site/reading-service';
import { WritingService } from '#api/domain/site/writing-service';
import { DashboardPreferencesService } from '#api/domain/dashboard/dashboard-preferences';
import { MenuService } from '#api/domain/appearance/menu-service';
import { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import { SeoDiscoveryService } from '#api/domain/seo/seo-discovery-service';
import { ThemeService } from '#api/domain/theme/theme-service';
import { ThemePreviews } from '#api/domain/theme/theme-previews';
import { createSitemapProviders } from '#api/plugin-runtime/discovery-providers';
import { zipThemeArchive } from '#api/infra/zip-theme-archive';
import { sharpImages } from '#api/infra/sharp-images';
import { systemClock, randomTokenIssuer } from '#api/infra/system';
import type { Logger } from '#api/shared/logger';

type Input = Pick<
  Awaited<ReturnType<typeof createRepositories>>,
  | 'settingsRepository'
  | 'patternTransactions'
  | 'mediaRepository'
  | 'siteWriter'
  | 'taxonomyRepository'
  | 'discoveryRepository'
> &
  Pick<
    ReturnType<typeof createRegistries>,
    'hooks' | 'menuItemTypes' | 'themeContributions'
  > &
  Pick<
    ReturnType<typeof createContent>,
    'publishedRepository' | 'taxonomyTypes' | 'contentTypes'
  > & {
    archivePaths: ConstructorParameters<typeof MenuService>[0]['archives'];
    signer: ConstructorParameters<typeof ThemePreviews>[0]['signer'];
    reconcileFunctions: ConstructorParameters<typeof ThemeService>[5];
    timeoutMs: number;
    logger: Logger;
  };

export const createSite = ({
  settingsRepository,
  patternTransactions,
  mediaRepository,
  siteWriter,
  taxonomyRepository,
  discoveryRepository,
  hooks,
  menuItemTypes,
  themeContributions,
  publishedRepository,
  taxonomyTypes,
  contentTypes,
  archivePaths,
  signer,
  reconcileFunctions,
  timeoutMs,
  logger,
}: Input) => {
  const site = new SiteService(
    settingsRepository,
    hooks,
    (ids) => mediaRepository.publicImages(ids),
    siteWriter,
  );
  const reading = new ReadingService(
    settingsRepository,
    publishedRepository,
    hooks,
  );
  const writing = new WritingService(settingsRepository, hooks);
  const dashboardPreferences = new DashboardPreferencesService(
    settingsRepository,
  );
  const menus = new MenuService({
    taxonomyTypes,
    itemTypes: menuItemTypes,
    hooks,
    archives: archivePaths,
    settings: settingsRepository,
    published: publishedRepository,
    terms: taxonomyRepository,
  });
  const seo = new SeoSettingsService(settingsRepository, hooks, {
    transactions: patternTransactions,
    generate: () =>
      randomTokenIssuer.digest(randomTokenIssuer.issue()).slice(0, 32),
  });
  const sitemaps = createSitemapProviders(
    discoveryRepository,
    {
      timeoutMs,
      logger,
    },
    async () => (await contentTypes.list()).filter((type) => type.archive),
  );
  const seoDiscovery = new SeoDiscoveryService(
    discoveryRepository,
    seo,
    sitemaps,
  );
  const themes = new ThemeService(
    settingsRepository,
    zipThemeArchive,
    sharpImages,
    hooks,
    themeContributions,
    reconcileFunctions,
  );
  const themePreviews = new ThemePreviews({
    themes,
    signer,
    clock: systemClock,
  });

  return {
    site,
    reading,
    writing,
    dashboardPreferences,
    menus,
    seo,
    sitemaps,
    seoDiscovery,
    themes,
    themePreviews,
  };
};
