import {
  archivePath,
  taxonomyDefinitionSchema,
  MEDIA_PATH,
  safeHttpUrlSchema,
} from '@cms/sdk';
import { readArchivePaths } from '#api/infra/prisma/archive-paths';
import type {
  SeoDiscoveryCriteria,
  SeoDiscoveryRecord,
  SeoDiscoveryRepository,
} from '#api/domain/seo/seo-discovery-repository';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import { decodePath } from '#api/infra/prisma/permalink-repository';

type ContentRow = Omit<SeoDiscoveryRecord, 'path'> & {
  id: string;
  path: Uint8Array;
};

/** Bounded, DB-filtered discovery; no documents, HTML, private keywords or author joins. */
export class PrismaSeoDiscoveryRepository implements SeoDiscoveryRepository {
  constructor(
    private readonly db: Database,
    private readonly activeTypes?: () => Promise<readonly string[]>,
  ) {}

  async list({
    kind,
    page,
    pageSize,
    siteUrl,
    archiveTypes = [],
    sort = 'stable',
  }: SeoDiscoveryCriteria) {
    const skip = (page - 1) * pageSize;
    const types = await this.activeTypes?.();
    const visible = types
      ? types.length
        ? Prisma.sql`AND c.type IN (${Prisma.join([...types])})`
        : Prisma.sql`AND 1 = 0`
      : Prisma.empty;

    if (kind === 'content') {
      // URL inputs are normalized on write; binary equality preserves case-sensitive paths.
      const from = Prisma.sql`
        FROM content_paths p
        JOIN contents c ON c.id = p.content_id
        WHERE p.current_for IS NOT NULL
          AND c.status = 'published' AND c.trashed_at IS NULL
          AND c.password_hash IS NULL
          ${visible}
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
          SELECT c.id, p.path,
            COALESCE(NULLIF(c.seo_title, ''), c.title) AS title,
            COALESCE(NULLIF(c.seo_description, ''), c.excerpt) AS description,
            c.updated_at AS updatedAt
          ${from}
          ORDER BY ${sort === 'modified' ? Prisma.sql`c.updated_at DESC, p.current_for DESC` : Prisma.sql`p.current_for ASC`}
          LIMIT ${pageSize} OFFSET ${skip}
        `);
        const images = await tx.$queryRaw<
          { contentId: string; url: string; title: string; caption: string }[]
        >(Prisma.sql`
          SELECT DISTINCT c.id AS contentId, COALESCE(m.public_url, CONCAT(${siteUrl + MEDIA_PATH}, m.storage_key)) AS url,
            m.title, m.caption
          FROM contents c JOIN media m ON m.id = c.featured_media_id
            OR m.id IN (SELECT cm.media_id FROM content_media cm WHERE cm.content_id = c.id)
          WHERE c.id IN (${Prisma.join(rows.map((row) => row.id))}) AND m.mime LIKE 'image/%' AND m.missing_at IS NULL
          ORDER BY c.id, m.id
        `);
        const imagesById = new Map<
          string,
          NonNullable<SeoDiscoveryRecord['images']>
        >();

        for (const image of images) {
          const parsed = safeHttpUrlSchema.safeParse(image.url);

          if (!parsed.success) continue;
          const list = imagesById.get(image.contentId) ?? [];

          if (list.length < 1000)
            list.push({
              url: parsed.data,
              title: image.title.slice(0, 1000),
              caption: image.caption.slice(0, 2000),
            });
          imagesById.set(image.contentId, list);
        }

        return {
          items: rows.map((row) => ({
            path: decodePath(row.path),
            title: row.title,
            description: row.description,
            updatedAt: row.updatedAt,
            images: imagesById.get(row.id) ?? [],
          })),
          total,
        };
      });
    }

    if (kind === 'archive') {
      if (!archiveTypes.length) return { items: [], total: 0 };
      const rows = await this.db.$queryRaw<
        { type: string; updatedAt: Date }[]
      >(Prisma.sql`
        SELECT c.type, MAX(c.updated_at) AS updatedAt FROM contents c
        WHERE c.type IN (${Prisma.join(archiveTypes.map((type) => type.key))})
          AND c.status = 'published' AND c.trashed_at IS NULL AND c.password_hash IS NULL
          ${visible}
        GROUP BY c.type ORDER BY c.type
      `);

      return {
        total: rows.length,
        items: rows.slice(skip, skip + pageSize).map((row) => {
          const type = archiveTypes.find((type) => type.key === row.type)!;

          return {
            path: `/archive/${encodeURIComponent(row.type)}`,
            title: type.pluralName,
            description: type.description,
            updatedAt: row.updatedAt,
          };
        }),
      };
    }

    if (kind === 'author') {
      const from = Prisma.sql`FROM users u JOIN contents c ON c.author_id = u.id WHERE c.status = 'published' AND c.trashed_at IS NULL AND c.seo_no_index = false AND c.password_hash IS NULL ${visible}`;
      const count = await this.db.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(DISTINCT u.id) AS total ${from}`,
      );
      const total = Number(count[0]!.total);
      const rows = await this.db.$queryRaw<
        { slug: string; title: string; description: string; updatedAt: Date }[]
      >(
        Prisma.sql`SELECT u.slug, u.name AS title, u.bio AS description, MAX(c.updated_at) AS updatedAt ${from} GROUP BY u.id, u.slug, u.name, u.bio ORDER BY u.slug, u.id LIMIT ${pageSize} OFFSET ${skip}`,
      );

      return {
        total,
        items: rows.map((row) => ({
          path: `/author/${encodeURIComponent(row.slug)}`,
          title: row.title,
          description: row.description,
          updatedAt: row.updatedAt,
        })),
      };
    }

    const definitions =
      kind === 'taxonomy'
        ? await this.db.setting.findMany({
            where: { key: { startsWith: 'taxonomy.definition.' } },
            select: { key: true, value: true },
          })
        : [];
    const custom = definitions.flatMap((row) => {
      try {
        const parsed = taxonomyDefinitionSchema.safeParse(
          JSON.parse(row.value),
        );

        return parsed.success &&
          row.key === `taxonomy.definition.${parsed.data.key}`
          ? [parsed.data]
          : [];
      } catch {
        return [];
      }
    });
    const keys =
      kind === 'taxonomy'
        ? custom
            .map((item) => item.key)
            .filter((key) => key !== 'category' && key !== 'tag')
        : [kind];

    if (!keys.length) return { items: [], total: 0 };
    const hierarchical = [
      'category',
      ...custom.filter((item) => item.hierarchical).map((item) => item.key),
    ];
    const pathOf = (
      taxonomy: string,
      slug: string,
      bases: { category: string; tag: string },
    ) =>
      taxonomy === 'category' || taxonomy === 'tag'
        ? archivePath(bases, taxonomy, slug)
        : `/taxonomy/${encodeURIComponent(taxonomy)}/${encodeURIComponent(slug)}`;

    // Walk upwards from published assignments, including ancestors with no direct assignments.
    // UNION DISTINCT deduplicates shared ancestors before counting/paging.
    const { bases } = await readArchivePaths(this.db);
    const scope = Prisma.sql`
      WITH RECURSIVE published_terms AS (
        SELECT DISTINCT t.id, t.parent_id, t.taxonomy, c.id AS content_id, c.updated_at
        FROM taxonomy_terms t
        JOIN content_terms ct ON ct.term_id = t.id
        JOIN contents c ON c.id = ct.content_id
        WHERE t.taxonomy IN (${Prisma.join(keys)}) AND c.status = 'published'
          AND c.trashed_at IS NULL
          AND c.password_hash IS NULL
          ${visible}
        UNION DISTINCT
        SELECT parent.id, parent.parent_id, parent.taxonomy, child.content_id, child.updated_at
        FROM taxonomy_terms parent
        JOIN published_terms child ON child.parent_id = parent.id
        WHERE parent.taxonomy = child.taxonomy AND parent.taxonomy IN (${Prisma.join(hierarchical)})
      )
    `;

    return this.db.$transaction(async (tx) => {
      // Explicit canonicals are matched here with the same encoder as the sitemap path, and the
      // matches filter in SQL before counting/paging.
      const explicit = await tx.taxonomyTerm.findMany({
        where: { taxonomy: { in: keys }, seoCanonicalUrl: { not: '' } },
        select: { id: true, slug: true, taxonomy: true, seoCanonicalUrl: true },
      });
      const selfCanonical = explicit
        .filter(
          (term) =>
            term.seoCanonicalUrl ===
            `${siteUrl}${pathOf(term.taxonomy, term.slug, bases)}`,
        )
        .map((term) => term.id);
      const from = Prisma.sql`
        FROM taxonomy_terms t
        JOIN (SELECT id, MAX(updated_at) AS updated_at, COUNT(DISTINCT content_id) AS content_count FROM published_terms GROUP BY id) p ON p.id = t.id
        WHERE t.taxonomy IN (${Prisma.join(keys)})
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
        (Omit<SeoDiscoveryRecord, 'path'> & {
          slug: string;
          taxonomy: string;
        })[]
      >(Prisma.sql`
        ${scope}
        SELECT t.slug, t.taxonomy,
          COALESCE(NULLIF(t.seo_title, ''), t.name) AS title,
          COALESCE(NULLIF(t.seo_description, ''), t.description) AS description,
          p.updated_at AS updatedAt
        ${from}
        ORDER BY ${sort === 'popular' ? Prisma.sql`p.content_count DESC,` : Prisma.empty} t.slug ASC, t.id ASC
        LIMIT ${pageSize} OFFSET ${skip}
      `);

      return {
        items: rows.map((row) => ({
          path: pathOf(row.taxonomy, row.slug, bases),
          title: row.title,
          description: row.description,
          updatedAt: row.updatedAt,
        })),
        total,
      };
    });
  }
}
