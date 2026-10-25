import { expect, test } from 'bun:test';
import { SIGN_IN_TTL_MS } from '#api/domain/auth/sign-in-transactions';
import type { SignInTransaction } from '#api/domain/auth/sign-in-transactions';
import { MemorySignInTransactions } from '#test/support/memory-sign-in';

test('pending sign-ins are client bound, single use, expiring and bounded', async () => {
  const store = new MemorySignInTransactions();
  const now = new Date('2026-01-01T00:00:00Z');
  const row: SignInTransaction = {
    handleHash: 'digest',
    stage: 'primary',
    methodId: 'plugin:test:method',
    factorId: null,
    userId: null,
    setupTokenHash: null,
    state: { nonce: 'secret' },
    clientKey: 'client',
    expiresAt: new Date(now.getTime() + SIGN_IN_TTL_MS),
  };
  const limits = { total: 2, perClient: 1 };
  expect(await store.admit(row, now, limits)).toBe(true);
  expect(await store.admit({ ...row, handleHash: 'second' }, now, limits)).toBe(
    false,
  );
  expect(await store.take('digest', 'wrong', now)).toBeNull();
  const taken = await Promise.all([
    store.take('digest', 'client', now),
    store.take('digest', 'client', now),
  ]);
  expect(taken.filter(Boolean)).toHaveLength(1);
  expect(taken.find(Boolean)?.state).toEqual({ nonce: 'secret' });
  expect(await store.admit(row, now, limits)).toBe(true);
  expect(await store.take('digest', 'client', row.expiresAt)).toBeNull();
  expect(
    await store.admit(
      {
        ...row,
        handleHash: 'new',
        expiresAt: new Date(row.expiresAt.getTime() + SIGN_IN_TTL_MS),
      },
      row.expiresAt,
      limits,
    ),
  ).toBe(true);
  expect(store.rows.size).toBe(1);
  const future = new Date(row.expiresAt.getTime() + SIGN_IN_TTL_MS);
  const candidates = ['a', 'b'].map((handleHash) =>
    store.admit(
      {
        ...row,
        handleHash,
        clientKey: handleHash,
        expiresAt: future,
      },
      row.expiresAt,
      limits,
    ),
  );
  expect((await Promise.all(candidates)).filter(Boolean)).toHaveLength(1);
  expect(store.rows.size).toBe(2);
  await expect(
    store.admit(
      {
        ...row,
        handleHash: 'oversized',
        state: '한'.repeat(3000),
      },
      now,
      limits,
    ),
  ).rejects.toThrow('Sign-in state exceeds 8 KB');
});
