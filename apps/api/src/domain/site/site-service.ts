import {
  DEFAULT_SITE_SETTINGS,
  siteSettingsSchema,
  publicSiteSchema,
} from '@cms/sdk';
import {
  filterSettings,
  settingsUpdated,
} from '#api/domain/site/settings-hooks';
import type {
  AdminSiteDto,
  PublicImage,
  PublicSiteDto,
  SiteSettings,
} from '@cms/sdk';
import { invalidInput, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import type { HookDispatcher } from '#api/domain/ports';

/** Core settings, stored as JSON values. */
export interface SettingsRepository {
  /** JSON values whose keys start with prefix. */
  list(prefix: string): Promise<Record<string, unknown>>;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

/** Public projections of library images; ids that are missing or not images are left out. */
export type SiteImages = (
  ids: readonly string[],
) => Promise<Map<string, PublicImage>>;

const SITE_KEY = 'site';

const siteProjection = {
  redact: (settings: SiteSettings) => ({
    section: 'site' as const,
    settings,
  }),
  restore: (value: { settings: SiteSettings }) => value.settings,
  parse: (value: unknown) => siteSettingsSchema.safeParse(value),
};

export interface SiteSettingsWriter {
  /** Saves settings while reserving the public login path against content and archive routes. */
  save(site: SiteSettings): Promise<void>;
  /** Existing pre-feature content keeps its route; a reserved public fallback serves login. */
  publicLoginPath(path: string): Promise<string>;
}

export const readSiteSettings = (stored: unknown): SiteSettings => {
  const overrides = typeof stored === 'object' && stored !== null ? stored : {};
  const result = siteSettingsSchema.safeParse({
    ...DEFAULT_SITE_SETTINGS,
    ...overrides,
  });

  return result.success ? result.data : DEFAULT_SITE_SETTINGS;
};

export class SiteService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly hooks: HookDispatcher,
    private readonly images: SiteImages,
    private readonly writer: SiteSettingsWriter = {
      save: (site) => settings.set(SITE_KEY, site),
      publicLoginPath: async (path) => path,
    },
  ) {}

  async get(): Promise<SiteSettings> {
    return readSiteSettings(await this.settings.get(SITE_KEY));
  }

  /** Display settings with the icon and logo resolved; a deleted image counts as unset. */
  async getPublic(): Promise<PublicSiteDto> {
    const {
      title,
      description,
      locale,
      icon,
      logo,
      loginPath: configuredLoginPath,
      showLogin,
    } = await this.getAdmin();

    const result: PublicSiteDto = {
      title,
      description,
      locale,
      icon,
      logo,
      loginPath: await this.writer.publicLoginPath(configuredLoginPath),
      showLogin,
    };

    if (!this.hooks.has('site.public')) return result;

    const filtered = await this.hooks.applyFilter(
      'site.public',
      result,
      (value) => publicSiteSchema.safeParse(value).success,
    );

    return publicSiteSchema.parse(filtered);
  }

  /** Public settings for plugin renderers, without resolving media records. */
  async getPlugin(): Promise<SiteSettings> {
    const site = await this.get();

    return {
      ...site,
      loginPath: await this.writer.publicLoginPath(site.loginPath),
    };
  }

  async getAdmin(): Promise<AdminSiteDto> {
    const site = await this.get();
    const images = await this.chosen(site);

    return {
      ...site,
      icon: (site.iconId && images.get(site.iconId)) || null,
      logo: (site.logoId && images.get(site.logoId)) || null,
    };
  }

  async update(input: unknown): Promise<SiteSettings> {
    const site = await filterSettings(
      this.hooks,
      parseInput(siteSettingsSchema, input),
      siteProjection,
    );
    const images = await this.chosen(site);

    for (const key of ['iconId', 'logoId'] as const) {
      const id = site[key];

      if (id && !images.has(id))
        throw invalidInput(Errors.SiteImageInvalid, [
          { path: key, message: Errors.SiteImageInvalid },
        ]);
    }

    await this.writer.save(site);
    settingsUpdated(this.hooks, site, siteProjection);
    void this.hooks.emit('site.updated', site);

    return site;
  }

  private chosen({ iconId, logoId }: SiteSettings) {
    const ids = [iconId, logoId].filter((id): id is string => id !== null);

    return ids.length ? this.images(ids) : Promise.resolve(new Map());
  }
}
