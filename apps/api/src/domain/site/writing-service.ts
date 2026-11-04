import { writingSettingsSchema } from '@cms/sdk';
import type { WritingSettings } from '@cms/sdk';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { parseInput } from '#api/shared/validation';
import type { HookDispatcher } from '#api/domain/ports';
import {
  filterSettings,
  settingsUpdated,
} from '#api/domain/site/settings-hooks';

const KEY = 'writing';

const projection = {
  redact: (settings: WritingSettings) => ({
    section: KEY as typeof KEY,
    settings,
  }),
  restore: (value: { settings: WritingSettings }) => value.settings,
  parse: (value: unknown) => writingSettingsSchema.safeParse(value),
};

/** Defaults for new entries (Settings → Writing). */
export class WritingService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly hooks?: HookDispatcher,
  ) {}

  async get(): Promise<WritingSettings> {
    const result = writingSettingsSchema.safeParse(
      await this.settings.get(KEY),
    );

    return result.success ? result.data : writingSettingsSchema.parse({});
  }

  async update(input: unknown): Promise<WritingSettings> {
    const settings = await filterSettings(
      this.hooks,
      parseInput(writingSettingsSchema, input),
      projection,
    );

    await this.settings.set(KEY, settings);
    settingsUpdated(this.hooks, settings, projection);

    return settings;
  }
}
