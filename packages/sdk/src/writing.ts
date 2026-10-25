import { z } from 'zod';

/** Defaults for new entries (WordPress "Settings → Writing"). */
export const writingSettingsSchema = z.object({
  autoToc: z
    .object({
      enabled: z.boolean().default(true),
      types: z.array(z.string().min(1)).default(['post']),
      position: z
        .enum(['top', 'beforeFirstHeading'])
        .default('beforeFirstHeading'),
      title: z.string().max(200).default(''),
      levels: z.array(z.number().int().min(1).max(6)).max(6).default([2, 3, 4]),
      minHeadings: z.number().int().min(0).max(100).default(3),
      collapsible: z.boolean().default(true),
      open: z.boolean().default(true),
    })
    .prefault({}),
  /** Category a new post starts with; null for none. */
  defaultCategoryId: z.string().trim().min(1).max(36).nullable().default(null),
  /** What "Save draft" saves for a new entry. */
  defaultStatus: z.enum(['draft', 'pending']).default('draft'),
});

export type WritingSettings = z.output<typeof writingSettingsSchema>;
export type WritingSettingsInput = z.input<typeof writingSettingsSchema>;
