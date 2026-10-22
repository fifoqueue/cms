import { z } from 'zod';
import { Errors } from '#sdk/errors';
import {
  canonicalPermalinkPath,
  MAX_PERMALINK_PATH_LENGTH,
} from '#sdk/permalinks';

const RESERVED = new Set([
  'admin',
  'api',
  '_app',
  'media',
  'preview',
  'author',
  'date',
  'archive',
  'taxonomy',
  'sitemaps',
  'robots.txt',
  'sitemap.xml',
  'feed.xml',
  'llms.txt',
]);

const baseSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_PERMALINK_PATH_LENGTH)
  .transform((input, context) => {
    const path = `${input.startsWith('/') ? '' : '/'}${input}`.replace(
      /\/+$/,
      '',
    );
    const canonical = canonicalPermalinkPath(path);
    const segments = canonical?.slice(1).split('/').map(decodeURIComponent);

    if (
      !canonical ||
      !segments ||
      canonical.length >= MAX_PERMALINK_PATH_LENGTH ||
      segments.some((segment) => /[\\/?#\p{Cc}]/u.test(segment)) ||
      RESERVED.has(segments[0]!.toLowerCase())
    ) {
      context.addIssue({ code: 'custom', message: Errors.BlockAttrFormat });
      return z.NEVER;
    }

    return canonical;
  });

export const archiveBasesSchema = z
  .object({
    category: baseSchema.default('/category'),
    tag: baseSchema.default('/tag'),
  })
  .refine(
    ({ category, tag }) =>
      category !== tag &&
      !category.startsWith(`${tag}/`) &&
      !tag.startsWith(`${category}/`),
    Errors.BlockAttrFormat,
  );

export type ArchiveBases = z.output<typeof archiveBasesSchema>;

export const archivePathsStateSchema = z.object({
  bases: archiveBasesSchema.default({ category: '/category', tag: '/tag' }),
  history: z
    .object({
      category: z.array(baseSchema).default([]),
      tag: z.array(baseSchema).default([]),
    })
    .default({ category: [], tag: [] }),
});

export type ArchivePathsState = z.output<typeof archivePathsStateSchema>;

/** Archive slugs occupy one encoded segment beneath their configured base. */
export const archivePath = (
  bases: ArchiveBases,
  taxonomy: 'category' | 'tag',
  slug: string,
) => `${bases[taxonomy]}/${encodeURIComponent(slug)}`;

/** Current routes take precedence over every historical address. */
export const resolveArchivePath = (state: ArchivePathsState, path: string) => {
  if (path.length > MAX_PERMALINK_PATH_LENGTH) return null;
  const canonical = canonicalPermalinkPath(path)?.replace(/\/$/, '');
  if (!canonical) return null;

  for (const historical of [false, true]) {
    for (const taxonomy of ['category', 'tag'] as const) {
      const bases = historical
        ? state.history[taxonomy]
        : [state.bases[taxonomy]];
      for (const base of bases) {
        if (!canonical.startsWith(`${base}/`)) continue;
        const segment = canonical.slice(base.length + 1);
        if (!segment || segment.includes('/')) continue;
        const slug = decodeURIComponent(segment);
        if (/[\\/?#\p{Cc}]/u.test(slug)) continue;
        const target = archivePath(state.bases, taxonomy, slug);
        return { taxonomy, slug, path: target, redirect: target !== path };
      }
    }
  }

  return null;
};
