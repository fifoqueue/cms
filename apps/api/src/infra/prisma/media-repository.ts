import type {
  MediaCriteria,
  MediaRecord,
  MediaRepository,
  MediaWrite,
} from '#api/domain/media/ports';
import { parseVariants, toPublicImage } from '#api/domain/media/media-mapper';
import type { Database } from '#api/infra/prisma/client';
import type { Media } from '#api/infra/prisma/generated/client';
import { Prisma } from '#api/infra/prisma/generated/client';

/** LIKE pattern text matching `value` literally. */
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const relations = {
  uploader: { select: { name: true } },
  _count: { select: { usages: true } },
} as const;

type Row = Media & {
  uploader: { name: string } | null;
  _count: { usages: number };
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
  usageCount: _count.usages,
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
  constructor(private readonly db: Database) {}

  async insert({ variants, ...media }: MediaWrite) {
    await this.db.media.create({
      data: { ...media, variants: JSON.stringify(variants) },
    });
  }

  async get(id: string) {
    const row = await this.db.media.findUnique({
      where: { id },
      include: relations,
    });
    if (!row) return null;
    const uses = await this.patternUses([id]);
    return {
      ...toRecord(row),
      usageCount: row._count.usages + (uses.get(id) ?? 0),
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
    kind,
    search,
    uploaded,
    unattached,
    page,
    pageSize,
  }: MediaCriteria) {
    const filters: Prisma.Sql[] = [];
    if (kind) filters.push(Prisma.sql`m.mime LIKE ${MIME_PREFIX[kind] + '%'}`);
    if (uploaded)
      filters.push(
        Prisma.sql`m.created_at >= ${uploaded.start} AND m.created_at < ${uploaded.end}`,
      );
    if (unattached)
      filters.push(Prisma.sql`
      NOT EXISTS (SELECT 1 FROM content_media cm WHERE cm.media_id = m.id)
      AND m.id NOT IN (SELECT id FROM (${patternFiles}) AS pattern_files)`);
    if (search) {
      const contains = '%' + literal(search) + '%';
      filters.push(
        Prisma.sql`(m.filename LIKE ${contains} OR m.alt LIKE ${contains} OR m.caption LIKE ${contains})`,
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
      items: rows.map((row) => ({
        ...toRecord(row),
        usageCount: row._count.usages + (uses.get(row.id) ?? 0),
      })),
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
    return rows.map(({ content }) => content);
  }

  async publicImages(ids: readonly string[]) {
    if (!ids.length) return new Map();
    const rows = await this.db.media.findMany({
      where: { id: { in: [...ids] }, mime: { startsWith: 'image/' } },
      select: {
        id: true,
        storageKey: true,
        alt: true,
        width: true,
        height: true,
        variants: true,
      },
    });
    return new Map(
      rows.map(({ id, variants, ...row }) => [
        id,
        toPublicImage({ ...row, variants: parseVariants(variants) }),
      ]),
    );
  }

  async update(id: string, changes: { alt?: string; caption?: string }) {
    await this.db.media.update({ where: { id }, data: changes });
  }

  async delete(id: string) {
    // Usage links cascade; featured images fall back to none (ON DELETE SET NULL).
    await this.db.media.deleteMany({ where: { id } });
  }
}
