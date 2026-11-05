import type { Awaitable } from '#sdk/common';
import type { PluginContext, PluginLogger } from '#sdk/plugin';
import type { SlotName } from '#sdk/slots';
import { publicContentSchema } from '#sdk/content';
import { publicEntrySeoSchema } from '#sdk/seo';
import { publicTaxonomyTermSchema } from '#sdk/taxonomy';
import {
  pageAssetSchema,
  bodyClassesSchema,
  templateCandidatesSchema,
} from '#sdk/render';
import { z } from 'zod';

export const functionsInputSchema = z.strictObject({
  source: z.string().max(262144),
});
export const functionsSourceSchema = z.strictObject({
  source: z.string(),
});
export const functionsStatusSchema = z.strictObject({
  editorEnabled: z.boolean(),
  checkedAt: z.string(),
  sources: z.array(
    z.strictObject({
      owner: z.string(),
      observedHash: z.string(),
      loadedHash: z.string().nullable(),
      lastError: z.string().nullable(),
      updatedAt: z.string(),
    }),
  ),
});

/** API functions have the same capabilities as plugin activation. */
export type ApiFunctionsContext = PluginContext;

export interface WebPageContext {
  readonly path: string;
  readonly kind: string;
  readonly type?: string;
  readonly slug?: string;
  readonly status?: number;
  readonly contentId?: string;
}

export interface WebAsset {
  key: string;
  kind: 'script' | 'style';
  src: string;
  placement: 'head' | 'footer';
  attrs: {
    defer?: boolean;
    async?: boolean;
    module?: boolean;
    integrity?: string;
    crossorigin?: 'anonymous' | 'use-credentials';
  };
}

export type WebHeadTag =
  | {
      tag: 'meta';
      attrs: { name?: string; property?: string; content: string };
    }
  | {
      tag: 'link';
      attrs: {
        rel: string;
        href: string;
        type?: string;
        media?: string;
        hreflang?: string;
        sizes?: string;
      };
    };

export interface WebFilterHookMap {
  'template.candidates': string[];
  'page.bodyClasses': string[];
  /** Revalidated against the current route's public DTO before rendering. */
  'page.data': Record<string, unknown>;
  'page.head': WebHeadTag[];
  'response.headers': Record<string, string>;
  assets: WebAsset[];
}

const webSummarySchema = publicContentSchema.omit({
  html: true,
  fields: true,
  metaDescription: true,
  meta: true,
  updatedAt: true,
  seo: true,
  parentId: true,
  parents: true,
});
const webListSchema = z.object({
  items: z.array(webSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
const webContentViewSchema = publicContentSchema.omit({ meta: true }).extend({
  categoryParents: z
    .array(z.object({ name: z.string(), slug: z.string() }))
    .default([]),
  pages: z.object({
    current: z.number().int().positive(),
    total: z.number().int().positive(),
  }),
});

/** Public route projections reuse the API DTO fields and exclude transport and UI state. */
export const webPageDataSchemas = {
  content: z.object({
    kind: z.literal('content'),
    content: webContentViewSchema,
  }),
  preview: z.object({
    kind: z.literal('preview'),
    content: webContentViewSchema,
  }),
  home: z.object({
    kind: z.literal('home'),
    type: z.enum(['post', 'article']),
    posts: webListSchema,
    path: z.string().optional(),
    title: z.string().optional(),
    explicitType: z.boolean().optional(),
    seo: publicEntrySeoSchema.optional(),
    description: z.string().optional(),
    passwordProtected: z.boolean().optional(),
    protected: z.boolean().optional(),
    featuredImage: publicContentSchema.shape.featuredImage.optional(),
  }),
  search: z.object({
    kind: z.literal('search'),
    query: z.string(),
    posts: webListSchema.nullable(),
  }),
  term: z.object({
    kind: z.literal('term'),
    term: publicTaxonomyTermSchema.omit({ fields: true }).extend({
      path: z.string().optional(),
      parents: z
        .array(z.object({ name: z.string(), slug: z.string() }))
        .optional(),
    }),
    posts: webListSchema,
  }),
  author: z.object({
    kind: z.literal('author'),
    author: z.object({
      name: z.string(),
      slug: z.string(),
      bio: z.string(),
      avatarUrl: z.string().nullable().optional(),
    }),
    posts: webListSchema,
  }),
  date: z.object({
    kind: z.literal('date'),
    date: z.object({
      year: z.number().int(),
      month: z.number().int().nullable(),
      day: z.number().int().optional(),
    }),
    posts: webListSchema,
  }),
  archive: z.object({
    kind: z.literal('archive'),
    archive: z.object({
      key: z.string(),
      name: z.string(),
      description: z.string(),
    }),
    posts: webListSchema,
  }),
};

const webUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    if (
      /[\s\\]/.test(value) ||
      [...value].some((char) => char.charCodeAt(0) < 32)
    )
      return false;
    if (value.startsWith('/') && !value.startsWith('//')) return true;

    try {
      const url = new URL(value);

      return (
        ['https:', 'http:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });

export const webAssetsSchema = z
  .array(
    pageAssetSchema.extend({
      src: webUrlSchema,
      attrs: pageAssetSchema.shape.attrs.extend({
        integrity: z
          .string()
          .regex(
            /^(sha(256|384|512)-[A-Za-z0-9+/]+={0,2})( sha(256|384|512)-[A-Za-z0-9+/]+={0,2})*$/,
          )
          .optional(),
      }),
    }),
  )
  .max(128);

const informationalMetaSchema = z
  .string()
  .max(128)
  .regex(
    /^(?:description|author|keywords|generator|application-name|theme-color|color-scheme|(?:og|twitter):[a-z0-9:_-]+)$/i,
  );

export const webHeadMetaSchema = z
  .strictObject({
    name: informationalMetaSchema.optional(),
    property: informationalMetaSchema.optional(),
    content: z.string().max(4096),
  })
  .refine((attrs) => Boolean(attrs.name || attrs.property));

export const webHeadSchema = z
  .array(
    z.discriminatedUnion('tag', [
      z.strictObject({
        tag: z.literal('meta'),
        attrs: webHeadMetaSchema,
      }),
      z.strictObject({
        tag: z.literal('link'),
        attrs: z.strictObject({
          rel: z.enum(['canonical', 'alternate', 'author', 'license', 'help']),
          href: webUrlSchema,
          type: z.string().max(128).optional(),
          media: z.string().max(256).optional(),
          hreflang: z.string().max(64).optional(),
          sizes: z.string().max(64).optional(),
        }),
      }),
    ]),
  )
  .max(128);

export const webBodyClassesSchema = bodyClassesSchema.shape.classes;
export const webTemplateCandidatesSchema =
  templateCandidatesSchema.shape.candidates;
export const webHeadersSchema = z.record(
  z.string().max(128),
  z.string().max(8192),
);

/** Observers receive the validated value after the corresponding filter chain. */
export type WebActionHookMap = WebFilterHookMap;

export interface WebHookRegistrar {
  filter<K extends keyof WebFilterHookMap>(
    name: K,
    handler: (
      value: WebFilterHookMap[K],
      page: Readonly<WebPageContext>,
    ) => Awaitable<WebFilterHookMap[K]>,
    priority?: number,
  ): () => void;
  on<K extends keyof WebActionHookMap>(
    name: K,
    handler: (
      value: Readonly<WebActionHookMap[K]>,
      page: Readonly<WebPageContext>,
    ) => Awaitable<void>,
    priority?: number,
  ): () => void;
}

/** Registrations belong to the activation scope and are removed on replacement. */
export interface WebFunctionsContext {
  readonly hooks: WebHookRegistrar;
  readonly assets: {
    register(asset: WebAsset): () => void;
  };
  readonly slots: {
    provide(
      name: SlotName,
      render: (page: Readonly<WebPageContext>) => Awaitable<string>,
      priority?: number,
    ): () => void;
  };
  readonly logger: PluginLogger;
  /** Request-local context; undefined outside a page-render operation. */
  readonly page: Readonly<WebPageContext> | undefined;
}

export interface FunctionsDefinition {
  api?(ctx: ApiFunctionsContext): Awaitable<void>;
  web?(ctx: WebFunctionsContext): Awaitable<void>;
}

export const webFunctionsSourceSchema = z.strictObject({
  owner: z.string().min(1).max(256),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string().max(262144),
});

export type WebFunctionsSource = z.infer<typeof webFunctionsSourceSchema>;

export const webFunctionsDeliverySchema = z.strictObject({
  version: z.string().regex(/^[a-f0-9]{64}$/),
  sources: z.array(webFunctionsSourceSchema).max(2),
});

export const webFunctionsDefinitionSchema = z.object({
  web: z
    .custom<NonNullable<FunctionsDefinition['web']>>(
      (value) => typeof value === 'function',
    )
    .optional(),
});

/**
 * Export as `export const functions = defineFunctions({ api(ctx) {} })`.
 * Each server executes only its corresponding member.
 */
export const defineFunctions = (
  definition: FunctionsDefinition,
): FunctionsDefinition => definition;
