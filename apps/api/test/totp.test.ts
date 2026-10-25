import { expect, test } from 'bun:test';
import type { UserProfile } from '@cms/sdk';
import type { SignInContinuation } from '@cms/sdk/plugin';
import { createTotpFactor } from '#api/domain/auth/totp/totp';
import { base32, totpAlgorithm, totpCode } from '#api/infra/totp-crypto';
import { aesSecretBox } from '#api/infra/secret-box';
import { MemoryTotpSecrets } from '#test/support/memory-totp';
import { Errors } from '#api/shared/errors';

const key = Buffer.from('12345678901234567890');
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const user: UserProfile = {
  id: 'alice',
  name: 'Alice',
  email: 'alice+cms@example.com',
  role: 'administrator',
  slug: 'alice',
  bio: '',
  locale: 'en',
};
const step = (state: unknown, code: string): SignInContinuation => ({
  state,
  values: { code },
  credential: null,
  query: null,
  address: null,
});

// RFC 6238 Appendix B SHA-1 vectors. Six digits are the low six of the specified eight.
test.each([
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
] as const)('RFC 6238 SHA-1 at %s seconds', (seconds, expected) => {
  const counter = Math.floor(seconds / 30);
  expect(base32(key)).toBe(secret);
  expect(totpCode(key, counter, 8)).toBe(expected);
  expect(totpCode(key, counter)).toBe(expected.slice(-6));
  expect(
    totpAlgorithm.match(secret, expected.slice(-6), new Date(seconds * 1000)),
  ).toBe(counter);
});

test('enrollment remains pending, stores sealed secret only after proof, and consumes codes atomically', async () => {
  const secrets = new MemoryTotpSecrets();
  const box = aesSecretBox('test-only-key');
  let now = new Date(1111111111 * 1000);
  const factor = createTotpFactor({
    secrets,
    box,
    clock: { now: () => now },
    ids: { next: () => crypto.randomUUID() },
    totp: { ...totpAlgorithm, secret: () => secret },
    site: async () => ({ title: ':A & B:' }),
  });
  const begin = await factor.enroll!.begin(user);
  expect(begin.kind).toBe('fields');
  expect(begin.display).toEqual([
    { kind: 'code', text: secret },
    {
      kind: 'qr',
      value: `otpauth://totp/A%20%26%20B:alice%2Bcms%40example.com?secret=${secret}&issuer=A%20%26%20B&algorithm=SHA1&digits=6&period=30`,
    },
  ]);
  expect(JSON.stringify(begin.state)).not.toContain(secret);
  const pending = begin.state as { userId: string; sealed: string };
  expect(box.open(pending.sealed)).toBe(secret);
  for (const state of [
    { userId: user.id, secret },
    { userId: user.id, sealed: 'invalid' },
    { userId: user.id, sealed: box.seal('not-base32') },
  ])
    expect(await factor.enroll!.finish(user, step(state, '050471'))).toBe(
      false,
    );
  expect(await secrets.find(user.id)).toBeNull();
  expect(await factor.enroll!.finish(user, step(begin.state, 'invalid'))).toBe(
    false,
  );
  expect(
    await factor.enroll!.finish(
      { ...user, id: 'other' },
      step(begin.state, '050471'),
    ),
  ).toBe(false);
  expect(await secrets.find(user.id)).toBeNull();
  expect(await factor.enroll!.finish(user, step(begin.state, '050471'))).toBe(
    true,
  );
  const record = (await secrets.find(user.id))!;
  await expect(Promise.resolve(factor.enroll!.begin(user))).rejects.toThrow(
    Errors.InvalidCredentials,
  );
  expect(record.sealedSecret).not.toContain(secret);
  expect(box.open(record.sealedSecret)).toBe(secret);
  expect(record.lastStep).toBe(Math.floor(now.getTime() / 30000));
  expect(await factor.verify(user, step(null, '050471'))).toBe(false);
  expect(await factor.enroll!.finish(user, step(begin.state, '050471'))).toBe(
    false,
  );
  expect(await factor.enrolled(user)).toBe(true);
  expect(await factor.credentials!(user)).toEqual([
    { id: record.id, label: 'Authenticator app', createdAt: now.toISOString() },
  ]);
  now = new Date(now.getTime() + 30000);
  const next = totpCode(key, Math.floor(now.getTime() / 30000));
  expect(
    (
      await Promise.all([
        factor.verify(user, step(null, next)),
        factor.verify(user, step(null, next)),
      ])
    ).sort(),
  ).toEqual([false, true]);
  expect(await factor.verify(user, step(null, '081804'))).toBe(false);
  expect((await factor.challenge(user)).display).toBeUndefined();
  await factor.remove!({ ...user, id: 'other' }, record.id);
  expect(await factor.enrolled(user)).toBe(true);
  await factor.remove!(user, record.id);
  expect(await factor.enrolled(user)).toBe(false);
});

test('production secret generation has 160 bits and unreadable sealed secrets fail closed', async () => {
  const first = totpAlgorithm.secret();
  expect(first).toMatch(/^[A-Z2-7]{32}$/);
  expect(totpAlgorithm.secret()).not.toBe(first);
  const secrets = new MemoryTotpSecrets();
  await secrets.insert({
    id: 'key',
    userId: user.id,
    sealedSecret: aesSecretBox('old-key').seal(secret),
    lastStep: -1,
    createdAt: new Date(),
  });
  const factor = createTotpFactor({
    secrets,
    box: aesSecretBox('new-key'),
    clock: { now: () => new Date(59000) },
    ids: { next: () => 'unused' },
    totp: totpAlgorithm,
    site: async () => ({ title: 'CMS' }),
  });
  expect(await factor.verify(user, step(null, '287082'))).toBe(false);
  expect((await secrets.find(user.id))!.lastStep).toBe(-1);
});
