import { contentApi } from '#lib/server/api.js';
import {
  FEED_TYPES,
  loadRecent,
  missingSiteUrl,
  notFound,
  rssFeed,
} from '#lib/server/seo-discovery.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
  const api = contentApi(fetch);
  const [settings, site, reading] = await Promise.all([
    api.seo.settings(),
    api.site(),
    api.reading().catch(() => null),
  ]);
  if (!settings.indexingEnabled) return notFound();
  if (!settings.siteUrl) return missingSiteUrl('The feed');
  return rssFeed(
    site,
    settings,
    await loadRecent(api, settings, FEED_TYPES, reading?.feedItems),
  );
};
