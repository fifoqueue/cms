import type { SettingsRepository } from '#api/domain/site/site-service';
import type { Database } from '#api/infra/prisma/client';

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Pick<Database, 'setting'>) {}

  async list(prefix: string): Promise<Record<string, unknown>> {
    const rows = await this.db.setting.findMany({
      where: { key: { startsWith: prefix } },
    });
    return Object.fromEntries(
      rows.map((row) => [row.key, JSON.parse(row.value) as unknown]),
    );
  }

  async get(key: string) {
    const row = await this.db.setting.findUnique({ where: { key } });
    return row ? (JSON.parse(row.value) as unknown) : undefined;
  }

  async set(key: string, value: unknown) {
    const json = JSON.stringify(value);
    await this.db.setting.upsert({
      where: { key },
      create: { key, value: json },
      update: { value: json },
    });
  }
}
