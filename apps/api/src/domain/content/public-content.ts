import { CONTENT_TYPES, contentListQuerySchema, isJsonValue } from '@cms/sdk';
import type { Paginated, PublicContent } from '@cms/sdk';
import type { ContentReader } from '@cms/sdk/plugin';
import { z } from 'zod';
import { notFound } from '../../shared/errors';
import { parseInput } from '../../shared/validation';
import type { HookDispatcher } from '../ports';
import { toPublic } from './content-mapper';
import type { ContentRepository } from './content-repository';

const publicQuerySchema = contentListQuerySchema.omit({ status: true });

const publicContentSchema = z.strictObject({
  id: z.string(),
  type: z.enum(CONTENT_TYPES),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  html: z.string(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  meta: z.record(z.string(), z.unknown()),
});

/**
 * The filter result is served as is, so it must be exactly the public shape (no extra keys)
 * and plain JSON data. It is checked where it is nested deepest when served — inside a list
 * page's `items` — so it serializes from every endpoint.
 */
const isPublicContent = (value: unknown) =>
  isJsonValue({ items: [value] }) &&
  publicContentSchema.safeParse(value).success;

/** Published content only, without plugin filters. Plugins receive this as their `ContentReader`. */
export class PublishedContentReader implements ContentReader {
  constructor(private readonly repository: ContentRepository) {}

  async list(query: unknown = {}): Promise<Paginated<PublicContent>> {
    const { type, page, pageSize } = parseInput(publicQuerySchema, query);
    const { items, total } = await this.repository.list({
      type,
      status: 'published',
      page,
      pageSize,
      orderBy: 'publishedAt',
    });
    return { items: items.map(toPublic), total, page, pageSize };
  }

  async getBySlug(slug: string): Promise<PublicContent | null> {
    const record = await this.repository.findBySlug(slug);
    return record?.status === 'published' ? toPublic(record) : null;
  }

  async getById(id: string): Promise<PublicContent | null> {
    const record = await this.repository.findById(id);
    return record?.status === 'published' ? toPublic(record) : null;
  }
}

/** What the public API serves: published content after the `content.public` filter. */
export class PublicContentService {
  constructor(
    private readonly reader: PublishedContentReader,
    private readonly hooks: HookDispatcher,
  ) {}

  async list(query: unknown): Promise<Paginated<PublicContent>> {
    const page = await this.reader.list(query);
    return {
      ...page,
      items: await Promise.all(page.items.map((item) => this.present(item))),
    };
  }

  async getBySlug(slug: string): Promise<PublicContent> {
    const content = await this.reader.getBySlug(slug);
    if (!content) throw notFound('Content');
    return this.present(content);
  }

  private present(content: PublicContent): Promise<PublicContent> {
    return this.hooks.applyFilter('content.public', content, isPublicContent);
  }
}
