import favicon from '#lib/assets/favicon.svg';
import { contentApi } from '#lib/server/api.js';
import type { RequestHandler } from './$types';

/**
 * Browsers and crawlers ask for `/favicon.ico` on their own. Answer with a redirect to the site
 * icon (or the default icon) instead of rendering the themed 404 page.
 */
export const GET: RequestHandler = async ({ fetch }) => {
  const icon = (
    await contentApi(fetch)
      .site()
      .catch(() => null)
  )?.icon;
  return new Response(null, {
    status: 302,
    headers: {
      location: icon ? (icon.sizes[0]?.url ?? icon.url) : favicon,
      'cache-control': 'public, max-age=3600',
    },
  });
};
