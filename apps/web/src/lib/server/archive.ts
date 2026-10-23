import { redirect } from '@sveltejs/kit';
import { archivePath } from '@cms/sdk';
import type { ArchivePathsState } from '@cms/sdk';
import type { TaxonomyType } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';
import { contentApi } from '#lib/server/api.js';
import { notFoundFrom } from '#lib/server/errors.js';
import {
  listView,
  pageParam,
  termArchiveView,
} from '#lib/server/public-view.js';
import type { ThemeView } from '#lib/server/public-view.js';
import { loadSlots } from '#lib/server/slots.js';
import { loadTemplateData } from '#lib/server/theme-queries.js';

/** A category or tag archive: the term (404 when unknown) and all assigned published content. */
export const loadTermArchive = async (
  fetch: typeof globalThis.fetch,
  url: URL,
  taxonomy: TaxonomyType,
  slug: string,
  layout: Promise<{
    reading: { postsPerPage: number };
    archives?: ArchivePathsState;
    theme: ThemeView;
  }>,
) => {
  const api = contentApi(fetch);
  const slots = loadSlots(api, { path: url.pathname });
  const { reading, archives, theme } = await layout;
  const pageSize = reading.postsPerPage;
  const list = (termSlug: string) =>
    api.list({
      ...(taxonomy === 'category' || taxonomy === 'tag'
        ? { [taxonomy]: termSlug }
        : { taxonomy, term: termSlug }),
      page: pageParam(url),
      pageSize,
    });
  const canonicalPath =
    taxonomy === 'category' || taxonomy === 'tag'
      ? archivePath(
          archives?.bases ?? { category: '/category', tag: '/tag' },
          taxonomy,
          slug,
        )
      : `/taxonomy/${encodeURIComponent(taxonomy)}/${encodeURIComponent(slug)}`;
  if (url.pathname !== canonicalPath)
    redirect(308, `${canonicalPath}${url.search}`);
  // Requested together with the term, whose lookup decides the error.
  const guess = list(slug);
  guess.catch(() => undefined);
  const term = await api.taxonomy.getBySlug(taxonomy, slug).catch(notFoundFrom);
  // The term lookup ignores case and padding; list by the stored slug when spelled differently.
  const posts = await (term.slug === slug ? guess : list(term.slug));
  const page = {
    kind: 'term' as const,
    term: { ...termArchiveView(term), path: canonicalPath },
    posts: listView(posts),
  };
  const [blocks, loadedSlots] = await Promise.all([
    loadTemplateData(api, theme, page),
    slots,
  ]);
  return { ...page, slots: loadedSlots, ...blocks };
};

/** Latest entries of `type`; sticky ones lead the first page and are left out of the rest (WordPress). */
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
  const listed = listView(posts);
  return sticky
    ? { ...listed, items: [...listView(sticky).items, ...listed.items] }
    : listed;
};
