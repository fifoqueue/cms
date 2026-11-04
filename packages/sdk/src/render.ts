import { z } from 'zod';
import { SLOT_NAMES, slotQuerySchema } from '#sdk/slots';
import type { Awaitable } from '#sdk/common';

export const assetSourceSchema = z
  .string()
  .max(2048)
  .refine((source) => {
    if (
      /[\s<>"'\\]/.test(source) ||
      [...source].some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return false;

    try {
      const url = new URL(source, 'https://cms.invalid');

      if (url.username || url.password || url.hash) return false;
      if (source.startsWith('/'))
        return (
          source.startsWith('/api/plugins/') &&
          url.origin === 'https://cms.invalid' &&
          url.pathname.startsWith('/api/plugins/') &&
          !/%(?:2f|5c|2e|25)/i.test(source)
        );

      return source.startsWith('https://') && url.protocol === 'https:';
    } catch {
      return false;
    }
  });

export const pageRenderQuerySchema = slotQuerySchema.extend({
  kind: z
    .string()
    .regex(/^[a-zA-Z][\w-]{0,63}$/)
    .default('content'),
  type: z.string().max(64).optional(),
  slug: z.string().max(2048).optional(),
  status: z.coerce.number<string | number>().int().min(100).max(599).optional(),
});

export type PageRenderQuery = z.input<typeof pageRenderQuerySchema>;

export const renderPageSchema = pageRenderQuerySchema.pick({
  kind: true,
  type: true,
  slug: true,
  status: true,
});

export type RenderPage = z.output<typeof renderPageSchema>;

export const templateCandidatesSchema = z.object({
  page: renderPageSchema,
  candidates: z.array(z.string().max(128)).max(64),
});

export const bodyClassesSchema = z.object({
  page: renderPageSchema,
  classes: z
    .array(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]{0,127}$/))
    .max(128),
});

export const pageAssetSchema = z.object({
  key: z.string().regex(/^[\w.:-]{1,191}$/),
  kind: z.enum(['script', 'style']),
  src: assetSourceSchema,
  placement: z.enum(['head', 'footer']),
  attrs: z
    .object({
      defer: z.boolean().optional(),
      async: z.boolean().optional(),
      module: z.boolean().optional(),
      integrity: z
        .string()
        .max(1024)
        .regex(
          /^(?:sha256-[A-Za-z0-9+/]{43}=|sha384-[A-Za-z0-9+/]{64}|sha512-[A-Za-z0-9+/]{86}==)(?: (?:sha256-[A-Za-z0-9+/]{43}=|sha384-[A-Za-z0-9+/]{64}|sha512-[A-Za-z0-9+/]{86}==))*$/,
        )
        .optional(),
      crossorigin: z.enum(['anonymous', 'use-credentials']).optional(),
    })
    .strict(),
});

export type PageAsset = z.infer<typeof pageAssetSchema>;

export type AssetDefinition = Omit<PageAsset, 'key'> & {
  when?: (page: RenderPage) => Awaitable<boolean>;
};

export interface AssetRegistrar {
  register(key: string, definition: AssetDefinition): () => void;
}

export const pageRenderSchema = z.object({
  slots: z.record(z.enum(SLOT_NAMES), z.string()),
  bodyClasses: z.array(z.string()),
  assets: z.array(pageAssetSchema),
  headers: z.record(z.string(), z.string()),
  templateCandidates: z.array(z.string()),
});

export type PageRender = z.infer<typeof pageRenderSchema>;
