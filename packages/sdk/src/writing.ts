import { z } from 'zod';

/** Defaults for new entries (WordPress "Settings → Writing"). */
export const writingSettingsSchema = z.object({
  /** Category a new post starts with; null for none. */
  defaultCategoryId: z.string().trim().min(1).max(36).nullable().default(null),
  /** What "Save draft" saves for a new entry. */
  defaultStatus: z.enum(['draft', 'pending']).default('draft'),
});

export type WritingSettings = z.output<typeof writingSettingsSchema>;
export type WritingSettingsInput = z.input<typeof writingSettingsSchema>;
