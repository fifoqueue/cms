import type {
  MediaCriteria,
  MediaRecord,
  MediaRepository,
  MediaWrite,
} from '#api/domain/media/ports';
import {
  parseVariants,
  toPublicImage,
  projectMedia,
} from '#api/domain/media/media-mapper';
import type { HookDispatcher } from '#api/domain/ports';
import type { Database } from '#api/infra/prisma/client';
import type { Media } from '#api/infra/prisma/generated/client';
import { Prisma } from '#api/infra/prisma/generated/client';
import { conflict, Errors } from '#api/shared/errors';
import { PrismaMediaKeyCatchUp } from '#api/infra/prisma/media-key-catch-up';

/** LIKE pattern text matching `value` literally. */
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const relations = {
  uploader: { select: { name: true } },
  _count: { select: { usages: true, termUsages: true } },
} as const;

type Row = Media & {
  uploader: { name: string } | null;
  _count: { usages: number; termUsages: number };
};

const toRecord = ({
  uploader,
  _count,
  variants,
  ...row
}: Row): MediaRecord => ({
  ...row,
  mime: row.mime as MediaRecord['mime'],
  uploaderName: uploader?.name ?? '',
  variants: parseVariants(variants),
  // Entries and term image fields that show the file.
  usageCount: _count.usages + _count.termUsages,
});

const MIME_PREFIX = {
  image: 'image/',
  audio: 'audio/',
  video: 'video/',
  document: 'application/',
} as const;

/** Extract each document once, without transporting its body or an unbounded id list to the API. */
const patternFiles = Prisma.sql`
  SELECT DISTINCT files.id, s.\`key\` AS pattern FROM settings s
  JOIN JSON_TABLE(s.value, '$**.attrs' COLUMNS (
    mediaId VARCHAR(36) PATH '$.mediaId', posterId VARCHAR(36) PATH '$.posterId'
  )) AS refs
  JOIN JSON_TABLE(JSON_ARRAY(refs.mediaId, refs.posterId), '$[*]' COLUMNS (
    id VARCHAR(36) PATH '$'
  )) AS files
  WHERE s.\`key\` LIKE 'pattern.%' AND files.id IS NOT NULL`;

export class PrismaMediaRepository implements MediaRepository {
  constructor(
    private readonly db: Database,
    private readonly hooks?: HookDispatcher,
  ) {}

  async getByKey(key: string) {
    const row = await this.db.mediaStorageKey.findUnique({
      where: { key: new TextEncoder().encode(key) },
      select: { mediaId: true },
    });

    if (row?.mediaId) return this.get(row.mediaId);
    // Original: one unique-index lookup. Legacy UUID variant: one primary-key lookup.
    const original = await this.db.media.findUnique({
      where: { storageKey: key },
      select: { id: true, storageKey: true },
    });
    let id = original?.storageKey === key ? original.id : undefined;

    if (!id) {
      const match =
        /^\d{4}\/\d{2}\/([0-9a-f-]{36})-[a-z][a-z0-9-]{0,63}\.webp$/.exec(key);

      if (match) {
        const media = await this.db.media.findUnique({
          where: { id: match[1]! },
          select: { variants: true },
        });

        if (
          media &&
          Object.values(parseVariants(media.variants)).some(
            (variant) => variant?.key === key,
          )
        )
          id = match[1]!;
      }
    }

    if (!id) return null;
    await new PrismaMediaKeyCatchUp(this.db).claim(id);

    return this.get(id);
  }

  async reserveKeys(uploadId: string, keys: readonly string[]) {
    try {
      await this.db.mediaStorageKey.createMany({
        data: keys.map((key) => ({
          key: new TextEncoder().encode(key),
          uploadId,
        })),
      });

      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return false;
      throw error;
    }
  }

  async insert({ variants, ...media }: MediaWrite) {
    const keys = [
      media.storageKey,
      ...Object.values(variants).flatMap((variant) =>
        variant ? [variant.key] : [],
      ),
    ].map((key) => new TextEncoder().encode(key));

    await this.db.$transaction(async (tx) => {
      await tx.media.create({
        data: { ...media, variants: JSON.stringify(variants) },
      });
      await tx.mediaStorageKey.createMany({
        data: keys.map((key) => ({ key, uploadId: media.id })),
        skipDuplicates: true,
      });
      const claimed = await tx.mediaStorageKey.updateMany({
        where: { key: { in: keys }, uploadId: media.id, mediaId: null },
        data: { mediaId: media.id },
      });

      if (claimed.count !== keys.length) throw conflict(Errors.MediaKeyInvalid);
    });
  }

  async get(id: string) {
    const row = await this.db.media.findUnique({
      where: { id },
      include: relations,
    });

    if (!row) return null;
    const uses = await this.patternUses([id]);
    const record = toRecord(row);

    return {
      ...record,
      usageCount: record.usageCount + (uses.get(id) ?? 0),
    };
  }

  async exists(id: string) {
    return (
      (await this.db.media.findUnique({
        where: { id },
        select: { id: true },
      })) !== null
    );
  }

  async list({
    missing,
    kind,
    search,
    uploaded,
    unattached,
    page,
    pageSize,
  }: MediaCriteria) {
    const filters: Prisma.Sql[] = [];

    if (missing) filters.push(Prisma.sql`m.missing_at IS NOT NULL`);
    if (kind) filters.push(Prisma.sql`m.mime LIKE ${MIME_PREFIX[kind] + '%'}`);
    if (uploaded)
      filters.push(
        Prisma.sql`m.created_at >= ${uploaded.start} AND m.created_at < ${uploaded.end}`,
      );
    if (unattached)
      filters.push(Prisma.sql`
      NOT EXISTS (SELECT 1 FROM content_media cm WHERE cm.media_id = m.id)
      AND NOT EXISTS (SELECT 1 FROM term_media tm WHERE tm.media_id = m.id)
      AND m.id NOT IN (SELECT id FROM (${patternFiles}) AS pattern_files)`);

    if (search) {
      const contains = '%' + literal(search) + '%';

      filters.push(
        Prisma.sql`(m.filename LIKE ${contains} OR m.alt LIKE ${contains} OR m.caption LIKE ${contains} OR m.title LIKE ${contains} OR m.description LIKE ${contains})`,
      );
    }

    const where = filters.length
      ? Prisma.join(filters, ' AND ')
      : Prisma.sql`TRUE`;
    const [count] = await this.db.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM media m WHERE ${where}`,
    );
    const total = Number(count?.total ?? 0);
    const skip = (page - 1) * pageSize;

    if (skip >= total) return { items: [], total };
    const ids = await this.db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT m.id FROM media m WHERE ${where}
      ORDER BY m.created_at DESC, m.id DESC LIMIT ${pageSize} OFFSET ${skip}`);
    const rows = await this.db.media.findMany({
      where: { id: { in: ids.map(({ id }) => id) } },
      include: relations,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const uses = unattached
      ? new Map<string, number>()
      : await this.patternUses(rows.map(({ id }) => id));

    return {
      items: rows.map((row) => {
        const record = toRecord(row);

        return {
          ...record,
          usageCount: record.usageCount + (uses.get(row.id) ?? 0),
        };
      }),
      total,
    };
  }

  /** Count direct uses, including draft patterns and targets reached through another pattern. */
  private async patternUses(ids: readonly string[]) {
    if (!ids.length) return new Map<string, number>();
    const rows = await this.db.$queryRaw<
      { id: string; count: bigint }[]
    >(Prisma.sql`
      SELECT id, COUNT(*) AS count FROM (${patternFiles}) AS pattern_files
      WHERE id IN (${Prisma.join([...ids])}) GROUP BY id`);

    return new Map(rows.map(({ id, count }) => [id, Number(count)]));
  }

  async neighbors(id: string) {
    const current = await this.db.media.findUnique({
      where: { id },
      select: { createdAt: true },
    });

    if (!current) return { newer: null, older: null };
    const { createdAt } = current;
    // The list order: newest first, ties by id descending.
    const [newer, older] = await Promise.all([
      this.db.media.findFirst({
        where: {
          OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
      this.db.media.findFirst({
        where: {
          OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      }),
    ]);

    return { newer: newer?.id ?? null, older: older?.id ?? null };
  }

  async usedIn(id: string, limit: number, publishedOnly: boolean) {
    const rows = await this.db.contentMedia.findMany({
      where: {
        mediaId: id,
        ...(publishedOnly && {
          content: { status: 'published', trashedAt: null },
        }),
      },
      select: { content: { select: { id: true, title: true, type: true } } },
      orderBy: { content: { updatedAt: 'desc' } },
      take: limit,
    });
    const terms =
      rows.length < limit
        ? await this.db.termMedia.findMany({
            where: { mediaId: id },
            select: {
              term: { select: { id: true, name: true, taxonomy: true } },
            },
            orderBy: { term: { updatedAt: 'desc' } },
            take: limit - rows.length,
          })
        : [];

    return [
      ...rows.map(({ content }) => ({ ...content, kind: 'content' as const })),
      ...terms.map(({ term }) => ({
        id: term.id,
        title: term.name,
        type: term.taxonomy,
        kind: 'term' as const,
      })),
    ];
  }

  async publicImages(ids: readonly string[]) {
    if (!ids.length) return new Map();
    const rows = await this.db.media.findMany({
      where: { id: { in: [...ids] }, mime: { startsWith: 'image/' } },
      select: {
        id: true,
        storageKey: true,
        storageDriver: true,
        publicUrl: true,
        alt: true,
        width: true,
        height: true,
        variants: true,
      },
    });

    return new Map(
      await Promise.all(
        rows.map(
          async ({ id, variants, ...row }) =>
            [
              id,
              toPublicImage(
                await projectMedia(
                  { ...row, variants: parseVariants(variants) },
                  this.hooks,
                ),
              ),
            ] as const,
        ),
      ),
    );
  }

  async update(
    id: string,
    changes: {
      alt?: string;
      caption?: string;
      title?: string;
      description?: string;
    },
  ) {
    await this.db.media.update({ where: { id }, data: changes });
  }

  async delete(id: string) {
    // Usage links cascade; featured images fall back to none (ON DELETE SET NULL).
    await this.db.media.deleteMany({ where: { id } });
  }
}
