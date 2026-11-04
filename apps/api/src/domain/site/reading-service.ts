import {
  DEFAULT_READING_SETTINGS,
  readingSettingsSchema,
  publicReadingSchema,
} from '@cms/sdk';
import {
  filterSettings,
  settingsUpdated,
} from '#api/domain/site/settings-hooks';
import type { PublicReading, ReadingSettings } from '@cms/sdk';
import type { PublishedContentRepository } from '#api/domain/content/published-content-repository';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { parseInput } from '#api/shared/validation';
import type { HookDispatcher } from '#api/domain/ports';

const KEY = 'reading';

const projection = {
  redact: (settings: ReadingSettings) => ({
    section: KEY as typeof KEY,
    settings,
  }),
  restore: (value: { settings: ReadingSettings }) => value.settings,
  parse: (value: unknown) => readingSettingsSchema.safeParse(value),
};

/** Front page, list sizes and date presentation (Settings → Reading). */
export class ReadingService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly published: Pick<
      PublishedContentRepository,
      'summariesByIds'
    >,
    private readonly hooks?: HookDispatcher,
  ) {}

  async get(): Promise<ReadingSettings> {
    const result = readingSettingsSchema.safeParse(
      await this.settings.get(KEY),
    );

    return result.success ? result.data : DEFAULT_READING_SETTINGS;
  }

  /** With the front and posts pages' paths; unpublished pages count as unset. */
  async getPublic(): Promise<PublicReading> {
    const settings = await this.get();
    const ids = [settings.frontPageId, settings.postsPageId].filter(
      (id): id is string => id !== null,
    );
    const pages = new Map(
      (await this.published.summariesByIds(ids)).map((page) => [
        page.id,
        page.path,
      ]),
    );
    const frontPagePath =
      settings.frontPage === 'page' && settings.frontPageId
        ? (pages.get(settings.frontPageId) ?? null)
        : null;

    const result = {
      ...settings,
      frontPagePath,
      postsPagePath:
        frontPagePath && settings.postsPageId
          ? (pages.get(settings.postsPageId) ?? null)
          : null,
    };

    if (!this.hooks?.has('settings.public')) return result;

    const filtered = await this.hooks.applyFilter(
      'settings.public',
      { section: KEY, settings: result },
      (value) => {
        const candidate = value as { section?: unknown; settings?: unknown };

        return (
          candidate?.section === KEY &&
          publicReadingSchema.safeParse(candidate.settings).success
        );
      },
    );

    return publicReadingSchema.parse(filtered.settings);
  }

  async update(input: unknown): Promise<ReadingSettings> {
    const settings = await filterSettings(
      this.hooks,
      parseInput(readingSettingsSchema, input),
      projection,
    );

    await this.settings.set(KEY, settings);
    settingsUpdated(this.hooks, settings, projection);

    return settings;
  }
}
