import type { ContentSummaryRecord } from '#api/domain/content/content-repository';
import type {
  PublishedContentRepository,
  PublishedCriteria,
  PublishedSummaryRecord,
} from '#api/domain/content/published-content-repository';
import { toPublicSeo } from '#api/domain/seo/seo-mapper';
import { countMonth, newestMonths } from '#api/infra/prisma/month-counts';
import type { MonthCounts } from '#api/infra/prisma/month-counts';
import type { MemoryContentRepository } from '#test/support/memory';

/** Same contract as `PrismaPublishedContentRepository`: published rows, public fields only. */
export class MemoryPublishedContentRepository implements PublishedContentRepository {
  constructor(private readonly content: MemoryContentRepository) {}

  async byId(id: string) {
    return this.ancestry(published(await this.content.findById(id)));
  }

  async privateById(id: string) {
    const record = await this.content.findById(id);
    return record?.status === 'private' && !record.trashedAt
      ? this.ancestry({
          ...project(record),
          html: record.html,
          fields: record.fields,
        })
      : null;
  }

  async bySlug(slug: string) {
    return this.ancestry(published(await this.content.findBySlug(slug)));
  }

  async summariesByIds(ids: readonly string[]) {
    const records = await Promise.all(ids.map((id) => this.byId(id)));
    return records
      .filter((record) => record !== null)
      .map(({ html: _html, fields: _fields, ...summary }) => summary);
  }

  async passwordHash(id: string) {
    const record = await this.content.findById(id);
    return record?.status === 'published' && !record.trashedAt
      ? record.passwordHash
      : null;
  }

  async list(criteria: PublishedCriteria) {
    const { items, total } = await this.summaries(criteria);
    return {
      items: await Promise.all(
        items.map(async (item) => {
          const record = (await this.content.findById(item.id))!;
          return { ...item, html: record.html, fields: record.fields };
        }),
      ),
      total,
    };
  }

  async months(types: readonly string[], limit: number) {
    const { items } = await this.summaries({ types, page: 1, pageSize: 1e6 });
    const counts: MonthCounts = new Map();
    for (const { publishedAt } of items)
      if (publishedAt)
        countMonth(
          counts,
          publishedAt.getUTCFullYear(),
          publishedAt.getUTCMonth() + 1,
        );
    return newestMonths(counts, limit);
  }

  async adjacent(id: string) {
    const entry = await this.byId(id);
    if (!entry?.publishedAt) return { previous: null, next: null };
    const { items } = await this.summaries({
      type: entry.type,
      page: 1,
      pageSize: 1e6,
    });
    const index = items.findIndex((item) => item.id === id);
    return {
      previous: items[index + 1] ?? null,
      next: items[index - 1] ?? null,
    };
  }

  async monthNeighbours(types: readonly string[], year: number, month: number) {
    const anchor = year * 12 + month;
    const months = (
      await this.summaries({ types, page: 1, pageSize: 1e6 })
    ).items.flatMap(({ publishedAt }) =>
      publishedAt
        ? [
            {
              year: publishedAt.getUTCFullYear(),
              month: publishedAt.getUTCMonth() + 1,
            },
          ]
        : [],
    );
    const order = (entry: { year: number; month: number }) =>
      entry.year * 12 + entry.month;
    const before = months
      .filter((entry) => order(entry) < anchor)
      .sort((a, b) => order(b) - order(a));
    const after = months
      .filter((entry) => order(entry) > anchor)
      .sort((a, b) => order(a) - order(b));
    return { previous: before[0] ?? null, next: after[0] ?? null };
  }

  async summaries(criteria: PublishedCriteria) {
    const { items, total } = await this.content.list({
      ...criteria,
      status: 'published',
      view: 'active',
      orderBy: criteria.orderBy ?? 'publishedAt',
    });
    return {
      items: items.map((item) => this.ancestry(project(item))!),
      total,
    };
  }

  /** Like the Prisma projection: a parent only while it is public and unlocked. */
  private ancestry<T extends PublishedSummaryRecord | null>(record: T): T {
    if (!record?.parentId) return record;
    const parent = this.content.rows.get(record.parentId);
    const open =
      parent?.status === 'published' &&
      !this.content.trashed.has(parent.id) &&
      parent.passwordHash === null;
    return open ? record : { ...record, parentId: null };
  }
}

const published = (
  record:
    | (ContentSummaryRecord & { html: string; fields: Record<string, unknown> })
    | null,
) =>
  record?.status === 'published' && !record.trashedAt
    ? { ...project(record), html: record.html, fields: record.fields }
    : null;

const project = (record: ContentSummaryRecord): PublishedSummaryRecord => ({
  id: record.id,
  type: record.type,
  slug: record.slug,
  path: record.path,
  title: record.title,
  excerpt: record.excerpt,
  publishedAt: record.publishedAt,
  updatedAt: record.updatedAt,
  extraTerms: record.extraTerms,
  categories: record.categories,
  tags: record.tags,
  author: { name: record.authorName, slug: record.authorSlug },
  parentId: record.parentId ?? null,
  sticky: record.sticky,
  tocOverride: record.tocOverride ?? 'default',
  commentCount: record.commentCount,
  protected: record.passwordHash !== null,
  featuredImage: record.featuredImage,
  summary: record.summary,
  seo: toPublicSeo(record.seo),
});
