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

const entrySchemaType = z.enum([
  'auto',
  'Article',
  'BlogPosting',
  'NewsArticle',
  'TechArticle',
  'WebPage',
  'AboutPage',
  'ContactPage',
]);

const publicEntryShape = {
  title: text(200),
  description: text(500),
  canonicalUrl: optionalUrl,
  noIndex: z.boolean().default(false),
  noFollow: z.boolean().default(false),
  noSnippet: z.boolean().default(false),
  maxSnippet: z.number().int().min(-1).max(10000).nullable().default(null),
  maxImagePreview: z
    .enum(['none', 'standard', 'large'])
    .nullable()
    .default(null),
  imageUrl: optionalUrl,
  imageAlt: text(500),
  socialTitle: text(200),
  socialDescription: text(500),
  schemaType: z
    // Legacy saved collection overrides have no collection items on an entry.
    .enum([...entrySchemaType.options, 'CollectionPage'])
    .transform((value) =>
      value === 'CollectionPage' ? ('WebPage' as const) : value,
    )
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
export const seoInputSchema = adminEntrySeoSchema.extend({
  schemaType: entrySchemaType.default('auto'),
});
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

/** Shared by robots generation and extra-rule validation; terminal `$` denotes an exact path. */
export const SEO_ROBOTS_DISALLOW_PATHS = [
  '/admin$',
  '/admin/',
  '/admin?',
  '/api$',
  '/api?',
  '/api/',
  '/preview$',
  '/preview?',
  '/preview/',
  '/?s=',
] as const;

/** Extra Allow rules need a literal prefix disjoint from crawl traps; root and theme CSS are exceptions. */
const extraAllow = (line: string) => {
  const match = /^Allow:\s*(.*)$/i.exec(line.trim());

  if (!match) return true;
  const pattern = match[1]!.replace(
    /%([0-9a-f]{2})/gi,
    (encoded, hex: string) => {
      const char = String.fromCharCode(Number.parseInt(hex, 16));

      return /^[A-Za-z0-9._~-]$/.test(char) ? char : encoded;
    },
  );

  if (!pattern || pattern === '/') return true;
  const prefix = pattern.split('*')[0]!.replace(/\$$/, '');

  if (prefix.startsWith('/preview/theme/')) return true;

  return !SEO_ROBOTS_DISALLOW_PATHS.some((rule) => {
    const path = rule.split('*')[0]!.replace(/\$$/, '');
    const exact = rule.endsWith('$') && !rule.includes('*');

    return path.startsWith(prefix) || (!exact && prefix.startsWith(path));
  });
};

const settingsShape = {
  siteUrl: siteOriginSchema,
  alternateName: text(191),
  twitterCreator: z
    .string()
    .trim()
    .regex(/^(@[A-Za-z0-9_]{1,15})?$/)
    .default(''),
  archiveOverrides: z
    .array(
      z.object({
        kind: z.enum(['author', 'archive']),
        key: z.string().trim().min(1).max(191),
        title: text(200),
        description: text(500),
        imageUrl: optionalUrl,
        noIndex: z.boolean().default(false),
      }),
    )
    .max(500)
    .default([]),
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
  aiBotOverrides: z
    .string()
    .max(10000)
    .default('')
    .refine(
      (value) =>
        value
          .split(/\r?\n/)
          .every(
            (line) =>
              !line.trim() ||
              /^[A-Za-z][A-Za-z0-9_-]{0,99}:\s*(allow|disallow)$/i.test(
                line.trim(),
              ),
          ),
      'Use one Bot: allow or Bot: disallow rule per line',
    ),
  extraRobotsRules: z
    .string()
    .max(20000)
    .default('')
    .refine(
      (value) =>
        !Array.from(value).some(
          (char) =>
            (char < ' ' && !'\t\r\n'.includes(char)) || char === '\u007f',
        ) &&
        value
          .split(/\r?\n/)
          .every(
            (line) =>
              !line.trim() ||
              /^#/.test(line.trim()) ||
              /^(?:User-agent:\s*(?:\*|[A-Za-z][A-Za-z0-9_-]{0,99})|(?:Allow|Disallow):\s*(?:\/[^\s<>]*)?|Crawl-delay:\s*\d+(?:\.\d+)?|Sitemap:\s*https?:\/\/[^\s<>]+)\s*$/i.test(
                line.trim(),
              ),
          ),
      'Use valid robots.txt directives, one per line',
    )
    .refine(
      (value) => value.split(/\r?\n/).every(extraAllow),
      'Allow rules must not override generated crawl-trap exclusions',
    ),
  feedsEnabled: z.boolean().default(true),
  indexNowEnabled: z.boolean().default(false),
  // Public ownership proof, not an account credential.
  indexNowKey: z
    .string()
    .regex(/^(?:[a-f0-9]{32})?$/)
    .default(''),
  webSubHub: optionalUrl,
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
  sort: z.enum(['stable', 'modified', 'popular']).default('stable'),
  kind: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,63}$/)
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
  images: z
    .array(
      z.object({
        url: safeHttpUrlSchema,
        title: z.string().max(1000).optional(),
        caption: z.string().max(2000).optional(),
      }),
    )
    .max(1000)
    .optional(),
  alternates: z
    .array(
      z.object({
        lang: z
          .string()
          .max(100)
          .regex(/^(?:x-default|[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*)$/),
        url: safeHttpUrlSchema,
      }),
    )
    .max(100)
    .optional(),
});
export type SeoSitemapEntry = z.output<typeof seoSitemapEntrySchema>;
