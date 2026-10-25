import type { TaxonomyType, TermSummary } from '@cms/sdk';
import { extraTerms } from '#api/infra/prisma/extra-terms';
import type {
  PublishedRecord,
  PublishedSummaryRecord,
} from '#api/domain/content/published-content-repository';
import type { Database } from '#api/infra/prisma/client';
import {
  featuredImageOf,
  parseFields,
  termSummaries,
} from '#api/infra/prisma/content-criteria';
import { Prisma } from '#api/infra/prisma/generated/client';
import { decodePath } from '#api/infra/prisma/permalink-repository';
import { fromPublicSeoColumns } from '#api/infra/prisma/seo-mapper';
import { Errors } from '#api/shared/errors';

type Visibility = 'published' | 'private';
type Row = Pick<
  PublishedSummaryRecord,
  | 'id'
  | 'type'
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'publishedAt'
  | 'updatedAt'
  | 'commentCount'
  | 'summary'
  | 'tocOverride'
> &
  Omit<
    Parameters<typeof fromPublicSeoColumns>[0],
    'seoNoIndex' | 'seoNoFollow'
  > & {
    path: Uint8Array | null;
    parentId: string | null;
    authorName: string | null;
    authorSlug: string | null;
    storageKey: string | null;
    publicUrl: string | null;
    alt: string | null;
    width: number | null;
    height: number | null;
    variants: string | null;
    sticky: number;
    protected: number;
    seoNoIndex: number;
    seoNoFollow: number;
    html?: string;
    fields?: string;
  };
type Term = TermSummary & { taxonomy: TaxonomyType };

const summary = (row: Row, terms: { term: Term }[]): PublishedSummaryRecord => {
  if (!row.path) throw new Error(Errors.ContentPathMissing);
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    path: decodePath(row.path),
    title: row.title,
    excerpt: row.excerpt,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    parentId: row.parentId,
    author:
      row.authorName === null
        ? null
        : { name: row.authorName, slug: row.authorSlug! },
    featuredImage: featuredImageOf(
      row.storageKey === null
        ? null
        : {
            storageKey: row.storageKey,
            publicUrl: row.publicUrl,
            alt: row.alt!,
            width: row.width,
            height: row.height,
            variants: row.variants!,
          },
    ),
    sticky: Boolean(row.sticky),
    tocOverride: row.tocOverride ?? 'default',
    protected: Boolean(row.protected),
    commentCount: row.commentCount,
    summary: row.summary,
    categories: termSummaries(terms, 'category'),
    tags: termSummaries(terms, 'tag'),
    extraTerms: extraTerms(terms),
    seo: fromPublicSeoColumns({
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoCanonicalUrl: row.seoCanonicalUrl,
      seoNoIndex: Boolean(row.seoNoIndex),
      seoNoFollow: Boolean(row.seoNoFollow),
      seoImageUrl: row.seoImageUrl,
      seoImageAlt: row.seoImageAlt,
      seoSocialTitle: row.seoSocialTitle,
      seoSocialDescription: row.seoSocialDescription,
      seoSchemaType: row.seoSchemaType,
      seoAuthorName: row.seoAuthorName,
      seoAuthorUrl: row.seoAuthorUrl,
    }),
  };
};

export function projectContent(
  db: Database,
  where: Prisma.Sql,
  body: true,
  visibility?: Visibility,
): Promise<PublishedRecord[]>;
export function projectContent(
  db: Database,
  where: Prisma.Sql,
  body: false,
  visibility?: Visibility,
): Promise<PublishedSummaryRecord[]>;
/** Fixed public projection, with a separate term batch to avoid JSON aggregate size limits. */
export async function projectContent(
  db: Database,
  where: Prisma.Sql,
  body: boolean,
  visibility: Visibility = 'published',
): Promise<PublishedSummaryRecord[]> {
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT c.id, c.type, c.slug, c.title, c.excerpt, c.summary, c.sticky,
      c.toc_override AS tocOverride,
      c.published_at AS publishedAt, c.updated_at AS updatedAt,
      c.comment_count AS commentCount, c.password_hash IS NOT NULL AS protected,
      p.path, u.name AS authorName, u.slug AS authorSlug,
      CASE WHEN parent.status = 'published' AND parent.trashed_at IS NULL
        AND parent.password_hash IS NULL THEN c.parent_id ELSE NULL END AS parentId,
      m.storage_key AS storageKey, m.public_url AS publicUrl, m.alt, m.width, m.height, m.variants,
      c.seo_title AS seoTitle, c.seo_description AS seoDescription,
      c.seo_canonical_url AS seoCanonicalUrl, c.seo_no_index AS seoNoIndex,
      c.seo_no_follow AS seoNoFollow, c.seo_image_url AS seoImageUrl,
      c.seo_image_alt AS seoImageAlt, c.seo_social_title AS seoSocialTitle,
      c.seo_social_description AS seoSocialDescription, c.seo_schema_type AS seoSchemaType,
      c.seo_author_name AS seoAuthorName, c.seo_author_url AS seoAuthorUrl
      ${body ? Prisma.sql`, c.html, c.fields` : Prisma.empty}
    FROM contents c
    LEFT JOIN content_paths p ON p.current_for = c.id
    LEFT JOIN users u ON u.id = c.author_id
    LEFT JOIN media m ON m.id = c.featured_media_id
    LEFT JOIN contents parent ON parent.id = c.parent_id
    WHERE c.status = ${visibility} AND c.trashed_at IS NULL AND (${where})
    ORDER BY c.id`);
  if (!rows.length) return [];

  const links = await db.$queryRaw<(Term & { contentId: string })[]>(Prisma.sql`
    SELECT ct.content_id AS contentId, t.id, t.name, t.slug, t.taxonomy
    FROM content_terms ct JOIN taxonomy_terms t ON t.id = ct.term_id
    JOIN contents c ON c.id = ct.content_id
    WHERE c.status = ${visibility} AND c.trashed_at IS NULL
      AND ct.content_id IN (${Prisma.join(rows.map(({ id }) => id))})
    ORDER BY ct.content_id, ct.term_id`);
  const terms = new Map<string, { term: Term }[]>();
  for (const { contentId, id, name, slug, taxonomy } of links) {
    const assigned = terms.get(contentId) ?? [];
    assigned.push({ term: { id, name, slug, taxonomy } });
    terms.set(contentId, assigned);
  }
  return rows.map((row) => {
    const item = summary(row, terms.get(row.id) ?? []);
    return body
      ? { ...item, html: row.html!, fields: parseFields(row.fields!) }
      : item;
  });
}
