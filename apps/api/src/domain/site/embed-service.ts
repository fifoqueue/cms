import { embedSettingsSchema, publicEmbedProviderSchema } from '@cms/sdk';
import type { EmbedSettings, PublicEmbedProvider } from '@cms/sdk';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { HookDispatcher } from '#api/domain/ports';
import { parseInput } from '#api/shared/validation';
import { presetProvider } from '#api/domain/content/embeds';
import type { EmbedProvider } from '#api/domain/content/embeds';

const KEY = 'embeds';

export class EmbedService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly hooks?: HookDispatcher,
  ) {}

  async get(): Promise<EmbedSettings> {
    const result = embedSettingsSchema.safeParse(await this.settings.get(KEY));
    return result.success ? result.data : embedSettingsSchema.parse({});
  }

  async providers(): Promise<readonly EmbedProvider[]> {
    return (await this.get()).providers
      .filter((provider) => provider.enabled)
      .map(({ sizing, ...provider }) =>
        presetProvider({
          ...provider,
          allow: provider.allow || undefined,
          ...sizing,
        }),
      );
  }

  async list(): Promise<PublicEmbedProvider[]> {
    return (await this.get()).providers
      .filter((provider) => provider.enabled)
      .map(({ id, label, urlPattern }) =>
        publicEmbedProviderSchema.parse({ id, label, urlPattern }),
      );
  }

  async update(input: unknown): Promise<EmbedSettings> {
    const settings = parseInput(embedSettingsSchema, input);
    await this.settings.set(KEY, settings);
    void this.hooks?.emit('settings.updated', { section: KEY, settings });
    return settings;
  }
}
