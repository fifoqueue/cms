import { redirect } from '@sveltejs/kit';
import { archivePath } from '@cms/sdk';
import type { ArchivePathsState, PublicContentListQuery } from '@cms/sdk';
import type { TaxonomyType } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { contentApi } from '#lib/server/api.js';
import { notFoundFrom } from '#lib/server/errors.js';
import {
  listView,
  requirePage,
  pageParam,
  termArchiveView,
} from '#lib/server/public-view.js';
import { loadSlots } from '#lib/server/slots.js';
import { loadTemplateData } from '#lib/server/theme-queries.js';
import type { LayoutBlockData } from '#lib/server/theme-queries.js';
import { withSeoMeta } from '#lib/server/page-meta.js';
import type { HeadLayout } from '#lib/server/page-meta.js';
import type { FilterEvent } from '#lib/server/seo-filter.js';
import { HOME_LIST_TYPES } from '#lib/theme/pagination.js';
import type { HomeListType } from '#lib/theme/pagination.js';

/** A category or tag archive: the term (404 when unknown) and all assigned published content. */
export const loadTermArchive = async (
  event: FilterEvent & { url: URL },
  taxonomy: TaxonomyType,
  slug: string,
  layout: Promise<
    LayoutBlockData &
      HeadLayout & {
        reading: { postsPerPage: number };
        archives?: ArchivePathsState;
      }
  >,
  /** Already requested by a caller that learned late that the path is an archive. */
  slots = loadSlots(contentApi(event.fetch), { path: event.url.pathname }),
) => {
  const { url } = event;
  const api = contentApi(event.fetch);
  const loaded = await layout;
  const { reading, archives } = loaded;
  const pageSize = reading.postsPerPage;
  const list = (termSlug: string) =>
    api.list({
      ...(taxonomy === 'category' || taxonomy === 'tag'
        ? { [taxonomy]: termSlug }
        : { taxonomy, term: termSlug }),
      page: pageParam(url),
      pageSize,
    });
  // Requested together with the term, whose lookup decides the error.
  const guess = list(slug);
  guess.catch(() => undefined);
  const term = await api.taxonomy.getBySlug(taxonomy, slug).catch(notFoundFrom);
  const canonicalPath =
    taxonomy === 'category' || taxonomy === 'tag'
      ? archivePath(
          archives?.bases ?? { category: '/category', tag: '/tag' },
          taxonomy,
          term.slug,
        )
      : `/taxonomy/${encodeURIComponent(taxonomy)}/${encodeURIComponent(term.slug)}`;
  if (url.pathname !== canonicalPath)
    redirect(308, `${canonicalPath}${url.search}`);
  // The term lookup ignores case and padding; list by the stored slug when spelled differently.
  const posts = await (term.slug === slug ? guess : list(term.slug));
  requirePage(posts);
  const page = {
    kind: 'term' as const,
    term: { ...termArchiveView(term), path: canonicalPath },
    posts: listView(posts),
  };
  const [blocks, loadedSlots, meta] = await Promise.all([
    loadTemplateData(api, loaded, page),
    slots,
    withSeoMeta(event, loaded, page),
  ]);
  return { ...page, slots: loadedSlots, seoMeta: meta.seoMeta, ...blocks };
};

/** Page `?page=` of the published entries `query` selects; 404 past the last page. */
export const listPosts = async (
  api: ContentClient,
  url: URL,
  query: Omit<PublicContentListQuery, 'page' | 'pageSize'>,
  pageSize: number,
) => {
  const posts = await api.list({ ...query, page: pageParam(url), pageSize });
  requirePage(posts);
  return listView(posts);
};

/** Latest entries of `type`; sticky ones lead the first page and are left out of the rest (WordPress). */
/**
 * The home list: the requested type, or, without an explicit `?type=`, the first home type
 * with published entries when the default one has none (a site with only articles lists them
 * at `/`). Explicit choices are kept even when empty.
 */
export const homePosts = async (
  api: ContentClient,
  requested: HomeListType,
  explicit: boolean,
  page: number,
  pageSize: number,
) => {
  const posts = await latestPosts(api, requested, page, pageSize);
  if (explicit || posts.items.length) return { type: requested, posts };
  for (const type of HOME_LIST_TYPES) {
    if (type === requested) continue;
    const other = await latestPosts(api, type, page, pageSize);
    if (other.items.length) return { type, posts: other };
  }
  return { type: requested, posts };
};

export const latestPosts = async (
  api: ContentClient,
  type: string,
  page: number,
  pageSize: number,
) => {
  const [posts, sticky] = await Promise.all([
    api.list({ type, sticky: 'exclude', page, pageSize }),
    page === 1 ? api.list({ type, sticky: 'only', pageSize }) : null,
  ]);
  requirePage(posts);
  const listed = listView(posts);
  return sticky
    ? { ...listed, items: [...listView(sticky).items, ...listed.items] }
    : listed;
};
