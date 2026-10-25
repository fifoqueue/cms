/** Where a paginated public listing lives; its filters are kept on every page link. */
export type ListingTarget =
  /** `path` is the posts page when the front page is static. */
  | { kind: 'taxonomy'; taxonomy: string; slug: string; path?: string }
  | { kind: 'home'; type: HomeListType; path?: string }
  | { kind: 'date'; year: number; month: number | null; day?: number }
  | { kind: 'search'; query: string }
  | {
      kind: 'category' | 'tag' | 'author' | 'archive';
      slug: string;
      path?: string;
    };

/** Content types the home page lists, one at a time; `post` is the default (no parameter). */
export const HOME_LIST_TYPES = ['post', 'article'] as const;
export type HomeListType = (typeof HOME_LIST_TYPES)[number];

/** Query string (without `?`) for one page of a listing, keeping its filters. */
export const pageQuery = (target: ListingTarget, page: number) => {
  const params = new URLSearchParams();
  if (target.kind === 'search') params.set('q', target.query);
  if (target.kind === 'home' && target.type !== 'post')
    params.set('type', target.type);
  params.set('page', String(page));
  return params.toString();
};

export const lastPageOf = ({
  total,
  pageSize,
}: {
  total: number;
  pageSize: number;
}) => Math.max(1, Math.ceil(total / pageSize));

/** Page links to show: the first, the last and two either side of the current page. */
export const pageWindow = (page: number, lastPage: number) =>
  [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, lastPage])]
    .filter((number) => number > 0 && number <= lastPage)
    .sort((a, b) => a - b);

export const termTarget = (
  taxonomy: string,
  slug: string,
  path?: string,
): ListingTarget =>
  taxonomy === 'category' || taxonomy === 'tag'
    ? { kind: taxonomy, slug, path }
    : { kind: 'taxonomy', taxonomy, slug, path };
