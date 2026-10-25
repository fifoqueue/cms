import {
  DEFAULT_ENTRY_SEO,
  RESERVED_CONTENT_SLUGS,
  UNPUBLISHED_STATUSES,
  can,
  contentInputSchema,
  contentListQuerySchema,
} from '@cms/sdk';
import type {
  AdminContentSummary,
  ContentData,
  ContentDocument,
  ContentEntry,
  Paginated,
} from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { PasswordHasher, UserRepository } from '#api/domain/auth/ports';
import { toEntry, toEntrySummary } from '#api/domain/content/content-mapper';
import type {
  ContentRecord,
  ContentRepository,
  ContentWrite,
  ContentWriteGuard,
  DocumentRenderer,
} from '#api/domain/content/content-repository';
import {
  mediaIdsOf,
  plainText,
  summarize,
} from '#api/domain/content/plain-text';
import type { RevisionSave } from '#api/domain/content/revisions';
import type { ContentTypeService } from '#api/domain/content/content-types';
import { fieldMediaIds } from '#api/domain/content/fields';
import type { FieldService } from '#api/domain/content/fields';
import { teaserOf } from '#api/domain/content/plain-text';
import { slugify, uniqueSlug } from '#api/domain/content/slug';
import type { Clock, HookDispatcher, IdGenerator } from '#api/domain/ports';
import {
  conflict,
  forbidden,
  invalidInput,
  notFound,
  Errors,
} from '#api/shared/errors';
import { withParams } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

export interface ContentServiceDeps {
  repository: ContentRepository;
  renderer: DocumentRenderer;
  hooks: HookDispatcher;
  ids: IdGenerator;
  clock: Clock;
  users: Pick<UserRepository, 'findById'>;
  hasher: PasswordHasher;
  types: Pick<ContentTypeService, 'require'> &
    Partial<Pick<ContentTypeService, 'list'>>;
  fields: Pick<FieldService, 'validate' | 'forType'>;
  /** Checks the attributes of active plugins' blocks in a document. */
  blocks?: { check(document: ContentDocument): void };
  /** Settings → Writing: the existing category a post saved without one gets (WordPress). */
  defaultCategory?: () => Promise<string | null>;
}

/** Revisions kept per entry; older ones are pruned on save. */
export const REVISIONS_KEPT = 25;

/** `content.beforeSave` value: filters never see, set or change the password. */
const contentSaveSchema = contentInputSchema.omit({ password: true });

const isContentSave = (value: unknown) =>
  contentSaveSchema.safeParse(value).success;

const isUnpublished = (status: ContentRecord['status']) =>
  UNPUBLISHED_STATUSES.includes(status);

/** Authoring use cases over every content item, whatever its status. */
export class ContentService {
  constructor(private readonly deps: ContentServiceDeps) {}

  /** Every writer sees every entry (like WordPress); opening one needs edit rights. */
  async list(
    query: unknown,
    actor: Actor,
  ): Promise<Paginated<AdminContentSummary>> {
    authorize(actor, 'content.create');
    const validated = parseInput(contentListQuerySchema, query);
    const filtered = await this.deps.hooks.applyFilter(
      'content.query',
      validated,
      (value) => contentListQuerySchema.safeParse(value).success,
    );
    const { page, pageSize, ...filters } =
      contentListQuerySchema.parse(filtered);
    const { items, total } = await this.deps.repository.list({
      ...filters,
      page,
      pageSize,
    });
    const active = await this.deps.types.list?.();
    return {
      items: items.map((item) => ({
        ...toEntrySummary(item),
        inactiveType: active
          ? !active.some((type) => type.key === item.type)
          : false,
      })),
      total,
      page,
      pageSize,
    };
  }

  async counts(query: unknown, actor: Actor) {
    authorize(actor, 'content.create');
    const { type } = parseInput(contentListQuerySchema, query);
    return this.deps.repository.counts(type);
  }

  async get(id: string, actor: Actor): Promise<ContentEntry> {
    const record = await this.require(id);
    this.assertEditable(actor, record);
    return toEntry(record);
  }

  async create(input: unknown, actor: Actor): Promise<ContentEntry> {
    authorize(actor, 'content.create');
    const data = await this.prepare(input);
    await this.assertStatus(actor, data);
    const authorId = await this.authorFor(actor, data.authorId, actor.id);
    const id = this.deps.ids.next();
    const now = this.deps.clock.now();
    if (data.slug) await this.assertSlugFree(data.slug);
    const record = await this.deps.repository.insert(
      {
        ...(await this.fields(data, null)),
        ...this.schedule(data, null, now),
        passwordHash: await this.passwordHash(data, null),
        seo: data.seo ?? { ...DEFAULT_ENTRY_SEO },
        id,
        slug:
          data.slug ??
          (await uniqueSlug(
            slugify(data.title) || `${data.type}-${id.slice(-12)}`,
            async (candidates) =>
              new Set([
                ...RESERVED_CONTENT_SLUGS,
                ...(await this.deps.repository.takenSlugs(candidates)),
              ]),
            () => this.deps.ids.next().slice(-8),
          )),
        createdAt: now,
        updatedAt: now,
        authorId,
      },
      this.revision(actor),
    );

    const entry = toEntry(record);
    void this.deps.hooks.emit('content.created', entry);
    void this.deps.hooks.emit('content.revisionSaved', entry);
    if (this.termIds(entry).length)
      void this.deps.hooks.emit('content.termsChanged', entry);
    if (record.status === 'scheduled')
      void this.deps.hooks.emit('content.scheduled', entry);
    if (record.status === 'published')
      void this.deps.hooks.emit('content.published', entry);
    return entry;
  }

  /** Replaces editable fields. Omitted `slug`, `seo`, `password` and date keep their values. */
  async update(
    id: string,
    input: unknown,
    actor: Actor,
    revision?: ContentWriteGuard['revision'],
  ): Promise<ContentEntry> {
    const current = await this.require(id);
    this.assertEditable(actor, current);
    const data = await this.prepare(input);
    await this.assertStatus(actor, data);
    const authorId = await this.authorFor(
      actor,
      data.authorId,
      current.authorId,
    );
    const slug = data.slug ?? current.slug;
    if (slug !== current.slug) await this.assertSlugFree(slug);
    const now = this.deps.clock.now();
    const expected = data.expectedUpdatedAt
      ? new Date(data.expectedUpdatedAt)
      : undefined;
    if (expected && expected.getTime() !== current.updatedAt.getTime())
      throw conflict(Errors.ContentChanged);
    const record = await this.deps.repository.update(
      {
        ...(await this.fields(data, current)),
        ...this.schedule(data, current, now),
        passwordHash: await this.passwordHash(data, current.passwordHash),
        seo: data.seo ?? current.seo,
        id: current.id,
        slug,
        createdAt: current.createdAt,
        updatedAt: now,
        authorId,
      },
      this.revision(actor, !data.preserveAutosave),
      {
        expectedUpdatedAt: expected,
        autosaveOf: data.preserveAutosave ? actor.id : undefined,
        revision,
      },
    );

    const entry = toEntry(record);
    void this.deps.hooks.emit('content.updated', entry);
    if (record.textSavedAt.getTime() !== current.textSavedAt.getTime())
      void this.deps.hooks.emit('content.revisionSaved', entry);
    if (
      JSON.stringify(this.termIds(entry)) !==
      JSON.stringify(this.termIds(toEntry(current)))
    )
      void this.deps.hooks.emit('content.termsChanged', entry);
    if (
      record.status === 'scheduled' &&
      (current.status !== 'scheduled' ||
        current.publishedAt?.getTime() !== record.publishedAt?.getTime())
    )
      void this.deps.hooks.emit('content.scheduled', entry);
    if (revision) void this.deps.hooks.emit('content.revisionRestored', entry);
    if (record.status === 'published' && current.status !== 'published') {
      void this.deps.hooks.emit('content.published', entry);
    }
    return entry;
  }

  /** Moves the entry to the trash; it stops being public and can be restored. */
  async trash(id: string, actor: Actor): Promise<void> {
    const current = await this.require(id);
    this.assertEditable(actor, current);
    if (current.trashedAt) return;
    await this.deps.repository.setTrashed(id, this.deps.clock.now());
    void this.deps.hooks.emit(
      'content.trashed',
      toEntry(await this.require(id)),
    );
  }

  async restore(id: string, actor: Actor): Promise<void> {
    const current = await this.require(id);
    this.assertEditable(actor, current);
    if (!current.trashedAt) return;
    await this.deps.repository.setTrashed(id, null);
    void this.deps.hooks.emit(
      'content.restored',
      toEntry(await this.require(id)),
    );
  }

  /** Deletes the entry for good, with its paths, assignments and revisions. */
  async remove(id: string, actor: Actor): Promise<void> {
    const current = await this.require(id);
    this.assertEditable(actor, current);
    if (!(await this.allowed('content.deleteAllowed'))) throw forbidden();
    await this.deps.repository.delete(id);
    void this.deps.hooks.emit('content.deleted', toEntry(current));
  }

  /** Publishes scheduled entries that are due. Run by the scheduler. */
  async publishDue(): Promise<void> {
    if (!(await this.allowed('content.publishAllowed'))) return;
    for (const id of await this.deps.repository.publishDue(
      this.deps.clock.now(),
    )) {
      const record = await this.deps.repository.findById(id);
      if (record)
        void this.deps.hooks.emit('content.published', toEntry(record));
    }
  }

  /** Deletes entries that stayed in the trash longer than `days`. Run by the scheduler. */
  async emptyTrash(days: number): Promise<void> {
    const before = new Date(
      this.deps.clock.now().getTime() - days * 24 * 60 * 60 * 1000,
    );
    for (const id of await this.deps.repository.expiredTrash(before, 100)) {
      const record = await this.deps.repository.findById(id);
      if (!(await this.allowed('content.deleteAllowed'))) continue;
      await this.deps.repository.delete(id);
      if (record) void this.deps.hooks.emit('content.deleted', toEntry(record));
    }
  }

  /** The stored fields derived from validated input alone. */
  private async fields(data: ContentData, current: ContentRecord | null) {
    const type = await this.deps.types.require(data.type);
    this.deps.blocks?.check(data.document);
    const definitions = await this.deps.fields.forType(type.key);
    // Omitted values are kept on update; new entries still meet required fields.
    const fields =
      data.fields === undefined && current
        ? current.fields
        : await this.deps.fields.validate(type.key, data.fields ?? {});
    // A protected body must not be found by its words through public search.
    const locked =
      data.password === undefined
        ? (current?.passwordHash ?? null) !== null
        : !!data.password;
    const text = plainText(data.document);
    const featuredMediaId =
      data.featuredMediaId === undefined
        ? (current?.featuredMediaId ?? null)
        : data.featuredMediaId;
    return {
      type: data.type,
      title: data.title,
      excerpt: data.excerpt,
      document: data.document,
      html: this.deps.renderer.render(data.document),
      searchText: locked ? '' : text,
      summary: locked ? '' : (teaserOf(data.document) ?? summarize(text)),
      status: data.status,
      sticky: data.sticky,
      allowComments: data.allowComments,
      menuOrder:
        data.type === 'page' ? (data.menuOrder ?? current?.menuOrder ?? 0) : 0,
      // Types that do not use terms drop them.
      parentId:
        data.type === 'page'
          ? data.parentId === undefined
            ? (current?.parentId ?? null)
            : data.parentId
          : null,
      extraTermIds: [
        ...new Set(
          data.extraTermIds ??
            current?.extraTerms?.map((term) => term.id) ??
            [],
        ),
      ],
      categoryIds: type.supports.categories
        ? data.categoryIds.length || data.type !== 'post'
          ? [...new Set(data.categoryIds)]
          : await this.defaultCategories()
        : [],
      tagIds: type.supports.tags ? [...new Set(data.tagIds)] : [],
      featuredMediaId,
      fields,
      mediaIds: [
        ...new Set([
          ...mediaIdsOf(data.document),
          ...(featuredMediaId ? [featuredMediaId] : []),
          ...fieldMediaIds(definitions, fields),
        ]),
      ],
    } satisfies Partial<ContentWrite>;
  }

  private async defaultCategories() {
    const id = await this.deps.defaultCategory?.();
    return id ? [id] : [];
  }

  private termIds(entry: ContentEntry) {
    return [...entry.categories, ...entry.tags, ...entry.extraTerms]
      .map((term) => term.id)
      .sort();
  }

  /**
   * Status and publication time. `scheduled` needs a future time (a past one publishes at
   * once); an explicit time redates the entry; otherwise the stored time is kept, or set now
   * when the entry is first published or made private.
   */
  private schedule(
    data: ContentData,
    current: ContentRecord | null,
    now: Date,
  ): Pick<ContentWrite, 'status' | 'publishedAt'> {
    const kept = current?.publishedAt ?? null;
    // Every explicit time is honored; forms resend the stored time exactly when untouched.
    const requested = data.publishedAt ? new Date(data.publishedAt) : null;
    if (data.status === 'scheduled') {
      if (!requested)
        throw invalidInput(Errors.ScheduleDateRequired, [
          { path: 'publishedAt', message: Errors.ScheduleDateRequired },
        ]);
      return requested > now
        ? { status: 'scheduled', publishedAt: requested }
        : { status: 'published', publishedAt: requested };
    }
    return {
      status: data.status,
      publishedAt:
        requested ?? kept ?? (isUnpublished(data.status) ? null : now),
    };
  }

  private async passwordHash(data: ContentData, current: string | null) {
    if (data.password === undefined) return current;
    return data.password ? this.deps.hasher.hash(data.password) : null;
  }

  private revision(actor: Actor, clearAutosave = true): RevisionSave {
    return {
      id: this.deps.ids.next(),
      authorId: actor.id,
      keep: REVISIONS_KEPT,
      clearAutosave,
    };
  }

  private async prepare(input: unknown): Promise<ContentData> {
    const { password, ...data } = parseInput(contentInputSchema, input);
    const filtered = await this.deps.hooks.applyFilter(
      'content.beforeSave',
      data,
      isContentSave,
    );
    // The password and concurrency check are the client's, never a filter's.
    return {
      ...contentSaveSchema.parse(filtered),
      password,
      expectedUpdatedAt: data.expectedUpdatedAt,
      preserveAutosave: data.preserveAutosave,
    };
  }

  /**
   * Own entries are editable while unpublished, and otherwise with `content.publish`; other
   * users' entries need `content.editOthers`.
   */
  assertEditable(actor: Actor, record: ContentRecord) {
    authorize(actor, 'content.create');
    if (record.authorId !== actor.id) authorize(actor, 'content.editOthers');
    else if (!isUnpublished(record.status)) authorize(actor, 'content.publish');
  }

  /** Only `content.publish` may publish, schedule or make private. */
  private async assertStatus(actor: Actor, data: ContentData) {
    if (!isUnpublished(data.status)) {
      authorize(actor, 'content.publish');
      if (!(await this.allowed('content.publishAllowed'))) throw forbidden();
    }
  }

  private async allowed(
    name: 'content.publishAllowed' | 'content.deleteAllowed',
  ) {
    let allowed = true;
    await this.deps.hooks.applyFilter(name, allowed, (value) => {
      if (typeof value !== 'boolean') return false;
      allowed = allowed && value;
      return value === allowed;
    });
    return allowed;
  }

  /** The requested author when the actor may assign one, else `fallback`. */
  private async authorFor(
    actor: Actor,
    requested: string | undefined,
    fallback: string,
  ) {
    if (!requested || requested === fallback) return fallback;
    if (!can(actor, 'content.editOthers')) throw forbidden();
    if (!(await this.deps.users.findById(requested)))
      throw invalidInput(Errors.UserNotFound, [
        { path: 'authorId', message: Errors.UserNotFound },
      ]);
    return requested;
  }

  async require(id: string): Promise<ContentRecord> {
    const record = await this.deps.repository.findById(id);
    if (!record) throw notFound(Errors.ContentNotFound);
    return record;
  }

  private async assertSlugFree(slug: string): Promise<void> {
    if ((await this.deps.repository.takenSlugs([slug])).size)
      throw conflict(
        Errors.SlugInUse,
        withParams(Errors.SlugInUse, { slug }, 'slug'),
      );
  }
}
