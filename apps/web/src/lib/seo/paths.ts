// Root-relative public paths used by metadata. Pure: no request, host, or `$app` access, and
// no `@cms/sdk` runtime schemas, because the public client bundle imports this module.
import { pageQuery } from '#lib/theme/pagination.js';
import type { ListingTarget } from '#lib/theme/pagination.js';

/** Discovery documents served by the site's discovery routes. */
export const SITEMAP_PATH = '/sitemap.xml';
export const FEED_PATH = '/feed.xml';
export const LLMS_TXT_PATH = '/llms.txt';

/** Stable Markdown alias of a content entry, independent of its permalink format. */
export const markdownPath = (slug: string) => `/${encodeURIComponent(slug)}.md`;

/** A breadcrumb step; content is addressed by its permalink path, never by slug. */
export type CrumbTarget =
  | { kind: 'taxonomy'; taxonomy: string; slug: string }
  | { kind: 'home' }
  | { kind: 'category' | 'tag'; slug: string }
  | { kind: 'content'; path: string };

/** A date archive: `/date/2026` or `/date/2026/03`. */
export const datePath = (year: number, month: number | null) =>
  month ? `/date/${year}/${String(month).padStart(2, '0')}` : `/date/${year}`;

const listingRoot = (target: ListingTarget) =>
  'path' in target && target.path
    ? target.path
    : target.kind === 'home'
      ? (target.path ?? '/')
      : target.kind === 'taxonomy'
        ? `/taxonomy/${encodeURIComponent(target.taxonomy)}/${encodeURIComponent(target.slug)}`
        : target.kind === 'date'
          ? datePath(target.year, target.month)
          : target.kind === 'category' ||
              target.kind === 'tag' ||
              target.kind === 'author' ||
              target.kind === 'archive'
            ? `/${target.kind}/${target.slug}`
            : '/';

/** One page of a listing with only its own filters; page 1 carries no `page` parameter. */
export const listingPath = (target: ListingTarget, page = 1) => {
  const params = new URLSearchParams(pageQuery(target, page));
  if (page <= 1) params.delete('page');
  const query = params.toString();
  return query ? `${listingRoot(target)}?${query}` : listingRoot(target);
};

export const crumbPath = (target: CrumbTarget) =>
  target.kind === 'content'
    ? target.path
    : target.kind === 'home'
      ? '/'
      : listingPath(target);
