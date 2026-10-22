import { permalinkSettingsSchema } from '@cms/sdk';
import type { PermalinkSettings } from '@cms/sdk';
import type { PermalinkRepository } from '#api/domain/permalinks/permalink-repository';
import { parseInput } from '#api/shared/validation';

/** Copies the template strings only, so nothing else can reach a response. */
const toSettings = (settings: PermalinkSettings): PermalinkSettings =>
  Object.fromEntries(
    Object.entries(settings).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );

/** Permalink templates. They hold no secrets, so public and admin reads share one DTO. */
export class PermalinkService {
  constructor(private readonly repository: PermalinkRepository) {}

  async get(): Promise<PermalinkSettings> {
    return toSettings(await this.repository.readSettings());
  }

  /** Regenerates every content path; on any collision nothing changes (see `saveSettings`). */
  async update(input: unknown): Promise<PermalinkSettings> {
    const settings = toSettings(parseInput(permalinkSettingsSchema, input));

    await this.repository.saveSettings(settings);

    return settings;
  }
}
