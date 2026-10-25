import { expect, test } from 'bun:test';
import { createRecoveryFactor } from '#api/domain/auth/recovery-factor';
import { MemoryRecoveryCodes } from '#test/support/memory-recovery';
import { profile } from '#test/support/memory';

test('recovery factor consumes an owner-bound code once and is no longer enrolled when empty', async () => {
  const codes = new MemoryRecoveryCodes();
  const user = profile({ id: 'owner' });
  const tokens = {
    issue: () => '',
    digest: (value: string) => `hash:${value}`,
  };
  const factor = createRecoveryFactor(codes, tokens);
  expect(await factor.enrolled(user)).toBe(false);
  await codes.replace(user.id, [
    {
      id: 'code',
      userId: user.id,
      codeHash: tokens.digest('ABCDE'),
      createdAt: new Date(),
    },
  ]);
  expect(await factor.enrolled(user)).toBe(true);
  expect((await factor.challenge(user)).kind).toBe('fields');
  const step = {
    state: null,
    values: { code: ' ab-cde ' },
    credential: null,
    query: null,
    address: null,
  };
  expect(await factor.verify(profile({ id: 'other' }), step)).toBe(false);
  expect(
    (
      await Promise.all([factor.verify(user, step), factor.verify(user, step)])
    ).filter(Boolean),
  ).toHaveLength(1);
  expect(await factor.enrolled(user)).toBe(false);
});
