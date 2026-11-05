import { contentApi } from '#lib/server/api.js';
import { conditionalResponse, notFound } from '#lib/server/seo-discovery.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch, request }) => {
  const settings = await contentApi(fetch).seo.settings();

  if (!settings.indexNowEnabled || !settings.indexNowKey) return notFound();

  return conditionalResponse(
    request,
    new Response(settings.indexNowKey, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=300',
        'x-robots-tag': 'noindex',
      },
    }),
  );
};
