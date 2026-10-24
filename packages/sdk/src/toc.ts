import { z } from 'zod';

export const tocAttrsSchema = z
  .strictObject({
    title: z.string().max(200),
    levels: z
      .array(z.union([z.literal(2), z.literal(3), z.literal(4)]))
      .max(3)
      .refine((levels) => new Set(levels).size === levels.length),
    minHeadings: z.number().int().min(0).max(100),
    excluded: z.array(z.string().max(200)).max(100),
    collapsible: z.boolean(),
    open: z.boolean(),
  })
  .partial();
