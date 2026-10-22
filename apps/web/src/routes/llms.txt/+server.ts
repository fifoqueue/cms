import { contentApi } from '#lib/server/api.js';
import {
  llmsEnabled,
  llmsTxt,
  loadRecent,
  missingSiteUrl,
  notFound,
} from '#lib/server/seo-discovery.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
  const api = contentApi(fetch);
  const [settings, site] = await Promise.all([api.seo.settings(), api.site()]);
  if (!llmsEnabled(settings)) return notFound();
  if (!settings.siteUrl) return missingSiteUrl('llms.txt');
  return llmsTxt(site, settings, await loadRecent(api, settings));
};
