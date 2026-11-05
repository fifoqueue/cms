import type { AdminSeoSettings, PublicSeoSettings } from '#sdk/seo';
import { seoSitemapEntrySchema } from '#sdk/seo';
import { z } from 'zod';

const link = z.union([
  z.url({ protocol: /^https?$/ }).max(2048),
  z
    .string()
    .max(2048)
    .regex(/^\/(?!\/)[^\s\\]*$/),
]);
const text = z.string().max(10000);
const feedItem = z.object({
  id: text,
  title: text,
  link,
  description: text,
  publishedAt: z.string().max(100),
  updatedAt: z.string().max(100).optional(),
  author: text.optional(),
});

/** Web servers submit structured data before escaping XML/HTML, not rendered markup. */
export const discoveryFilterSchemas = {
  'discovery.document': z
    .object({
      body: z.string().max(512000),
      updatedAt: z.iso.datetime().optional(),
    })
    .nullable(),
  'sitemap.entries': z.array(seoSitemapEntrySchema),
  'feed.items': z.array(feedItem).max(1000),
  'feed.channel': z.object({
    title: text,
    link,
    description: text,
    language: z.string().max(100).optional(),
  }),
  'robots.txt': z.string().max(512000),
  'llms.txt': z.string().max(512000),
  'seo.markdown': z.string().max(512000),
  'seo.meta': z.object({
    title: text,
    description: text,
    canonicalUrl: link,
    og: z
      .record(z.string().max(100), z.union([text, z.array(text).max(100)]))
      .refine(
        (values) =>
          Object.keys(values).length <= 100 &&
          Object.entries(values).every(
            ([key, value]) =>
              !/(?:^|:)(?:url|image|video|audio)(?::(?:url|secure_url))?$/.test(
                key,
              ) ||
              (Array.isArray(value) ? value : [value]).every(
                (item) => link.safeParse(item).success,
              ),
          ),
      ),
    robots: text.optional(),
    links: z
      .array(
        z.object({
          rel: z
            .string()
            .regex(/^[a-zA-Z][a-zA-Z -]*$/)
            .max(100),
          href: link,
          type: z.string().max(100).optional(),
          title: text.optional(),
        }),
      )
      .max(100)
      .optional(),
    jsonLd: z
      .array(z.json())
      .max(100)
      .refine((value) => JSON.stringify(value).length <= 512000),
  }),
};

export const discoveryFilterInputSchema = z.object({
  kind: z.enum([
    'discovery.document',
    'sitemap.entries',
    'feed.items',
    'feed.channel',
    'robots.txt',
    'llms.txt',
    'seo.markdown',
    'seo.meta',
  ]),
  value: z.unknown(),
  context: z
    .strictObject({
      id: z.string().max(36).optional(),
      slug: z.string().max(191).optional(),
      path: z.string().max(2048),
      type: z.string().max(136).optional(),
    })
    .optional(),
});

export type DiscoveryContext = NonNullable<
  z.output<typeof discoveryFilterInputSchema>['context']
>;

export interface SeoFilterArgs {
  'discovery.document': [context: Readonly<DiscoveryContext>];
  'seo.markdown': [context: Readonly<DiscoveryContext>];
  'llms.txt': [context: Readonly<DiscoveryContext>];
}

type DiscoveryFilterHooks = {
  [K in keyof typeof discoveryFilterSchemas]: z.output<
    (typeof discoveryFilterSchemas)[K]
  >;
};

export interface SeoActionHooks {
  'seo.updated': AdminSeoSettings;
}

export interface SeoFilterHooks extends DiscoveryFilterHooks {
  'seo.beforeSave': AdminSeoSettings;
  'seo.public': PublicSeoSettings;
}
