import type { SettingsRepository } from '../../domain/site/site-service';
import type { Database } from './client';

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Pick<Database, 'setting'>) {}

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
