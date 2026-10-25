import { contentApi } from '#lib/server/api.js';
import { mapLimit } from '#lib/server/bounded.js';
import {
  missingSiteUrl,
  notFound,
  sitemapIndex,
} from '#lib/server/seo-discovery.js';
import type { RequestHandler } from './$types';

/**
 * Index of every chunk of every registered provider (core and plugin kinds); each kind's
 * total comes from a one-entry page.
 */
export const GET: RequestHandler = async ({ fetch }) => {
  const api = contentApi(fetch);
  const [settings, kinds] = await Promise.all([
    api.seo.settings(),
    api.seo.providers(),
  ]);
  if (!settings.indexingEnabled) return notFound();
  if (!settings.siteUrl) return missingSiteUrl('The sitemap');
  const totals = await mapLimit(kinds, (kind) =>
    api.seo.sitemap({ kind, pageSize: 1 }).then((page) => page.total),
  );
  return sitemapIndex(
    settings.siteUrl,
    Object.fromEntries(kinds.map((kind, index) => [kind, totals[index]!])),
  );
};
