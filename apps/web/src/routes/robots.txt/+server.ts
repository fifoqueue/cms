import { contentApi } from '#lib/server/api.js';
import {
  conditionalResponse,
  robotsText,
  robotsTxt,
} from '#lib/server/seo-discovery.js';
import { SEO_SETTINGS_DEFAULTS } from '@cms/sdk';
import { filterDiscovery } from '#lib/server/seo-filter.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const settings = await contentApi(event.fetch)
    .seo.settings()
    .catch(() => null);

  if (!settings)
    return conditionalResponse(
      event.request,
      new Response(
        robotsText({ ...SEO_SETTINGS_DEFAULTS, indexingEnabled: false }),
        {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=30',
          },
        },
      ),
    );
  const [text] = await filterDiscovery(event, [
    { kind: 'robots.txt', value: robotsText(settings) },
  ]);

  return conditionalResponse(event.request, robotsTxt(settings, text));
};
