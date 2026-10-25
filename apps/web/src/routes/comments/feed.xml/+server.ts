import { contentApi } from '#lib/server/api.js';
import { commentFeed, missingSiteUrl } from '#lib/server/seo-discovery.js';
import type { FeedItem } from '#lib/server/seo-discovery.js';
import { filterDiscovery } from '#lib/server/seo-filter.js';
import { notFoundFrom } from '#lib/server/errors.js';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
  const { url } = event;
  const api = contentApi(event.fetch);
  const [site, seo, reading] = await Promise.all([
    api.site(),
    api.seo.settings(),
    api.reading(),
  ]);
  if (!seo.siteUrl) return missingSiteUrl('The comments feed');
  const comments = await api.comments
    .feed(url.searchParams.get('contentId') ?? undefined, reading.feedItems)
    .catch(notFoundFrom);
  const items = comments.map((comment): FeedItem => ({
    id: comment.id,
    title: `${comment.authorName}: ${comment.title}`,
    link: `${seo.siteUrl}${comment.path}#comment-${comment.id}`,
    description: comment.body,
    publishedAt: comment.createdAt,
    author: comment.authorName,
  }));
  const [channel, filtered] = await filterDiscovery(event, [
    {
      kind: 'feed.channel',
      value: {
        title: site.title,
        link: seo.siteUrl,
        description: site.description,
      },
    },
    { kind: 'feed.items', value: items },
  ]);
  return commentFeed(channel, filtered);
};
