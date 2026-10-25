import type { Awaitable } from '@cms/sdk';
import type { Unsubscribe } from '@cms/sdk/plugin';
import { providerKeySchema } from '@cms/sdk/plugin';
import type { z } from 'zod';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';
import { parseInput } from '#api/shared/validation';

interface Provider<I, O> {
  core: boolean;
  owner: string;
  key: string;
  run: (input: I) => Awaitable<O | null>;
}

/** Last registration wins; failed/revoked implementations fall through to earlier ones. */
export class ProviderRegistry<I, O> {
  private readonly providers: Provider<I, O>[] = [];

  constructor(
    private readonly schema: z.ZodType<O>,
    private readonly options: { timeoutMs: number; logger: Logger },
  ) {}

  register(
    owner: string,
    key: string,
    run: Provider<I, O>['run'],
    core = false,
  ): Unsubscribe {
    parseInput(providerKeySchema, key);
    const provider = { owner, key, run, core };
    this.providers.push(provider);
    return () => {
      const index = this.providers.indexOf(provider);
      if (index !== -1) this.providers.splice(index, 1);
    };
  }

  keys() {
    return [...new Set(this.providers.map((provider) => provider.key))];
  }

  async resolve(input: I, key?: string): Promise<O | null> {
    return (await this.resolveEntry(input, key))?.value ?? null;
  }

  async resolveEntry(
    input: I,
    key?: string,
  ): Promise<{ source: string; value: O } | null> {
    for (const provider of [...this.providers].reverse()) {
      if (key !== undefined && provider.key !== key) continue;
      if (!this.providers.includes(provider)) continue;
      if (provider.core) {
        const output = await provider.run(input);
        if (output !== null)
          return { source: provider.owner, value: this.schema.parse(output) };
        continue;
      }
      const result = await isolate(async () => {
        if (!this.providers.includes(provider)) return null;
        const output = await provider.run(structuredClone(input));
        if (output === null) return null;
        const parsed = this.schema.safeParse(output);
        if (parsed.success) return structuredClone(parsed.data);
        this.options.logger.warn(
          `Provider "${provider.owner}:${provider.key}" returned invalid output`,
        );
        return null;
      }, this.options.timeoutMs);
      if (!this.providers.includes(provider)) continue;
      if (result.ok && result.value !== null)
        return { source: provider.owner, value: result.value };
      if (!result.ok)
        this.options.logger.warn(
          `Provider "${provider.owner}:${provider.key}" failed; using fallback`,
        );
    }
    return null;
  }
}
