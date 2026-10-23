import type { ContentSummaryRecord } from '#api/domain/content/content-repository';
import type {
  PublishedContentRepository,
  PublishedCriteria,
  PublishedSummaryRecord,
} from '#api/domain/content/published-content-repository';
import { toPublicSeo } from '#api/domain/seo/seo-mapper';
import type { MemoryContentRepository } from '#test/support/memory';

/** Same contract as `PrismaPublishedContentRepository`: published rows, public fields only. */
export class MemoryPublishedContentRepository implements PublishedContentRepository {
  constructor(private readonly content: MemoryContentRepository) {}

  async byId(id: string) {
    return published(await this.content.findById(id));
  }

  async privateById(id: string) {
    const record = await this.content.findById(id);
    return record?.status === 'private' && !record.trashedAt
      ? { ...project(record), html: record.html, fields: record.fields }
      : null;
  }

  async bySlug(slug: string) {
    return published(await this.content.findBySlug(slug));
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
    const counts = new Map<
      string,
      { year: number; month: number; count: number }
    >();
    for (const { publishedAt } of items) {
      if (!publishedAt) continue;
      const [year, month] = [
        publishedAt.getUTCFullYear(),
        publishedAt.getUTCMonth() + 1,
      ];
      const entry = counts.get(`${year}-${month}`) ?? { year, month, count: 0 };
      counts.set(`${year}-${month}`, { ...entry, count: entry.count + 1 });
    }
    return [...counts.values()]
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(0, limit);
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

  async summaries(criteria: PublishedCriteria) {
    const { items, total } = await this.content.list({
      ...criteria,
      status: 'published',
      view: 'active',
      orderBy: 'publishedAt',
    });
    return { items: items.map(project), total };
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
  sticky: record.sticky,
  commentCount: record.commentCount,
  protected: record.passwordHash !== null,
  featuredImage: record.featuredImage,
  summary: record.summary,
  seo: toPublicSeo(record.seo),
});
