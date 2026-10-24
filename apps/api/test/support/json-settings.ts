import type { SettingsRepository } from '#api/domain/site/site-service';

/** Same contract as `PrismaSettingsRepository`: JSON values by key, a JSON round trip on write. */
export class MemoryJsonSettings implements SettingsRepository {
  readonly values = new Map<string, string>();
  writes = 0;

  async list(prefix: string): Promise<Record<string, unknown>> {
    return Object.fromEntries(
      [...this.values]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key, JSON.parse(value) as unknown]),
    );
  }

  async get(key: string) {
    const value = this.values.get(key);
    return value === undefined ? undefined : (JSON.parse(value) as unknown);
  }

  async set(key: string, value: unknown) {
    this.writes += 1;
    this.values.set(key, JSON.stringify(value));
  }
}
