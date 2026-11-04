import { redirectSchema, safeRedirect } from '@cms/sdk';
import type { PageRedirect, RedirectRegistrar } from '@cms/sdk';
import { providerKeySchema } from '@cms/sdk/plugin';
import { isolate } from '#api/shared/isolate';
import { parseInput } from '#api/shared/validation';

type Definition = Parameters<RedirectRegistrar['register']>[1];

export class RedirectRegistry {
  private entries: {
    owner: string;
    key: string;
    resolve: Definition['resolve'];
  }[] = [];

  constructor(
    private readonly timeoutMs: number,
    private readonly allowedOrigins: readonly string[] = [],
  ) {}

  get empty() {
    return this.entries.length === 0;
  }

  register(owner: string, key: string, definition: Definition) {
    parseInput(providerKeySchema, key);
    const entry = { owner, key, resolve: definition.resolve };

    this.entries.push(entry);

    return () => {
      this.entries = this.entries.filter((item) => item !== entry);
    };
  }

  async resolve(path: string): Promise<PageRedirect | null> {
    for (const entry of this.entries.slice()) {
      if (!this.entries.includes(entry)) continue;
      const result = await isolate(async () => {
        const parsed = redirectSchema.safeParse(await entry.resolve(path));

        return parsed.success &&
          safeRedirect(parsed.data.to, this.allowedOrigins)
          ? parsed.data
          : null;
      }, this.timeoutMs);

      if (
        this.entries.includes(entry) &&
        result.ok &&
        result.value &&
        result.value.to !== path
      )
        return result.value;
    }

    return null;
  }
}
