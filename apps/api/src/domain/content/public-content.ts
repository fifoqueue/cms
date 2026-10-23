import {
  can,
  isJsonValue,
  publicContentListQuerySchema,
  publicContentSchema,
  publicContentSummarySchema,
} from '@cms/sdk';
import type { Paginated, PublicContent, PublicContentSummary } from '@cms/sdk';
import { authorize } from '#api/domain/auth/authorization';
import type { Actor } from '#api/domain/auth/authorization';
import type { ContentReader } from '@cms/sdk/plugin';
import { toPublic, toPublicSummary } from '#api/domain/content/content-mapper';
import type {
  PublishedContentRepository,
  PublishedRecord,
} from '#api/domain/content/published-content-repository';
import type { ContentLocks } from '#api/domain/content/content-locks';
import type { Embeds } from '#api/domain/content/embeds';
import type { FieldService } from '#api/domain/content/fields';
import type { ContentTypeService } from '#api/domain/content/content-types';
import type { HookDispatcher } from '#api/domain/ports';
import type { SearchService } from '#api/domain/search/search-service';
import { notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

/**
 * The filter result is served as is, so it must be exactly the public shape (no extra keys,
 * nested terms included) and plain JSON data. It is checked where it is nested deepest when
 * served — inside a list page's `items` — so it serializes from every endpoint.
 */
const isPublicContent = (value: unknown) =>
  isJsonValue({ items: [value] }) &&
  publicContentSchema.safeParse(value).success;

const isPublicSummary = (value: unknown) =>
  isJsonValue({ items: [value] }) &&
  publicContentSummarySchema.safeParse(value).success;

/** Published content only, without plugin filters. Plugins receive this as their `ContentReader`. */
export class PublishedContentReader implements ContentReader {
  constructor(private readonly repository: PublishedContentRepository) {}

  async list(query: unknown = {}): Promise<Paginated<PublicContent>> {
    // The query schema has no status, and the repository matches published content only.
    const criteria = parseInput(publicContentListQuerySchema, query);
    const { items, total } = await this.repository.list(criteria);
    const { page, pageSize } = criteria;
    return {
      items: items.map((item) => toPublic(item)),
      total,
      page,
      pageSize,
    };
  }

  /** Like `list`, without reading or returning the body. */
  async summaries(
    query: unknown = {},
    types?: readonly string[],
  ): Promise<Paginated<PublicContentSummary>> {
    const criteria = parseInput(publicContentListQuerySchema, query);
    const { items, total } = await this.repository.summaries({
      ...criteria,
      types,
    });
    const { page, pageSize } = criteria;
    return { items: items.map(toPublicSummary), total, page, pageSize };
  }

  /** Public entries among `ids`, in that order; others are left out. */
  async summariesByIds(
    ids: readonly string[],
  ): Promise<PublicContentSummary[]> {
    const records = new Map(
      (await this.repository.summariesByIds(ids)).map((record) => [
        record.id,
        record,
      ]),
    );
    return ids.flatMap((id) => {
      const record = records.get(id);
      return record ? [toPublicSummary(record)] : [];
    });
  }

  /**
   * `unlock` decides whether a protected body may be shown (by default it stays locked);
   * `fields` projects the stored custom fields (by default none are served).
   */
  async getBySlug(
    slug: string,
    unlock: Unlock = locked,
    fields: Present = none,
  ): Promise<PublicContent | null> {
    return this.read(await this.repository.bySlug(slug), unlock, fields);
  }

  async getById(
    id: string,
    unlock: Unlock = locked,
    fields: Present = none,
  ): Promise<PublicContent | null> {
    return this.read(await this.repository.byId(id), unlock, fields);
  }

  async getPrivateById(
    id: string,
    fields: Present,
  ): Promise<PublicContent | null> {
    const content = await this.read(
      await this.repository.privateById(id),
      async () => true,
      fields,
    );
    return content
      ? { ...content, seo: { ...content.seo, noIndex: true } }
      : null;
  }

  private async read(
    record: PublishedRecord | null,
    unlock: Unlock,
    fields: Present,
  ) {
    if (!record) return null;
    const open = !record.protected || (await unlock(record.id));
    return {
      ...toPublic(record, record.protected && open),
      fields: open ? await fields(record.type, record.fields) : {},
    };
  }
}

/** Public custom field values of an entry of `type`. */
type Present = (
  type: string,
  values: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const none: Present = async () => ({});

/** Whether the current visitor unlocked the protected entry `id`. */
type Unlock = (id: string) => Promise<boolean>;

const locked: Unlock = async () => false;

/** What the public API serves: published content after the `content.public` filter. */
export class PublicContentService {
  constructor(
    private readonly reader: PublishedContentReader,
    private readonly hooks: HookDispatcher,
    private readonly locks: ContentLocks,
    private readonly embeds: Embeds,
    private readonly fields: Pick<FieldService, 'present'>,
    private readonly types: Pick<ContentTypeService, 'list'>,
    private readonly search?: Pick<SearchService, 'find'>,
  ) {}

  /**
   * Search covers only searchable types unless a type is asked for explicitly. The search
   * index answers when it is current; the database otherwise (and for author filters).
   */
  async list(query: unknown): Promise<Paginated<PublicContentSummary>> {
    const criteria = parseInput(publicContentListQuerySchema, query);
    const types =
      criteria.search && !criteria.type
        ? (await this.types.list())
            .filter((type) => type.searchable)
            .map((type) => type.key)
        : undefined;
    const page =
      (criteria.search && !criteria.author && !criteria.taxonomy
        ? await this.indexed({
            ...criteria,
            text: criteria.search,
            types: criteria.type ? [criteria.type] : types,
          })
        : null) ?? (await this.reader.summaries(criteria, types));
    return {
      ...page,
      items: await Promise.all(page.items.map((item) => this.summarize(item))),
    };
  }

  /** `proofs` are the visitor's unlock proofs (`<id>.<token>`) for protected entries. */
  async getBySlug(
    slug: string,
    proofs: readonly string[] = [],
  ): Promise<PublicContent> {
    const content = await this.reader.getBySlug(
      slug,
      (id) => this.locks.unlocked(id, proofs),
      (type, values) => this.fields.present(type, values),
    );
    if (!content) throw notFound(Errors.ContentNotFound);
    return this.present(content);
  }

  async getById(
    id: string,
    proofs: readonly string[] = [],
    actor: Actor | null = null,
  ): Promise<PublicContent | null> {
    let content = await this.reader.getById(
      id,
      (contentId) => this.locks.unlocked(contentId, proofs),
      (type, values) => this.fields.present(type, values),
    );
    if (!content && actor && can(actor, 'content.readPrivate')) {
      authorize(actor, 'content.readPrivate');
      content = await this.reader.getPrivateById(id, (type, values) =>
        this.fields.present(type, values),
      );
    }
    return content ? this.present(content) : null;
  }

  private async indexed(
    criteria: Parameters<SearchService['find']>[0],
  ): Promise<Paginated<PublicContentSummary> | null> {
    const hits = await this.search?.find(criteria);
    if (!hits) return null;
    return {
      items: await this.reader.summariesByIds(hits.ids),
      total: hits.total,
      page: criteria.page,
      pageSize: criteria.pageSize,
    };
  }

  unlock(
    id: string,
    input: unknown,
    attempt?: Parameters<ContentLocks['unlock']>[2],
  ) {
    return this.locks.unlock(id, input, attempt);
  }

  private async present(content: PublicContent): Promise<PublicContent> {
    const filtered = await this.hooks.applyFilter(
      'content.public',
      { ...content, html: await this.embeds.expand(content.html) },
      isPublicContent,
    );
    // Plugins may decorate display content, but cannot move an entry or override crawler policy.
    return publicContentSchema.parse({
      ...filtered,
      id: content.id,
      slug: content.slug,
      path: content.path,
      seo: content.seo,
    });
  }

  private async summarize(
    content: PublicContentSummary,
  ): Promise<PublicContentSummary> {
    const filtered = await this.hooks.applyFilter(
      'content.publicSummary',
      content,
      isPublicSummary,
    );
    // Same fixed routing identity and crawler policy as `present`.
    return publicContentSummarySchema.parse({
      ...filtered,
      id: content.id,
      slug: content.slug,
      path: content.path,
      seo: content.seo,
    });
  }
}
