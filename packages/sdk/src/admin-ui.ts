import { z } from 'zod';
import { adminBlockSchema } from '#sdk/plugins';
import { pageAssetSchema } from '#sdk/render';

export const adminScreenSchema = z.enum([
  'content',
  'media',
  'users',
  'comments',
  'terms',
]);

export type AdminScreen = z.output<typeof adminScreenSchema>;

export const adminMenuParentSchema = z.enum([
  'content',
  'media',
  'users',
  'tools',
  'settings',
  'appearance',
  'plugins',
]);

const key = z.string().regex(/^[a-zA-Z0-9:._-]{1,191}$/);
const label = z.string().min(1).max(200);
const href = z
  .string()
  .max(2048)
  .refine(
    (value) =>
      value.startsWith('/') &&
      !value.startsWith('//') &&
      !/[\s\\]/.test(value) &&
      [...value].every(
        (character) =>
          character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
  );
const item = z.object({ key, label });

export const adminMenuItemSchema = item.extend({
  href,
  parent: adminMenuParentSchema.nullable(),
  position: z.number().finite(),
  core: z.boolean(),
  labelOverridden: z.boolean(),
  hidden: z.boolean(),
});

export type AdminMenuItem = z.output<typeof adminMenuItemSchema>;

export const adminMenuResponseSchema = z.object({
  items: z.array(adminMenuItemSchema).max(500),
});

export const adminNoticeSchema = adminBlockSchema.refine(
  (block) => block.kind === 'notice',
);

export const adminNoticesResponseSchema = z.object({
  notices: z.array(adminNoticeSchema).max(100),
});

export const adminIdsSchema = z.array(z.string().min(1).max(191)).max(100);

export const adminActionInputSchema = z.object({
  ids: adminIdsSchema.min(1),
});

export const adminActionResponseSchema = z.object({
  notice: adminNoticeSchema.optional(),
  failed: adminIdsSchema,
});

export const adminScreenResponseSchema = z.object({
  columns: z.array(item).max(100),
  values: z.record(z.string().max(191), z.record(key, z.string().max(10000))),
  rowActions: z.array(item).max(100),
  bulkActions: z.array(item).max(100),
  filters: z
    .array(
      item.extend({
        options: z
          .array(z.object({ value: z.string().max(200), label }))
          .max(100),
      }),
    )
    .max(100),
});

export const adminBarResponseSchema = z.object({
  items: z.array(item.extend({ href })).max(100),
});

export const adminAssetsResponseSchema = z.array(pageAssetSchema).max(100);

export type AdminScreenResponse = z.output<typeof adminScreenResponseSchema>;
export type AdminActionResponse = z.output<typeof adminActionResponseSchema>;
export type AdminBarItem = z.output<
  typeof adminBarResponseSchema
>['items'][number];
