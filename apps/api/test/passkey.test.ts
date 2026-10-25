import { describe, expect, test } from 'bun:test';
import { signInStepSchema } from '@cms/sdk';
import { signInOutcomeSchema } from '#api/plugin-runtime/sign-in-outcome';
import type { UserProfile } from '@cms/sdk';
import type { SignInContinuation } from '@cms/sdk/plugin';
import {
  createPasskeyFactor,
  createPasskeyMethod,
} from '#api/domain/auth/passkey/passkey';
import { simpleWebAuthn } from '#api/infra/passkey-webauthn';
import type { WebAuthn } from '#api/domain/auth/passkey/ports';
import { MemoryPasskeys } from '#test/support/memory-passkey';
import {
  assertion,
  assertionChallenge,
  assertionPublicKey,
  registration,
  registrationChallenge,
  registrationOrigin,
  unverifiedAssertion,
  unverifiedPublicKey,
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
const harness = (
  siteUrl = 'http://localhost:8000',
  overrides: Partial<WebAuthn> = {},
) => {
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
      generateRegistrationOptions: (
        options: Parameters<
          typeof simpleWebAuthn.generateRegistrationOptions
        >[0],
      ) =>
        simpleWebAuthn.generateRegistrationOptions({
          ...options,
          challenge: Buffer.from(registrationChallenge, 'base64url'),
        }),
      ...overrides,
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
const saved = (credential = assertion, publicKey = assertionPublicKey) => ({
  id: '33333333-3333-4333-8333-333333333333',
  userId: user.id,
  credentialId: Buffer.from(credential.id, 'base64url'),
  publicKey: Buffer.from(publicKey, 'base64url'),
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
  test('real WebAuthn generators produce JSON-safe sign-in, setup and enrollment steps', async () => {
    const h = harness(registrationOrigin);
    for (const outcome of [
      await h.method.begin(request),
      await h.method.setup!.begin(user, request),
      await h.factor.challenge(user),
      await h.factor.enroll!.begin(user),
    ]) {
      const parsed = signInOutcomeSchema.parse(outcome);
      if (parsed.kind !== 'webauthn') throw new Error('Expected WebAuthn');
      expect(
        signInStepSchema.safeParse({
          kind: parsed.kind,
          ceremony: parsed.ceremony,
          options: parsed.options,
          display: parsed.display ?? [],
          transaction: 'handle',
        }).success,
      ).toBe(true);
    }
  });
  test('large credential lists are capped for registration and factor assertions', async () => {
    const h = harness(registrationOrigin);
    for (let index = 0; index < 40; index++) {
      const id = new Uint8Array(1024);
      id[0] = index;
      await h.passkeys.insert({
        ...saved(),
        id: `key-${index}`,
        credentialId: id,
      });
    }
    const registration = await h.factor.enroll!.begin(user);
    const assertion = await h.factor.challenge(user);
    if (registration.kind !== 'webauthn' || assertion.kind !== 'webauthn')
      throw new Error('Expected WebAuthn');
    expect(registration.options.excludeCredentials).toHaveLength(16);
    expect(assertion.options.allowCredentials).toHaveLength(16);
    expect(
      new TextEncoder().encode(JSON.stringify(registration)).byteLength,
    ).toBeLessThan(32 * 1024);
    expect(
      new TextEncoder().encode(JSON.stringify(assertion)).byteLength,
    ).toBeLessThan(32 * 1024);
  });
  test('registration persists only after verification and excludes existing credentials', async () => {
    const h = harness(registrationOrigin);
    const begin = await h.method.setup!.begin(user, request);
    expect(begin.kind).toBe('webauthn');
    if (begin.kind !== 'webauthn') throw new Error('missing ceremony');
    expect(begin.options.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    });
    expect(await h.passkeys.list(user.id)).toEqual([]);
    const outcome = await h.method.setup!.continue!(
      user,
      continuation(begin.state, registration),
    );
    expect(outcome).toMatchObject({ kind: 'user', userId: user.id });
    expect(await h.passkeys.list(user.id)).toEqual([]);
    if (!('commitSetup' in outcome) || !outcome.commitSetup)
      throw new Error('Missing commit');
    h.passkeys.tokens.set('proof', {
      userId: user.id,
      expiresAt: new Date(now.getTime() + 60000),
    });
    expect(await outcome.commitSetup('proof', now)).toBe(true);
    expect(await h.method.usableBy(user)).toBe(true);
    expect(await h.factor.enrolled(user)).toBe(true);
    const next = await h.factor.enroll!.begin(user);
    if (next.kind !== 'webauthn') throw new Error('missing ceremony');
    expect(next.options.excludeCredentials).toEqual([
      { id: registration.id, type: 'public-key', transports: [] },
    ]);
    expect(
      await h.factor.enroll!.finish(
        user,
        continuation(next.state, registration),
      ),
    ).toBe(false);
    expect(
      await h.factor.enroll!.finish(
        other,
        continuation(next.state, registration),
      ),
    ).toBe(false);
    expect(await h.factor.credentials!(user)).toEqual([
      {
        id: (await h.passkeys.list(user.id))[0]!.id,
        label: 'Passkey',
        createdAt: now.toISOString(),
      },
    ]);
  });

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

  test('a cryptographically valid assertion without UV is refused', async () => {
    const h = harness(registrationOrigin);
    await h.passkeys.insert(saved(unverifiedAssertion, unverifiedPublicKey));
    const challenge = Buffer.from('totallyUniqueValueEveryTime').toString(
      'base64url',
    );
    // Establish that the recorded signature is valid independently of our required-UV policy.
    const options = {
      response: unverifiedAssertion,
      expectedChallenge: challenge,
      expectedOrigin: registrationOrigin,
      expectedRPID: 'dev.dontneeda.pw',
      credential: {
        id: unverifiedAssertion.id,
        publicKey: Buffer.from(unverifiedPublicKey, 'base64url'),
        counter: 0,
      },
    };
    expect(
      (
        await simpleWebAuthn.verifyAuthenticationResponse({
          ...options,
          requireUserVerification: false,
        })
      ).verified,
    ).toBe(true);
    expect(
      await h.method.continue!(
        continuation(
          {
            ceremony: 'get',
            challenge,
            origin: registrationOrigin,
            rpId: 'dev.dontneeda.pw',
            userId: null,
          },
          {
            ...unverifiedAssertion,
            response: {
              ...unverifiedAssertion.response,
              userHandle: Buffer.from(user.id).toString('base64url'),
            },
          },
        ),
      ),
    ).toEqual({ kind: 'failed' });
  });

  test.each(['origin', 'rpId', 'challenge'] as const)(
    'registration rejects %s mismatch without storing a key',
    async (failure) => {
      const h = harness(registrationOrigin);
      const begin = await h.factor.enroll!.begin(user);
      const state = { ...(begin.state as Record<string, unknown>) };
      if (failure === 'challenge') state.challenge = 'wrong';
      if (failure === 'origin') {
        h.setUrl('https://dev.dontneeda.pw:8443');
        state.origin = 'https://dev.dontneeda.pw:8443';
      }
      if (failure === 'rpId') {
        h.setUrl('https://example.com');
        state.origin = 'https://example.com';
        state.rpId = 'example.com';
      }
      expect(
        await h.factor.enroll!.finish(user, continuation(state, registration)),
      ).toBe(false);
      expect(await h.passkeys.list(user.id)).toEqual([]);
    },
  );

  test('empty site URL is not ready; malformed responses and changed configuration fail closed', async () => {
    const h = harness('');
    expect(await h.method.ready!()).toBe(false);
    expect(await h.method.begin(request)).toEqual({ kind: 'failed' });
    expect(await h.method.continue!(continuation(null, {}))).toEqual({
      kind: 'failed',
    });
    h.setUrl('http://localhost:8000');
    const begin = await h.method.begin(request);
    if (begin.kind !== 'webauthn') throw new Error('missing ceremony');
    await h.passkeys.insert(saved());
    h.setUrl('https://example.com');
    expect(
      await h.method.continue!(continuation(begin.state, signed())),
    ).toEqual({ kind: 'failed' });
  });

  test.each([undefined, false, true])(
    'only proven resident keys count as primary credentials (rk=%s)',
    async (rk) => {
      const h = harness(registrationOrigin);
      const begin = await h.factor.enroll!.begin(user);
      if (begin.kind !== 'webauthn') throw new Error('missing ceremony');
      expect(begin.options.authenticatorSelection).toMatchObject({
        residentKey: 'preferred',
      });
      expect(begin.options.extensions).toMatchObject({ credProps: true });
      const credential = {
        ...registration,
        clientExtensionResults: rk === undefined ? {} : { credProps: { rk } },
      };
      expect(
        await h.factor.enroll!.finish(
          user,
          continuation(begin.state, credential),
        ),
      ).toBe(true);
      expect((await h.passkeys.list(user.id))[0]!.discoverable).toBe(
        rk === true,
      );
      expect(await h.method.usableBy(user)).toBe(rk === true);
      expect(await h.factor.enrolled(user)).toBe(true);
    },
  );

  test('primary setup rejects an explicitly non-resident credential', async () => {
    const h = harness(registrationOrigin);
    const begin = await h.method.setup!.begin(user, request);
    if (begin.kind !== 'webauthn') throw new Error('missing ceremony');
    expect(
      await h.method.setup!.continue!(
        user,
        continuation(begin.state, {
          ...registration,
          clientExtensionResults: { credProps: { rk: false } },
        }),
      ),
    ).toEqual({ kind: 'failed' });
    expect(await h.passkeys.list(user.id)).toEqual([]);
  });

  test('primary assertions reject non-discoverable credentials, while bound factors still accept them', async () => {
    const h = harness();
    await h.passkeys.insert({ ...saved(), discoverable: false });
    const primary = await h.method.begin(request);
    if (primary.kind !== 'webauthn') throw new Error('Missing ceremony');
    expect(
      await h.method.continue!(continuation(primary.state, signed())),
    ).toEqual({ kind: 'failed' });
    const factor = await h.factor.challenge(user);
    expect(
      await h.factor.verify(user, continuation(factor.state, signed())),
    ).toBe(true);
  });

  test('competing setup outcomes persist exactly one credential and revoke sibling proofs', async () => {
    let serial = 0;
    const h = harness(registrationOrigin, {
      verifyRegistrationResponse: async (options) => {
        const result = await simpleWebAuthn.verifyRegistrationResponse(options);
        if (!result.verified) return result;
        return {
          ...result,
          registrationInfo: {
            ...result.registrationInfo,
            credential: {
              ...result.registrationInfo.credential,
              id: Buffer.from(`key-${++serial}`).toString('base64url'),
            },
          },
        };
      },
    });
    for (const hash of ['proof', 'sibling'])
      h.passkeys.tokens.set(hash, {
        userId: user.id,
        expiresAt: new Date(now.getTime() + 60000),
      });
    const outcomes = await Promise.all(
      [0, 1].map(async () => {
        const begin = await h.method.setup!.begin(user, request);
        if (begin.kind !== 'webauthn') throw new Error('Missing ceremony');
        return h.method.setup!.continue!(
          user,
          continuation(begin.state, registration),
        );
      }),
    );
    expect(await h.passkeys.list(user.id)).toEqual([]);
    const results = await Promise.all(
      outcomes.map((outcome) => {
        if (!('commitSetup' in outcome) || !outcome.commitSetup)
          throw new Error('Missing commit');
        return outcome.commitSetup('proof', now);
      }),
    );
    expect(results.sort()).toEqual([false, true]);
    expect(await h.passkeys.list(user.id)).toHaveLength(1);
    expect(h.passkeys.tokens.size).toBe(0);
  });

  test.each([
    'https://127.0.0.1',
    'https://2130706433',
    'https://[::1]',
    'https://[2001:db8::1]',
  ])('IP site URL is not ready: %s', async (url) => {
    const h = harness(url);
    expect(await h.method.ready!()).toBe(false);
    expect(await h.method.begin(request)).toEqual({ kind: 'failed' });
  });

  test.each([1023, 1024])(
    'registration limits credential IDs to 1023 bytes (%s)',
    async (size) => {
      const id = Buffer.alloc(size, 1).toString('base64url');
      const h = harness(registrationOrigin, {
        verifyRegistrationResponse: async (options) => {
          const result =
            await simpleWebAuthn.verifyRegistrationResponse(options);
          if (!result.verified)
            throw new Error('invalid recorded registration');
          return {
            ...result,
            registrationInfo: {
              ...result.registrationInfo,
              credential: { ...result.registrationInfo.credential, id },
            },
          };
        },
      });
      const begin = await h.factor.enroll!.begin(user);
      expect(
        await h.factor.enroll!.finish(
          user,
          continuation(begin.state, registration),
        ),
      ).toBe(size === 1023);
      expect((await h.passkeys.list(user.id)).length).toBe(
        size === 1023 ? 1 : 0,
      );
    },
  );

  test('oversized browser credential IDs are rejected before registration', async () => {
    const h = harness(registrationOrigin);
    const begin = await h.factor.enroll!.begin(user);
    const id = Buffer.alloc(1024, 1).toString('base64url');
    expect(
      await h.factor.enroll!.finish(
        user,
        continuation(begin.state, {
          ...registration,
          id,
          rawId: id,
        }),
      ),
    ).toBe(false);
    expect(await h.passkeys.list(user.id)).toEqual([]);
  });

  test('cross-origin client data is refused for registration and authentication', async () => {
    const crossOrigin = (clientDataJSON: string) =>
      Buffer.from(
        JSON.stringify({
          ...JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString()),
          crossOrigin: true,
        }),
      ).toString('base64url');
    const h = harness(registrationOrigin);
    const begin = await h.factor.enroll!.begin(user);
    expect(
      await h.factor.enroll!.finish(
        user,
        continuation(begin.state, {
          ...registration,
          response: {
            ...registration.response,
            clientDataJSON: crossOrigin(registration.response.clientDataJSON),
          },
        }),
      ),
    ).toBe(false);
    expect(await h.passkeys.list(user.id)).toEqual([]);
    // The port returns a valid verification for this fixture; the domain must independently
    // refuse an embedding context, even if a cryptographic adapter accepts it.
    const auth = harness('http://localhost:8000', {
      verifyAuthenticationResponse: (options) =>
        simpleWebAuthn.verifyAuthenticationResponse({
          ...options,
          response: signed(),
        }),
    });
    await auth.passkeys.insert(saved());
    const challenge = await auth.method.begin(request);
    if (challenge.kind !== 'webauthn') throw new Error('missing ceremony');
    expect(
      await auth.method.continue!(
        continuation(challenge.state, {
          ...signed(),
          response: {
            ...signed().response,
            clientDataJSON: crossOrigin(assertion.response.clientDataJSON),
          },
        }),
      ),
    ).toEqual({ kind: 'failed' });
    expect((await auth.passkeys.list(user.id))[0]!.counter).toBe(0);
  });
});
