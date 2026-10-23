import { z } from 'zod';
import { permalinkPathSchema } from '#sdk/permalinks';
import { PAGINATION_MAX_PAGE } from '#sdk/common';

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      !Array.from(value).some((char) => char <= '\u0020' || char === '\u007f')
    );
  } catch {
    return false;
  }
};

/** Public links only: never script/data URLs, credentials, or control characters. */
export const safeHttpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(isHttpUrl, 'Enter an absolute HTTP or HTTPS URL without credentials')
  .transform((value) =>
    new URL(value).href.replace(/%[0-9a-f]{2}/gi, (escape) =>
      escape.toUpperCase(),
    ),
  );

const optionalUrl = z.union([z.literal(''), safeHttpUrlSchema]).default('');
const text = (max: number) => z.string().trim().max(max).default('');

const publicEntryShape = {
  title: text(200),
  description: text(500),
  canonicalUrl: optionalUrl,
  noIndex: z.boolean().default(false),
  noFollow: z.boolean().default(false),
  imageUrl: optionalUrl,
  imageAlt: text(500),
  socialTitle: text(200),
  socialDescription: text(500),
  schemaType: z
    .enum(['auto', 'Article', 'BlogPosting', 'WebPage'])
    .default('auto'),
  authorName: text(191),
  authorUrl: optionalUrl,
};

/** Only metadata intended for publication; editorial keywords are not public metadata. */
export const publicEntrySeoSchema = z.strictObject(publicEntryShape);
export type PublicEntrySeo = z.output<typeof publicEntrySeoSchema>;

export const adminEntrySeoSchema = z.object({
  ...publicEntryShape,
  focusKeyword: text(100),
});
export const seoInputSchema = adminEntrySeoSchema;
export type AdminEntrySeo = z.output<typeof adminEntrySeoSchema>;
export type EntrySeoInput = z.input<typeof seoInputSchema>;
export const DEFAULT_ENTRY_SEO: AdminEntrySeo = adminEntrySeoSchema.parse({});

const publicSeoProjection = publicEntrySeoSchema.strip();

/** A schema allowlist, not a blacklist/spread of the stored admin object. */
export const toPublicEntrySeo = (value: unknown): PublicEntrySeo =>
  publicSeoProjection.parse(value);

const siteOriginSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    if (!isHttpUrl(value)) return false;
    const url = new URL(value);
    return url.pathname === '/' && !url.search && !url.hash;
  }, 'Enter the public site origin, without a path, query, or fragment')
  .transform((value) => (value ? new URL(value).origin : ''))
  .default('');

const titleTemplateSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      value.includes('{title}') &&
      !/[{}]/.test(value.replace(/\{(?:title|site)\}/g, '')),
    'Use {title} and optionally {site}; other placeholders are not supported',
  )
  .default('{title} · {site}');

const settingsShape = {
  siteUrl: siteOriginSchema,
  titleTemplate: titleTemplateSchema,
  homeTitle: text(200),
  homeDescription: text(500),
  defaultImageUrl: optionalUrl,
  defaultImageAlt: text(500),
  entityType: z.enum(['Organization', 'Person']).default('Organization'),
  entityName: text(191),
  logoUrl: optionalUrl,
  sameAs: z.array(safeHttpUrlSchema).max(20).default([]),
  twitterHandle: z
    .string()
    .trim()
    .regex(/^(@[A-Za-z0-9_]{1,15})?$/, 'Use a handle such as @example')
    .default(''),
  indexingEnabled: z.boolean().default(true),
  indexCategories: z.boolean().default(true),
  indexTags: z.boolean().default(true),
  allowAiSearch: z.boolean().default(true),
  allowAiTraining: z.boolean().default(false),
  llmsTxtEnabled: z.boolean().default(true),
  llmsIntro: text(2000),
  // These are explicitly public webmaster-verification tokens, never account credentials.
  googleVerification: text(255),
  bingVerification: text(255),
  maxSnippet: z.number().int().min(-1).max(10000).default(-1),
  maxImagePreview: z.enum(['none', 'standard', 'large']).default('large'),
  maxVideoPreview: z.number().int().min(-1).max(86400).default(-1),
};

export const seoSettingsSchema = z.object(settingsShape);
export const publicSeoSettingsSchema = z.strictObject(settingsShape);
export type AdminSeoSettings = z.output<typeof seoSettingsSchema>;
export type PublicSeoSettings = z.output<typeof publicSeoSettingsSchema>;
export type SeoSettingsInput = z.input<typeof seoSettingsSchema>;
export const SEO_SETTINGS_DEFAULTS: AdminSeoSettings = seoSettingsSchema.parse(
  {},
);

export { formatSeoTitle } from '#sdk/format';

export const SEO_SITEMAP_PAGE_SIZE = 1000;
export const seoSitemapQuerySchema = z.object({
  kind: z
    .enum(['content', 'category', 'tag', 'author', 'taxonomy'])
    .default('content'),
  page: z.coerce.number().int().min(1).max(PAGINATION_MAX_PAGE).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEO_SITEMAP_PAGE_SIZE)
    .default(SEO_SITEMAP_PAGE_SIZE),
});
export type SeoSitemapQuery = z.input<typeof seoSitemapQuerySchema>;
export const seoSitemapEntrySchema = z.strictObject({
  path: permalinkPathSchema,
  title: z.string(),
  description: z.string(),
  updatedAt: z.string(),
});
export type SeoSitemapEntry = z.output<typeof seoSitemapEntrySchema>;
