import { patternSummarySchema } from '@cms/sdk';
import type {
  PatternCatalog,
  PatternCriteria,
} from '#api/domain/content/pattern-catalog';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';

/** Existing pattern settings stay intact; SQL returns only the requested metadata page. */
export class PrismaPatternCatalog implements PatternCatalog {
  constructor(private readonly db: Database) {}

  async summaries({ page, pageSize, search, authorId }: PatternCriteria) {
    const filters = [
      Prisma.sql`\`key\` LIKE 'pattern.%' AND JSON_TYPE(value) = 'OBJECT'`,
    ];
    if (authorId !== undefined)
      filters.push(
        Prisma.sql`(JSON_VALUE(value, '$.status') = 'published' OR BINARY JSON_VALUE(value, '$.authorId') = ${authorId})`,
      );
    if (search)
      filters.push(
        Prisma.sql`LOCATE(${search.toLowerCase()}, LOWER(JSON_VALUE(value, '$.title'))) > 0`,
      );
    const where = Prisma.join(filters, ' AND ');
    const [count] = await this.db.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM settings WHERE ${where}`,
    );
    const rows = await this.db.$queryRaw<{ summary: string }[]>(Prisma.sql`
      SELECT JSON_OBJECT(
        'id', JSON_VALUE(value, '$.id'),
        'title', JSON_VALUE(value, '$.title'),
        'synced', JSON_EXTRACT(value, '$.synced'),
        'status', JSON_VALUE(value, '$.status'),
        'authorId', JSON_VALUE(value, '$.authorId'),
        'updatedAt', JSON_VALUE(value, '$.updatedAt')
      ) AS summary
      FROM settings WHERE ${where}
      ORDER BY JSON_VALUE(value, '$.title'), \`key\`
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
    return {
      items: rows.map(({ summary }) =>
        patternSummarySchema.parse(JSON.parse(summary)),
      ),
      total: Number(count?.total ?? 0),
    };
  }
}
