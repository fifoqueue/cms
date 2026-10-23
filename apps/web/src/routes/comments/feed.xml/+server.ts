import { contentApi } from '#lib/server/api.js';
import { xmlText, missingSiteUrl } from '#lib/server/seo-discovery.js';
import { notFoundFrom } from '#lib/server/errors.js';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ fetch, url }) => {
  const api = contentApi(fetch);
  const [site, seo, reading] = await Promise.all([
    api.site(),
    api.seo.settings(),
    api.reading(),
  ]);
  if (!seo.siteUrl) return missingSiteUrl('The comments feed');
  const comments = await api.comments
    .feed(url.searchParams.get('contentId') ?? undefined, reading.feedItems)
    .catch(notFoundFrom);
  const items = comments.map((comment) => {
    const link = `${seo.siteUrl}${comment.path}#comment-${comment.id}`;
    return `<item><title>${xmlText(`${comment.authorName}: ${comment.title}`)}</title><link>${xmlText(link)}</link><guid isPermaLink="true">${xmlText(link)}</guid><description>${xmlText(comment.body)}</description><pubDate>${new Date(comment.createdAt).toUTCString()}</pubDate></item>`;
  });
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xmlText(site.title)}</title><link>${xmlText(seo.siteUrl)}</link><description>${xmlText(site.description)}</description>${items.join('')}</channel></rss>`,
    {
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    },
  );
};
