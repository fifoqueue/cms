import { healthCheckSchema } from '@cms/sdk';
import type { HealthCheck } from '@cms/sdk';
import { Errors } from '#api/shared/errors';
import { isolate } from '#api/shared/isolate';

type Check = () => unknown;

/** What plugin contexts may reach: namespaced, isolated registrations only. */
export type PluginHealthChecks = Pick<HealthChecks, 'plugin'>;

/**
 * Site health registry. Core checks (`registerCore`, composition root and `SiteHealthService`
 * only) run directly and their errors propagate. Plugin checks run isolated and time-limited;
 * throwing, invalid or timed-out ones become a critical `check failed` result.
 */
export class HealthChecks {
  private readonly core = new Map<HealthCheck['key'], Check>();
  private readonly plugins = new Map<HealthCheck['key'], Check>();
  constructor(private readonly timeoutMs = 3000) {}

  registerCore(key: HealthCheck['key'], check: Check): () => void {
    return this.add(this.core, key, check);
  }

  plugin(owner: string, key: string, check: Check) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || key.length > 64)
      throw new Error(Errors.InvalidInput);
    return this.add(this.plugins, `plugin:${owner}:${key}`, check);
  }

  async run(): Promise<HealthCheck[]> {
    const [core, plugins] = await Promise.all([
      Promise.all(
        [...this.core].map(async ([key, check]) =>
          healthCheckSchema.parse({ ...((await check()) as object), key }),
        ),
      ),
      Promise.all(
        [...this.plugins].map(async ([key, check]) => {
          const result = await isolate(async () => {
            const value = await check();
            return healthCheckSchema.parse({ ...(value as object), key });
          }, this.timeoutMs);
          if (this.plugins.get(key) !== check) return null;
          return result.ok
            ? structuredClone(result.value)
            : { key, status: 'critical' as const, detail: ['check failed'] };
        }),
      ),
    ]);
    return [...core, ...plugins.filter((result) => result !== null)];
  }

  private add(
    table: Map<HealthCheck['key'], Check>,
    key: HealthCheck['key'],
    check: Check,
  ): () => void {
    if (this.core.has(key) || this.plugins.has(key))
      throw new Error(Errors.InvalidInput);
    table.set(key, check);
    return () => {
      if (table.get(key) === check) table.delete(key);
    };
  }
}
