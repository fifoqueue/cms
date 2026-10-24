import {
  SEO_SETTINGS_DEFAULTS,
  publicSeoSettingsFields,
  publicSeoSettingsSchema,
  seoSettingsSchema,
} from '@cms/sdk';
import type { AdminSeoSettings, PublicSeoSettings } from '@cms/sdk';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { parseInput } from '#api/shared/validation';

const SEO_KEY = 'seo';

/** Only display/crawler policy belongs here; never credentials or account data. */
const toPublicSettings = (settings: AdminSeoSettings): PublicSeoSettings =>
  publicSeoSettingsSchema.parse(publicSeoSettingsFields(settings));

export class SeoSettingsService {
  constructor(private readonly settings: SettingsRepository) {}

  async getPublic(): Promise<PublicSeoSettings> {
    return toPublicSettings(await this.getAdmin());
  }

  async getAdmin(): Promise<AdminSeoSettings> {
    const stored = await this.settings.get(SEO_KEY);
    const overrides =
      typeof stored === 'object' && stored !== null ? stored : {};
    const result = seoSettingsSchema.safeParse({
      ...SEO_SETTINGS_DEFAULTS,
      ...overrides,
    });
    return seoSettingsSchema.parse(
      toPublicSettings(result.success ? result.data : SEO_SETTINGS_DEFAULTS),
    );
  }

  async update(input: unknown): Promise<AdminSeoSettings> {
    const settings = parseInput(seoSettingsSchema, input);
    const dto = seoSettingsSchema.parse(toPublicSettings(settings));
    await this.settings.set(SEO_KEY, dto);
    return dto;
  }
}
