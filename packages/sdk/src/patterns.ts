import { z } from 'zod';
import { contentDocumentSchema } from '#sdk/content';
import { PAGINATION_MAX_PAGE } from '#sdk/common';

/** Patterns that are not published never render on the public site. */
export const PATTERN_STATUSES = ['draft', 'published'] as const;
export type PatternStatus = (typeof PATTERN_STATUSES)[number];

/** A reusable piece of content (WordPress pattern / reusable block). */
export const patternInputSchema = z.object({
  title: z.string().trim().min(1).max(191),
  document: contentDocumentSchema,
  /** Synced patterns are inserted by reference: editing one updates every entry using it. */
  synced: z.boolean().default(true),
  status: z.enum(PATTERN_STATUSES).default('published'),
});

export type PatternInput = z.input<typeof patternInputSchema>;

export const adminPatternSchema = z.object({
  id: z.string(),
  title: z.string(),
  document: contentDocumentSchema,
  synced: z.boolean(),
  status: z.enum(PATTERN_STATUSES),
  authorId: z.string().nullable(),
  updatedAt: z.string(),
});

export type AdminPattern = z.output<typeof adminPatternSchema>;

/** Library lists never include stored editorial documents or rendered HTML. */
export const patternSummarySchema = adminPatternSchema.omit({ document: true });
export type PatternSummary = z.output<typeof patternSummarySchema>;

export const patternListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(PAGINATION_MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(191).optional(),
});
export type PatternListQuery = Partial<z.output<typeof patternListQuerySchema>>;

export const patternListSchema = z.object({
  items: z.array(patternSummarySchema).max(100),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
});
