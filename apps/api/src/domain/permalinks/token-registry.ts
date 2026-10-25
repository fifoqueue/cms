import { PERMALINK_TOKENS, renderPermalink } from '@cms/sdk';
import type { PermalinkValues } from '@cms/sdk';
import { permalinkSegmentSchema } from '@cms/sdk/plugin';
import type { PermalinkTokenResolver } from '@cms/sdk/plugin';
import { z } from 'zod';
import { isolate } from '#api/shared/isolate';
import { consoleLogger } from '#api/shared/logger';
import type { Logger } from '#api/shared/logger';

const keySchema = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/);

/** Core expansions and isolated plugin segment resolvers share one lookup. */
export class PermalinkTokenRegistry {
  private readonly core = new Map<string, PermalinkTokenResolver>();
  private readonly plugins = new Map<string, PermalinkTokenResolver>();

  constructor(
    private readonly timeoutMs = 3000,
    private readonly logger: Logger = consoleLogger(),
  ) {
    for (const key of PERMALINK_TOKENS)
      this.core.set(key, (values) =>
        renderPermalink(`/%${key}%`, values).slice(1),
      );
  }

  register(key: string, resolver: PermalinkTokenResolver) {
    keySchema.parse(key);
    this.plugins.set(key, resolver);
    return () => {
      if (this.plugins.get(key) === resolver) this.plugins.delete(key);
    };
  }

  isPluginResolved(key: string) {
    return this.plugins.has(key);
  }

  async resolve(key: string, values: PermalinkValues): Promise<string> {
    const plugin = this.plugins.get(key);
    if (plugin) {
      const result = await isolate(
        () => plugin(structuredClone(values)),
        this.timeoutMs,
      );
      if (result.ok && this.plugins.get(key) === plugin) {
        const parsed = permalinkSegmentSchema.safeParse(result.value);
        if (parsed.success) {
          try {
            return encodeURIComponent(parsed.data);
          } catch {
            // An unpaired surrogate is not a valid segment.
          }
        }
      }
      // Do not include plugin exceptions, returned values or entry fields in logs.
      this.logger.warn(
        `Permalink token "${key}" failed for entry "${values.id}"; using core fallback`,
      );
    }
    return (await this.core.get(key)?.(values)) ?? '';
  }

  async expand(pattern: string, values: PermalinkValues) {
    const parts = pattern.split('%');
    const output: string[] = [];
    for (const [index, part] of parts.entries())
      output.push(index % 2 ? await this.resolve(part, values) : part);
    return output.join('');
  }
}
