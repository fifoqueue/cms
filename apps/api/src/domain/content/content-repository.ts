import type {
  ContentOrder,
  ContentCounts,
  PublicImage,
  AdminEntrySeo,
  ContentDocument,
  ContentStatus,
  ContentType,
  TermSummary,
  ExtraTermSummary,
} from '@cms/sdk';
import type { RevisionSave } from '#api/domain/content/revisions';

/** Stored content as read back, with its assigned terms ordered by `compareTerms`. */
export interface ContentRecord {
  createdIp?: string | null;
  createdUserAgent?: string | null;
  modifiedIp?: string | null;
  modifiedUserAgent?: string | null;
  createdById?: string | null;
  modifiedById?: string | null;
  parentId?: string | null;
  menuOrder?: number;
  id: string;
  type: ContentType;
  slug: string;
  /** Canonical route generated atomically with the content write. */
  path: string;
  title: string;
  excerpt: string;
  document: ContentDocument;
  html: string;
  status: ContentStatus;
  /** Publication time: planned while scheduled, retained when unpublished. */
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Last saved text version; independent of deletable history and status-only writes. */
  textSavedAt: Date;
  /** Set while in the trash. Trashed entries are never public. */
  trashedAt: Date | null;
  authorId: string;
  authorName: string;
  /** The author's public archive segment. */
  authorSlug: string;
  sticky: boolean;
  allowComments: boolean;
  tocOverride?: 'default' | 'always' | 'never';
  /** Approved comments; maintained by the comment store. */
  commentCount: number;
  /** Hash of the visitors' password; null when the body is not protected. */
  passwordHash: string | null;
  /** Generated from the body; public lists show it when `excerpt` is empty. */
  summary: string;
  featuredMediaId: string | null;
  /** Custom field values by key, as validated when saved. */
  fields: Record<string, unknown>;
  /** The featured image as the site shows it; null without one. */
  featuredImage: PublicImage | null;
  extraTerms?: ExtraTermSummary[];
  categories: TermSummary[];
  tags: TermSummary[];
  seo: AdminEntrySeo;
}

/** A list item: the stored record without the editor document and rendered body. */
export type ContentSummaryRecord = Omit<ContentRecord, 'document' | 'html'>;

/** Body and snapshot guards only; no authoring metadata, relations or password hash. */
export interface ContentRenderRecord extends Pick<
  ContentRecord,
  | 'id'
  | 'document'
  | 'html'
  | 'updatedAt'
  | 'status'
  | 'trashedAt'
  | 'type'
  | 'tocOverride'
> {
  protected: boolean;
}

/** What is written: the record's own fields, its search text and the assigned term ids. */
export interface ContentWrite extends Omit<
  ContentRecord,
  | 'extraTerms'
  | 'categories'
  | 'tags'
  | 'path'
  | 'authorName'
  | 'authorSlug'
  | 'trashedAt'
  | 'featuredImage'
  | 'commentCount'
  | 'textSavedAt'
> {
  /** Media the entry shows (body images and featured image); rebuilt on every save. */
  mediaIds: string[];
  /** Plain text of the document (`plainText`), searched instead of the HTML. */
  searchText: string;
  /** Distinct ids of `category` terms. */
  extraTermIds?: string[];
  categoryIds: string[];
  /** Distinct ids of `tag` terms. */
  tagIds: string[];
}

/** Conditions a content update must still meet when it is written. */
export interface ContentWriteGuard {
  expectedUpdatedAt?: Date;
  /** A user whose pending autosave of the entry refuses the write. */
  autosaveOf?: string;
  /** Source and authorized ownership snapshot for a revision restore. */
  revision?: { id: string; authorId: string; status: ContentStatus };
}

export interface ContentCriteria {
  include?: readonly string[];
  exclude?: readonly string[];
  parent?: string | null;
  day?: number;
  taxonomy?: string;
  term?: string;
  type?: ContentType;
  /** Only these types (ignored when `type` is given). */
  types?: readonly string[];
  status?: ContentStatus;
  /** `trash` lists only trashed entries; anything else excludes them. */
  view?: 'active' | 'trash';
  /** Author slug. Unknown slugs match nothing. */
  author?: string;
  sticky?: 'only' | 'exclude';
  /** Case-insensitive substring of the title, excerpt or search text. */
  search?: string;
  /** Category slug: content in that category or any of its descendants. Unknown slugs match nothing. */
  category?: string;
  /** Tag slug. Unknown slugs match nothing. */
  tag?: string;
  /** Published in this site-local year (and `month`, 1–12; ignored without a year). */
  year?: number;
  month?: number;
  page: number;
  pageSize: number;
  /** Sort field (then id); newest first unless `order` is `asc`. */
  orderBy: ContentOrder;
  order?: 'asc' | 'desc';
}

/**
 * Every write that can change public content (save, trash, publish, delete) also queues the
 * entry for the search index in the same transaction (`SearchOutbox`).
 */
export interface ContentRepository {
  counts(type?: string): Promise<ContentCounts>;
  findById(id: string): Promise<ContentRecord | null>;
  /** One narrow rendering batch; missing IDs are omitted, order is unspecified. */
  findByIds(ids: readonly string[]): Promise<ContentRenderRecord[]>;
  /** The subset of `slugs` already used by stored content, in one read, compared as the store's unique index compares them. */
  takenSlugs(slugs: readonly string[]): Promise<Set<string>>;
  /** `total` counts every item matching the criteria. */
  list(
    criteria: ContentCriteria,
  ): Promise<{ items: ContentSummaryRecord[]; total: number }>;
  /** Full non-trashed records after `afterId`, ordered by id for streaming exports. */
  exportPage(afterId: string | null, limit: number): Promise<ContentRecord[]>;
  /**
   * Returns the stored record. Throws `conflict` when the slug is taken and `invalid_input`
   * (see `checkTermKinds`) when an id is not a term of the matching taxonomy.
   * Content and its current path are saved atomically; path conflicts change neither.
   */
  insert(record: ContentWrite, revision: RevisionSave): Promise<ContentRecord>;
  /**
   * Replaces fields/assignments and moves the path atomically, retaining all previously public URLs.
   * `record.publishedAt` is written as given (the service resolves an omitted date). Throws
   * `conflict` and changes nothing when `guard.expectedUpdatedAt` differs from the stored
   * `updatedAt`, or when `guard.autosaveOf` has an autosave newer than the stored entry. Both
   * checks run under the content write lock, which autosaves take too (`RevisionRepository`).
   */
  update(
    record: ContentWrite,
    revision: RevisionSave,
    guard?: ContentWriteGuard,
  ): Promise<ContentRecord>;
  /** Also removes its term assignments, paths and revisions. */
  delete(id: string): Promise<void>;
  /** Moves the entry to the trash (`at`) or back out of it (null). */
  setTrashed(
    id: string,
    at: Date | null,
    origin?: Pick<
      ContentRecord,
      'modifiedIp' | 'modifiedUserAgent' | 'modifiedById'
    >,
  ): Promise<void>;
  /** Whether any entry, trashed or not, has `type`. */
  typeInUse(type: string): Promise<boolean>;
  /** Publishes scheduled entries that are due; returns their ids. */
  publishDue(now: Date): Promise<string[]>;
  /** Ids of entries trashed before `before`, at most `limit`. */
  expiredTrash(before: Date, limit: number): Promise<string[]>;
}

export interface DocumentRenderer {
  /** Throws `invalid_input` for documents outside the editor schema. */
  render(document: ContentDocument): string;
}
