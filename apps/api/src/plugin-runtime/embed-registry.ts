import type { EmbedProvider } from '#api/domain/content/embeds';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';

interface Registration {
  owner: string;
  provider: EmbedProvider;
}

/** Embed providers added by plugins; each call is isolated and a failure means "no player". */
export class EmbedRegistry {
  private registrations: Registration[] = [];

  constructor(
    private readonly options: { timeoutMs: number; logger: Logger },
  ) {}

  registrar(owner: string) {
    return {
      register: (provider: EmbedProvider) => {
        const registration = { owner, provider };
        this.registrations = [...this.registrations, registration];
        return () => {
          this.registrations = this.registrations.filter(
            (entry) => entry !== registration,
          );
        };
      },
    };
  }

  providers(): EmbedProvider[] {
    return this.registrations.map(({ owner, provider }) => ({
      name: `${owner}:${provider.name}`,
      render: async (url) => {
        const result = await isolate(
          () => provider.render(new URL(url.href)),
          this.options.timeoutMs,
        );
        if (
          result.ok &&
          (typeof result.value === 'string' || result.value === null)
        )
          return result.value;
        this.options.logger.warn(
          `Plugin "${owner}" failed to render an embed: ${result.ok ? 'not a string' : result.error.message}`,
        );
        return null;
      },
    }));
  }
}
