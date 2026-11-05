// Root-relative public paths used by metadata. Pure: no request, host, or `$app` access, and
// no `@cms/sdk` runtime schemas, because the public client bundle imports this module.
import { pageQuery } from '#lib/theme/pagination.js';
import type { ListingTarget } from '#lib/theme/pagination.js';
import type { ArchiveBases } from '@cms/sdk';
import { archivePath } from '@cms/sdk/archive-links';

/** Discovery documents served by the site's discovery routes. */
export const SITEMAP_PATH = '/sitemap.xml';
export const FEED_PATH = '/feed.xml';
export const JSON_FEED_PATH = '/feed.json';
export const LLMS_TXT_PATH = '/llms.txt';

/** What a narrowed feed follows: a category, tag or author. */
export interface FeedTarget {
  kind: 'category' | 'tag' | 'author' | 'taxonomy' | 'archive';
  slug: string;
  taxonomy?: string;
}

export const FEED_KINDS = [
  'category',
  'tag',
  'author',
  'taxonomy',
  'archive',
] as const;

/** The site feed, or the feed of one category, tag or author. */
export const feedPath = (
  target?: FeedTarget,
  format: 'rss' | 'json' = 'rss',
) =>
  target
    ? `${format === 'rss' ? FEED_PATH : JSON_FEED_PATH}?${target.kind}=${encodeURIComponent(target.kind === 'taxonomy' ? target.taxonomy! : target.slug)}${target.kind === 'taxonomy' ? `&term=${encodeURIComponent(target.slug)}` : ''}`
    : format === 'rss'
      ? FEED_PATH
      : JSON_FEED_PATH;

/** The oEmbed endpoint for an entry's absolute URL. */
export const oembedPath = (url: string) =>
  `/oembed?url=${encodeURIComponent(url)}&format=json`;

/** Stable Markdown alias of a content entry, independent of its permalink format. */
export const markdownPath = (slug: string) => `/${encodeURIComponent(slug)}.md`;

/** The HTML address may differ from the stored permalink for a static front page. */
export const markdownDiscoverable = (
  content: {
    path: string;
    protected?: boolean;
    seo: { noIndex: boolean; canonicalUrl: string };
  },
  siteUrl: string,
  indexingEnabled: boolean,
) =>
  Boolean(siteUrl) &&
  indexingEnabled &&
  !content.protected &&
  !content.seo.noIndex &&
  (!content.seo.canonicalUrl ||
    content.seo.canonicalUrl === `${siteUrl}${content.path}`);

/** A breadcrumb step; content is addressed by its permalink path, never by slug. */
export type CrumbTarget =
  | { kind: 'taxonomy'; taxonomy: string; slug: string }
  | { kind: 'home' }
  | { kind: 'category' | 'tag'; slug: string }
  | { kind: 'content'; path: string };

/** A date archive: `/date/2026` or `/date/2026/03`. */
export const datePath = (year: number, month: number | null, day?: number) =>
  month && day
    ? `/date/${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
    : month
      ? `/date/${year}/${String(month).padStart(2, '0')}`
      : `/date/${year}`;

const listingRoot = (target: ListingTarget) =>
  'path' in target && target.path
    ? target.path
    : target.kind === 'home'
      ? (target.path ?? '/')
      : target.kind === 'taxonomy'
        ? `/taxonomy/${encodeURIComponent(target.taxonomy)}/${encodeURIComponent(target.slug)}`
        : target.kind === 'date'
          ? datePath(target.year, target.month, target.day)
          : target.kind === 'category' ||
              target.kind === 'tag' ||
              target.kind === 'author' ||
              target.kind === 'archive'
            ? `/${target.kind}/${encodeURIComponent(target.slug)}`
            : '/';

/** One page of a listing with only its own filters; page 1 carries no `page` parameter. */
export const listingPath = (target: ListingTarget, page = 1) => {
  const params = new URLSearchParams(pageQuery(target, page));

  if (page <= 1) params.delete('page');
  const query = params.toString();

  return query ? `${listingRoot(target)}?${query}` : listingRoot(target);
};

export const crumbPath = (
  target: CrumbTarget,
  bases: ArchiveBases = { category: '/category', tag: '/tag' },
) =>
  target.kind === 'content'
    ? target.path
    : target.kind === 'home'
      ? '/'
      : target.kind === 'category' || target.kind === 'tag'
        ? archivePath(bases, target.kind, target.slug)
        : listingPath(target);
