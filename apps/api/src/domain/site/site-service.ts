import { DEFAULT_SITE_SETTINGS, siteSettingsSchema } from '@cms/sdk';
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
    return {
      title,
      description,
      locale,
      icon,
      logo,
      loginPath: await this.writer.publicLoginPath(configuredLoginPath),
      showLogin,
    };
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
    const site = parseInput(siteSettingsSchema, input);
    const images = await this.chosen(site);
    for (const key of ['iconId', 'logoId'] as const) {
      const id = site[key];
      if (id && !images.has(id))
        throw invalidInput(Errors.SiteImageInvalid, [
          { path: key, message: Errors.SiteImageInvalid },
        ]);
    }
    await this.writer.save(site);
    void this.hooks.emit('site.updated', site);
    return site;
  }

  private chosen({ iconId, logoId }: SiteSettings) {
    const ids = [iconId, logoId].filter((id): id is string => id !== null);
    return ids.length ? this.images(ids) : Promise.resolve(new Map());
  }
}
