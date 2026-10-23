// In-memory adapters for tests. They honour the same port contracts as the Prisma adapters.
import { stringifyJson } from '@cms/sdk';
import type { TaxonomyType, UserProfile } from '@cms/sdk';
import type { UserRecord } from '#api/domain/auth/ports';
import { ContentLocks } from '#api/domain/content/content-locks';
import { ContentTypeService } from '#api/domain/content/content-types';
import { FieldService } from '#api/domain/content/fields';
import type { PluginDefinition } from '@cms/sdk/plugin';
import type {
  ContentCriteria,
  ContentRecord,
  ContentRepository,
  ContentWrite,
  ContentWriteGuard,
} from '#api/domain/content/content-repository';
import { checkContentParent } from '#api/domain/content/hierarchy';
import { checkTermKinds } from '#api/domain/content/term-assignment';
import { compareTerms, withDescendants } from '#api/domain/taxonomy/hierarchy';
import type { TaxonomyTermRecord } from '#api/domain/taxonomy/taxonomy-repository';
import type { Clock, IdGenerator } from '#api/domain/ports';
import type {
  CommittedBundle,
  PluginDataRepository,
  PluginDataScope,
  PluginModuleLoader,
  PluginPackageStore,
  PluginStateRecord,
  PluginStateRepository,
  StagedBundle,
} from '#api/plugin-runtime/ports';
import { conflict, invalidInput, Errors } from '#api/shared/errors';
import type { Logger } from '#api/shared/logger';
import { MemoryPermalinkRepository } from '#test/support/memory-permalinks';
import { MemoryRevisionRepository } from '#test/support/memory-revisions';

/**
 * Content rows keep their term ids; `terms` is the term table, shared with
 * `MemoryTaxonomyRepository` (`memory-taxonomy.ts`) so both see the same relations.
 */
export class MemoryContentRepository implements ContentRepository {
  readonly rows = new Map<string, ContentWrite>();
  readonly trashed = new Map<string, Date>();
  /** Approved comment counts, kept by `MemoryCommentRepository`. */
  readonly commentCounts = new Map<string, number>();
  readonly terms = new Map<string, TaxonomyTermRecord>();
  readonly permalinks = new MemoryPermalinkRepository(() => this.rows.values());

  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? this.toRecord(row) : null;
  }

  async findBySlug(slug: string) {
    const row = [...this.rows.values()].find((row) => row.slug === slug);
    return row ? this.toRecord(row) : null;
  }

  async takenSlugs(slugs: readonly string[]) {
    return new Set(
      [...this.rows.values()]
        .map((row) => row.slug)
        .filter((slug) => slugs.includes(slug)),
    );
  }

  async setTrashed(id: string, at: Date | null) {
    if (at) this.trashed.set(id, at);
    else this.trashed.delete(id);
  }

  /** Like the Prisma adapter: in the write queue, advancing each version. */
  publishDue(now: Date) {
    return this.exclusive(async () => {
      const due = [...this.rows.values()].filter(
        (row) =>
          row.status === 'scheduled' &&
          !this.trashed.has(row.id) &&
          row.publishedAt &&
          row.publishedAt <= now,
      );
      for (const row of due) {
        row.status = 'published';
        row.updatedAt =
          now > row.updatedAt ? now : new Date(row.updatedAt.getTime() + 1);
      }
      return due.map((row) => row.id);
    });
  }

  async expiredTrash(before: Date, limit: number) {
    return [...this.trashed]
      .filter(([, at]) => at < before)
      .slice(0, limit)
      .map(([id]) => id);
  }

  async typeInUse(type: string) {
    return [...this.rows.values()].some((row) => row.type === type);
  }

  async list({
    type,
    status,
    view,
    author,
    sticky,
    types,
    search,
    taxonomy,
    term,
    category,
    tag,
    year,
    month,
    page,
    pageSize,
    orderBy,
    order = 'desc',
  }: ContentCriteria) {
    const needle = search?.toLowerCase();
    const categoryIds = category && this.categoryScope(category);
    const tagId = tag && this.termId('tag', tag);
    const customRoot =
      taxonomy && term ? this.termId(taxonomy, term) : undefined;
    const customIds =
      taxonomy && term
        ? customRoot
          ? withDescendants([...this.terms.values()], customRoot)
          : []
        : null;
    const matches = [...this.rows.values()]
      .filter(
        (row) =>
          (!customIds ||
            (row.extraTermIds ?? []).some((id) => customIds.includes(id))) &&
          (!type || row.type === type) &&
          (!!type || !types || types.includes(row.type)) &&
          (!status || row.status === status) &&
          this.trashed.has(row.id) === (view === 'trash') &&
          (!author || row.authorId === author) &&
          (!sticky || row.sticky === (sticky === 'only')) &&
          (!year ||
            (row.publishedAt?.getUTCFullYear() === year &&
              (!month || row.publishedAt.getUTCMonth() + 1 === month))) &&
          (!needle ||
            [row.title, row.excerpt, row.searchText].some((text) =>
              text.toLowerCase().includes(needle),
            )) &&
          (categoryIds === undefined ||
            row.categoryIds.some((id) => categoryIds.includes(id))) &&
          (tagId === undefined || row.tagIds.includes(tagId)),
      )
      .sort((a, b) => {
        // Newest/largest first, then id; `asc` reverses both.
        const key = (row: ContentWrite) =>
          orderBy === 'title'
            ? row.title
            : orderBy === 'author'
              ? row.authorId
              : orderBy === 'commentCount'
                ? (this.commentCounts.get(row.id) ?? 0)
                : (row[orderBy]?.getTime() ?? 0);
        const [left, right] = [key(a), key(b)];
        const compared =
          typeof left === 'string'
            ? String(right).localeCompare(left)
            : (right as number) - left;
        return (
          (compared || (a.id < b.id ? 1 : -1)) * (order === 'asc' ? -1 : 1)
        );
      });
    return {
      items: matches
        .slice((page - 1) * pageSize, page * pageSize)
        .map((row) => this.toRecord(row))
        .map(({ document: _document, html: _html, ...summary }) => summary),
      total: matches.length,
    };
  }

  async exportPage(afterId: string | null, limit: number) {
    return [...this.rows.values()]
      .filter(
        (row) => !this.trashed.has(row.id) && (!afterId || row.id > afterId),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((row) => this.toRecord(row));
  }

  insert(record: ContentWrite) {
    return this.exclusive(() => this.add(record));
  }

  private async add(record: ContentWrite) {
    await checkContentParent(
      { id: record.id, type: record.type, parentId: record.parentId ?? null },
      async (id) => {
        const row = this.rows.get(id);
        return row
          ? { id: row.id, type: row.type, parentId: row.parentId ?? null }
          : null;
      },
    );
    this.checkTerms(record);
    if (await this.findBySlug(record.slug))
      throw conflict('Slug is already in use');
    await this.permalinks.assign(record, false);
    this.rows.set(record.id, structuredClone(record));
    return this.toRecord(record);
  }

  /** Revisions and autosaves of these entries, sharing this store's write queue. */
  readonly revisions: MemoryRevisionRepository = new MemoryRevisionRepository({
    exclusive: (task) => this.exclusive(task),
    savedAt: (id) => this.rows.get(id)?.updatedAt,
  });

  /** Content writes and autosaves run one at a time, like the Prisma adapter's write lock. */
  private writing: Promise<unknown> = Promise.resolve();
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writing.then(task, task);
    this.writing = run.catch(() => undefined);
    return run;
  }

  update(record: ContentWrite, guard: ContentWriteGuard = {}) {
    return this.exclusive(() => this.write(record, guard));
  }

  private async write(input: ContentWrite, guard: ContentWriteGuard) {
    const stored = this.rows.get(input.id);
    // The version (`updatedAt`) strictly advances, so equal clocks never share one.
    const record =
      stored && input.updatedAt <= stored.updatedAt
        ? { ...input, updatedAt: new Date(stored.updatedAt.getTime() + 1) }
        : input;
    if (
      guard.expectedUpdatedAt &&
      stored?.updatedAt.getTime() !== guard.expectedUpdatedAt.getTime()
    )
      throw conflict(Errors.ContentChanged);
    if (
      guard.autosaveOf &&
      stored &&
      this.revisions.pendingNow(record.id, guard.autosaveOf, stored.updatedAt)
    )
      throw conflict(Errors.ContentAutosavePending);
    if (
      record.type !== 'page' &&
      [...this.rows.values()].some((row) => row.parentId === record.id)
    )
      throw invalidInput(Errors.ContentParentInvalid);
    await checkContentParent(
      { id: record.id, type: record.type, parentId: record.parentId ?? null },
      async (id) => {
        const row = this.rows.get(id);
        return row
          ? { id: row.id, type: row.type, parentId: row.parentId ?? null }
          : null;
      },
    );
    this.checkTerms(record);
    const other = await this.findBySlug(record.slug);
    if (other && other.id !== record.id)
      throw conflict('Slug is already in use');
    const current = this.rows.get(record.id);
    await this.permalinks.assign(record, current?.publishedAt != null);
    this.rows.set(record.id, structuredClone(record));
    return this.toRecord(record);
  }

  delete(id: string) {
    return this.exclusive(() => this.erase(id));
  }

  private async erase(id: string) {
    const rows = structuredClone([...this.rows]);
    const paths = structuredClone([...this.permalinks.paths]);
    try {
      this.permalinks.remove(id);
      this.rows.delete(id);
      for (const row of this.rows.values())
        if (row.parentId === id) row.parentId = null;
      await this.permalinks.saveSettings(await this.permalinks.readSettings());
      this.trashed.delete(id);
    } catch (caught) {
      this.rows.clear();
      for (const [key, row] of rows) this.rows.set(key, row);
      this.permalinks.paths.clear();
      for (const [key, path] of paths) this.permalinks.paths.set(key, path);
      throw caught;
    }
  }

  private checkTerms(record: ContentWrite) {
    checkTermKinds(
      record,
      new Map([...this.terms.values()].map((term) => [term.id, term.taxonomy])),
    );
  }

  private termId(taxonomy: TaxonomyType, slug: string) {
    return [...this.terms.values()].find(
      (term) => term.taxonomy === taxonomy && term.slug === slug,
    )?.id;
  }

  /** Ids of the category and its descendants; empty for unknown slugs (matches nothing). */
  private categoryScope(slug: string): string[] {
    const rootId = this.termId('category', slug);
    return rootId ? withDescendants([...this.terms.values()], rootId) : [];
  }

  private toRecord(row: ContentWrite): ContentRecord {
    const path = this.permalinks.current(row.id);
    if (path === null) throw new Error('Content has no current path');
    const summaries = (ids: string[]) =>
      ids
        .map((id) => this.terms.get(id))
        .filter((term) => term !== undefined)
        .sort(compareTerms)
        .map(({ id, name, slug }) => ({ id, name, slug }));
    return {
      id: row.id,
      type: row.type,
      slug: row.slug,
      path,
      title: row.title,
      excerpt: row.excerpt,
      document: structuredClone(row.document),
      html: row.html,
      status: row.status,
      publishedAt: row.publishedAt && new Date(row.publishedAt),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      trashedAt: this.trashed.get(row.id) ?? null,
      authorId: row.authorId,
      // Users live elsewhere in tests; the id doubles as display name and slug.
      authorName: row.authorId,
      authorSlug: row.authorId,
      sticky: row.sticky,
      allowComments: row.allowComments,
      commentCount: this.commentCounts.get(row.id) ?? 0,
      passwordHash: row.passwordHash,
      summary: row.summary,
      featuredMediaId: row.featuredMediaId,
      fields: structuredClone(row.fields),
      // The media table lives elsewhere in tests; featured images are not resolved.
      featuredImage: null,
      extraTerms: summaries(row.extraTermIds ?? []).map((term) => ({
        ...term,
        taxonomy: this.terms.get(term.id)!.taxonomy,
      })),
      parentId: row.parentId ?? null,
      categories: summaries(row.categoryIds),
      tags: summaries(row.tagIds),
      seo: structuredClone(row.seo),
    };
  }
}

/** Stores JSON text like `PrismaPluginDataRepository`, so values round-trip identically. */
export class MemoryPluginData implements PluginDataRepository {
  readonly rows = new Map<string, string>();

  async get(pluginId: string, scope: PluginDataScope, key: string) {
    const json = this.rows.get(`${pluginId}/${scope}/${key}`);

    return json === undefined ? undefined : (JSON.parse(json) as unknown);
  }

  async set(
    pluginId: string,
    scope: PluginDataScope,
    key: string,
    value: unknown,
  ) {
    this.rows.set(`${pluginId}/${scope}/${key}`, stringifyJson(value));
  }

  async delete(pluginId: string, scope: PluginDataScope, key: string) {
    this.rows.delete(`${pluginId}/${scope}/${key}`);
  }

  async entries(pluginId: string, scope: PluginDataScope) {
    const prefix = `${pluginId}/${scope}/`;
    return Object.fromEntries(
      [...this.rows]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, json]) => [
          key.slice(prefix.length),
          JSON.parse(json) as unknown,
        ]),
    );
  }

  deleteAll(pluginId: string) {
    for (const key of this.rows.keys())
      if (key.startsWith(`${pluginId}/`)) this.rows.delete(key);
  }
}

export class MemoryPluginState implements PluginStateRepository {
  readonly rows = new Map<string, PluginStateRecord>();

  constructor(private readonly data: MemoryPluginData) {}

  async list() {
    return [...this.rows.values()].map((row) => ({ ...row }));
  }

  async save(record: PluginStateRecord) {
    this.rows.set(record.id, { ...record });
  }

  async setEnabled(id: string, enabled: boolean) {
    const row = this.rows.get(id);
    if (row) row.enabled = enabled;
  }

  async delete(id: string) {
    this.rows.delete(id);
    this.data.deleteAll(id);
  }
}

/**
 * Package store + loader pair where a bundle "source" is a key into `modules`.
 * Lets tests install plugin definitions without touching the file system.
 */
export class MemoryBundles implements PluginPackageStore, PluginModuleLoader {
  readonly modules = new Map<string, unknown>();
  /** Bundle sources by path: `staging:<n>` while staged, `<plugin-id>:<entry>` once committed. */
  readonly files = new Map<string, string>();
  private uploads = 0;

  register(source: string, definition: PluginDefinition | unknown) {
    this.modules.set(source, definition);
    return source;
  }

  async stage(source: string): Promise<StagedBundle> {
    const path = `staging:${++this.uploads}`;
    this.files.set(path, source);
    return { path, discard: async () => void this.files.delete(path) };
  }

  async commit(
    bundle: StagedBundle,
    pluginId: string,
  ): Promise<CommittedBundle> {
    const source = this.files.get(bundle.path);
    if (source === undefined) throw new Error(`No bundle at ${bundle.path}`);

    this.files.delete(bundle.path);
    const entry = `${source}@${bundle.path.slice('staging:'.length)}`;
    const path = this.locate(pluginId, entry);
    this.files.set(path, source);

    return {
      entry,
      prune: async () => {
        for (const other of this.files.keys())
          if (other.startsWith(`${pluginId}:`) && other !== path)
            this.files.delete(other);
      },
    };
  }

  locate(pluginId: string, entry: string) {
    return `${pluginId}:${entry}`;
  }

  async remove(pluginId: string) {
    for (const path of this.files.keys())
      if (path.startsWith(`${pluginId}:`)) this.files.delete(path);
  }

  async load(path: string) {
    const source = this.files.get(path);
    if (source === undefined) throw new Error(`No bundle at ${path}`);
    if (!this.modules.has(source)) throw new Error('Module evaluation failed');
    return this.modules.get(source);
  }
}

export const sequentialIds = (): IdGenerator => {
  let next = 0;
  return {
    next: () => `00000000-0000-7000-8000-${String(++next).padStart(12, '0')}`,
  };
};

export const fixedClock = (
  iso = '2026-01-01T00:00:00.000Z',
): Clock & { set(iso: string): void } => {
  let now = new Date(iso);
  return {
    now: () => new Date(now),
    set: (value) => void (now = new Date(value)),
  };
};

export const recordingLogger = () => {
  const lines: string[] = [];
  const logger: Logger = {
    info: (message) => void lines.push(`info ${message}`),
    warn: (message) => void lines.push(`warn ${message}`),
    error: (message) => void lines.push(`error ${message}`),
  };
  return { logger, lines };
};

/** An administrator acting in service tests. */
export const ADMIN = { id: 'user', role: 'administrator' } as const;

/** A stored user with every field, for repository fixtures. */
export const userRecord = (
  overrides: Partial<UserRecord> & Pick<UserRecord, 'id'>,
): UserRecord => ({
  email: `${overrides.id}@example.com`,
  name: overrides.id,
  passwordHash: 'x',
  role: 'administrator',
  slug: overrides.id.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  bio: '',
  locale: '',
  createdAt: new Date(0),
  ...overrides,
});

/** A signed-in profile for HTTP and SSO fixtures. */
export const profile = (
  overrides: Partial<UserProfile> & Pick<UserProfile, 'id'>,
): UserProfile => ({
  email: `${overrides.id}@example.com`,
  name: overrides.id,
  role: 'administrator',
  slug: overrides.id,
  bio: '',
  locale: '',
  ...overrides,
});

/** No other users exist: author changes are rejected as unknown. */
export const noUsers = { findById: async () => null };

/** Readable stand-in for the password hasher. */
export const plainHasher = {
  hash: async (value: string) => `hash:${value}`,
  verify: async (value: string, hash: string) => hash === `hash:${value}`,
};

/** Deterministic stand-in for the HMAC signer. */
export const plainSigner = {
  sign: (value: string) => `sig(${value.length})${value.slice(-4)}`,
  verify: (value: string, signature: string) =>
    signature === `sig(${value.length})${value.slice(-4)}`,
};

/** Locks for `PublicContentService` over a published repository. */
export const testLocks = (
  repository: {
    passwordHash(id: string): Promise<string | null>;
  },
  protection?: ConstructorParameters<typeof ContentLocks>[0]['protection'],
) =>
  new ContentLocks({
    repository,
    hasher: plainHasher,
    signer: plainSigner,
    clock: fixedClock(),
    protection,
  });

/** Plain settings storage for services that keep definitions in core settings. */
export class MemorySettings {
  async list(prefix: string): Promise<Record<string, unknown>> {
    return Object.fromEntries(
      [...this.values]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key, structuredClone(value)]),
    );
  }
  readonly values = new Map<string, unknown>();
  async get(key: string) {
    return structuredClone(this.values.get(key));
  }
  async set(key: string, value: unknown) {
    this.values.set(key, structuredClone(value));
  }
}

/** Content types with only the built-ins, unless a test adds more through `settings`. */
export const testTypes = (settings = new MemorySettings()) =>
  new ContentTypeService(settings, async () => false);

/** Custom fields without media; image fields resolve to nothing. */
export const testFields = (settings = new MemorySettings()) =>
  new FieldService({ settings, images: async () => new Map() });
