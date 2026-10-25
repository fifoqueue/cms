import { z } from 'zod';

export const tocAttrsSchema = z
  .strictObject({
    title: z.string().max(200),
    levels: z
      .array(z.number().int().min(1).max(6))
      .max(6)
      .refine((levels) => new Set(levels).size === levels.length),
    minHeadings: z.number().int().min(0).max(100),
    excluded: z.array(z.string().max(200)).max(100),
    collapsible: z.boolean(),
    open: z.boolean(),
  })
  .partial();
