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
  key: z.enum(HEALTH_CHECKS),
  status: z.enum(['good', 'recommended', 'critical']),
  detail: z.array(z.string()),
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
export const wxrImportResultSchema = z.object({
  content: z.number().int(),
  categories: z.number().int(),
  tags: z.number().int(),
  comments: z.number().int(),
  skipped: z.array(z.object({ title: z.string(), reason: z.string() })),
});

export type WxrImportResult = z.output<typeof wxrImportResultSchema>;
