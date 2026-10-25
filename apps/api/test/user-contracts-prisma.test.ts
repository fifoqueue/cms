import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { scratchDatabase } from '#test/support/scratch-database';
import type { Database } from '#api/infra/prisma/client';
import { PrismaUserRepository } from '#api/infra/prisma/auth-repositories';
import { PrismaUserDirectory } from '#api/infra/prisma/user-directory';
import { PrismaPrivacyRepository } from '#api/infra/prisma/privacy-repository';
import { PrismaProfileMeta } from '#api/infra/prisma/profile-meta';
import { RoleRegistry } from '#api/domain/users/role-registry';
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

  test('registered roles are assignable and withdrawn defaults cannot be assigned', async () => {
    const defaults = new RoleRegistry();
    const remove = defaults.register({
      key: 'reviewer',
      name: 'Reviewer',
      capabilities: ['content.create'],
    });
    const directory = new PrismaUserDirectory(db, (key) => defaults.has(key));
    await new PrismaUserRepository(db).insert(
      userRecord({
        id: 'administrator',
        email: 'admin@example.com',
        slug: 'admin',
      }),
    );
    await directory.insert(
      userRecord({
        id: 'reviewer',
        email: 'reviewer@example.com',
        slug: 'reviewer',
        role: 'reviewer',
      }),
    );
    expect((await directory.get('reviewer'))?.role).toBe('reviewer');
    remove();
    await expect(
      directory.setRole('reviewer', 'reviewer'),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await directory.setRole('reviewer', 'subscriber');
  });

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
