import { contentApi } from '#lib/server/api.js';
import {
  llmsEnabled,
  llmsText,
  llmsTxt,
  loadRecent,
  missingSiteUrl,
  notFound,
} from '#lib/server/seo-discovery.js';
import { filterDiscovery } from '#lib/server/seo-filter.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const api = contentApi(event.fetch);
  const [settings, site] = await Promise.all([api.seo.settings(), api.site()]);
  if (!llmsEnabled(settings)) return notFound();
  if (!settings.siteUrl) return missingSiteUrl('llms.txt');
  const items = await loadRecent(api, settings);
  const [text] = await filterDiscovery(event, [
    { kind: 'llms.txt', value: llmsText(site, settings, items) },
  ]);
  return llmsTxt(site, settings, items, text);
};
