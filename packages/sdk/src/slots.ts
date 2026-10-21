import { z } from 'zod';

/**
 * Named places in a rendered page where plugins may inject HTML.
 * Every frontend must render all of them (see AGENTS.md, "Frontend contract").
 */
export const SLOT_NAMES = [
  'head',
  'site.header',
  'site.footer',
  'content.before',
  'content.after',
] as const;

export type SlotName = (typeof SLOT_NAMES)[number];

/** HTML fragments per slot, in plugin registration order. Empty arrays when nothing is contributed. */
export type SlotMap = Record<SlotName, string[]>;

export const slotQuerySchema = z.object({
  path: z.string().max(2048).default('/'),
  contentId: z.string().max(36).optional(),
});

export type SlotQuery = z.input<typeof slotQuerySchema>;
