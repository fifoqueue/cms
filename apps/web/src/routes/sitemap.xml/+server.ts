import { contentApi } from '#lib/server/api.js';
import {
  SITEMAP_KINDS,
  missingSiteUrl,
  notFound,
  sitemapIndex,
} from '#lib/server/seo-discovery.js';
import type { RequestHandler } from './$types';

/** Index of every chunk; each kind's total comes from a one-entry page. */
export const GET: RequestHandler = async ({ fetch }) => {
  const api = contentApi(fetch);
  const [settings, ...pages] = await Promise.all([
    api.seo.settings(),
    ...SITEMAP_KINDS.map((kind) => api.seo.sitemap({ kind, pageSize: 1 })),
  ]);
  if (!settings.indexingEnabled) return notFound();
  if (!settings.siteUrl) return missingSiteUrl('The sitemap');
  const [content, category, tag, author, taxonomy] = pages.map(
    (page) => page.total,
  );
  return sitemapIndex(settings.siteUrl, {
    content: content ?? 0,
    category: category ?? 0,
    tag: tag ?? 0,
    author: author ?? 0,
    taxonomy: taxonomy ?? 0,
  });
};
