import { z } from 'zod';
import { Errors } from '#sdk/errors';

/** Autosaves newer than this age are never cleanup candidates. */
export const DATABASE_CLEANUP_AUTOSAVE_DAYS = 7;

export const databaseCleanupCategorySchema = z.enum([
  'revisions',
  'autosaves',
  'trashedContent',
  'spamComments',
  'trashedComments',
  'expired',
  'optimize',
]);

export const databaseCleanupOptionsSchema = z.object({
  /** Number of newest saved revisions to retain per content item. */
  keepLatest: z.number().int().nonnegative().default(0),
});

export const databaseCleanupInputSchema = z.object({
  categories: z
    .array(databaseCleanupCategorySchema)
    .min(1)
    .max(7)
    .refine((values) => new Set(values).size === values.length, {
      message: Errors.DatabaseCleanupDuplicate,
    }),
  options: databaseCleanupOptionsSchema.default({ keepLatest: 0 }),
});

export const databaseTableSizeSchema = z.object({
  table: z.string(),
  dataBytes: z.number().int().nonnegative(),
  indexBytes: z.number().int().nonnegative(),
  freeBytes: z.number().int().nonnegative(),
});

/** `optimize` counts tables; all other categories count directly targeted rows. */
export const databaseCleanupCountsSchema = z.record(
  databaseCleanupCategorySchema,
  z.number().int().nonnegative(),
);

export const databaseCleanupPreviewSchema = z.object({
  counts: databaseCleanupCountsSchema,
  tables: z.array(databaseTableSizeSchema),
  options: databaseCleanupOptionsSchema,
});

/** Unselected categories have zero deleted rows; cascades are not included. */
export const databaseCleanupResultSchema = z.object({
  deleted: databaseCleanupCountsSchema,
  optimization: z
    .object({
      before: z.array(databaseTableSizeSchema),
      after: z.array(databaseTableSizeSchema),
    })
    .nullable(),
});

export type DatabaseCleanupCategory = z.infer<
  typeof databaseCleanupCategorySchema
>;
export type DatabaseCleanupOptions = z.input<
  typeof databaseCleanupOptionsSchema
>;
export type DatabaseCleanupInput = z.input<typeof databaseCleanupInputSchema>;
export type DatabaseTableSize = z.infer<typeof databaseTableSizeSchema>;
export type DatabaseCleanupCounts = z.infer<typeof databaseCleanupCountsSchema>;
export type DatabaseCleanupPreview = z.infer<
  typeof databaseCleanupPreviewSchema
>;
export type DatabaseCleanupResult = z.infer<typeof databaseCleanupResultSchema>;
