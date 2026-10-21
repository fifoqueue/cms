import { contentInputSchema, contentListQuerySchema } from '@cms/sdk';
import type { ContentData, ContentEntry, Paginated } from '@cms/sdk';
import { conflict, notFound } from '../../shared/errors';
import { parseInput } from '../../shared/validation';
import type { Clock, HookDispatcher, IdGenerator } from '../ports';
import { toEntry } from './content-mapper';
import type {
  ContentRecord,
  ContentRepository,
  DocumentRenderer,
} from './content-repository';
import { slugify } from './slug';

export interface ContentServiceDeps {
  repository: ContentRepository;
  renderer: DocumentRenderer;
  hooks: HookDispatcher;
  ids: IdGenerator;
  clock: Clock;
}

const isContentData = (value: unknown) =>
  contentInputSchema.safeParse(value).success;

/** Authoring use cases over every content item, whatever its status. */
export class ContentService {
  constructor(private readonly deps: ContentServiceDeps) {}

  async list(query: unknown): Promise<Paginated<ContentEntry>> {
    const { type, status, page, pageSize } = parseInput(
      contentListQuerySchema,
      query,
    );
    const { items, total } = await this.deps.repository.list({
      type,
      status,
      page,
      pageSize,
      orderBy: 'updatedAt',
    });
    return { items: items.map(toEntry), total, page, pageSize };
  }

  async get(id: string): Promise<ContentEntry> {
    return toEntry(await this.require(id));
  }

  async create(input: unknown, authorId: string): Promise<ContentEntry> {
    const data = await this.prepare(input);
    const id = this.deps.ids.next();
    const now = this.deps.clock.now();
    if (data.slug) await this.assertSlugFree(data.slug);
    const record: ContentRecord = {
      id,
      type: data.type,
      slug:
        data.slug ??
        (await this.uniqueSlug(
          slugify(data.title) || `${data.type}-${id.slice(-12)}`,
        )),
      title: data.title,
      excerpt: data.excerpt,
      document: data.document,
      html: this.deps.renderer.render(data.document),
      status: data.status,
      publishedAt: data.status === 'published' ? now : null,
      createdAt: now,
      updatedAt: now,
      authorId,
    };
    await this.deps.repository.insert(record);

    const entry = toEntry(record);
    void this.deps.hooks.emit('content.created', entry);
    if (record.status === 'published')
      void this.deps.hooks.emit('content.published', entry);
    return entry;
  }

  /** Replaces the editable fields. Omitting `slug` keeps the current one. */
  async update(id: string, input: unknown): Promise<ContentEntry> {
    const current = await this.require(id);
    const data = await this.prepare(input);
    const slug = data.slug ?? current.slug;
    if (slug !== current.slug) await this.assertSlugFree(slug);
    const now = this.deps.clock.now();
    const record: ContentRecord = {
      ...current,
      type: data.type,
      slug,
      title: data.title,
      excerpt: data.excerpt,
      document: data.document,
      html: this.deps.renderer.render(data.document),
      status: data.status,
      publishedAt:
        data.status === 'published' ? (current.publishedAt ?? now) : null,
      updatedAt: now,
    };
    await this.deps.repository.update(record);

    const entry = toEntry(record);
    void this.deps.hooks.emit('content.updated', entry);
    if (record.status === 'published' && current.status !== 'published') {
      void this.deps.hooks.emit('content.published', entry);
    }
    return entry;
  }

  async remove(id: string): Promise<void> {
    const current = await this.require(id);
    await this.deps.repository.delete(id);
    void this.deps.hooks.emit('content.deleted', toEntry(current));
  }

  private async prepare(input: unknown): Promise<ContentData> {
    const data = parseInput(contentInputSchema, input);
    const filtered = await this.deps.hooks.applyFilter(
      'content.beforeSave',
      data,
      isContentData,
    );
    return contentInputSchema.parse(filtered);
  }

  private async require(id: string): Promise<ContentRecord> {
    const record = await this.deps.repository.findById(id);
    if (!record) throw notFound('Content');
    return record;
  }

  private async assertSlugFree(slug: string): Promise<void> {
    if (await this.deps.repository.findBySlug(slug))
      throw conflict(`Slug "${slug}" is already in use`);
  }

  private async uniqueSlug(base: string): Promise<string> {
    for (let attempt = 1; attempt <= 20; attempt++) {
      const candidate = attempt === 1 ? base : `${base}-${attempt}`;
      if (!(await this.deps.repository.findBySlug(candidate))) return candidate;
    }
    return `${base}-${this.deps.ids.next().slice(-8)}`;
  }
}
