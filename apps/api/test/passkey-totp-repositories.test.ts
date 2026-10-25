import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PasskeyRepository } from '#api/domain/auth/passkey/ports';
import type {
  TotpRepository,
  TotpMaintenanceRepository,
} from '#api/domain/auth/totp/ports';
import { PrismaPasskeyRepository } from '#api/infra/passkey-repository';
import { PrismaTotpRepository } from '#api/infra/totp-repository';
import { MemoryPasskeys } from '#test/support/memory-passkey';
import { MemoryTotpSecrets } from '#test/support/memory-totp';
import { scratchDatabase } from '#test/support/scratch-database';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const contracts = (
  repositories: () => {
    passkeys: PasskeyRepository;
    secrets: TotpRepository & TotpMaintenanceRepository;
  },
) => {
  test('credential bytes are exact and globally unique; usage CAS is atomic and deletion owner-scoped', async () => {
    const { passkeys } = repositories();
    const record = {
      id: crypto.randomUUID(),
      userId: alice,
      credentialId: Buffer.from('Key'),
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: ['internal'],
      deviceType: 'multiDevice',
      backedUp: true,
      discoverable: false,
      name: 'Laptop',
      createdAt: new Date(),
      lastUsedAt: null,
    };
    expect(await passkeys.insert(record)).toBe(true);
    expect(
      await passkeys.insert({
        ...record,
        id: crypto.randomUUID(),
        userId: bob,
      }),
    ).toBe(false);
    expect(await passkeys.find(Buffer.from('key'))).toBeNull();
    expect((await passkeys.find(record.credentialId))!.userId).toBe(alice);
    expect((await passkeys.find(record.credentialId))!.discoverable).toBe(
      false,
    );
    expect(await passkeys.use(record.id, 0, 0, true, new Date())).toBe(true);
    expect(
      (
        await Promise.all([
          passkeys.use(record.id, 0, 1, true, new Date()),
          passkeys.use(record.id, 0, 1, true, new Date()),
        ])
      ).sort(),
    ).toEqual([false, true]);
    expect(await passkeys.use(record.id, 1, 0, true, new Date())).toBe(false);
    await passkeys.remove(bob, record.id);
    expect(await passkeys.find(record.credentialId)).not.toBeNull();
    await passkeys.remove(alice, record.id);
    expect(await passkeys.use(record.id, 1, 2, true, new Date())).toBe(false);
  });
  test('one TOTP per user; concurrent replay and stale credentials after replacement fail', async () => {
    const { secrets } = repositories();
    const record = {
      id: crypto.randomUUID(),
      userId: alice,
      sealedSecret: 'sealed',
      lastStep: 100,
      createdAt: new Date(),
    };
    expect(await secrets.insert(record)).toBe(true);
    expect(await secrets.insert({ ...record, id: crypto.randomUUID() })).toBe(
      false,
    );
    expect(
      (
        await Promise.all([
          secrets.consume(record.id, 101, 'rotated'),
          secrets.consume(record.id, 101, 'rotated'),
        ])
      ).sort(),
    ).toEqual([false, true]);
    expect((await secrets.find(alice))!.sealedSecret).toBe('rotated');
    expect(await secrets.consume(record.id, 100, 'stale')).toBe(false);
    expect(await secrets.reseal(record.id, 'sealed', 'stale')).toBe(false);
    expect(await secrets.reseal(record.id, 'rotated', 'maintenance')).toBe(
      true,
    );
    expect((await secrets.find(alice))!.lastStep).toBe(101);
    expect((await secrets.find(alice))!.sealedSecret).toBe('maintenance');
    await secrets.remove(bob, record.id);
    expect(await secrets.find(alice)).not.toBeNull();
    await secrets.remove(alice, record.id);
    expect(await secrets.insert({ ...record, id: crypto.randomUUID() })).toBe(
      true,
    );
    expect(await secrets.consume(record.id, 102, 'stale')).toBe(false);
    expect(await secrets.reseal(record.id, 'maintenance', 'stale')).toBe(false);
    await secrets.insert({ ...record, id: crypto.randomUUID(), userId: bob });
    const rows = await secrets.scan(null, 1);
    expect(rows).toHaveLength(1);
    const next = await secrets.scan(rows[0]!.id, 1);
    expect(next).toHaveLength(1);
    expect(next[0]!.id > rows[0]!.id).toBe(true);
    expect(await secrets.scan(next[0]!.id, 1)).toEqual([]);
  });
};
describe('memory credential repository contracts', () => {
  const passkeys = new MemoryPasskeys();
  const secrets = new MemoryTotpSecrets();
  contracts(() => ({ passkeys, secrets }));
});
const serverUrl = process.env.CMS_TEST_DATABASE_URL;
describe.skipIf(!serverUrl)('Prisma credential repository contracts', () => {
  let scratch: Awaited<ReturnType<typeof scratchDatabase>>;
  beforeAll(async () => {
    scratch = await scratchDatabase(serverUrl!, 'cms_credentials_test');
    await scratch.db.user.createMany({
      data: [alice, bob].map((id) => ({
        id,
        email: `${id}@example.com`,
        name: id,
        slug: id,
        passwordHash: '',
      })),
    });
  }, 60000);
  afterAll(async () => {
    await scratch?.drop();
  }, 60000);
  contracts(() => ({
    passkeys: new PrismaPasskeyRepository(scratch.db),
    secrets: new PrismaTotpRepository(scratch.db),
  }));
  test('setup commits one credential with all proof revocations; collisions roll back consumption', async () => {
    const db = scratch.db;
    const passkeys = new PrismaPasskeyRepository(db);
    const now = new Date();
    const record = {
      id: crypto.randomUUID(),
      userId: bob,
      credentialId: Buffer.from('atomic-key'),
      publicKey: Buffer.from([1]),
      counter: 0,
      transports: [],
      deviceType: 'singleDevice',
      backedUp: false,
      discoverable: true,
      name: 'Setup key',
      createdAt: now,
      lastUsedAt: null,
    };
    for (const tokenHash of ['a'.repeat(64), 'b'.repeat(64)])
      await db.passwordToken.create({
        data: {
          tokenHash,
          userId: bob,
          purpose: 'invite',
          expiresAt: new Date(now.getTime() + 60000),
        },
      });
    const results = await Promise.all([
      passkeys.register(record, 'a'.repeat(64), now),
      passkeys.register(
        {
          ...record,
          id: crypto.randomUUID(),
          credentialId: Buffer.from('other-atomic-key'),
        },
        'a'.repeat(64),
        now,
      ),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(await db.passwordToken.count({ where: { userId: bob } })).toBe(0);
    const keys = (await passkeys.list(bob)).filter(
      (key) => key.name === 'Setup key',
    );
    expect(keys).toHaveLength(1);
    await db.passwordToken.create({
      data: {
        tokenHash: 'c'.repeat(64),
        userId: bob,
        purpose: 'reset',
        expiresAt: new Date(now.getTime() + 60000),
      },
    });
    expect(
      await passkeys.register(
        { ...keys[0]!, id: crypto.randomUUID() },
        'c'.repeat(64),
        now,
      ),
    ).toBe(false);
    expect(
      await db.passwordToken.findUnique({
        where: { tokenHash: 'c'.repeat(64) },
      }),
    ).not.toBeNull();
  });
  test('deleting a user cascades to both credential tables', async () => {
    await scratch.db.user.delete({ where: { id: alice } });
    expect(await scratch.db.passkey.count({ where: { userId: alice } })).toBe(
      0,
    );
    expect(
      await scratch.db.totpSecret.count({ where: { userId: alice } }),
    ).toBe(0);
  });
});
