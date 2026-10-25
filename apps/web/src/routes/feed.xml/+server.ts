import { redirect } from '@sveltejs/kit';
import { CONTENT_SLUG } from '@cms/sdk';
import { contentApi, mediaFiles } from '#lib/server/api.js';
import { filterDiscovery } from '#lib/server/seo-filter.js';
import {
  feedTypes,
  feedValues,
  loadBodies,
  loadRecent,
  missingSiteUrl,
  notFound,
  rssFeed,
} from '#lib/server/seo-discovery.js';
import { FEED_KINDS, feedPath } from '#lib/seo/paths.js';
import type { FeedTarget } from '#lib/seo/paths.js';
import type { RequestHandler } from './$types';

/**
 * `?category=`, `?tag=` or `?author=` narrows the feed to one archive. A value that is not a
 * slug (`undefined`) has no feed; it is never shortened into another archive's slug.
 */
const targetOf = (url: URL): FeedTarget | null | undefined => {
  for (const kind of FEED_KINDS) {
    const slug = url.searchParams.get(kind);
    if (slug === null) continue;
    return slug.length <= 191 && CONTENT_SLUG.test(slug)
      ? { kind, slug }
      : undefined;
  }
  return null;
};

/** A library file's size from a one-byte range request, without downloading it. */
const mediaSize =
  (fetch: typeof globalThis.fetch) =>
  async (key: string): Promise<number | null> => {
    const response = await mediaFiles(fetch)
      .file(key, 'bytes=0-0')
      .catch(() => null);
    if (!response) return null;
    await response.body?.cancel();
    const total =
      response.status === 206
        ? /\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1]
        : response.ok
          ? response.headers.get('content-length')
          : null;
    const size = Number(total);
    return Number.isSafeInteger(size) && size > 0 ? size : null;
  };

export const GET: RequestHandler = async (event) => {
  const { fetch, url } = event;
  const api = contentApi(fetch);
  const target = targetOf(url);
  if (target === undefined) return notFound();
  const [settings, site, reading, types, followed] = await Promise.all([
    api.seo.settings(),
    api.site(),
    api.reading().catch(() => null),
    api.contentTypes().catch(() => null),
    // The archive's name titles the feed; an unknown one has no feed.
    !target
      ? null
      : target.kind === 'author'
        ? api.author(target.slug).then(
            ({ name, slug }) => ({ name, slug }),
            () => undefined,
          )
        : api.taxonomy.getBySlug(target.kind, target.slug).then(
            ({ name, slug }) => ({ name, slug }),
            () => undefined,
          ),
  ]);
  if (!settings.indexingEnabled || followed === undefined) return notFound();
  if (!settings.siteUrl) return missingSiteUrl('The feed');
  const narrowed = target && followed && { ...target, slug: followed.slug };
  const canonicalPath = narrowed ? feedPath(narrowed) : null;
  if (canonicalPath && `${url.pathname}${url.search}` !== canonicalPath)
    redirect(308, canonicalPath);
  const items = await loadRecent(
    api,
    settings,
    feedTypes(types),
    reading?.feedItems,
    narrowed ? { [narrowed.kind]: narrowed.slug } : {},
  );
  const values = feedValues(site, settings, items, followed?.name);
  const [bodies, [channel, filteredItems]] = await Promise.all([
    reading?.feedContent === 'excerpt'
      ? undefined
      : loadBodies(api, items, mediaSize(fetch)),
    filterDiscovery(event, [
      { kind: 'feed.channel', value: values.channel },
      { kind: 'feed.items', value: values.items },
    ]),
  ]);
  return rssFeed(site, settings, items, {
    self: feedPath(narrowed ?? undefined),
    bodies,
    filtered: { channel, items: filteredItems },
  });
};
