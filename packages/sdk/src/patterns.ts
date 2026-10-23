import { z } from 'zod';
import { contentDocumentSchema } from '#sdk/content';

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
