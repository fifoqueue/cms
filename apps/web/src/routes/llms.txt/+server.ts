import { contentApi } from '#lib/server/api.js';
import {
  llmsEnabled,
  llmsText,
  llmsTxt,
  loadRecent,
  missingSiteUrl,
  notFound,
  conditionalResponse,
  feedTypes,
  newestDate,
} from '#lib/server/seo-discovery.js';
import { filterDiscovery } from '#lib/server/seo-filter.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const api = contentApi(event.fetch);
  const [settings, site] = await Promise.all([api.seo.settings(), api.site()]);

  if (!llmsEnabled(settings)) return notFound();
  if (!settings.siteUrl) return missingSiteUrl('llms.txt');
  const types = await api.contentTypes();
  const [pages, posts, topics] = await Promise.all([
    loadRecent(api, settings, ['page']),
    loadRecent(api, settings, feedTypes(types)),
    settings.indexCategories
      ? api.seo
          .sitemap({ kind: 'category', pageSize: 10, sort: 'popular' })
          .then(({ items }) => items)
      : [],
  ]);
  const items = [...pages, ...posts];
  const [text] = await filterDiscovery(event, [
    {
      kind: 'llms.txt',
      value: llmsText(site, settings, items, topics),
      context: { path: '/llms.txt' },
    },
  ]);

  return conditionalResponse(
    event.request,
    llmsTxt(site, settings, items, text),
    newestDate(items.map((item) => item.updatedAt)),
  );
};
