import type {
  MediaCriteria,
  MediaRecord,
  MediaRepository,
  MediaWrite,
} from '#api/domain/media/ports';
import { parseVariants, toPublicImage } from '#api/domain/media/media-mapper';
import type { Database } from '#api/infra/prisma/client';
import type { Media, Prisma } from '#api/infra/prisma/generated/client';

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
    return row && toRecord(row);
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
    const filters: Prisma.MediaWhereInput[] = [];
    if (kind) filters.push({ mime: { startsWith: MIME_PREFIX[kind] } });
    if (uploaded)
      filters.push({ createdAt: { gte: uploaded.start, lt: uploaded.end } });
    if (unattached) filters.push({ usages: { none: {} } });
    if (search) {
      const contains = literal(search);
      filters.push({
        OR: [
          { filename: { contains } },
          { alt: { contains } },
          { caption: { contains } },
        ],
      });
    }
    const where = { AND: filters };
    const total = await this.db.media.count({ where });
    const skip = (page - 1) * pageSize;
    if (skip >= total) return { items: [], total };
    const rows = await this.db.media.findMany({
      where,
      include: relations,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
    });
    return { items: rows.map(toRecord), total };
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

  async usedIn(id: string, limit: number) {
    const rows = await this.db.contentMedia.findMany({
      where: { mediaId: id },
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
