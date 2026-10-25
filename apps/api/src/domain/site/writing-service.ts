import { writingSettingsSchema } from '@cms/sdk';
import type { WritingSettings } from '@cms/sdk';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { parseInput } from '#api/shared/validation';
import type { HookDispatcher } from '#api/domain/ports';

const KEY = 'writing';

/** Defaults for new entries (WordPress "Settings → Writing"). */
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
    const settings = parseInput(writingSettingsSchema, input);
    await this.settings.set(KEY, settings);
    void this.hooks?.emit('settings.updated', { section: KEY, settings });
    return settings;
  }
}
