import { describe, expect, test } from 'bun:test';
import { AuthService } from '#api/domain/auth/auth-service';
import { SsoService } from '#api/domain/auth/sso-service';
import type {
  OidcChecks,
  OidcProvider,
  VerifiedOidcIdentity,
} from '#api/domain/auth/sso-ports';
import { unauthorized } from '#api/shared/errors';
import { aesSecretBox } from '#api/infra/secret-box';
import {
  fixedClock,
  profile,
  sequentialIds,
  userRecord,
} from '#test/support/memory';
import {
  MemorySsoTransactions,
  MemorySsoAccessTransactions,
  MemoryUsers,
  createMemoryAuthStore,
  plainHasher,
} from '#test/support/sso-memory';

const ISSUER = 'https://id.example.com';
const TTL = 10 * 60 * 1000;
const CLIENT = 'ip:203.0.113.5';

/** Single-provider cases select this fixture's default provider. */
class FixtureSso extends SsoService {
  override start(
    input: object,
    user: Parameters<SsoService['start']>[1],
    client: string,
  ) {
    return super.start({ provider: 'default', ...input }, user, client);
  }
}

/** Accepts `?code=<subject>&state=<state>` and asserts the stored checks reach the provider. */
class FakeProvider implements OidcProvider {
  issued = 0;

  async verifyLogout() {
    return null;
  }

  async endSession() {
    return null;
  }

  async authorize() {
    this.issued++;

    return {
      url: `${ISSUER}/authorize?state=state-${this.issued}`,
      state: `state-${this.issued}`,
      nonce: `nonce-${this.issued}`,
      codeVerifier: `verifier-${this.issued}`,
    };
  }

  async verify(
    query: string,
    checks: OidcChecks,
  ): Promise<VerifiedOidcIdentity> {
    const params = new URLSearchParams(query);

    if (params.get('state') !== checks.state || !params.get('code'))
      throw unauthorized('Single sign-on failed. Please try again.');

    return {
      issuer: ISSUER,
      subject: params.get('code')!,
      clientId: 'cms',
      idToken: 'verified-id-token',
    };
  }
}

let tokenCounter = 0;
const tokens = {
  issue: () => `token-${++tokenCounter}`,
  digest: (token: string) => `digest:${token}`,
};

const fixture = async () => {
  const clock = fixedClock();
  const secrets = aesSecretBox('sso-service-test-key');
  const users = new MemoryUsers();
  const { sessions, identities } = createMemoryAuthStore(users);
  const provider = new FakeProvider();
  let identityCounter = 0;

  const auth = new AuthService({
    users,
    sessions,
    hasher: plainHasher,
    tokens,
    ids: sequentialIds(),
    clock,
    sessionTtlMs: 60_000,
  });

  const sso = new FixtureSso({
    secrets,
    policy: async () => ({ otherMethod: true, providers: [] }),
    access: new MemorySsoAccessTransactions({
      settings: {
        get: async () => undefined,
        set: async () => {},
        list: async () => ({}),
      },
      identities,
    }),
    setup: async () => ({
      providers: [
        {
          id: 'default',
          issuer: ISSUER,
          provider,
          name: 'Company SSO',
          subjects: new Map<string, string>(),
        },
      ],
    }),
    users,
    identities,
    transactions: new MemorySsoTransactions(),
    sessions: auth,
    tokens,
    ids: { next: () => `identity-${++identityCounter}` },
    clock,
    transactionTtlMs: TTL,
    admission: { total: 100, perClient: 100 },
    startLimiter: { tryAcquire: () => true },
  });

  const admin = (
    await auth.setup({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'long-password',
    })
  ).user;

  const other = profile({ id: 'other', name: 'Other' });

  await users.insert(userRecord({ ...other, createdAt: clock.now() }));

  /** Signs in through single sign-on as whoever `subject` resolves to. */
  const signIn = async (subject: string, client = CLIENT) => {
    const start = await sso.start({}, null, client);

    return sso.complete(
      callback(start.transaction, `state-${provider.issued}`, subject),
      null,
    );
  };

  return { identities, sso, admin, other, signIn, sessions, secrets, clock };
};

const callback = (transaction: string, state: string, subject: string) => ({
  transaction,
  query: `?code=${encodeURIComponent(subject)}&state=${state}`,
});

describe('SsoService', () => {
  test('login and claim sessions store only sealed OIDC logout material', async () => {
    for (const intent of ['login', 'claim'] as const) {
      const { sso, identities, admin, sessions, secrets, clock } =
        await fixture();

      if (intent === 'claim')
        await identities.tokens.insert({
          tokenHash: tokens.digest('claim-proof'),
          userId: admin.id,
          purpose: 'invite',
          expiresAt: new Date(clock.now().getTime() + TTL),
        });
      else
        await identities.link({
          id: 'linked-identity',
          userId: admin.id,
          issuer: ISSUER,
          subject: 'subject',
          createdAt: clock.now(),
        });
      const start = await sso.start(
        { intent, ...(intent === 'claim' ? { token: 'claim-proof' } : {}) },
        null,
        CLIENT,
      );
      const result = await sso.complete(
        callback(start.transaction, 'state-1', 'subject'),
        null,
      );

      if (result.kind !== 'session') throw new Error('Expected session');
      const stored = sessions.rows.get(tokens.digest(result.session.token))!;

      expect(JSON.stringify(stored)).not.toContain('verified-id-token');
      expect(JSON.stringify(result)).not.toContain('verified-id-token');
      expect(stored.oidc?.logout?.providerId).toBe('default');
      expect(stored.oidc?.logout?.clientId).toBe('cms');
      expect(secrets.open(stored.oidc?.logout?.sealedIdToken ?? '')).toBe(
        'verified-id-token',
      );
    }
  });

  test('never links by email: an unlinked subject is rejected even if it claims an admin email', async () => {
    const { signIn } = await fixture();

    await expect(signIn('admin@example.com')).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  test('linking requires the same signed-in user from start to callback', async () => {
    const { sso, admin, other, identities, signIn } = await fixture();

    await expect(
      sso.start({ intent: 'link' }, null, CLIENT),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    const hijacked = await sso.start({ intent: 'link' }, admin, CLIENT);

    await expect(
      sso.complete(callback(hijacked.transaction, 'state-1', 'sub-x'), other),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    const signedOut = await sso.start({ intent: 'link' }, admin, CLIENT);

    await expect(
      sso.complete(callback(signedOut.transaction, 'state-2', 'sub-x'), null),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(identities.rows.size).toBe(0);

    const link = await sso.start({ intent: 'link' }, admin, CLIENT);

    expect(
      await sso.complete(callback(link.transaction, 'state-3', 'sub-x'), admin),
    ).toEqual({ kind: 'linked' });

    expect(await signIn('sub-x')).toMatchObject({
      session: { user: { id: admin.id } },
    });
  });
});
