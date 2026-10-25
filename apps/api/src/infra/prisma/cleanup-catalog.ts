import type { Database } from '#api/infra/prisma/client';
import { CLEANUP_MAX_ATTEMPTS } from '#api/domain/media/media-cleanup';

/** SQL pagination excludes cleared records, lock rows and recovery cursors. */
export class PrismaCleanupCatalog {
  constructor(private readonly db: Database) {}
  async page(after: string, limit: number) {
    const rows = await this.db.$queryRaw<{ key: string; value: string }[]>`
      SELECT \`key\`, value FROM settings WHERE \`key\` LIKE 'media.cleanup.%'
      AND JSON_TYPE(value) = 'OBJECT' AND \`key\` > ${after}
      ORDER BY \`key\` LIMIT ${limit}`;
    return rows.map((row) => ({
      key: row.key,
      value: JSON.parse(row.value) as unknown,
    }));
  }
  async attention() {
    const [row] = await this.db.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total FROM settings WHERE \`key\` LIKE 'media.cleanup.%'
      AND JSON_TYPE(value) = 'OBJECT'
      AND JSON_EXTRACT(value, '$.attempts') >= ${CLEANUP_MAX_ATTEMPTS}`;
    return Number(row?.total ?? 0);
  }
}
