import { SEO_SITEMAP_PAGE_SIZE } from '@cms/sdk';
import { contentApi } from '#lib/server/api.js';
import {
  isSitemapKind,
  missingSiteUrl,
  notFound,
  sitemapChunk,
  sitemapChunkCount,
} from '#lib/server/seo-discovery.js';
import type { RequestHandler } from './$types';

/** `/sitemaps/<kind>/<page>.xml`: one API page of sitemap entries. */
export const GET: RequestHandler = async ({ fetch, params }) => {
  const { kind } = params;
  if (!isSitemapKind(kind) || !/^[1-9]\d{0,6}$/.test(params.page))
    return notFound();
  const page = Number(params.page);
  const api = contentApi(fetch);
  const [settings, entries, reading] = await Promise.all([
    api.seo.settings(),
    api.seo.sitemap({ kind, page, pageSize: SEO_SITEMAP_PAGE_SIZE }),
    api.reading().catch(() => null),
  ]);
  if (
    !settings.indexingEnabled ||
    page > sitemapChunkCount(kind, entries.total)
  )
    return notFound();
  if (!settings.siteUrl) return missingSiteUrl('The sitemap');
  return sitemapChunk(
    settings.siteUrl,
    // A static front page is listed as the home page, which redirects it.
    entries.items.filter(
      (entry) => kind !== 'content' || entry.path !== reading?.frontPagePath,
    ),
    kind === 'content' && page === 1,
  );
};
