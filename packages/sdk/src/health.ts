import { z } from 'zod';

export const HEALTH_CHECKS = [
  'siteUrl',
  'email',
  'search',
  'scheduler',
  'jobs',
  'plugins',
  'visitorProof',
] as const;

export type HealthCheckKey = (typeof HEALTH_CHECKS)[number];

/** One finding of Tools → Site health. `detail` is data (names, counts, messages), not prose. */
export const healthCheckSchema = z.object({
  key: z.union([
    z.enum(HEALTH_CHECKS),
    z.templateLiteral(['plugin:', z.string(), ':', z.string()]),
  ]),
  status: z.enum(['good', 'recommended', 'critical']),
  detail: z.array(z.string().max(2048)).max(100),
});

export type HealthCheck = z.output<typeof healthCheckSchema>;

export const siteHealthSchema = z.object({
  checks: z.array(healthCheckSchema),
  info: z.object({
    cms: z.string(),
    runtime: z.string(),
    database: z.string(),
  }),
});

export type SiteHealth = z.output<typeof siteHealthSchema>;

/** What an import created, and what it left out (with the reason in words). */
/**
 * Authors of the file without a matching user (by email or login): assigned to the importing
 * administrator, or new accounts with that role (WordPress importer "Assign authors").
 */
export const IMPORT_AUTHOR_MODES = ['me', 'author', 'subscriber'] as const;
export type ImportAuthorMode = (typeof IMPORT_AUTHOR_MODES)[number];

export const wxrImportOptionsSchema = z.object({
  authors: z.enum(IMPORT_AUTHOR_MODES).default('me'),
});
export type WxrImportOptions = z.input<typeof wxrImportOptionsSchema>;

export const wxrImportResultSchema = z.object({
  content: z.number().int(),
  categories: z.number().int(),
  tags: z.number().int(),
  comments: z.number().int(),
  /** Accounts created for authors of the file. */
  users: z.number().int().default(0),
  menus: z.number().int().default(0),
  /** Old addresses that now redirect to the imported entries. */
  redirects: z.number().int().default(0),
  skipped: z.array(z.object({ title: z.string(), reason: z.string() })),
  /**
   * Media of the old site still referenced by address (not downloaded): upload them to the
   * library and replace the references; `featured` counts entries that used it as featured image.
   */
  attachments: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
        featured: z.number().int(),
      }),
    )
    .default([]),
});

export type WxrImportResult = z.output<typeof wxrImportResultSchema>;
