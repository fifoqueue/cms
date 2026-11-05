import { contentApi } from '#lib/server/api.js';
import {
  conditionalResponse,
  llmsEnabled,
  missingSiteUrl,
  notFound,
} from '#lib/server/seo-discovery.js';
import { filterDiscovery } from '#lib/server/seo-filter.js';
import { loadCorpus } from '#web/routes/llms-full.txt/corpus.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const api = contentApi(event.fetch);
  const [settings, site] = await Promise.all([api.seo.settings(), api.site()]);

  if (!llmsEnabled(settings)) return notFound();
  if (!settings.siteUrl) return missingSiteUrl('llms-full.txt');
  const corpus = await loadCorpus(api, settings, site.locale);
  const [filtered] = await filterDiscovery(event, [
    {
      kind: 'llms.txt',
      value: corpus.text,
      context: { path: '/llms-full.txt' },
    },
  ]);
  const text =
    new TextEncoder().encode(filtered).byteLength <= 512000
      ? filtered
      : corpus.text;

  return conditionalResponse(
    event.request,
    new Response(text, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=300',
        'x-robots-tag': 'noindex',
      },
    }),
    corpus.modified,
  );
};
