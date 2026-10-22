import { DEFAULT_READING_SETTINGS, readingSettingsSchema } from '@cms/sdk';
import type { PublicReading, ReadingSettings } from '@cms/sdk';
import type { PublishedContentRepository } from '#api/domain/content/published-content-repository';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { parseInput } from '#api/shared/validation';

const KEY = 'reading';

/** Front page, list sizes and date presentation (WordPress "Settings → Reading"). */
export class ReadingService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly published: Pick<
      PublishedContentRepository,
      'summariesByIds'
    >,
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
    return {
      ...settings,
      frontPagePath,
      postsPagePath:
        frontPagePath && settings.postsPageId
          ? (pages.get(settings.postsPageId) ?? null)
          : null,
    };
  }

  async update(input: unknown): Promise<ReadingSettings> {
    const settings = parseInput(readingSettingsSchema, input);
    await this.settings.set(KEY, settings);
    return settings;
  }
}
