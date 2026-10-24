import { calendar } from '@cms/sdk';
import { siteTimeZone } from '#api/infra/prisma/content-calendar';
import type {
  PublishedContentRepository,
  PublishedCriteria,
  PublishedRecord,
  PublishedSummaryRecord,
} from '#api/domain/content/published-content-repository';
import type { Database } from '#api/infra/prisma/client';
import {
  PUBLIC_CONTENT,
  contentWhere,
  termScope,
  publishedIn,
} from '#api/infra/prisma/content-criteria';
import { Prisma } from '#api/infra/prisma/generated/client';
import { countMonth, newestMonths } from '#api/infra/prisma/month-counts';
import type { MonthCounts } from '#api/infra/prisma/month-counts';
import { projectContent } from '#api/infra/prisma/public-content-projection';

/** Published-only reads filtered in the database, with the same criteria as the admin list. */
export class PrismaPublishedContentRepository implements PublishedContentRepository {
  constructor(private readonly db: Database) {}

  byId(id: string) {
    return this.find({ id });
  }

  async privateById(id: string) {
    const rows = await projectContent(
      this.db,
      Prisma.sql`c.id = ${id}`,
      true,
      'private',
    );
    return rows[0] ?? null;
  }

  bySlug(slug: string) {
    return this.find({ slug });
  }

  list(criteria: PublishedCriteria) {
    return this.page<PublishedRecord>(criteria, true);
  }

  summaries(criteria: PublishedCriteria) {
    return criteria.search
      ? this.fullTextSummaries(criteria)
      : this.page<PublishedSummaryRecord>(criteria, false);
  }

  private async page<T extends PublishedSummaryRecord>(
    {
      page,
      pageSize,
      orderBy = 'publishedAt',
      order = 'desc',
      ...filters
    }: PublishedCriteria,
    body: boolean,
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
      select: { id: true },
      orderBy: [{ [orderBy]: order }, { id: order }],
      skip,
      take: pageSize,
    });
    if (!rows.length) return { items: [], total };
    const filter = Prisma.sql`c.id IN (${Prisma.join(rows.map(({ id }) => id))})`;
    const items = body
      ? await projectContent(this.db, filter, true)
      : await projectContent(this.db, filter, false);
    const positions = new Map(rows.map(({ id }, index) => [id, index]));
    items.sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
    return { items: items as T[], total };
  }

  async summariesByIds(ids: readonly string[]) {
    if (!ids.length) return [];
    return projectContent(
      this.db,
      Prisma.sql`c.id IN (${Prisma.join([...ids])})`,
      false,
    );
  }

  private async fullTextSummaries({
    include,
    exclude,
    parent,
    orderBy = 'publishedAt',
    order: direction = 'desc',
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
    day,
    page,
    pageSize,
  }: PublishedCriteria) {
    if (!search || (!type && types?.length === 0) || include?.length === 0)
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
    if (include?.length)
      filters.push(Prisma.sql`c.id IN (${Prisma.join([...include])})`);
    if (exclude?.length)
      filters.push(Prisma.sql`c.id NOT IN (${Prisma.join([...exclude])})`);
    if (parent !== undefined)
      filters.push(
        parent === null
          ? Prisma.sql`c.parent_id IS NULL`
          : Prisma.sql`c.parent_id = ${parent}`,
      );
    if (type) filters.push(Prisma.sql`c.type = ${type}`);
    else if (types)
      filters.push(Prisma.sql`c.type IN (${Prisma.join([...types])})`);
    if (sticky) filters.push(Prisma.sql`c.sticky = ${sticky === 'only'}`);
    if (year) {
      const range = publishedIn(year, month, day, await siteTimeZone(this.db));
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
    const column = {
      publishedAt: Prisma.sql`c.published_at`,
      updatedAt: Prisma.sql`c.updated_at`,
      menuOrder: Prisma.sql`c.menu_order`,
      title: Prisma.sql`c.title`,
      id: Prisma.sql`c.id`,
    }[orderBy];
    const sort = direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const rows = await this.db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT c.id FROM contents c WHERE ${where}
      ORDER BY ${column} ${sort}, c.id ${sort}
      LIMIT ${pageSize} OFFSET ${skip}
    `);
    const order = new Map(rows.map((row, index) => [row.id, index]));
    const items = await this.summariesByIds(rows.map((row) => row.id));
    items.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    return { items, total };
  }

  async months(types: readonly string[], limit: number) {
    if (!types.length) return [];
    const parts = calendar(await siteTimeZone(this.db));
    const counts: MonthCounts = new Map();
    let cursor: { id: string; publishedAt: Date } | null = null;
    for (;;) {
      const rows: { id: string; publishedAt: Date | null }[] =
        await this.db.content.findMany({
          where: {
            ...PUBLIC_CONTENT,
            type: { in: [...types] },
            publishedAt: { not: null },
            ...(cursor && {
              OR: [
                { publishedAt: { lt: cursor.publishedAt } },
                { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
              ],
            }),
          },
          select: { id: true, publishedAt: true },
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
          take: 1000,
        });
      for (const row of rows) {
        const { year, month } = parts(row.publishedAt!);
        countMonth(counts, year, month);
      }
      if (rows.length < 1000 || counts.size > limit) break;
      const last = rows.at(-1)!;
      cursor = { id: last.id, publishedAt: last.publishedAt! };
    }
    return newestMonths(counts, limit);
  }

  async adjacent(id: string) {
    const entry = await this.db.content.findFirst({
      where: { id, ...PUBLIC_CONTENT },
      select: { type: true, publishedAt: true },
    });
    const at = entry?.publishedAt;
    if (!entry || !at) return { previous: null, next: null };
    // Ties on `publishedAt` fall back to the id, like the list order.
    const near = (direction: 'lt' | 'gt') =>
      this.db.content.findFirst({
        where: {
          ...PUBLIC_CONTENT,
          type: entry.type,
          OR: [
            { publishedAt: { [direction]: at } },
            { publishedAt: at, id: { [direction]: id } },
          ],
        },
        select: { id: true },
        orderBy:
          direction === 'lt'
            ? [{ publishedAt: 'desc' }, { id: 'desc' }]
            : [{ publishedAt: 'asc' }, { id: 'asc' }],
      });
    const [previous, next] = await Promise.all([near('lt'), near('gt')]);
    const items = new Map(
      (
        await this.summariesByIds(
          [previous?.id, next?.id].filter((id): id is string => !!id),
        )
      ).map((item) => [item.id, item]),
    );
    return {
      previous: previous ? (items.get(previous.id) ?? null) : null,
      next: next ? (items.get(next.id) ?? null) : null,
    };
  }

  async monthNeighbours(types: readonly string[], year: number, month: number) {
    const timeZone = await siteTimeZone(this.db);
    const { gte: start, lt: end } = publishedIn(
      year,
      month,
      undefined,
      timeZone,
    );
    const parts = calendar(timeZone);
    const near = (publishedAt: { lt: Date } | { gte: Date }) =>
      this.db.content.findFirst({
        where: { ...PUBLIC_CONTENT, type: { in: [...types] }, publishedAt },
        select: { publishedAt: true },
        orderBy: { publishedAt: 'lt' in publishedAt ? 'desc' : 'asc' },
      });
    const [previous, next] = await Promise.all([
      near({ lt: start }),
      near({ gte: end }),
    ]);
    const monthOf = (row: { publishedAt: Date | null } | null) =>
      row?.publishedAt
        ? {
            year: parts(row.publishedAt).year,
            month: parts(row.publishedAt).month,
          }
        : null;
    return { previous: monthOf(previous), next: monthOf(next) };
  }

  async passwordHash(id: string) {
    const row = await this.db.content.findFirst({
      where: { id, ...PUBLIC_CONTENT },
      select: { passwordHash: true },
    });
    return row?.passwordHash ?? null;
  }

  private async find(where: { id: string } | { slug: string }) {
    const filter =
      'id' in where
        ? Prisma.sql`c.id = ${where.id}`
        : Prisma.sql`c.slug = ${where.slug}`;
    const rows = await projectContent(this.db, filter, true);
    return rows[0] ?? null;
  }
}
