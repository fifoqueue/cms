import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';

/**
 * The candidates that collide with a stored slug under the column's own collation (a stored
 * `café` takes `cafe` in utf8mb4_unicode_ci), in the candidates' spelling. Each candidate is
 * compared as a literal against the column so the column collation decides, as the unique index does.
 */
export const takenSlugs = async (
  db: Pick<Database, '$queryRaw'>,
  table: 'contents' | 'taxonomy_terms' | 'users',
  slugs: readonly string[],
  scope: Prisma.Sql = Prisma.empty,
): Promise<Set<string>> => {
  if (!slugs.length) return new Set();
  const rows = await db.$queryRaw<{ slug: string }[]>(
    Prisma.join(
      slugs.map(
        (slug) => Prisma.sql`SELECT ${slug} AS slug FROM DUAL WHERE EXISTS (
          SELECT 1 FROM ${Prisma.raw(table)} t WHERE t.slug = ${slug} ${scope}
        )`,
      ),
      ' UNION ALL ',
    ),
  );
  return new Set(rows.map((row) => row.slug));
};
