import {
  SEO_SETTINGS_DEFAULTS,
  publicSeoSettingsFields,
  publicSeoSettingsSchema,
  seoSettingsSchema,
} from '@cms/sdk';
import type { AdminSeoSettings, PublicSeoSettings } from '@cms/sdk';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { parseInput } from '#api/shared/validation';
import type { HookDispatcher } from '#api/domain/ports';
import {
  filterSettings,
  settingsUpdated,
} from '#api/domain/site/settings-hooks';
import {
  discoveryFilterInputSchema,
  discoveryFilterSchemas,
} from '@cms/sdk/plugin';

const SEO_KEY = 'seo';

const projection = {
  redact: (settings: AdminSeoSettings) => ({
    section: SEO_KEY as typeof SEO_KEY,
    settings,
  }),
  restore: (value: { settings: AdminSeoSettings }) => value.settings,
  parse: (value: unknown) => seoSettingsSchema.safeParse(value),
};

/** Only display/crawler policy belongs here; never credentials or account data. */
const toPublicSettings = (settings: AdminSeoSettings): PublicSeoSettings =>
  publicSeoSettingsSchema.parse(publicSeoSettingsFields(settings));

export class SeoSettingsService {
  /** Structured frontend output, filtered before the frontend escapes/serializes it. */
  async filterOutput(input: unknown) {
    const { kind, value } = parseInput(discoveryFilterInputSchema, input);
    const schema = discoveryFilterSchemas[kind];
    const initial = parseInput(schema, value);
    const filtered = await this.hooks?.applyFilter(
      kind,
      initial,
      (result) => schema.safeParse(result).success,
    );

    return schema.parse(filtered ?? initial);
  }

  constructor(
    private readonly settings: SettingsRepository,
    private readonly hooks?: HookDispatcher,
  ) {}

  async getPublic(): Promise<PublicSeoSettings> {
    return this.present(await this.getCore());
  }

  async getCore(): Promise<PublicSeoSettings> {
    return toPublicSettings(await this.getAdmin());
  }

  async present(dto: PublicSeoSettings): Promise<PublicSeoSettings> {
    const filtered = this.hooks?.has('seo.public')
      ? await this.hooks.applyFilter(
          'seo.public',
          dto,
          (value) => publicSeoSettingsSchema.safeParse(value).success,
        )
      : dto;

    if (!this.hooks?.has('settings.public'))
      return publicSeoSettingsSchema.parse(filtered);

    const result = await this.hooks.applyFilter(
      'settings.public',
      { section: SEO_KEY, settings: filtered },
      (value) => {
        const candidate = value as { section?: unknown; settings?: unknown };

        return (
          candidate?.section === SEO_KEY &&
          publicSeoSettingsSchema.safeParse(candidate.settings).success
        );
      },
    );

    return publicSeoSettingsSchema.parse(result.settings);
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
    const initial = parseInput(seoSettingsSchema, input);
    const filtered = await this.hooks?.applyFilter(
      'seo.beforeSave',
      initial,
      (value) => seoSettingsSchema.safeParse(value).success,
    );
    const settings = await filterSettings(
      this.hooks,
      seoSettingsSchema.parse(filtered ?? initial),
      projection,
    );
    const dto = seoSettingsSchema.parse(toPublicSettings(settings));

    await this.settings.set(SEO_KEY, dto);
    settingsUpdated(this.hooks, dto, projection);
    void this.hooks?.emit('seo.updated', dto);

    return dto;
  }
}
