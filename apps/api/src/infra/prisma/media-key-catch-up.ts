import type { Database } from '#api/infra/prisma/client';
import { parseVariants } from '#api/domain/media/media-mapper';
import { conflict, Errors } from '#api/shared/errors';
import { z } from 'zod';

const CURSOR = 'media.keys.cursor';
export const MEDIA_KEY_CATCH_UP = 'core:media-key-catch-up';
export const MEDIA_KEY_BATCH = 100;
const encode = (key: string) => new TextEncoder().encode(key);
const sweepSchema = z.object({ after: z.string(), through: z.string() });

/** A full keyset sweep repeats, so late legacy inserts behind the cursor are not lost. */
export class PrismaMediaKeyCatchUp {
  constructor(private readonly db: Database) {}

  async claim(id: string) {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { storageKey: string; variants: string }[]
      >`
        SELECT storage_key AS storageKey, variants FROM media WHERE id = ${id} FOR UPDATE`;
      const row = rows[0];
      if (!row) return;
      const keys = [
        ...new Set([
          row.storageKey,
          ...Object.values(parseVariants(row.variants)).flatMap((variant) =>
            variant ? [variant.key] : [],
          ),
        ]),
      ].map(encode);
      if (keys.length > 33 || keys.some((key) => key.length > 255))
        throw conflict(Errors.MediaKeyInvalid);
      await tx.mediaStorageKey.createMany({
        data: keys.map((key) => ({ key, uploadId: id, mediaId: id })),
        skipDuplicates: true,
      });
      const existing = await tx.mediaStorageKey.findMany({
        where: { key: { in: keys } },
      });
      if (
        existing.some(
          (key) =>
            (key.mediaId !== null && key.mediaId !== id) ||
            (key.uploadId !== null && key.uploadId !== id),
        )
      )
        throw conflict(Errors.MediaKeyInvalid);
      await tx.mediaStorageKey.updateMany({
        where: { key: { in: keys }, mediaId: null },
        data: { uploadId: id, mediaId: id },
      });
    });
  }

  private async save(sweep: z.infer<typeof sweepSchema>) {
    const value = JSON.stringify(sweep);
    await this.db.setting.upsert({
      where: { key: CURSOR },
      create: { key: CURSOR, value },
      update: { value },
    });
  }

  async run() {
    const saved = await this.db.setting.findUnique({ where: { key: CURSOR } });
    const sweep = saved
      ? sweepSchema.parse(JSON.parse(saved.value))
      : { after: '', through: '' };
    if (!sweep.through) {
      const last = await this.db.media.findFirst({
        select: { id: true },
        orderBy: { id: 'desc' },
      });
      if (!last) return { media: 0 };
      sweep.through = last.id;
      // Persist the boundary before work so failures cannot extend an unfinished sweep.
      await this.save(sweep);
    }
    const rows = await this.db.media.findMany({
      where: { id: { gt: sweep.after, lte: sweep.through } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: MEDIA_KEY_BATCH,
    });
    for (const { id } of rows) await this.claim(id);
    await this.save(
      rows.length < MEDIA_KEY_BATCH || rows.at(-1)?.id === sweep.through
        ? { after: '', through: '' }
        : { after: rows.at(-1)!.id, through: sweep.through },
    );
    return { media: rows.length };
  }
}
