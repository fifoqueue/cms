import { contentApi } from '#lib/server/api.js';
import { SEO_SITEMAP_PAGE_SIZE } from '@cms/sdk';
import { mapLimit } from '#lib/server/bounded.js';
import {
  missingSiteUrl,
  notFound,
  sitemapIndex,
  sitemapChunkCount,
  conditionalResponse,
  newestDate,
  sitemapParts,
  sitemapHomeDate,
  SITEMAP_INDEX_LIMIT,
} from '#lib/server/seo-discovery.js';
import { Errors } from '#lib/server/errors.js';
import type { RequestHandler } from './$types';

/**
 * Index of every chunk of every registered provider (core and plugin kinds); each kind's
 * total comes from a one-entry page.
 */
export const GET: RequestHandler = async ({ fetch, request }) => {
  const api = contentApi(fetch);
  const [settings, kinds, reading] = await Promise.all([
    api.seo.settings(),
    api.seo.providers(),
    api.reading(),
  ]);

  if (!settings.indexingEnabled) return notFound();
  if (!settings.siteUrl) return missingSiteUrl('The sitemap');
  const totals = await mapLimit(kinds, (kind) =>
    api.seo.sitemap({ kind, pageSize: 1 }).then((page) => page.total),
  );

  const counts = Object.fromEntries(
    kinds.map((kind, index) => [kind, totals[index]!]),
  );

  if (
    kinds.reduce(
      (sum, kind) => sum + sitemapChunkCount(kind, counts[kind]!),
      0,
    ) > SITEMAP_INDEX_LIMIT
  )
    throw new Error(Errors.SitemapIndexTooLarge);
  const homeDate = kinds.includes('content')
    ? await sitemapHomeDate(api, reading.frontPage)
    : undefined;
  const chunks = kinds.flatMap((kind) =>
    Array.from(
      { length: sitemapChunkCount(kind, counts[kind]!) },
      (_, page) => ({ kind, page: page + 1 }),
    ),
  );
  let partCount = 0;
  const parts = await mapLimit(chunks, async ({ kind, page }) => {
    const result = await api.seo.sitemap({
      kind,
      page,
      pageSize: SEO_SITEMAP_PAGE_SIZE,
    });

    const locations: { path: string; updatedAt?: string }[] = [];
    let part = 0;

    for (const chunk of sitemapParts(
      settings.siteUrl,
      result.items,
      kind === 'content' && page === 1,
      homeDate,
      kind === 'content' ? reading.frontPagePath : undefined,
    )) {
      if (++partCount > SITEMAP_INDEX_LIMIT)
        throw new Error(Errors.SitemapIndexTooLarge);
      part++;
      locations.push({
        path: `/sitemaps/${kind}/${page}.xml${part > 1 ? `?part=${part}` : ''}`,
        updatedAt: chunk.updatedAt,
      });
    }

    return locations;
  });
  const locations = parts.flat();
  const modified = newestDate(
    locations.flatMap(({ updatedAt }) => (updatedAt ? [updatedAt] : [])),
  );

  return conditionalResponse(
    request,
    sitemapIndex(settings.siteUrl, locations),
    modified,
  );
};
