import { permalinkSettingsSchema } from '@cms/sdk';
import type { PermalinkSettings } from '@cms/sdk';
import type { PermalinkRepository } from '#api/domain/permalinks/permalink-repository';
import type { HookDispatcher } from '#api/domain/ports';
import { parseInput } from '#api/shared/validation';
import {
  filterSettings,
  settingsUpdated,
} from '#api/domain/site/settings-hooks';

const projection = {
  redact: (settings: PermalinkSettings) => ({
    section: 'permalinks' as const,
    settings,
  }),
  restore: (value: { settings: PermalinkSettings }) => value.settings,
  parse: (value: unknown) => permalinkSettingsSchema.safeParse(value),
};

/** Copies the template strings only, so nothing else can reach a response. */
const toSettings = (settings: PermalinkSettings): PermalinkSettings =>
  Object.fromEntries(
    Object.entries(settings).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );

/** Permalink templates. They hold no secrets, so public and admin reads share one DTO. */
export class PermalinkService {
  constructor(
    private readonly repository: PermalinkRepository,
    private readonly hooks?: HookDispatcher,
  ) {}

  async get(): Promise<PermalinkSettings> {
    return toSettings(await this.repository.readSettings());
  }

  /** Regenerates paths; interrupted stores may resume prior batches (see `saveSettings`). */
  async update(input: unknown): Promise<PermalinkSettings> {
    const settings = await filterSettings(
      this.hooks,
      toSettings(parseInput(permalinkSettingsSchema, input)),
      projection,
    );

    await this.repository.saveSettings(settings);
    settingsUpdated(this.hooks, settings, projection);
    void this.hooks?.emit('permalinks.updated', settings);

    return settings;
  }
}
