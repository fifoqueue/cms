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
  author: text.optional(),
});

/** Web servers submit structured data before escaping XML/HTML, not rendered markup. */
export const discoveryFilterSchemas = {
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
      .record(z.string().max(100), text)
      .refine(
        (values) =>
          Object.keys(values).length <= 100 &&
          Object.entries(values).every(
            ([key, value]) =>
              !/(?:^|:)(?:url|image|video|audio)(?::(?:url|secure_url))?$/.test(
                key,
              ) || link.safeParse(value).success,
          ),
      ),
    jsonLd: z
      .array(z.json())
      .max(100)
      .refine((value) => JSON.stringify(value).length <= 512000),
  }),
};

export const discoveryFilterInputSchema = z.object({
  kind: z.enum([
    'sitemap.entries',
    'feed.items',
    'feed.channel',
    'robots.txt',
    'llms.txt',
    'seo.markdown',
    'seo.meta',
  ]),
  value: z.unknown(),
});

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
