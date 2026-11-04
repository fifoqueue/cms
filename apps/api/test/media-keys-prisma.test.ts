import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Database } from '#api/infra/prisma/client';
import type { MediaWrite } from '#api/domain/media/ports';
import { PrismaMediaRepository } from '#api/infra/prisma/media-repository';
import {
  PrismaMediaKeyCatchUp,
  MEDIA_KEY_BATCH,
} from '#api/infra/prisma/media-key-catch-up';
import { scratchDatabase } from '#test/support/scratch-database';

const serverUrl = process.env.CMS_TEST_DATABASE_URL;
describe.skipIf(!serverUrl)('indexed media keys on MariaDB', () => {
  let db: Database;
  let drop = async () => {};
  beforeAll(async () => {
    ({ db, drop } = await scratchDatabase(serverUrl!, 'cms_media_keys_test'));
  }, 60000);
  afterAll(() => drop(), 60000);
  const record = (id: string, key: string): MediaWrite => ({
    id,
    storageKey: key,
    uploaderId: null,
    filename: 'image.png',
    mime: 'image/png',
    size: 10,
    width: 100,
    height: 100,
    alt: '',
    caption: '',
    variants: {},
    createdAt: new Date(),
  });

  test('schema and catch-up rerun safely after legacy writes', async () => {
    // This table belongs only to this newly allocated scratch database.
    await db.$executeRawUnsafe('DROP TABLE media_storage_keys');
    const id = crypto.randomUUID();
    const { variants: _variants, ...row } = record(id, 'legacy_a.png');
    await db.media.create({
      data: {
        ...row,
        variants: JSON.stringify({
          small: { key: 'legacy_a-small.webp', width: 50, height: 50 },
        }),
      },
    });
    const sql = await Bun.file(
      new URL(
        '../prisma/migrations/20261122000000_media_storage_keys/migration.sql',
        import.meta.url,
      ),
    ).text();
    const statements = sql
      .replace(/^--.*$/gm, '')
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean);
    for (let run = 0; run < 2; run++)
      for (const statement of statements) await db.$executeRawUnsafe(statement);
    const catchUp = new PrismaMediaKeyCatchUp(db);
    await catchUp.run();
    const count = await db.mediaStorageKey.count();
    await catchUp.run();
    expect(await db.mediaStorageKey.count()).toBe(count);
    const late = crypto.randomUUID();
    const { variants: _lateVariants, ...lateRow } = record(
      late,
      `2026/01/${late}.png`,
    );
    await db.media.create({
      data: {
        ...lateRow,
        variants: JSON.stringify({
          small: { key: `2026/01/${late}-small.webp`, width: 50, height: 50 },
        }),
      },
    });
    const repository = new PrismaMediaRepository(db);
    expect((await repository.getByKey(`2026/01/${late}-small.webp`))?.id).toBe(
      late,
    );
    const later = crypto.randomUUID();
    const { variants: _laterVariants, ...laterRow } = record(
      later,
      'custom-late.png',
    );
    await db.media.create({
      data: {
        ...laterRow,
        variants: JSON.stringify({
          small: { key: 'custom-late-small.webp', width: 50, height: 50 },
        }),
      },
    });
    await catchUp.run();
    expect((await repository.getByKey('custom-late-small.webp'))?.id).toBe(
      later,
    );
    expect((await repository.getByKey('legacy_a.png'))?.id).toBe(id);
    expect((await repository.getByKey('legacy_a-small.webp'))?.id).toBe(id);
    expect(await repository.getByKey('legacyXa-small.webp')).toBeNull();
    expect(await repository.getByKey('LEGACY_a.png')).toBeNull();
  }, 60000);

  test('high-water sweeps claim behind-cursor inserts despite a growing tail', async () => {
    // All rows here belong to this suite's uniquely allocated database.
    await db.media.deleteMany();
    await db.mediaStorageKey.deleteMany();
    await db.setting.deleteMany();
    const insert = async (start: number, count: number) =>
      db.media.createMany({
        data: Array.from({ length: count }, (_, i) => {
          const id = String(start + i).padStart(36, '0');
          const { variants: _variants, ...row } = record(id, `batch-${id}.png`);
          return { ...row, variants: '{}' };
        }),
      });
    await insert(1, MEDIA_KEY_BATCH * 2);
    expect((await new PrismaMediaKeyCatchUp(db).run()).media).toBe(
      MEDIA_KEY_BATCH,
    );
    expect(await db.mediaStorageKey.count()).toBe(MEDIA_KEY_BATCH);
    await insert(0, 1);
    await insert(MEDIA_KEY_BATCH * 2 + 1, MEDIA_KEY_BATCH);
    expect((await new PrismaMediaKeyCatchUp(db).run()).media).toBe(
      MEDIA_KEY_BATCH,
    );
    await insert(MEDIA_KEY_BATCH * 3 + 1, MEDIA_KEY_BATCH);
    expect((await new PrismaMediaKeyCatchUp(db).run()).media).toBe(
      MEDIA_KEY_BATCH,
    );
    const id = '0'.repeat(36);
    const mapping = await db.mediaStorageKey.findUnique({
      where: { key: new TextEncoder().encode(`batch-${id}.png`) },
    });
    expect(mapping?.mediaId).toBe(id);
  }, 60000);

  test('competing batches reserve atomically and only their owner can claim keys', async () => {
    const first = new PrismaMediaRepository(db);
    const second = new PrismaMediaRepository(db);
    const a = crypto.randomUUID(),
      b = crypto.randomUUID();
    const outcomes = await Promise.all([
      first.reserveKeys(a, ['race.png', 'race_a.webp']),
      second.reserveKeys(b, ['race.png', 'race_b.webp']),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const winner = outcomes[0] ? a : b;
    const loser = outcomes[0] ? b : a;
    const wonVariant = outcomes[0] ? 'race_a.webp' : 'race_b.webp';
    const lostVariant = outcomes[0] ? 'race_b.webp' : 'race_a.webp';
    expect(await first.reserveKeys(loser, [lostVariant])).toBe(true);
    await expect(second.insert(record(loser, 'race.png'))).rejects.toThrow();
    expect(await second.exists(loser)).toBe(false);
    expect(await first.getByKey('race.png')).toBeNull();
    await first.insert({
      ...record(winner, 'race.png'),
      variants: { small: { key: wonVariant, width: 50, height: 50 } },
    });
    expect((await second.getByKey(wonVariant))?.id).toBe(winner);
    await first.delete(winner);
    expect(await second.getByKey(wonVariant)).toBeNull();
    expect(
      await second.reserveKeys(crypto.randomUUID(), ['race.png', wonVariant]),
    ).toBe(false);
  }, 60000);
});
