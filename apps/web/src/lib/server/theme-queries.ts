import { error } from '@sveltejs/kit';
import { isIndependentQuery, walkBlocks } from '@cms/sdk';
import type {
  Block,
  PublicContentSummary,
  PublicTaxonomyTerm,
  TaxonomyType,
} from '@cms/sdk';
import { childrenOf } from '@cms/sdk/tree';
import type { contentApi } from '#lib/server/api.js';
import { Errors } from '#lib/server/errors.js';
import { listView } from '#lib/server/public-view.js';
import { mapLimit } from '#lib/server/seo-discovery.js';
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
  /**
   * The limits `months` and `recentComments` were requested with: a shorter answer can be
   * complete, so reuse depends on what was asked, not on how much came back.
   */
  limits: { months: number; comments: number };
  adjacent: { previous: EntryLink | null; next: EntryLink | null } | null;
  /** Published pages in tree order (`page-list`). */
  pageTree: (EntryLink & { depth: number })[] | null;
  /** Newest approved comments (`latest-comments`). */
  recentComments: { author: string; title: string; path: string }[] | null;
  /** Profiles of the authors `post-author` blocks show, by author slug. */
  authors: Record<
    string,
    { name: string; slug: string; bio: string; avatarUrl: string | null }
  > | null;
  /** Posts per day of one month (`calendar`), UTC like the date archives. */
  calendar: {
    year: number;
    month: number;
    days: Record<number, number>;
    /** The nearest months with posts before and after (WordPress calendar links). */
    previous: { year: number; month: number } | null;
    next: { year: number; month: number } | null;
  } | null;
}

/** What the page shows, for blocks whose data depends on it. */
export interface BlockContext {
  /** The single entry (post navigation, post author). */
  entry: { id: string; author: string | null } | null;
  /** The month a calendar shows; the current UTC month by default. */
  month: { year: number; month: number } | null;
  /** Authors of the page's own posts (archives, home), for post-author blocks in loops. */
  authors: string[];
}

/** Months of posts the calendar looks through for its previous and next links. */
const CALENDAR_MONTHS = 60;

/** Pages and calendar posts read at most (100 per request). */
const LIST_MAX = 2_000;
/** Distinct author profiles one page loads at most. */
const AUTHORS_MAX = 50;

const NO_CONTEXT: BlockContext = { entry: null, month: null, authors: [] };

/**
 * Every item of a paginated public list up to `LIST_MAX`, a few pages at a time. A failed
 * page fails the whole read, so a partial list is never shown as complete.
 */
const listAll = async (
  api: Api,
  query: Parameters<Api['list']>[0],
): Promise<PublicContentSummary[]> => {
  const first = await api.list({ ...query, page: 1, pageSize: 100 });
  const pages = Math.min(
    Math.ceil(first.total / 100),
    Math.ceil(LIST_MAX / 100),
  );
  const rest = await mapLimit(
    Array.from({ length: Math.max(pages - 1, 0) }, (_, index) => index + 2),
    (page) => api.list({ ...query, page, pageSize: 100 }),
  );
  return [first, ...rest].flatMap((list) => list.items);
};

/** The block context of a page. */
export const contextOf = (page: ThemePage): BlockContext => ({
  entry:
    page.kind === 'content'
      ? { id: page.content.id, author: page.content.author?.slug ?? null }
      : null,
  month:
    page.kind === 'date' && page.date.month
      ? { year: page.date.year, month: page.date.month }
      : null,
  authors:
    'posts' in page && page.posts
      ? page.posts.items.flatMap((post) =>
          post.author ? [post.author.slug] : [],
        )
      : [],
});

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

/** Block data that does not depend on the page, so a page may reuse what the layout loaded. */
type Shared = Partial<
  Pick<
    BlockData,
    'queries' | 'terms' | 'months' | 'pageTree' | 'recentComments' | 'limits'
  >
>;

/** What the site layout already loaded (for error pages); pages reuse it instead of asking again. */
export type LayoutBlockData = { theme: ThemeView } & Shared;

/** Pages in tree order by parent, each once (cycles and missing parents end up at the top). */
const toPageTree = (
  pages: {
    id: string;
    title: string;
    path: string;
    parentId?: string | null;
  }[],
) => {
  const ids = new Set(pages.map((page) => page.id));
  const children = childrenOf(
    pages.map((page) => ({ ...page, parentId: page.parentId ?? null })),
  );
  const items: (EntryLink & { depth: number })[] = [];
  const seen = new Set<string>();
  const visit = (page: (typeof pages)[number], depth: number) => {
    if (seen.has(page.id)) return;
    seen.add(page.id);
    items.push({ title: page.title, path: page.path, depth });
    for (const child of children.get(page.id) ?? []) visit(child, depth + 1);
  };
  for (const page of pages)
    if (!page.parentId || !ids.has(page.parentId)) visit(page, 0);
  return items;
};

/** What the data blocks among `blocks` need: list selections, term lists, months, neighbours. */
export const blockNeeds = (blocks: Block[]) => {
  const all = [...walkBlocks(blocks)];
  const queries = new Map<string, QuerySelection>();
  for (const block of all)
    if (isIndependentQuery(block)) {
      const selection = selectionOf(
        block as Extract<Block, { name: 'query' | 'latest-posts' }>,
      );
      queries.set(queryKey(selection), selection);
    }
  const has = (name: Block['name']) => all.some((block) => block.name === name);
  return {
    queries,
    category: has('categories'),
    tag: has('tag-cloud'),
    months: Math.max(
      0,
      ...all.map((block) =>
        block.name === 'archives' ? block.attrs.months : 0,
      ),
    ),
    adjacent: has('post-navigation'),
    pages: has('page-list'),
    comments: Math.max(
      0,
      ...all.map((block) =>
        block.name === 'latest-comments' ? block.attrs.comments : 0,
      ),
    ),
    author: has('post-author'),
    calendar: has('calendar'),
  };
};

/**
 * Loads, in parallel, what the data blocks among `blocks` show, reusing what `known` already
 * holds. Post lists fail the page like its own list would; term lists, monthly archives and
 * post navigation are optional extras.
 */
export const loadBlockData = async (
  api: Api,
  blocks: Block[],
  context: BlockContext = NO_CONTEXT,
  known: Shared = {},
): Promise<BlockData> => {
  const needs = blockNeeds(blocks);
  if (needs.queries.size > 32) error(400, Errors.ThemeQueriesLimit);
  const missing = [...needs.queries].filter(([key]) => !known.queries?.[key]);
  const terms = (taxonomy: TaxonomyType) =>
    known.terms?.[taxonomy as 'category' | 'tag'] ??
    api.taxonomy.list(taxonomy).then(
      (list) => termItems(list, taxonomy === 'category'),
      () => null,
    );
  const { entry } = context;
  const now = new Date();
  const month = context.month ?? {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
  };
  const [
    lists,
    category,
    tag,
    months,
    adjacent,
    pageTree,
    recentComments,
    calendar,
  ] = await Promise.all([
    Promise.all(
      missing.map(
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
    needs.category ? terms('category') : (known.terms?.category ?? null),
    needs.tag ? terms('tag') : (known.terms?.tag ?? null),
    !needs.months
      ? (known.months ?? null)
      : known.months && (known.limits?.months ?? 0) >= needs.months
        ? known.months
        : api.months(needs.months).then(
            (list) =>
              list.map(({ year, month, count }) => ({ year, month, count })),
            () => null,
          ),
    entry && needs.adjacent
      ? api.adjacent(entry.id).then(
          ({ previous, next }) => ({
            previous: link(previous),
            next: link(next),
          }),
          () => null,
        )
      : null,
    !needs.pages
      ? (known.pageTree ?? null)
      : (known.pageTree ??
        listAll(api, { type: 'page' }).then(
          // Locked pages are not listed; their children show at the top level.
          (items) => toPageTree(items.filter((item) => !item.protected)),
          () => null,
        )),
    !needs.comments
      ? (known.recentComments ?? null)
      : known.recentComments && (known.limits?.comments ?? 0) >= needs.comments
        ? known.recentComments
        : api.recentComments(needs.comments).then(
            (list) =>
              list.map(({ author, title, path }) => ({ author, title, path })),
            () => null,
          ),
    needs.calendar
      ? Promise.all([
          listAll(api, { type: 'post', ...month }),
          // Newest first; months further back than this get no "previous" link.
          api.months(CALENDAR_MONTHS).catch(() => []),
        ])
          .then(([items, listed]) => {
            const days: Record<number, number> = {};
            for (const { publishedAt } of items) {
              const day = new Date(publishedAt).getUTCDate();
              days[day] = (days[day] ?? 0) + 1;
            }
            const order = ({ year, month }: { year: number; month: number }) =>
              year * 12 + month;
            const near = (entry: (typeof listed)[number] | undefined) =>
              entry ? { year: entry.year, month: entry.month } : null;
            return {
              ...month,
              days,
              previous: near(
                listed.find((entry) => order(entry) < order(month)),
              ),
              next: near(
                listed.findLast((entry) => order(entry) > order(month)),
              ),
            };
          })
          .catch(() => null)
      : null,
  ]);
  const queries = { ...known.queries, ...Object.fromEntries(lists) };
  // Post-author blocks show the entry's author or, in loops, each listed post's author.
  const slugs = needs.author
    ? [
        ...new Set([
          ...(entry?.author ? [entry.author] : []),
          ...context.authors,
          ...Object.values(queries).flatMap((list) =>
            list.items.flatMap((post) =>
              post.author ? [post.author.slug] : [],
            ),
          ),
        ]),
      ].slice(0, AUTHORS_MAX)
    : [];
  const profiles = await mapLimit(slugs, (slug) =>
    api.author(slug).then(
      ({ name, slug, bio, avatarUrl }) => ({ name, slug, bio, avatarUrl }),
      () => null,
    ),
  );
  const authors = needs.author
    ? Object.fromEntries(
        profiles.flatMap((profile) =>
          profile ? [[profile.slug, profile] as const] : [],
        ),
      )
    : null;
  return {
    queries,
    terms: { category, tag },
    months,
    limits: {
      months:
        months === known.months
          ? (known.limits?.months ?? 0)
          : months
            ? needs.months
            : 0,
      comments:
        recentComments === known.recentComments
          ? (known.limits?.comments ?? 0)
          : recentComments
            ? needs.comments
            : 0,
    },
    adjacent,
    pageTree,
    recentComments,
    authors,
    calendar,
  };
};

/** Block data of the template `page` renders with, and of the parts it includes. */
export const loadTemplateData = (
  api: Api,
  layout: LayoutBlockData,
  page: ThemePage,
) =>
  loadBlockData(
    api,
    withParts(
      pickTemplate(
        layout.theme.templates,
        templateCandidates(page, isFrontPage(page)),
      ),
      layout.theme.parts,
    ),
    contextOf(page),
    layout,
  );

/** Page data plus the block data of its template; the layout is loaded alongside. */
export const withTemplateData = async <P extends ThemePage>(
  api: Api,
  parent: () => Promise<LayoutBlockData>,
  page: P,
) => ({
  ...page,
  ...(await loadTemplateData(api, await parent(), page)),
});

/**
 * Block data of every template and part, for the site editor's canvas. `context` describes
 * the published sample entry, for post navigation and its author.
 */
export const loadThemeData = (
  api: Api,
  theme: Pick<ThemeView, 'templates' | 'parts'>,
  context: BlockContext = NO_CONTEXT,
) =>
  loadBlockData(
    api,
    [
      ...Object.values(theme.templates).flat(),
      ...theme.parts.flatMap((part) => part.blocks),
    ],
    context,
  );
