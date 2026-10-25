import { expect, test } from 'bun:test';
import { createPasswordMethod } from '#api/domain/auth/password-method';
import { MemoryUsers } from '#test/support/sso-memory';
import { profile, userRecord } from '#test/support/memory';

test('password method verifies unknown users against a dummy hash and defers setup to atomic token consumption', async () => {
  const users = new MemoryUsers();
  const user = userRecord({
    id: 'owner',
    email: 'owner@example.com',
    passwordHash: 'hash:correct-password',
  });
  await users.insert(user);
  const verified: string[] = [];
  let consumed = false;
  const method = createPasswordMethod({
    users,
    hasher: {
      hash: async (password) => `hash:${password}`,
      verify: async (password, hash) => {
        verified.push(hash);
        return hash === `hash:${password}`;
      },
    },
    credentials: {
      change: async () => {},
      validReset: async () => true,
      reset: async (token, _now, hash) => {
        if (consumed || token !== 'valid-token-hash') return false;
        consumed = true;
        await users.setPassword(user.id, hash);
        return true;
      },
    },
  });
  const request = {
    option: null,
    address: null,
    callbackUrl: 'https://site.example/admin/sign-in/callback',
    values: { email: user.email, password: 'correct-password' },
  };
  expect(await method.begin(request)).toEqual({
    kind: 'user',
    userId: user.id,
  });
  expect(
    await method.begin({
      ...request,
      values: { ...request.values, password: 'wrong-password' },
    }),
  ).toEqual({ kind: 'failed' });
  expect(
    await method.begin({
      ...request,
      values: { ...request.values, email: 'missing@example.com' },
    }),
  ).toEqual({ kind: 'failed' });
  expect(verified).toEqual([
    'hash:correct-password',
    'hash:correct-password',
    'hash:dummy-password',
  ]);
  const outcome = await method.setup!.begin(profile({ id: user.id }), {
    ...request,
    values: { password: 'new-password' },
  });
  expect(consumed).toBe(false);
  expect((await users.findById(user.id))?.passwordHash).toBe(
    'hash:correct-password',
  );
  if (!('commitSetup' in outcome) || !outcome.commitSetup)
    throw new Error('Missing atomic finalizer');
  const results = await Promise.all([
    outcome.commitSetup('valid-token-hash', new Date()),
    outcome.commitSetup('valid-token-hash', new Date()),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect((await users.findById(user.id))?.passwordHash).toBe(
    'hash:new-password',
  );
});
