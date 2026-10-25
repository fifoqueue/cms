import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { scratchDatabase } from '#test/support/scratch-database';
import type { Database } from '#api/infra/prisma/client';
import { PrismaUserRepository } from '#api/infra/prisma/auth-repositories';
import { PrismaPrivacyRepository } from '#api/infra/prisma/privacy-repository';
import { PrismaProfileMeta } from '#api/infra/prisma/profile-meta';
import { plainSecretBox } from '#test/support/memory-security';
import { userRecord } from '#test/support/memory';

const server = process.env.CMS_TEST_DATABASE_URL;
describe.skipIf(!server)('user extension persistence on MariaDB', () => {
  let db: Database;
  let drop = async () => {};
  beforeAll(async () => {
    ({ db, drop } = await scratchDatabase(server!, 'cms_user_extensions'));
  }, 60000);
  afterAll(() => drop(), 60000);

  test('profile metadata is subject-scoped, exported while its plugin is disabled, erased atomically and cannot be recreated after erasure', async () => {
    const users = new PrismaUserRepository(db);
    await users.insert(
      userRecord({
        id: 'meta-subject',
        email: 'subject@example.com',
        slug: 'subject',
        role: 'subscriber',
      }),
    );
    await users.insert(
      userRecord({
        id: 'meta-other',
        email: 'other@example.com',
        slug: 'other',
        role: 'subscriber',
      }),
    );
    const profiles = new PrismaProfileMeta(db);
    await profiles.save('meta-subject', { 'preferences:color': 'blue' });
    await profiles.save('meta-other', { 'preferences:color': 'red' });
    const repository = new PrismaPrivacyRepository(db, plainSecretBox);
    expect(
      await repository.data('subject@example.com', 'profileFields', null, 200),
    ).toEqual([
      { id: 'meta-subject', values: { 'preferences:color': 'blue' } },
    ]);
    const now = new Date();
    await repository.insert({
      id: 'erasure',
      email: 'subject@example.com',
      action: 'erase',
      status: 'confirmed',
      tokenHash: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60000),
      confirmedAt: now,
      completedAt: null,
    });
    await repository.erase('erasure', 'disabled-hash', now);
    expect(await profiles.read('meta-subject')).toEqual({});
    expect(await profiles.read('meta-other')).toEqual({
      'preferences:color': 'red',
    });
    await expect(
      profiles.save('meta-subject', { 'preferences:color': 'returned' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
