import { describe, expect, test } from 'bun:test';
import type { UserProfile } from '@cms/sdk';
import type { SignInContinuation } from '@cms/sdk/plugin';
import {
  createPasskeyFactor,
  createPasskeyMethod,
} from '#api/domain/auth/passkey/passkey';
import { simpleWebAuthn } from '#api/infra/passkey-webauthn';
import { MemoryPasskeys } from '#test/support/memory-passkey';
import {
  assertion,
  assertionChallenge,
  assertionPublicKey,
} from '#test/support/passkey-fixtures';

const user: UserProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Alice',
  email: 'alice@example.com',
  role: 'administrator',
  slug: 'alice',
  bio: '',
  locale: 'en',
};
const other = { ...user, id: '22222222-2222-4222-8222-222222222222' };
const request = { values: {}, option: null, address: null, callbackUrl: '' };
const continuation = (
  state: unknown,
  credential: Record<string, unknown>,
): SignInContinuation => ({
  state,
  credential,
  values: {},
  query: null,
  address: null,
});
const now = new Date('2026-01-01');
const harness = (siteUrl = 'http://localhost:8000') => {
  const passkeys = new MemoryPasskeys();
  let url = siteUrl;
  const deps = {
    passkeys,
    ids: { next: () => crypto.randomUUID() },
    clock: { now: () => now },
    site: async () => ({ siteUrl: url, title: 'Example' }),
    webauthn: {
      ...simpleWebAuthn,
      // Only fix generated challenges to those captured in the recorded fixtures.
      generateAuthenticationOptions: (
        options: Parameters<
          typeof simpleWebAuthn.generateAuthenticationOptions
        >[0],
      ) =>
        simpleWebAuthn.generateAuthenticationOptions({
          ...options,
          challenge: Buffer.from(assertionChallenge, 'base64url'),
        }),
    },
  };
  return {
    passkeys,
    method: createPasskeyMethod(deps),
    factor: createPasskeyFactor(deps),
    setUrl: (value: string) => {
      url = value;
    },
  };
};
const saved = () => ({
  id: '33333333-3333-4333-8333-333333333333',
  userId: user.id,
  credentialId: Buffer.from(assertion.id, 'base64url'),
  publicKey: Buffer.from(assertionPublicKey, 'base64url'),
  counter: 0,
  transports: ['internal'],
  deviceType: 'singleDevice',
  backedUp: false,
  discoverable: true,
  name: 'Laptop',
  createdAt: now,
  lastUsedAt: null,
});
const signed = () => ({
  ...assertion,
  response: {
    ...assertion.response,
    userHandle: Buffer.from(user.id).toString('base64url'),
  },
});

describe('passkey ceremonies using recorded SimpleWebAuthn fixtures', () => {
  test('usernameless authentication verifies UV/signature, advances counter and rejects replay', async () => {
    const h = harness();
    await h.passkeys.insert(saved());
    const begin = await h.method.begin(request);
    if (begin.kind !== 'webauthn') throw new Error('missing ceremony');
    expect(begin.options.allowCredentials).toEqual([]);
    expect(begin.options.userVerification).toBe('required');
    expect(JSON.stringify(begin.state).length).toBeLessThan(8192);
    const step = continuation(begin.state, signed());
    expect(await h.method.continue!(step)).toEqual({
      kind: 'user',
      userId: user.id,
    });
    const record = (await h.passkeys.list(user.id))[0]!;
    expect(record.counter).toBeGreaterThan(0);
    expect(record.lastUsedAt).toEqual(now);
    expect(await h.method.continue!(step)).toEqual({ kind: 'failed' });
  });

  test('second factor is owner scoped, lists allowed keys and removes only its own', async () => {
    const h = harness();
    const record = saved();
    await h.passkeys.insert(record);
    const begin = await h.factor.challenge(user);
    if (begin.kind !== 'webauthn') throw new Error('missing ceremony');
    expect(begin.options.allowCredentials).toEqual([
      { id: assertion.id, type: 'public-key', transports: ['internal'] },
    ]);
    expect(
      await h.factor.verify(other, continuation(begin.state, signed())),
    ).toBe(false);
    expect(
      await h.factor.verify(user, continuation(begin.state, signed())),
    ).toBe(true);
    await h.factor.remove!(other, record.id);
    expect(await h.factor.enrolled(user)).toBe(true);
    await h.factor.remove!(user, record.id);
    expect(await h.factor.enrolled(user)).toBe(false);
  });

  test.each([
    'origin',
    'rpId',
    'challenge',
    'counter',
    'unknown',
    'handle',
    'signature',
    'deviceType',
  ] as const)('uniform authentication failure: %s', async (failure) => {
    const h = harness();
    const record = saved();
    if (failure === 'counter') record.counter = 0xffffffff;
    if (failure === 'deviceType') record.deviceType = 'multiDevice';
    if (failure !== 'unknown') await h.passkeys.insert(record);
    const begin = await h.method.begin(request);
    if (begin.kind !== 'webauthn') throw new Error('missing ceremony');
    const state = { ...(begin.state as Record<string, unknown>) };
    const credential = signed();
    if (failure === 'origin') {
      h.setUrl('http://localhost:9000');
      state.origin = 'http://localhost:9000';
    }
    if (failure === 'rpId') {
      h.setUrl('https://example.com');
      state.origin = 'https://example.com';
      state.rpId = 'example.com';
    }
    if (failure === 'challenge') state.challenge = 'wrong';
    if (failure === 'handle')
      credential.response.userHandle = Buffer.from(other.id).toString(
        'base64url',
      );
    if (failure === 'signature') credential.response.signature = 'AAAA';
    expect(await h.method.continue!(continuation(state, credential))).toEqual({
      kind: 'failed',
    });
    expect((await h.passkeys.list(user.id))[0]?.lastUsedAt ?? null).toBeNull();
  });
});
