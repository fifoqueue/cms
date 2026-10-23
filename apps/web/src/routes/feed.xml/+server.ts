import { contentApi } from '#lib/server/api.js';
import {
  feedTypes,
  loadBodies,
  loadRecent,
  missingSiteUrl,
  notFound,
  rssFeed,
} from '#lib/server/seo-discovery.js';
import { FEED_KINDS, feedPath } from '#lib/seo/paths.js';
import type { FeedTarget } from '#lib/seo/paths.js';
import type { RequestHandler } from './$types';

/** `?category=`, `?tag=` or `?author=` narrows the feed to one archive. */
const targetOf = (url: URL): FeedTarget | null => {
  for (const kind of FEED_KINDS) {
    const slug = url.searchParams.get(kind)?.trim();
    if (slug) return { kind, slug: slug.slice(0, 191) };
  }
  return null;
};

export const GET: RequestHandler = async ({ fetch, url }) => {
  const api = contentApi(fetch);
  const target = targetOf(url);
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
  const items = await loadRecent(
    api,
    settings,
    feedTypes(types),
    reading?.feedItems,
    narrowed ? { [narrowed.kind]: narrowed.slug } : {},
  );
  return rssFeed(site, settings, items, {
    title: followed?.name,
    self: feedPath(narrowed ?? undefined),
    bodies:
      reading?.feedContent === 'excerpt'
        ? undefined
        : await loadBodies(api, items),
  });
};
