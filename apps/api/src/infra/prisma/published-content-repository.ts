import type {
  PublishedContentRepository,
  PublishedCriteria,
  PublishedRecord,
  PublishedSummaryRecord,
} from '#api/domain/content/published-content-repository';
import type { Database } from '#api/infra/prisma/client';
import {
  parseFields,
  featuredImageOf,
  PUBLIC_CONTENT,
  contentRelations,
  contentWhere,
  termScope,
  publishedIn,
  termSummaries,
} from '#api/infra/prisma/content-criteria';
import { Prisma } from '#api/infra/prisma/generated/client';
import { decodePath } from '#api/infra/prisma/permalink-repository';
import { fromPublicSeoColumns } from '#api/infra/prisma/seo-mapper';
import { Errors } from '#api/shared/errors';

/** Public columns only: never the editor document, search text, author, status or focus keyword. */
const summaryColumns = {
  id: true,
  type: true,
  slug: true,
  title: true,
  excerpt: true,
  publishedAt: true,
  updatedAt: true,
  seoTitle: true,
  seoDescription: true,
  seoCanonicalUrl: true,
  seoNoIndex: true,
  seoNoFollow: true,
  seoImageUrl: true,
  seoImageAlt: true,
  seoSocialTitle: true,
  seoSocialDescription: true,
  seoSchemaType: true,
  seoAuthorName: true,
  seoAuthorUrl: true,
  sticky: true,
  commentCount: true,
  summary: true,
  passwordHash: true,
  ...contentRelations,
} as const satisfies Prisma.ContentSelect;

const columns = {
  ...summaryColumns,
  html: true,
  fields: true,
} as const satisfies Prisma.ContentSelect;

type SummaryRow = Prisma.ContentGetPayload<{ select: typeof summaryColumns }>;

const toSummary = ({
  currentPath,
  terms,
  author,
  passwordHash,
  featuredMedia,
  ...row
}: SummaryRow): PublishedSummaryRecord => {
  if (!currentPath) throw new Error(Errors.ContentPathMissing);
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    path: decodePath(currentPath.path),
    title: row.title,
    excerpt: row.excerpt,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    extraTerms: terms
      .filter(
        ({ term }) => term.taxonomy !== 'category' && term.taxonomy !== 'tag',
      )
      .map(({ term }) => ({
        id: term.id,
        name: term.name,
        slug: term.slug,
        taxonomy: term.taxonomy,
      })),
    categories: termSummaries(terms, 'category'),
    tags: termSummaries(terms, 'tag'),
    author,
    featuredImage: featuredImageOf(featuredMedia),
    sticky: row.sticky,
    commentCount: row.commentCount,
    // Only whether it is set leaves the repository, never the hash.
    protected: passwordHash !== null,
    summary: row.summary,
    seo: fromPublicSeoColumns(row),
  };
};

const toRecord = (
  row: Prisma.ContentGetPayload<{ select: typeof columns }>,
): PublishedRecord => ({
  ...toSummary(row),
  html: row.html,
  fields: parseFields(row.fields),
});

/** Published-only reads filtered in the database, with the same criteria as the admin list. */
export class PrismaPublishedContentRepository implements PublishedContentRepository {
  constructor(private readonly db: Database) {}

  byId(id: string) {
    return this.find({ id });
  }

  async privateById(id: string) {
    const row = await this.db.content.findFirst({
      where: { id, status: 'private', trashedAt: null },
      select: columns,
    });
    return row ? toRecord(row) : null;
  }

  bySlug(slug: string) {
    return this.find({ slug });
  }

  list(criteria: PublishedCriteria) {
    return this.page(criteria, columns, toRecord);
  }

  summaries(criteria: PublishedCriteria) {
    return criteria.search
      ? this.fullTextSummaries(criteria)
      : this.page(criteria, summaryColumns, toSummary);
  }

  private async page<S extends Prisma.ContentSelect, R, T>(
    { page, pageSize, ...filters }: PublishedCriteria,
    select: S,
    map: (row: R) => T,
  ) {
    const where = await contentWhere(this.db, {
      ...filters,
      status: 'published',
      view: 'active',
    });
    if (!where) return { items: [], total: 0 };
    const total = await this.db.content.count({ where });
    const skip = (page - 1) * pageSize;
    if (skip >= total) return { items: [], total };
    const rows = await this.db.content.findMany({
      where,
      select,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
    });
    return { items: (rows as R[]).map(map), total };
  }

  async summariesByIds(ids: readonly string[]) {
    if (!ids.length) return [];
    const rows = await this.db.content.findMany({
      where: { id: { in: [...ids] }, ...PUBLIC_CONTENT },
      select: summaryColumns,
    });
    return rows.map(toSummary);
  }

  private async fullTextSummaries({
    search,
    type,
    types,
    category,
    tag,
    author,
    taxonomy,
    term,
    sticky,
    year,
    month,
    page,
    pageSize,
  }: PublishedCriteria) {
    if (!search || (!type && types?.length === 0))
      return { items: [], total: 0 };
    const termIds = category
      ? await termScope(this.db, 'category', category)
      : null;
    if (termIds && !termIds.length) return { items: [], total: 0 };

    const filters: Prisma.Sql[] = [
      Prisma.sql`c.status = 'published'`,
      Prisma.sql`c.trashed_at IS NULL`,
      Prisma.sql`MATCH(c.title, c.excerpt, c.search_text) AGAINST (${search} IN NATURAL LANGUAGE MODE)`,
    ];
    if (taxonomy && term) {
      const ids = await termScope(this.db, taxonomy, term);
      if (!ids.length) return { items: [], total: 0 };
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM content_terms ct WHERE ct.content_id = c.id AND ct.term_id IN (${Prisma.join(ids)}))`,
      );
    }
    if (type) filters.push(Prisma.sql`c.type = ${type}`);
    else if (types)
      filters.push(Prisma.sql`c.type IN (${Prisma.join([...types])})`);
    if (sticky) filters.push(Prisma.sql`c.sticky = ${sticky === 'only'}`);
    if (year) {
      const range = publishedIn(year, month);
      filters.push(
        Prisma.sql`c.published_at >= ${range.gte} AND c.published_at < ${range.lt}`,
      );
    }
    if (author)
      filters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM users u WHERE u.id = c.author_id AND u.slug = ${author}
      )`);
    if (termIds)
      filters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM content_terms ct
        WHERE ct.content_id = c.id AND ct.term_id IN (${Prisma.join(termIds)})
      )`);
    if (tag)
      filters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM content_terms ct
        JOIN taxonomy_terms t ON t.id = ct.term_id
        WHERE ct.content_id = c.id AND t.taxonomy = 'tag' AND t.slug = ${tag}
      )`);

    const where = Prisma.join(filters, ' AND ');
    const counts = await this.db.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS total FROM contents c WHERE ${where}
    `);
    const total = Number(counts[0]!.total);
    const skip = (page - 1) * pageSize;
    if (skip >= total) return { items: [], total };
    const rows = await this.db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT c.id FROM contents c WHERE ${where}
      ORDER BY c.published_at DESC, c.id DESC
      LIMIT ${pageSize} OFFSET ${skip}
    `);
    const order = new Map(rows.map((row, index) => [row.id, index]));
    const items = await this.summariesByIds(rows.map((row) => row.id));
    items.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    return { items, total };
  }

  async months(types: readonly string[], limit: number) {
    if (!types.length) return [];
    // DATETIME columns hold UTC, so YEAR()/MONTH() group by UTC months like permalinks.
    const rows = await this.db.$queryRaw<
      { year: number; month: number; count: bigint }[]
    >`
      SELECT YEAR(published_at) AS year, MONTH(published_at) AS month, COUNT(*) AS count
      FROM contents
      WHERE status = 'published' AND trashed_at IS NULL AND published_at IS NOT NULL
        AND type IN (${Prisma.join([...types])})
      GROUP BY year, month
      ORDER BY year DESC, month DESC
      LIMIT ${limit}`;
    return rows.map((row) => ({
      year: Number(row.year),
      month: Number(row.month),
      count: Number(row.count),
    }));
  }

  async passwordHash(id: string) {
    const row = await this.db.content.findFirst({
      where: { id, ...PUBLIC_CONTENT },
      select: { passwordHash: true },
    });
    return row?.passwordHash ?? null;
  }

  private async find(where: { id: string } | { slug: string }) {
    const row = await this.db.content.findUnique({
      where: { ...where, ...PUBLIC_CONTENT },
      select: columns,
    });
    return row && toRecord(row);
  }
}
