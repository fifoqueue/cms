import { calendarBounds } from '@cms/sdk';
import { siteTimeZone } from '#api/infra/prisma/content-calendar';
import type { TaxonomyType, TermSummary } from '@cms/sdk';
import type { ContentCriteria } from '#api/domain/content/content-repository';
import { compareTerms } from '#api/domain/taxonomy/hierarchy';
import type { Database } from '#api/infra/prisma/client';
import { parseVariants, toPublicImage } from '#api/domain/media/media-mapper';
import { Prisma } from '#api/infra/prisma/generated/client';

export type ContentFilters = Pick<
  ContentCriteria,
  | 'include'
  | 'exclude'
  | 'parent'
  | 'day'
  | 'taxonomy'
  | 'term'
  | 'type'
  | 'types'
  | 'status'
  | 'search'
  | 'category'
  | 'tag'
  | 'view'
  | 'author'
  | 'sticky'
  | 'year'
  | 'month'
>;

/** What makes an entry public: published and not in the trash. */
export const PUBLIC_CONTENT = {
  status: 'published',
  trashedAt: null,
} as const satisfies Prisma.ContentWhereInput;

/** Relations every content read projects: path, author display data and term summaries. */
export const contentRelations = {
  currentPath: { select: { path: true } },
  author: { select: { name: true, slug: true } },
  featuredMedia: {
    select: {
      storageKey: true,
      alt: true,
      width: true,
      height: true,
      variants: true,
    },
  },
  terms: {
    select: {
      term: { select: { id: true, name: true, slug: true, taxonomy: true } },
    },
  },
} as const;

/** LIKE pattern text matching `value` literally (Prisma `contains` does not escape wildcards). */
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');

/** Ids of the category and its descendants; empty for unknown slugs. */
export const termScope = async (
  db: Database,
  taxonomy: string,
  slug: string,
) => {
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH RECURSIVE category_tree AS (
      SELECT id FROM taxonomy_terms
      WHERE taxonomy = ${taxonomy} AND slug = ${slug}
      UNION DISTINCT
      SELECT child.id FROM taxonomy_terms child
      JOIN category_tree parent ON child.parent_id = parent.id
      WHERE child.taxonomy = ${taxonomy}
    )
    SELECT id FROM category_tree
  `);
  return rows.map((row) => row.id);
};

/** A local year/month/day as UTC boundaries for indexed comparisons. */
export const publishedIn = (
  year: number,
  month?: number,
  day?: number,
  zone = 'UTC',
) => calendarBounds(year, month, day, zone);

/** Where clause for `ContentCriteria` filters; null when an unknown category matches nothing. */
export const contentWhere = async (
  db: Database,
  {
    include,
    exclude,
    parent,
    day,
    taxonomy,
    term,
    type,
    types,
    status,
    search,
    category,
    tag,
    view,
    author,
    sticky,
    year,
    month,
  }: ContentFilters,
): Promise<Prisma.ContentWhereInput | null> => {
  const filters: Prisma.ContentWhereInput[] = [
    { trashedAt: view === 'trash' ? { not: null } : null },
  ];
  if (taxonomy && term) {
    const ids = await termScope(db, taxonomy, term);
    if (!ids.length) return null;
    filters.push({ terms: { some: { termId: { in: ids } } } });
  }
  if (include) filters.push({ id: { in: [...include] } });
  if (exclude) filters.push({ id: { notIn: [...exclude] } });
  if (parent !== undefined) filters.push({ parentId: parent });
  if (author) filters.push({ author: { slug: author } });
  if (!type && types) filters.push({ type: { in: [...types] } });
  if (sticky) filters.push({ sticky: sticky === 'only' });
  if (year)
    filters.push({
      publishedAt: publishedIn(year, month, day, await siteTimeZone(db)),
    });
  if (search) {
    const contains = literal(search);
    filters.push({
      OR: [
        { title: { contains } },
        { excerpt: { contains } },
        { searchText: { contains } },
      ],
    });
  }
  if (category) {
    const termIds = await termScope(db, 'category', category);
    if (!termIds.length) return null;
    filters.push({ terms: { some: { termId: { in: termIds } } } });
  }
  if (tag)
    filters.push({ terms: { some: { term: { taxonomy: 'tag', slug: tag } } } });
  return { type, status, AND: filters };
};

/** Summaries of one taxonomy's assigned terms, ordered by `compareTerms`. */
export const termSummaries = (
  terms: { term: TermSummary & { taxonomy: TaxonomyType } }[],
  taxonomy: TaxonomyType,
): TermSummary[] =>
  terms
    .map(({ term }) => term)
    .filter((term) => term.taxonomy === taxonomy)
    .sort(compareTerms)
    .map(({ id, name, slug }) => ({ id, name, slug }));

/** The featured image of a row as the site shows it. */
export const featuredImageOf = (
  media: {
    storageKey: string;
    alt: string;
    width: number | null;
    height: number | null;
    variants: string;
  } | null,
) =>
  media && toPublicImage({ ...media, variants: parseVariants(media.variants) });

/** Stored custom field values; damaged JSON counts as none. */
export const parseFields = (raw: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(raw) as unknown;
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};
