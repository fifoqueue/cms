import { archivePath } from '@cms/sdk';
import { readArchivePaths } from '#api/infra/prisma/archive-paths';
import type {
  SeoDiscoveryCriteria,
  SeoDiscoveryRecord,
  SeoDiscoveryRepository,
} from '#api/domain/seo/seo-discovery-repository';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import { decodePath } from '#api/infra/prisma/permalink-repository';

type ContentRow = Omit<SeoDiscoveryRecord, 'path'> & { path: Uint8Array };

/** Bounded, DB-filtered discovery; no documents, HTML, private keywords or author joins. */
export class PrismaSeoDiscoveryRepository implements SeoDiscoveryRepository {
  constructor(private readonly db: Database) {}

  async list({ kind, page, pageSize, siteUrl }: SeoDiscoveryCriteria) {
    const skip = (page - 1) * pageSize;
    if (kind === 'content') {
      // URL inputs are normalized on write; binary equality preserves case-sensitive paths.
      const from = Prisma.sql`
        FROM content_paths p
        JOIN contents c ON c.id = p.content_id
        WHERE p.current_for IS NOT NULL
          AND c.status = 'published' AND c.trashed_at IS NULL
          AND c.seo_no_index = false
          AND (
            c.seo_canonical_url = ''
            OR CAST(c.seo_canonical_url AS BINARY) = CONCAT(${siteUrl}, p.path)
          )
      `;
      return this.db.$transaction(async (tx) => {
        const counts = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS total ${from}
        `);
        const total = Number(counts[0]!.total);
        if (skip >= total) return { items: [], total };
        const rows = await tx.$queryRaw<ContentRow[]>(Prisma.sql`
          SELECT p.path,
            COALESCE(NULLIF(c.seo_title, ''), c.title) AS title,
            COALESCE(NULLIF(c.seo_description, ''), c.excerpt) AS description,
            c.updated_at AS updatedAt
          ${from}
          ORDER BY p.current_for ASC
          LIMIT ${pageSize} OFFSET ${skip}
        `);
        return {
          items: rows.map((row) => ({
            path: decodePath(row.path),
            title: row.title,
            description: row.description,
            updatedAt: row.updatedAt,
          })),
          total,
        };
      });
    }

    // Walk upwards from published assignments, including ancestors with no direct assignments.
    // UNION DISTINCT deduplicates shared ancestors before counting/paging.
    const { bases } = await readArchivePaths(this.db);
    const scope = Prisma.sql`
      WITH RECURSIVE published_terms AS (
        SELECT DISTINCT t.id, t.parent_id
        FROM taxonomy_terms t
        JOIN content_terms ct ON ct.term_id = t.id
        JOIN contents c ON c.id = ct.content_id
        WHERE t.taxonomy = ${kind} AND c.status = 'published'
          AND c.trashed_at IS NULL
        UNION DISTINCT
        SELECT parent.id, parent.parent_id
        FROM taxonomy_terms parent
        JOIN published_terms child ON child.parent_id = parent.id
        WHERE parent.taxonomy = ${kind} AND parent.taxonomy = 'category'
      )
    `;
    return this.db.$transaction(async (tx) => {
      // SQL cannot percent-encode slugs, so explicit canonicals (rare) are matched here with the
      // same encoder as the sitemap path, and the matches filter in SQL before counting/paging.
      const explicit = await tx.taxonomyTerm.findMany({
        where: { taxonomy: kind, seoCanonicalUrl: { not: '' } },
        select: { id: true, slug: true, seoCanonicalUrl: true },
      });
      const selfCanonical = explicit
        .filter(
          (term) =>
            term.seoCanonicalUrl ===
            `${siteUrl}${archivePath(bases, kind, term.slug)}`,
        )
        .map((term) => term.id);
      const from = Prisma.sql`
        FROM taxonomy_terms t
        JOIN published_terms p ON p.id = t.id
        WHERE t.taxonomy = ${kind}
          AND t.seo_no_index = false
          AND (
            t.seo_canonical_url = ''
            ${selfCanonical.length ? Prisma.sql`OR t.id IN (${Prisma.join(selfCanonical)})` : Prisma.empty}
          )
      `;
      const counts = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        ${scope} SELECT COUNT(*) AS total ${from}
      `);
      const total = Number(counts[0]!.total);
      if (skip >= total) return { items: [], total };
      const rows = await tx.$queryRaw<
        (Omit<SeoDiscoveryRecord, 'path'> & { slug: string })[]
      >(Prisma.sql`
        ${scope}
        SELECT t.slug,
          COALESCE(NULLIF(t.seo_title, ''), t.name) AS title,
          COALESCE(NULLIF(t.seo_description, ''), t.description) AS description,
          t.updated_at AS updatedAt
        ${from}
        ORDER BY t.slug ASC, t.id ASC
        LIMIT ${pageSize} OFFSET ${skip}
      `);
      return {
        items: rows.map((row) => ({
          path: archivePath(bases, kind, row.slug),
          title: row.title,
          description: row.description,
          updatedAt: row.updatedAt,
        })),
        total,
      };
    });
  }
}
