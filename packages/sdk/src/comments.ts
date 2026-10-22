import { z } from 'zod';
import { Errors } from '#sdk/errors';
import { PAGINATION_MAX_PAGE } from '#sdk/common';

export const COMMENT_STATUSES = [
  'pending',
  'approved',
  'spam',
  'trash',
] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

/** How new comments are held for review (WordPress "Before a comment appears"). */
export const COMMENT_MODERATION = ['manual', 'known', 'auto'] as const;

const words = z
  .array(z.string().trim().toLowerCase().min(1).max(100))
  .max(500)
  .default([]);

/** Comment rules for the whole site (Settings → Discussion). */
export const discussionSettingsSchema = z.object({
  /** Off closes comments everywhere; existing comments stay visible. */
  enabled: z.boolean().default(true),
  /** `manual`: every comment waits; `known`: authors with an approved comment skip; `auto`: none wait. */
  moderation: z.enum(COMMENT_MODERATION).default('known'),
  /** Close comments on entries older than this many days; 0 never closes them. */
  closeAfterDays: z.number().int().min(0).max(3650).default(0),
  /** Reply levels shown, the top level included. */
  threadDepth: z.number().int().min(1).max(5).default(3),
  /** Top-level comments per page. */
  pageSize: z.number().int().min(5).max(200).default(50),
  /** A comment with more links waits for review. */
  maxLinks: z.number().int().min(0).max(50).default(2),
  /** A comment containing one of these (in any field) waits for review. */
  holdWords: words,
  /** A comment containing one of these is marked as spam. */
  blockWords: words,
  /** Email moderators about comments waiting for review. */
  notifyModerators: z.boolean().default(true),
  /** Email entry authors about approved comments. */
  notifyAuthors: z.boolean().default(true),
});

export type DiscussionSettings = z.output<typeof discussionSettingsSchema>;
export type DiscussionSettingsInput = z.input<typeof discussionSettingsSchema>;

const authorUrlSchema = z
  .string()
  .trim()
  .max(255)
  .refine(
    (value) => value === '' || /^https?:\/\/[^\s]+$/i.test(value),
    Errors.CommentUrlInvalid,
  )
  .default('');

/** A visitor's comment. `website` is a honeypot field that people never see or fill in. */
export const commentInputSchema = z.object({
  contentId: z.string().min(1).max(36),
  parentId: z.string().max(36).nullable().default(null),
  authorName: z.string().trim().min(1).max(100),
  authorEmail: z.email().trim().toLowerCase().max(191),
  authorUrl: authorUrlSchema,
  body: z.string().trim().min(1).max(5000),
  website: z.string().max(500).optional(),
});

export type CommentInput = z.input<typeof commentInputSchema>;

/** A published comment. The body is plain text; the email address is never public. */
export const publicCommentSchema = z.strictObject({
  id: z.string(),
  parentId: z.string().nullable(),
  /** 0 for top-level comments. */
  depth: z.number().int(),
  authorName: z.string(),
  authorUrl: z.string().nullable(),
  /** Written by the entry's author. */
  byAuthor: z.boolean(),
  body: z.string(),
  createdAt: z.string(),
});

export type PublicComment = z.output<typeof publicCommentSchema>;

/** One page of top-level comments with all their shown replies, in thread order. */
export const publicCommentPageSchema = z.strictObject({
  items: z.array(publicCommentSchema),
  /** Top-level comments in every page. */
  total: z.number().int(),
  /** Every approved comment. */
  count: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  open: z.boolean(),
  threadDepth: z.number().int(),
  /** True when the server stopped at its per-page reply safety limit. */
  truncated: z.boolean(),
});

export type PublicCommentPage = z.output<typeof publicCommentPageSchema>;

export const commentSubmittedSchema = z.strictObject({
  /** `pending` also covers comments that will never appear. */
  status: z.enum(['approved', 'pending']),
  comment: publicCommentSchema.nullable(),
});

export type CommentSubmitted = z.output<typeof commentSubmittedSchema>;

export const adminCommentSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  contentTitle: z.string(),
  parentId: z.string().nullable(),
  userId: z.string().nullable(),
  authorName: z.string(),
  authorEmail: z.string(),
  authorUrl: z.string(),
  body: z.string(),
  status: z.enum(COMMENT_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AdminComment = z.output<typeof adminCommentSchema>;

/** Without `status`, pending and approved comments are listed (WordPress "All"). */
export const commentListQuerySchema = z.object({
  status: z.enum(COMMENT_STATUSES).optional(),
  contentId: z.string().max(36).optional(),
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
  page: z.coerce.number().int().min(1).max(PAGINATION_MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CommentListQuery = z.input<typeof commentListQuerySchema>;

export const commentUpdateSchema = z.object({
  status: z.enum(COMMENT_STATUSES).optional(),
  authorName: z.string().trim().min(1).max(100).optional(),
  authorEmail: z.email().trim().toLowerCase().max(191).optional(),
  authorUrl: authorUrlSchema.optional(),
  body: z.string().trim().min(1).max(5000).optional(),
});

export type CommentUpdate = z.input<typeof commentUpdateSchema>;

export const commentReplySchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const COMMENT_BULK_ACTIONS = [
  'approve',
  'unapprove',
  'spam',
  'trash',
  'delete',
] as const;

export const commentBulkSchema = z.object({
  ids: z.array(z.string().min(1).max(36)).min(1).max(100),
  action: z.enum(COMMENT_BULK_ACTIONS),
});

export type CommentBulkInput = z.input<typeof commentBulkSchema>;

export const commentCountsSchema = z.object({
  pending: z.number().int(),
  approved: z.number().int(),
  spam: z.number().int(),
  trash: z.number().int(),
});

export type CommentCounts = z.output<typeof commentCountsSchema>;
