import { error } from '@sveltejs/kit';
import { isIndependentQuery, walkBlocks } from '@cms/sdk';
import type { Block, PublicTaxonomyTerm, TaxonomyType } from '@cms/sdk';
import { childrenOf } from '@cms/sdk/tree';
import type { contentApi } from '#lib/server/api.js';
import { Errors } from '#lib/server/errors.js';
import { listView } from '#lib/server/public-view.js';
import type { PostList, ThemeView } from '#lib/server/public-view.js';
import { queryKey, selectionOf } from '#lib/theme/queries.js';
import type { QuerySelection } from '#lib/theme/queries.js';
import {
  isFrontPage,
  pickTemplate,
  templateCandidates,
} from '#lib/theme/template.js';
import type { ThemePage } from '#lib/theme/template.js';

type Api = ReturnType<typeof contentApi>;

/** A listed term, in tree order with its depth (categories) or flat (tags). */
export interface TermItem {
  name: string;
  slug: string;
  count: number;
  depth: number;
}

export interface EntryLink {
  title: string;
  path: string;
}

/** What the data blocks of a template show; only what the template uses is loaded. */
export interface BlockData {
  /** Independent `query` and `latest-posts` results by `queryKey`. */
  queries: Record<string, PostList>;
  terms: { category: TermItem[] | null; tag: TermItem[] | null };
  months: { year: number; month: number; count: number }[] | null;
  adjacent: { previous: EntryLink | null; next: EntryLink | null } | null;
}

/** A template's blocks followed by those of the parts it includes, each part once. */
export const withParts = (blocks: Block[], parts: ThemeView['parts']) => {
  const all = [...blocks];
  const seen = new Set<string>();
  const include = (list: Block[]) => {
    for (const block of walkBlocks(list)) {
      if (block.name !== 'template-part' || seen.has(block.attrs.slug))
        continue;
      seen.add(block.attrs.slug);
      const part = parts.find(({ slug }) => slug === block.attrs.slug);
      if (part) {
        all.push(...part.blocks);
        include(part.blocks);
      }
    }
  };
  include(blocks);
  return all;
};

/** Terms with published entries; categories as a tree (each term once, cycles ignored). */
const termItems = (terms: PublicTaxonomyTerm[], tree: boolean): TermItem[] => {
  const used = terms.filter((term) => term.count > 0);
  if (!tree)
    return used.map(({ name, slug, count }) => ({
      name,
      slug,
      count,
      depth: 0,
    }));
  const ids = new Set(used.map((term) => term.id));
  const children = childrenOf(used);
  const items: TermItem[] = [];
  const seen = new Set<string>();
  const visit = (term: PublicTaxonomyTerm, depth: number) => {
    if (seen.has(term.id)) return;
    seen.add(term.id);
    items.push({ name: term.name, slug: term.slug, count: term.count, depth });
    for (const child of children.get(term.id) ?? []) visit(child, depth + 1);
  };
  for (const term of used)
    if (!term.parentId || !ids.has(term.parentId)) visit(term, 0);
  return items;
};

const link = (entry: { title: string; path: string } | null) =>
  entry && { title: entry.title, path: entry.path };

/**
 * Loads, in parallel, what the data blocks among `blocks` show. Post lists fail the page like
 * its own list would; term lists, monthly archives and post navigation are optional extras.
 */
export const loadBlockData = async (
  api: Api,
  blocks: Block[],
  contentId: string | null,
): Promise<BlockData> => {
  const all = [...walkBlocks(blocks)];
  const queries = new Map<string, QuerySelection>();
  for (const block of all)
    if (isIndependentQuery(block)) {
      const selection = selectionOf(
        block as Extract<Block, { name: 'query' | 'latest-posts' }>,
      );
      queries.set(queryKey(selection), selection);
    }
  if (queries.size > 32) error(400, Errors.ThemeQueriesLimit);
  const has = (name: Block['name']) => all.some((block) => block.name === name);
  const terms = (taxonomy: TaxonomyType) =>
    api.taxonomy.list(taxonomy).then(
      (list) => termItems(list, taxonomy === 'category'),
      () => null,
    );
  const monthCount = Math.max(
    0,
    ...all.map((block) => (block.name === 'archives' ? block.attrs.months : 0)),
  );
  const [lists, category, tag, months, adjacent] = await Promise.all([
    Promise.all(
      [...queries].map(
        async ([key, selection]) =>
          [
            key,
            listView(
              await api.list({
                type: selection.type || undefined,
                category: selection.category || undefined,
                tag: selection.tag || undefined,
                author: selection.author || undefined,
                pageSize: selection.count,
              }),
            ),
          ] as const,
      ),
    ),
    has('categories') ? terms('category') : null,
    has('tag-cloud') ? terms('tag') : null,
    monthCount ? api.months(monthCount).catch(() => null) : null,
    contentId && has('post-navigation')
      ? api.adjacent(contentId).then(
          ({ previous, next }) => ({
            previous: link(previous),
            next: link(next),
          }),
          () => null,
        )
      : null,
  ]);
  return {
    queries: Object.fromEntries(lists),
    terms: { category, tag },
    months:
      months &&
      months.map(({ year, month, count }) => ({ year, month, count })),
    adjacent,
  };
};

/** Block data of the template `page` renders with, and of the parts it includes. */
export const loadTemplateData = (api: Api, theme: ThemeView, page: ThemePage) =>
  loadBlockData(
    api,
    withParts(
      pickTemplate(
        theme.templates,
        templateCandidates(page, isFrontPage(page)),
      ),
      theme.parts,
    ),
    page.kind === 'content' ? page.content.id : null,
  );

/** Page data plus the block data of its template; the layout is loaded alongside. */
export const withTemplateData = async <P extends ThemePage>(
  api: Api,
  parent: () => Promise<{ theme: ThemeView }>,
  page: P,
) => ({
  ...page,
  ...(await loadTemplateData(api, (await parent()).theme, page)),
});

/** Block data of every template and part, for the site editor's canvas. */
export const loadThemeData = (api: Api, theme: ThemeView) =>
  loadBlockData(
    api,
    [
      ...Object.values(theme.templates).flat(),
      ...theme.parts.flatMap((part) => part.blocks),
    ],
    null,
  );
