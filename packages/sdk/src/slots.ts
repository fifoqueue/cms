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
  /** Around an entry's comment section (shown only where comments are). */
  'comments.before',
  'comments.after',
] as const;

export type SlotName = (typeof SLOT_NAMES)[number];

/** HTML fragments per slot, in plugin registration order. Empty arrays when nothing is contributed. */
export type SlotMap = Record<SlotName, string[]>;

export const slotMapSchema = z.object({
  head: z.array(z.string()),
  'site.header': z.array(z.string()),
  'site.footer': z.array(z.string()),
  'content.before': z.array(z.string()),
  'content.after': z.array(z.string()),
  'comments.before': z.array(z.string()),
  'comments.after': z.array(z.string()),
});

export const slotQuerySchema = z.object({
  path: z.string().max(2048).default('/'),
  /** Content shown on the page. Omitted: the published content whose current path is `path`, if any. */
  contentId: z.string().max(36).optional(),
});

export type SlotQuery = z.input<typeof slotQuerySchema>;
