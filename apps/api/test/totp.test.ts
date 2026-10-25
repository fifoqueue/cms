import { expect, test } from 'bun:test';
import type { UserProfile } from '@cms/sdk';
import type { SignInContinuation } from '@cms/sdk/plugin';
import { createTotpFactor } from '#api/domain/auth/totp/totp';
import { base32, totpAlgorithm, totpCode } from '#api/infra/totp-crypto';
import { aesSecretBox } from '#api/infra/secret-box';
import { MemoryTotpSecrets } from '#test/support/memory-totp';
import { resealTotpSecrets } from '#api/domain/auth/totp/maintenance';
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

test('window accepts exactly ±1 step, preserves leading zeros, and rejects malformed input', () => {
  const at = new Date(1111111111 * 1000);
  const current = Math.floor(at.getTime() / 30000);
  for (const offset of [-2, -1, 0, 1, 2]) {
    expect(
      totpAlgorithm.match(secret, totpCode(key, current + offset), at),
    ).toBe(Math.abs(offset) <= 1 ? current + offset : null);
  }
  for (const code of [
    '05047',
    '0050471',
    ' 050471',
    '050471 ',
    '０５０４７１',
    'abcdef',
  ]) {
    expect(totpAlgorithm.match(secret, code, at)).toBeNull();
  }
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

test('successful verification atomically rotates ciphertext; failures and replays never overwrite it', async () => {
  const secrets = new MemoryTotpSecrets();
  const old = aesSecretBox('old-key');
  const current = aesSecretBox('current-key');
  const rotating = aesSecretBox('current-key', 'old-key');
  const sealedSecret = old.seal(secret);
  await secrets.insert({
    id: 'key',
    userId: user.id,
    sealedSecret,
    lastStep: -1,
    createdAt: new Date(),
  });
  const factor = createTotpFactor({
    secrets,
    box: rotating,
    clock: { now: () => new Date(59000) },
    ids: { next: () => 'unused' },
    totp: totpAlgorithm,
    site: async () => ({ title: 'CMS' }),
  });
  expect(await factor.verify(user, step(null, 'invalid'))).toBe(false);
  expect((await secrets.find(user.id))!.sealedSecret).toBe(sealedSecret);
  expect(await factor.verify(user, step(null, '287082'))).toBe(true);
  const rotated = (await secrets.find(user.id))!;
  expect(rotated.lastStep).toBe(1);
  expect(current.open(rotated.sealedSecret)).toBe(secret);
  expect(old.open(rotated.sealedSecret)).toBeNull();
  expect(await factor.verify(user, step(null, '287082'))).toBe(false);
  expect((await secrets.find(user.id))!.sealedSecret).toBe(
    rotated.sealedSecret,
  );
});

test('maintenance rotates every page, preserves unreadable secrets and replay counters', async () => {
  const secrets = new MemoryTotpSecrets();
  const old = aesSecretBox('old-key');
  const current = aesSecretBox('current-key');
  const rotating = aesSecretBox('current-key', 'old-key');
  for (let index = 0; index < 205; index++) {
    const id = index.toString().padStart(4, '0');
    await secrets.insert({
      id,
      userId: id,
      sealedSecret: old.seal(secret),
      lastStep: index,
      createdAt: new Date(),
    });
  }
  await secrets.insert({
    id: 'unreadable',
    userId: 'unreadable',
    sealedSecret: 'preserve-me',
    lastStep: 20,
    createdAt: new Date(),
  });
  await secrets.insert({
    id: 'malformed',
    userId: 'malformed',
    sealedSecret: old.seal('invalid-secret'),
    lastStep: 30,
    createdAt: new Date(),
  });
  expect(await resealTotpSecrets({ secrets, box: rotating })).toEqual({
    resealed: 205,
    unreadable: 2,
    skipped: 0,
  });
  for (let index = 0; index < 205; index++) {
    const row = (await secrets.find(index.toString().padStart(4, '0')))!;
    expect(current.open(row.sealedSecret)).toBe(secret);
    expect(row.lastStep).toBe(index);
  }
  expect((await secrets.find('unreadable'))!.sealedSecret).toBe('preserve-me');
  expect(old.open((await secrets.find('malformed'))!.sealedSecret)).toBe(
    'invalid-secret',
  );
});

test('maintenance reports concurrent deletion without recreating a factor', async () => {
  const secrets = new MemoryTotpSecrets();
  const box = aesSecretBox('key');
  await secrets.insert({
    id: 'key',
    userId: user.id,
    sealedSecret: box.seal(secret),
    lastStep: 1,
    createdAt: new Date(),
  });
  const result = await resealTotpSecrets({
    box,
    secrets: {
      scan: (after, limit) => secrets.scan(after, limit),
      reseal: async (id, expected, sealed) => {
        await secrets.remove(user.id, id);
        return secrets.reseal(id, expected, sealed);
      },
    },
  });
  expect(result).toEqual({ resealed: 0, unreadable: 0, skipped: 1 });
  expect(await secrets.find(user.id)).toBeNull();
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
