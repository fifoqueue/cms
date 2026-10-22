import { DEFAULT_SITE_SETTINGS, siteSettingsSchema } from '@cms/sdk';
import type { SiteSettings } from '@cms/sdk';
import { parseInput } from '#api/shared/validation';
import type { HookDispatcher } from '#api/domain/ports';

/** Core settings, stored as JSON values. */
export interface SettingsRepository {
  /** JSON values whose keys start with prefix. */
  list(prefix: string): Promise<Record<string, unknown>>;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

const SITE_KEY = 'site';

export class SiteService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly hooks: HookDispatcher,
  ) {}

  async get(): Promise<SiteSettings> {
    const stored = await this.settings.get(SITE_KEY);
    const overrides =
      typeof stored === 'object' && stored !== null ? stored : {};
    const result = siteSettingsSchema.safeParse({
      ...DEFAULT_SITE_SETTINGS,
      ...overrides,
    });
    return result.success ? result.data : DEFAULT_SITE_SETTINGS;
  }

  async update(input: unknown): Promise<SiteSettings> {
    const site = parseInput(siteSettingsSchema, input);
    await this.settings.set(SITE_KEY, site);
    void this.hooks.emit('site.updated', site);
    return site;
  }
}
