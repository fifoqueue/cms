import { contentApi } from '#lib/server/api.js';
import { robotsText, robotsTxt } from '#lib/server/seo-discovery.js';
import { filterDiscovery } from '#lib/server/seo-filter.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const settings = await contentApi(event.fetch).seo.settings();
  const [text] = await filterDiscovery(event, [
    { kind: 'robots.txt', value: robotsText(settings) },
  ]);
  return robotsTxt(settings, text);
};
