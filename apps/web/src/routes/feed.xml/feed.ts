import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { CONTENT_SLUG } from '@cms/sdk';
import { contentApi, mediaFiles } from '#lib/server/api.js';
import { siteTranslation } from '#lib/i18n/overrides.server.js';
import { filterDiscovery } from '#lib/server/seo-filter.js';
import {
  feedTypes,
  feedValues,
  loadBodies,
  loadRecent,
  missingSiteUrl,
  notFound,
  rssFeed,
  conditionalResponse,
  newestDate,
} from '#lib/server/seo-discovery.js';
import { FEED_KINDS, feedPath } from '#lib/seo/paths.js';
import type { FeedTarget } from '#lib/seo/paths.js';
import { jsonFeed } from '#web/routes/feed.xml/json-feed.js';

/**
 * `?category=`, `?tag=` or `?author=` narrows the feed to one archive. A value that is not a
 * slug (`undefined`) has no feed; it is never shortened into another archive's slug.
 */
const targetOf = (url: URL): FeedTarget | null | undefined => {
  for (const kind of FEED_KINDS) {
    const slug = url.searchParams.get(kind);

    if (slug === null) continue;

    const term = kind === 'taxonomy' ? url.searchParams.get('term') : null;

    return slug.length <= 191 &&
      CONTENT_SLUG.test(slug) &&
      (kind !== 'taxonomy' ||
        (term && term.length <= 191 && CONTENT_SLUG.test(term)))
      ? kind === 'taxonomy'
        ? { kind, taxonomy: slug, slug: term! }
        : { kind, slug }
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

export const serveFeed = async (
  event: Pick<RequestEvent, 'fetch' | 'request' | 'url' | 'getClientAddress'>,
  json = false,
) => {
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
        : target.kind === 'archive'
          ? api.contentTypes().then((types) => {
              const type = types.find(
                (type) => type.key === target.slug && type.archive,
              );

              return type
                ? { name: type.pluralName, slug: type.key }
                : undefined;
            })
          : api.taxonomy
              .getBySlug(
                target.kind === 'taxonomy' ? target.taxonomy! : target.kind,
                target.slug,
              )
              .then(
                ({ name, slug }) => ({ name, slug }),
                () => undefined,
              ),
  ]);

  if (!settings.feedsEnabled || followed === undefined) return notFound();
  if (!settings.siteUrl) return missingSiteUrl('The feed');
  const narrowed = target && followed && { ...target, slug: followed.slug };
  const self = feedPath(narrowed ?? undefined).replace(
    '/feed.xml',
    json ? '/feed.json' : '/feed.xml',
  );
  const canonicalPath = narrowed ? self : null;

  if (canonicalPath && `${url.pathname}${url.search}` !== canonicalPath)
    redirect(308, canonicalPath);
  const [items, translation] = await Promise.all([
    loadRecent(
      api,
      { ...settings, indexingEnabled: true },
      narrowed?.kind === 'archive' ? [narrowed.slug] : feedTypes(types),
      reading?.feedItems,
      narrowed?.kind === 'taxonomy'
        ? { taxonomy: narrowed.taxonomy, term: narrowed.slug }
        : narrowed && narrowed.kind !== 'archive'
          ? { [narrowed.kind]: narrowed.slug }
          : {},
    ),
    siteTranslation(fetch, site.locale),
  ]);
  // The channel language follows the locale the API chose for the site.
  const shown = { ...site, locale: translation.locale };
  const values = feedValues(shown, settings, items, followed?.name);
  const [bodies, [channel, filteredItems]] = await Promise.all([
    reading?.feedContent === 'excerpt'
      ? undefined
      : loadBodies(api, items, mediaSize(fetch)),
    filterDiscovery(event, [
      { kind: 'feed.channel', value: values.channel },
      { kind: 'feed.items', value: values.items },
    ]),
  ]);

  const response = json
    ? jsonFeed(
        { channel, items: filteredItems },
        settings.siteUrl,
        self,
        bodies,
      )
    : rssFeed(shown, settings, items, {
        self,
        bodies,
        filtered: { channel, items: filteredItems },
      });

  response.headers.set('x-robots-tag', 'noindex');

  return conditionalResponse(
    event.request,
    response,
    newestDate(filteredItems.map((item) => item.updatedAt || item.publishedAt)),
  );
};
