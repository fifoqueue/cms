import { SEO_SITEMAP_PAGE_SIZE } from '@cms/sdk';
import { contentApi } from '#lib/server/api.js';
import {
  isSitemapKind,
  missingSiteUrl,
  notFound,
  sitemapChunk,
  sitemapChunkCount,
  conditionalResponse,
  sitemapHomeDate,
} from '#lib/server/seo-discovery.js';
import { notFoundFrom } from '#lib/server/errors.js';
import type { RequestHandler } from './$types';

/** `/sitemaps/<kind>/<page>.xml`: one API page of sitemap entries. */
export const GET: RequestHandler = async ({ fetch, params, request, url }) => {
  const { kind } = params;
  const part = url.searchParams.get('part') ?? '1';

  if (
    !isSitemapKind(kind) ||
    !/^[1-9]\d{0,6}$/.test(params.page) ||
    !/^[1-9]\d{0,6}$/.test(part)
  )
    return notFound();
  const page = Number(params.page);
  const api = contentApi(fetch);
  const [settings, entries, reading] = await Promise.all([
    api.seo.settings(),
    // Any registered provider kind; an unknown one is a 404 from the API.
    api.seo
      .sitemap({ kind, page, pageSize: SEO_SITEMAP_PAGE_SIZE })
      .catch(notFoundFrom),
    api.reading(),
  ]);

  if (
    !settings.indexingEnabled ||
    page > sitemapChunkCount(kind, entries.total)
  )
    return notFound();
  if (!settings.siteUrl) return missingSiteUrl('The sitemap');

  const homeDate =
    kind === 'content' && page === 1
      ? await sitemapHomeDate(api, reading.frontPage)
      : undefined;
  const response = sitemapChunk(
    settings.siteUrl,
    entries.items,
    kind === 'content' && page === 1,
    homeDate,
    kind === 'content' ? reading.frontPagePath : undefined,
    Number(part),
  );

  return conditionalResponse(request, response);
};
