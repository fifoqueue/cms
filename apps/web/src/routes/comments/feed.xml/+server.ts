import { contentApi } from '#lib/server/api.js';
import {
  commentFeed,
  conditionalResponse,
  isDiscoverable,
  missingSiteUrl,
  newestDate,
  notFound,
} from '#lib/server/seo-discovery.js';
import { mapLimit } from '#lib/server/bounded.js';
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
  if (!seo.feedsEnabled) return notFound();
  const comments = await api.comments
    .feed(url.searchParams.get('contentId') ?? undefined, reading.feedItems)
    .catch(notFoundFrom);
  const paths = [...new Set(comments.map((comment) => comment.path))];
  const visible = new Set(
    await mapLimit(paths, async (path) => {
      const resolved = await api.resolvePath(path).catch(() => null);

      return resolved?.content &&
        isDiscoverable(resolved.content, { ...seo, indexingEnabled: true })
        ? path
        : null;
    }),
  );
  const items = comments
    .filter((comment) => visible.has(comment.path))
    .map((comment): FeedItem => ({
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

  const self = `${seo.siteUrl}/comments/feed.xml${url.searchParams.has('contentId') ? `?contentId=${encodeURIComponent(url.searchParams.get('contentId')!)}` : ''}`;
  const response = commentFeed(channel, filtered, self);

  response.headers.set('x-robots-tag', 'noindex');

  return conditionalResponse(
    event.request,
    response,
    newestDate(filtered.map((item) => item.publishedAt)),
  );
};
