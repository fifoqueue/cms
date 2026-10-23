import type { SettingsTransaction } from '#api/domain/site/settings-transactions';
import type { Database } from '#api/infra/prisma/client';

export class PrismaSettingsRepository implements SettingsTransaction {
  constructor(private readonly db: Pick<Database, 'setting' | '$queryRaw'>) {}

  async list(prefix: string): Promise<Record<string, unknown>> {
    const rows = await this.db.setting.findMany({
      where: { key: { startsWith: prefix } },
    });
    return Object.fromEntries(
      rows.map((row) => [row.key, JSON.parse(row.value) as unknown]),
    );
  }

  async count(prefix: string): Promise<number> {
    const pattern = prefix.replace(/[\\%_]/g, '\\$&') + '%';
    const [row] = await this.db.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total FROM settings
      WHERE \`key\` LIKE ${pattern} AND JSON_TYPE(value) = 'OBJECT'`;
    return Number(row?.total ?? 0);
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
