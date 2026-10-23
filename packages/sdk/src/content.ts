import { Errors } from '#sdk/errors';
import { extraTermSummarySchema, taxonomyTypeSchema } from '#sdk/taxonomy';
import { z } from 'zod';
import { CONTENT_SLUG } from '#sdk/common';
import { termSummarySchema } from '#sdk/taxonomy';
import { permalinkPathSchema } from '#sdk/permalinks';
import { publicImageSchema } from '#sdk/media';
import {
  BUILTIN_CONTENT_TYPES,
  contentTypeKeySchema,
  fieldValuesSchema,
} from '#sdk/content-types';
import {
  adminEntrySeoSchema,
  publicEntrySeoSchema,
  seoInputSchema,
} from '#sdk/seo';
import { PAGINATION_MAX_PAGE } from '#sdk/common';

/** The built-in types; sites may define more (see `contentTypeSchema`). */
export const CONTENT_TYPES = BUILTIN_CONTENT_TYPES;
/**
 * `pending` awaits review; `scheduled` becomes `published` at `publishedAt`; `private` is visible
 * only in the administration. Only `published` content is public.
 */
export const CONTENT_STATUSES = [
  'draft',
  'pending',
  'scheduled',
  'published',
  'private',
] as const;

/** Statuses an author may save without `content.publish`. */
export const UNPUBLISHED_STATUSES: readonly ContentStatus[] = [
  'draft',
  'pending',
];

/** A content type key: one of `CONTENT_TYPES` or a custom type. */
export type ContentType = string;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_DOCUMENT_LIMITS = {
  depth: 100,
  nodes: 10_000,
} as const;

/** Bounds untrusted trees before ProseMirror or recursive content helpers read them. */
const documentWithinLimits = (document: unknown) => {
  const stack = [{ value: document, depth: 0 }];
  let nodes = 0;

  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    if (frame.depth > CONTENT_DOCUMENT_LIMITS.depth) return false;
    if (typeof frame.value !== 'object' || frame.value === null) continue;
    if (++nodes > CONTENT_DOCUMENT_LIMITS.nodes) return false;

    const values = Array.isArray(frame.value)
      ? frame.value
      : Object.values(frame.value);
    for (const value of values) stack.push({ value, depth: frame.depth + 1 });
  }

  return true;
};

/** Tiptap JSON. The API also checks the exact editor schema before storing it. */
export const contentDocumentSchema = z
  .looseObject({
    type: z.literal('doc'),
    content: z
      .array(z.record(z.string(), z.unknown()))
      .max(CONTENT_DOCUMENT_LIMITS.nodes)
      .optional(),
  })
  .refine(documentWithinLimits, 'Document is too large or deeply nested');

export type ContentDocument = z.infer<typeof contentDocumentSchema>;

/** Only the admin area owns a root slug. Archives and query-string search preserve legacy URLs. */
export const RESERVED_CONTENT_SLUGS: readonly string[] = ['admin'];

const termIdsSchema = z
  .array(z.string().trim().min(1).max(36))
  .max(100)
  .default([]);

export const contentInputSchema = z.object({
  type: contentTypeKeySchema,
  title: z.string().trim().min(1).max(255),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(191)
    .regex(CONTENT_SLUG)
    .refine(
      (slug) => !RESERVED_CONTENT_SLUGS.includes(slug),
      'Slug is reserved',
    )
    .optional(),
  excerpt: z.string().trim().max(1000).default(''),
  document: contentDocumentSchema,
  status: z.enum(CONTENT_STATUSES).default('draft'),
  /** Ids of `category` terms. */
  categoryIds: termIdsSchema,
  /** Ids of `tag` terms. */
  parentId: z.string().min(1).max(36).nullable().optional(),
  tagIds: termIdsSchema,
  /** Ids of custom taxonomy terms. Omitted keeps the stored ones (no default, unlike the others). */
  extraTermIds: z.array(z.string().trim().min(1).max(36)).max(100).optional(),
  /** Omission preserves existing SEO on update; new entries receive defaults. */
  seo: seoInputSchema.optional(),
  /** Another author than the signed-in user; needs `content.editOthers`. Omitted keeps the current author. */
  authorId: z.string().trim().min(1).max(36).optional(),
  /**
   * Publication time. Required for `scheduled` (in the future); for other statuses it changes
   * the date of published content. Omitted keeps the stored date (or uses now on first publish).
   */
  publishedAt: z.iso.datetime({ offset: true }).optional(),
  /** Pinned to the top of the first home page. */
  sticky: z.boolean().default(false),
  /** Visitors may comment, if the type supports comments and discussion is on. */
  allowComments: z.boolean().default(true),
  /** Visitors must enter it to read the body. Omitted keeps the current one; empty removes it. */
  password: z.string().max(200).optional(),
  /** Custom field values by key; validated against the type's fields. Omitted keeps them. */
  fields: fieldValuesSchema.optional(),
  /** An image from the media library shown with the entry. Omitted keeps it; null removes it. */
  featuredMediaId: z.string().trim().min(1).max(36).nullable().optional(),
  /**
   * Updates only: the `updatedAt` the client last read. When the stored entry was saved since,
   * the update is refused with `conflict` and nothing changes.
   */
  expectedUpdatedAt: z.iso.datetime({ offset: true }).optional(),
  /**
   * Updates only, for partial editors that copy the stored body (Quick Edit, Bulk Edit): the
   * save is refused with `conflict` while the user has a pending autosave of the entry, and
   * never discards one, so unsaved editor text survives.
   */
  preserveAutosave: z.boolean().optional(),
});

/** What clients send when creating or replacing content. */
export type ContentInput = z.input<typeof contentInputSchema>;
/** Validated content input, with defaults applied. */
export type ContentData = z.output<typeof contentInputSchema>;

const termSlugFilterSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(191)
  .regex(CONTENT_SLUG)
  .optional();

const listFilters = {
  taxonomy: taxonomyTypeSchema.optional(),
  term: termSlugFilterSchema,
  type: contentTypeKeySchema.optional(),
  /** Author slug. */
  author: termSlugFilterSchema,
  /** `only` lists sticky entries, `exclude` everything else. */
  sticky: z.enum(['only', 'exclude']).optional(),
  /** Entries published in this UTC year (and `month`, 1–12). */
  year: z.coerce.number().int().min(1970).max(9999).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  /** Case-insensitive text in the title, excerpt or body text (not the HTML markup). Blank means no filter. */
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((search) => search || undefined),
  /** Category slug; includes content in its descendant categories. */
  category: termSlugFilterSchema,
  /** Tag slug. */
  tag: termSlugFilterSchema,
  page: z.coerce.number().int().min(1).max(PAGINATION_MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
};

/** Admin list sort columns: modified, date, title, author name and approved comments. */
export const CONTENT_ORDERS = [
  'updatedAt',
  'publishedAt',
  'title',
  'author',
  'commentCount',
] as const;

export type ContentOrder = (typeof CONTENT_ORDERS)[number];

/** Admin listing: every status unless `status` is given; the trash only with `view=trash`. */
export const contentListQuerySchema = z
  .object({
    ...listFilters,
    status: z.enum(CONTENT_STATUSES).optional(),
    view: z.enum(['active', 'trash']).default('active'),
    /** Sort field, then id in the same direction. */
    orderBy: z.enum(CONTENT_ORDERS).default('updatedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine((value) => Boolean(value.taxonomy) === Boolean(value.term), {
    path: ['term'],
    message: Errors.TaxonomyFilterPair,
  });

export type ContentListQuery = z.input<typeof contentListQuerySchema>;

/** Public listing: published content only. Unknown keys (including `status`) are ignored. */
export const publicContentListQuerySchema = z
  .object(listFilters)
  .refine((value) => Boolean(value.taxonomy) === Boolean(value.term), {
    path: ['term'],
    message: Errors.TaxonomyFilterPair,
  });

export type PublicContentListQuery = z.input<
  typeof publicContentListQuerySchema
>;

/** Full content record, visible to authenticated users only. Allowlist: undeclared keys are stripped. */
export const adminContentSchema = z.object({
  id: z.string(),
  type: contentTypeKeySchema,
  slug: z.string(),
  path: permalinkPathSchema,
  title: z.string(),
  excerpt: z.string(),
  document: contentDocumentSchema,
  html: z.string(),
  status: z.enum(CONTENT_STATUSES),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Set while the entry is in the trash. */
  trashedAt: z.string().nullable(),
  parentId: z.string().nullable().default(null),
  authorId: z.string(),
  authorName: z.string(),
  sticky: z.boolean(),
  allowComments: z.boolean(),
  /** Approved comments. */
  commentCount: z.number().int(),
  /** Whether a password protects the body. The password itself is never returned. */
  protected: z.boolean(),
  featuredMediaId: z.string().nullable(),
  featuredImage: publicImageSchema.nullable(),
  /** Custom field values by key, public or not. */
  fields: z.record(z.string(), z.unknown()),
  extraTerms: z.array(extraTermSummarySchema).default([]),
  categories: z.array(termSummarySchema),
  tags: z.array(termSummarySchema),
  seo: adminEntrySeoSchema,
});

/** Same schema as `adminContentSchema`, under the `ContentEntry` name. */
export const contentEntrySchema = adminContentSchema;

export type ContentEntry = z.output<typeof adminContentSchema>;
export type AdminContent = ContentEntry;

/** Admin list item: the full record without the editor document and rendered body. */
export const adminContentSummarySchema = adminContentSchema.omit({
  document: true,
  html: true,
  fields: true,
});

export type AdminContentSummary = z.output<typeof adminContentSummarySchema>;

const strictTermSummarySchema = z.strictObject(termSummarySchema.shape);

/**
 * Published content as served by the public API, and the only accepted `content.public` filter
 * result: exactly these keys, nested terms included.
 */
export const publicContentSchema = z.strictObject({
  id: z.string(),
  type: contentTypeKeySchema,
  slug: z.string(),
  path: permalinkPathSchema,
  title: z.string(),
  excerpt: z.string(),
  html: z.string(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  extraTerms: z.array(extraTermSummarySchema).default([]),
  categories: z.array(strictTermSummarySchema),
  tags: z.array(strictTermSummarySchema),
  /** The author's public name and archive slug; never their id or email. */
  author: z.strictObject({ name: z.string(), slug: z.string() }).nullable(),
  sticky: z.boolean(),
  /** Approved comments. */
  commentCount: z.number().int(),
  /** The body (`html`) and excerpt are empty until the visitor unlocks it with the password. */
  protected: z.boolean(),
  featuredImage: publicImageSchema.nullable(),
  /** Public custom fields by key (image fields as `PublicImage`). Empty while protected. */
  fields: z.record(z.string(), z.unknown()),
  seo: z.strictObject(publicEntrySeoSchema.shape),
  /**
   * Data added by plugins through the `content.public` filter. Values must be JSON data
   * (`isJsonValue`); otherwise the filter result is discarded. Frontends must tolerate any shape.
   */
  meta: z.record(z.string(), z.unknown()),
});

export type PublicContent = z.output<typeof publicContentSchema>;

/**
 * Published content as listed by the public API, and the only accepted `content.publicSummary`
 * filter result: `publicContentSchema` without the rendered body.
 */
export const publicContentSummarySchema = publicContentSchema.omit({
  html: true,
  fields: true,
});

export type PublicContentSummary = z.output<typeof publicContentSummarySchema>;

/** The published entries of the same type just before and after one (WordPress post navigation). */
export const publicAdjacentSchema = z.strictObject({
  previous: publicContentSummarySchema.nullable(),
  next: publicContentSummarySchema.nullable(),
});

export type PublicAdjacent = z.output<typeof publicAdjacentSchema>;

export const adjacentQuerySchema = z.object({
  contentId: z.string().trim().min(1).max(36),
});

/** Months with published posts (UTC), newest first. */
export const publicMonthSchema = z.strictObject({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  count: z.number().int().min(0),
});

export type PublicMonth = z.output<typeof publicMonthSchema>;

export const monthsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(12),
});

export const CONTENT_REVISION_KINDS = ['revision', 'autosave'] as const;

/** A saved version of an entry's text, listed in the editor. */
export const contentRevisionSummarySchema = z.object({
  id: z.string(),
  kind: z.enum(CONTENT_REVISION_KINDS),
  authorName: z.string(),
  createdAt: z.string(),
  title: z.string(),
});

export type ContentRevisionSummary = z.output<
  typeof contentRevisionSummarySchema
>;

export const contentRevisionSchema = contentRevisionSummarySchema.extend({
  excerpt: z.string(),
  document: contentDocumentSchema,
});

export type ContentRevision = z.output<typeof contentRevisionSchema>;

/** Unsaved editor text, kept per user and entry until the entry is saved. */
export const autosaveInputSchema = contentInputSchema.pick({
  title: true,
  excerpt: true,
  document: true,
});

export type AutosaveInput = z.input<typeof autosaveInputSchema>;

/** A short-lived link to see unpublished changes rendered by the site. */
export const previewTokenSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
});

export type PreviewToken = z.output<typeof previewTokenSchema>;

export const contentUnlockSchema = z.object({
  password: z.string().min(1).max(200),
});

/** Proof that a visitor entered an entry's password, kept by the frontend in a cookie. */
export const contentUnlockedSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
});

export type ContentUnlocked = z.output<typeof contentUnlockedSchema>;

/** Header carrying unlock proofs (`<id>.<token>`, comma separated) from the frontend. */
export const CONTENT_UNLOCK_HEADER = 'x-cms-unlock';

/** A public author archive. */
export const publicAuthorSchema = z.object({
  name: z.string(),
  slug: z.string(),
  bio: z.string(),
});

export type PublicAuthor = z.output<typeof publicAuthorSchema>;
