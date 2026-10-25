import { z } from 'zod';
import { Errors } from '#sdk/errors';

/** Where themes place menus. */
export const MENU_LOCATIONS = ['primary', 'footer'] as const;
export type MenuLocation = (typeof MENU_LOCATIONS)[number];

export const MENU_ITEM_KINDS = [
  'custom',
  'content',
  'term',
  'home',
  'archive',
  'plugin',
] as const;

/** A web address or a path on this site; never another scheme. */
const linkSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) =>
      (value.startsWith('/') && !value.startsWith('//')) ||
      /^https?:\/\/[^\s]+$/.test(value) ||
      /^mailto:[^\s]+$/.test(value),
    Errors.MenuLinkInvalid,
  );

export interface MenuItem {
  id: string;
  /** Empty uses the target's own title. */
  label: string;
  kind: (typeof MENU_ITEM_KINDS)[number];
  /** `custom` items. */
  url?: string;
  /** `content` items. */
  contentId?: string;
  /** `term` items. */
  taxonomy?: string;
  termId?: string;
  /** `archive` items: a content type key. */
  archive?: string;
  provider?: string;
  objectId?: string;
  newTab: boolean;
  children: MenuItem[];
}

/** Menu items nest at most three levels deep. */
const itemSchema = (depth: number): z.ZodType<MenuItem> =>
  z
    .object({
      id: z.string().min(1).max(36),
      label: z.string().trim().max(191).default(''),
      kind: z.enum(MENU_ITEM_KINDS),
      url: linkSchema.optional(),
      contentId: z.string().max(36).optional(),
      taxonomy: z
        .string()
        .regex(/^[a-z][a-z0-9-]{0,63}$/)
        .optional(),
      termId: z.string().max(36).optional(),
      archive: z.string().max(32).optional(),
      provider: z
        .string()
        .regex(/^[a-z][a-z0-9-]{0,63}$/)
        .optional(),
      objectId: z.string().min(1).max(191).optional(),
      newTab: z.boolean().default(false),
      children:
        depth > 1
          ? z
              .array(z.lazy(() => itemSchema(depth - 1)))
              .max(100)
              .default([])
          : z.array(z.never()).max(0).default([]),
    })
    .refine(
      (item) =>
        (item.kind === 'custom' && !!item.url) ||
        (item.kind === 'content' && !!item.contentId) ||
        (item.kind === 'term' && !!item.termId && !!item.taxonomy) ||
        (item.kind === 'archive' && !!item.archive) ||
        (item.kind === 'plugin' && !!item.provider && !!item.objectId) ||
        item.kind === 'home',
      Errors.MenuTargetMissing,
    ) as z.ZodType<MenuItem>;

export const menuItemSchema = itemSchema(3);

export const menuSchema = z.object({
  id: z.string().min(1).max(36),
  name: z.string().trim().min(1).max(100),
  items: z.array(menuItemSchema).max(200).default([]),
});

export type Menu = z.output<typeof menuSchema>;

/** Every menu and the menu shown at each location. */
export const menusSettingsSchema = z.object({
  menus: z.array(menuSchema).max(50).default([]),
  locations: z
    .object({
      primary: z.string().max(36).nullable().default(null),
      footer: z.string().max(36).nullable().default(null),
    })
    .default({ primary: null, footer: null }),
});

export type MenusSettings = z.output<typeof menusSettingsSchema>;
export type MenusSettingsInput = z.input<typeof menusSettingsSchema>;

export interface PublicMenuItem {
  label: string;
  url: string;
  newTab: boolean;
  children: PublicMenuItem[];
}

export const publicMenuItemSchema: z.ZodType<PublicMenuItem> = z.object({
  label: z.string(),
  url: linkSchema,
  newTab: z.boolean(),
  children: z.array(z.lazy(() => publicMenuItemSchema)),
});

export const menuLinkSchema = z.object({ url: linkSchema, title: z.string() });

/** A published entry a saved menu links to, as the menu editor labels it. */
export const menuTargetSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
});

export type MenuTarget = z.output<typeof menuTargetSchema>;

/** A location's menu with every target resolved; null when none is assigned. */
export const publicMenuSchema = z.array(publicMenuItemSchema).nullable();

export const menuObjectQuerySchema = z.object({
  search: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type MenuObjectQuery = Partial<z.output<typeof menuObjectQuerySchema>>;
export const menuObjectSchema = z.strictObject({
  id: z.string().min(1).max(191),
  label: z.string().min(1).max(191),
});
export const menuObjectsSchema = z.strictObject({
  items: menuObjectSchema.array().max(100),
  total: z.number().int().nonnegative(),
});
export const menuItemTypeSchema = z.strictObject({
  key: z.string(),
  label: z.string(),
  source: z.string(),
  searchable: z.boolean(),
});
