import { describe, expect, test } from 'bun:test';
import { AuthService } from '#api/domain/auth/auth-service';
import { SsoService } from '#api/domain/auth/sso-service';
import type {
  ExternalIdentityRepository,
  OidcChecks,
  OidcProvider,
  VerifiedIdentity,
} from '#api/domain/auth/sso-ports';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { ClientResolver } from '#api/http/client-identity';
import { MemoryRateLimiter } from '#api/infra/memory-rate-limiter';
import { unauthorized } from '#api/shared/errors';
import {
  fixedClock,
  profile,
  recordingLogger,
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

/** Existing single-provider regression cases all select this fixture's default provider. */
class FixtureSso extends SsoService {
  override start(
    input: object,
    user: Parameters<SsoService['start']>[1],
    client: string,
  ) {
    return super.start({ provider: 'default', ...input }, user, client);
  }
  override async unlink(userId: string, identityId = 'identity-1') {
    return super.unlink(userId, identityId);
  }
}

/**
 * Accepts `?code=<subject>&state=<state>` and asserts the stored checks reach the provider.
 * `next` overrides the identity of the next verification (for values a URL cannot carry).
 */
class FakeProvider implements OidcProvider {
  issued = 0;
  verified: OidcChecks[] = [];
  next: VerifiedIdentity | undefined;

  async authorize() {
    this.issued++;
    return {
      url: `${ISSUER}/authorize?state=state-${this.issued}`,
      state: `state-${this.issued}`,
      nonce: `nonce-${this.issued}`,
      codeVerifier: `verifier-${this.issued}`,
    };
  }

  async verify(query: string, checks: OidcChecks): Promise<VerifiedIdentity> {
    this.verified.push(checks);
    const params = new URLSearchParams(query);
    if (params.get('state') !== checks.state || !params.get('code'))
      throw unauthorized('Single sign-on failed. Please try again.');
    const identity = this.next ?? {
      issuer: ISSUER,
      subject: params.get('code')!,
    };
    this.next = undefined;
    return identity;
  }
}

/** Counts database admissions, to prove refused starts never reach them. */
class CountingTransactions extends MemorySsoTransactions {
  admissions = 0;

  override admit(...args: Parameters<MemorySsoTransactions['admit']>) {
    this.admissions++;
    return super.admit(...args);
  }
}

let tokenCounter = 0;
const tokens = {
  issue: () => `token-${++tokenCounter}`,
  digest: (token: string) => `digest:${token}`,
};

const fixture = async ({
  enabled = true,
  subjects = {} as Record<string, string>,
  total = 100,
  perClient = 100,
  startsPerMinute = 1000,
  startsPerMinutePerClient = 1000,
  wrapIdentities = (
    identities: ExternalIdentityRepository,
  ): ExternalIdentityRepository => identities,
} = {}) => {
  const clock = fixedClock();
  const users = new MemoryUsers();
  const { sessions, identities } = createMemoryAuthStore(users);
  const transactions = new CountingTransactions();
  const startLimiter = new MemoryRateLimiter({
    clock,
    perKey: startsPerMinutePerClient,
    total: startsPerMinute,
    windowMs: 60_000,
  });
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
    policy: async () => ({ otherMethod: true, providers: [] }),
    access: new MemorySsoAccessTransactions({
      settings: {
        get: async () => undefined,
        set: async () => {},
        list: async () => ({}),
      },
      identities: wrapIdentities(identities),
    }),
    setup: async () => ({
      providers: enabled
        ? [
            {
              id: 'default',
              issuer: ISSUER,
              provider,
              name: 'Company SSO',
              subjects: new Map(Object.entries(subjects)),
            },
          ]
        : [],
    }),
    users,
    identities: wrapIdentities(identities),
    transactions,
    sessions: auth,
    tokens,
    ids: { next: () => `identity-${++identityCounter}` },
    clock,
    transactionTtlMs: TTL,
    admission: { total, perClient },
    startLimiter,
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

  /** Links `subject` to `user` through the real link flow. */
  const link = async (user: { id: string }, subject: string) => {
    const start = await sso.start(
      { intent: 'link' },
      admin.id === user.id ? admin : other,
      CLIENT,
    );
    return sso.complete(
      callback(start.transaction, `state-${provider.issued}`, subject),
      admin.id === user.id ? admin : other,
    );
  };

  /** Signs in through single sign-on as whoever `subject` resolves to. */
  const signIn = async (subject: string, client = CLIENT) => {
    const start = await sso.start({}, null, client);
    return sso.complete(
      callback(start.transaction, `state-${provider.issued}`, subject),
      null,
    );
  };

  return {
    clock,
    users,
    sessions,
    identities,
    transactions,
    provider,
    auth,
    sso,
    admin,
    other,
    link,
    signIn,
  };
};

const callback = (transaction: string, state: string, subject: string) => ({
  transaction,
  query: `?code=${encodeURIComponent(subject)}&state=${state}`,
});

const tokenOf = (result: Awaited<ReturnType<SsoService['complete']>>) => {
  if (result.kind !== 'session') throw new Error('expected a session');
  return result.session.token;
};

describe('SsoService', () => {
  test('root trailing-slash spelling binds to the provider while verified issuer bytes remain exact', async () => {
    const f = await fixture();
    f.provider.next = { issuer: `${ISSUER}/`, subject: 'slash' };
    await f.link(f.admin, 'slash');
    expect((await f.identities.findByUser(f.admin.id))[0]!.issuer).toBe(
      `${ISSUER}/`,
    );
    expect((await f.sso.identity(f.admin)).identities[0]!.providers).toEqual([
      'default',
    ]);
    f.provider.next = { issuer: `${ISSUER}/`, subject: 'slash' };
    expect(
      (await f.auth.authenticate(tokenOf(await f.signIn('slash'))))?.id,
    ).toBe(f.admin.id);
  });
  test('reports availability and rejects every flow when not configured', async () => {
    const off = await fixture({ enabled: false });
    expect(await off.sso.info()).toEqual({
      providers: [],
    });
    await expect(off.sso.start({}, null, CLIENT)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      off.sso.complete(callback('t', 's', 'x'), null),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    const on = await fixture();
    expect(await on.sso.info()).toEqual({
      providers: [{ id: 'default', name: 'Company SSO' }],
    });
  });

  test('keeps PKCE verifier, state and nonce on the server and passes them to verification', async () => {
    const { sso, transactions, provider, admin, link } = await fixture();
    await link(admin, 'sub-admin');

    const start = await sso.start({}, null, CLIENT);
    expect(JSON.stringify(start)).not.toContain('verifier');
    expect(JSON.stringify(start)).not.toContain('nonce');
    expect(transactions.rows.has(`digest:${start.transaction}`)).toBe(true);

    const result = await sso.complete(
      callback(start.transaction, 'state-2', 'sub-admin'),
      null,
    );
    expect(result).toMatchObject({
      kind: 'session',
      session: { user: { id: admin.id } },
    });
    expect(provider.verified.at(-1)).toEqual(
      expect.objectContaining({
        state: 'state-2',
        nonce: 'nonce-2',
        codeVerifier: 'verifier-2',
      }),
    );
  });

  test('never links by email: an unlinked subject is rejected even if it claims an admin email', async () => {
    const { signIn } = await fixture();
    await expect(signIn('admin@example.com')).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  test('operator allowlist maps subjects to existing users only', async () => {
    const { signIn, admin } = await fixture({
      subjects: {
        'sub-allowed': 'admin@example.com',
        'sub-ghost': 'missing@example.com',
      },
    });

    expect(await signIn('sub-allowed')).toMatchObject({
      kind: 'session',
      session: { user: { id: admin.id } },
    });
    await expect(signIn('sub-ghost')).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  test('transactions are single use, expire, and reject unknown handles and state mismatches', async () => {
    const { sso, admin, clock, link } = await fixture();
    await link(admin, 'sub-admin');

    await expect(
      sso.complete(callback('forged', 'state-1', 'sub-admin'), null),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    const start = await sso.start({}, null, CLIENT);
    await expect(
      sso.complete(
        callback(start.transaction, 'wrong-state', 'sub-admin'),
        null,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    // The failed attempt consumed the transaction: replaying the right state fails too.
    await expect(
      sso.complete(callback(start.transaction, 'state-2', 'sub-admin'), null),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    const replay = await sso.start({}, null, CLIENT);
    await sso.complete(
      callback(replay.transaction, 'state-3', 'sub-admin'),
      null,
    );
    await expect(
      sso.complete(callback(replay.transaction, 'state-3', 'sub-admin'), null),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    const late = await sso.start({}, null, CLIENT);
    clock.set(new Date(clock.now().getTime() + TTL).toISOString());
    await expect(
      sso.complete(callback(late.transaction, 'state-4', 'sub-admin'), null),
    ).rejects.toMatchObject({ code: 'unauthorized' });
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

  test('an identity belongs to one user and allowlisted subjects cannot be relinked', async () => {
    const { admin, other, link } = await fixture({
      subjects: { 'sub-managed': 'other@example.com' },
    });

    await link(admin, 'sub-x');
    await expect(link(other, 'sub-x')).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(link(admin, 'sub-managed')).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  describe('exact identity matching', () => {
    test('subjects that differ only in case or trailing space are different identities', async () => {
      const { admin, other, link, signIn } = await fixture();

      await link(admin, 'Alice');
      await link(other, 'alice');

      expect(await signIn('Alice')).toMatchObject({
        session: { user: { id: admin.id } },
      });
      expect(await signIn('alice')).toMatchObject({
        session: { user: { id: other.id } },
      });
      await expect(signIn('ALICE')).rejects.toMatchObject({
        code: 'unauthorized',
      });
      await expect(signIn('Alice ')).rejects.toMatchObject({
        code: 'unauthorized',
      });
    });

    test('issuers that differ only in case are different identities', async () => {
      const { admin, link, signIn, provider } = await fixture();
      await link(admin, 'sub-x');

      provider.next = { issuer: ISSUER.toUpperCase(), subject: 'sub-x' };
      await expect(signIn('sub-x')).rejects.toMatchObject({
        code: 'unauthorized',
      });
    });

    test('a store that folds case cannot hand out a stored identity for a different one', async () => {
      const { admin, link, signIn, sessions } = await fixture({
        // Simulates a case-insensitive collation answering the lookup.
        wrapIdentities: (identities) => ({
          find: async (issuer, subject) =>
            (await identities.find(issuer, subject)) ??
            (await identities.find(issuer, 'Alice')),
          findByUser: (userId) => identities.findByUser(userId),
          claimUser: (...args) => identities.claimUser(...args),
          claim: (...args) => identities.claim(...args),
          link: (identity) => identities.link(identity),
          unlink: (userId, id) => identities.unlink(userId, id),
        }),
      });
      await link(admin, 'Alice');

      await expect(signIn('alice')).rejects.toMatchObject({
        code: 'unauthorized',
      });
      expect(sessions.rows.size).toBe(1); // Only the setup session.
    });

    test('identities that cannot be stored byte-exact are refused', async () => {
      const { admin, link, signIn, provider, identities } = await fixture();

      for (const subject of ['\uD800', 'x'.repeat(256), 'é'.repeat(128)]) {
        provider.next = { issuer: ISSUER, subject };
        await expect(link(admin, 'ignored')).rejects.toMatchObject({
          code: 'unauthorized',
        });
        provider.next = { issuer: ISSUER, subject };
        await expect(signIn('ignored')).rejects.toMatchObject({
          code: 'unauthorized',
        });
      }
      expect(identities.rows.size).toBe(0);

      // 255 bytes is the limit, not beyond it.
      provider.next = { issuer: ISSUER, subject: 'x'.repeat(255) };
      expect(await link(admin, 'ignored')).toEqual({ kind: 'linked' });
    });
  });

  describe('session revocation', () => {
    test('unlinking revokes the sessions signed in through the link, not password sessions', async () => {
      const { auth, sso, admin, link, signIn } = await fixture();
      await link(admin, 'sub-x');

      const viaSso = tokenOf(await signIn('sub-x'));
      const viaPassword = (
        await auth.login({
          email: 'admin@example.com',
          password: 'long-password',
        })
      ).token;
      expect(await auth.authenticate(viaSso)).toMatchObject({ id: admin.id });

      await sso.unlink(admin.id);

      expect(await auth.authenticate(viaSso)).toBeNull();
      expect(await auth.authenticate(viaPassword)).toMatchObject({
        id: admin.id,
      });
      await expect(signIn('sub-x')).rejects.toMatchObject({
        code: 'unauthorized',
      });
    });

    test('replacing a link revokes the sessions of the previous one', async () => {
      const { auth, admin, link, signIn } = await fixture();
      await link(admin, 'sub-old');
      const old = tokenOf(await signIn('sub-old'));

      await link(admin, 'sub-new');

      expect(await auth.authenticate(old)).toBeNull();
      expect(
        await auth.authenticate(tokenOf(await signIn('sub-new'))),
      ).toMatchObject({ id: admin.id });
    });

    test('a sign-in racing an unlink never yields a usable session', async () => {
      let unlinkDuringSignIn: () => Promise<void> = async () => undefined;
      const context = await fixture({
        // The unlink lands after the callback found the identity, before the session is stored.
        wrapIdentities: (identities) => ({
          find: async (issuer, subject) => {
            const found = await identities.find(issuer, subject);
            await unlinkDuringSignIn();
            return found;
          },
          findByUser: (userId) => identities.findByUser(userId),
          claimUser: (...args) => identities.claimUser(...args),
          claim: (...args) => identities.claim(...args),
          link: (identity) => identities.link(identity),
          unlink: (userId, id) => identities.unlink(userId, id),
        }),
      });
      const { sso, admin, link, signIn, sessions } = context;
      await link(admin, 'sub-x');
      unlinkDuringSignIn = () => sso.unlink(admin.id);

      await expect(signIn('sub-x')).rejects.toMatchObject({
        code: 'unauthorized',
      });
      expect(
        [...sessions.rows.values()].filter((row) => row.identityId),
      ).toEqual([]);
    });

    test('operator-assigned sign-ins are not bound to a link', async () => {
      const { auth, sso, admin, signIn } = await fixture({
        subjects: { 'sub-allowed': 'admin@example.com' },
      });
      const token = tokenOf(await signIn('sub-allowed'));

      await expect(sso.unlink(admin.id)).rejects.toMatchObject({
        code: 'not_found',
      });

      expect(await auth.authenticate(token)).toMatchObject({ id: admin.id });
    });
  });

  describe('admission', () => {
    test('pending requests are bounded overall; expired and finished ones free capacity', async () => {
      const { sso, transactions, admin, clock, link } = await fixture({
        total: 3,
      });
      await link(admin, 'sub-admin');

      // Concurrent starts from many clients never exceed the bound.
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, index) =>
          sso.start({}, null, `ip:198.51.100.${index}`),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      expect(
        results
          .filter((r) => r.status === 'rejected')
          .map((r) => (r as PromiseRejectedResult).reason.code),
      ).toEqual(['conflict', 'conflict', 'conflict']);
      expect(transactions.rows.size).toBe(3);

      // A finished sign-in frees its slot.
      const first = results[0];
      if (first?.status !== 'fulfilled') throw new Error('expected a start');
      await sso.complete(
        callback(first.value.transaction, 'state-2', 'sub-admin'),
        null,
      );
      await sso.start({}, null, CLIENT);
      await expect(sso.start({}, null, 'ip:192.0.2.1')).rejects.toMatchObject({
        code: 'conflict',
      });

      // Expired requests are purged on the next admission.
      clock.set(new Date(clock.now().getTime() + TTL).toISOString());
      await sso.start({}, null, CLIENT);
      expect(transactions.rows.size).toBe(1);
    });

    test('one client cannot take the capacity others need', async () => {
      const { sso, admin, transactions } = await fixture({
        total: 10,
        perClient: 2,
      });
      const attacker = 'ip:203.0.113.66';

      const flood = await Promise.allSettled(
        Array.from({ length: 8 }, () => sso.start({}, null, attacker)),
      );
      expect(flood.filter((r) => r.status === 'fulfilled')).toHaveLength(2);

      // Other visitors, the shared unproven quota and signed-in links still get through.
      await sso.start({}, null, 'ip:192.0.2.10');
      await sso.start({}, null, 'unverified');
      await sso.start({ intent: 'link' }, admin, attacker);
      await sso.start({ intent: 'link' }, admin, attacker);
      await expect(
        sso.start({ intent: 'link' }, admin, attacker),
      ).rejects.toMatchObject({ code: 'conflict' });
      expect(transactions.rows.size).toBe(6);
    });
  });

  describe('start rate limit', () => {
    const after = (
      clock: { now(): Date; set(iso: string): void },
      ms: number,
    ) => clock.set(new Date(clock.now().getTime() + ms).toISOString());

    test('refused starts reach neither the provider nor the database', async () => {
      const { sso, provider, transactions, admin } = await fixture({
        startsPerMinutePerClient: 2,
      });
      await sso.start({}, null, CLIENT);
      await sso.start({}, null, CLIENT);
      const before = {
        authorized: provider.issued,
        admissions: transactions.admissions,
      };

      for (let attempt = 0; attempt < 50; attempt++)
        await expect(sso.start({}, null, CLIENT)).rejects.toMatchObject({
          code: 'rate_limited',
        });

      expect({
        authorized: provider.issued,
        admissions: transactions.admissions,
      }).toEqual(before);

      // Other visitors, the shared unproven client and signed-in links keep their own rates.
      await sso.start({}, null, 'ip:192.0.2.1');
      await sso.start({}, null, 'unverified');
      await sso.start({ intent: 'link' }, admin, CLIENT);
    });

    test('the rate recovers with time', async () => {
      const { sso, clock } = await fixture({ startsPerMinutePerClient: 2 });
      const start = () => sso.start({}, null, CLIENT);

      await start();
      await start();
      await expect(start()).rejects.toMatchObject({ code: 'rate_limited' });

      after(clock, 30_000); // Half a window refills one attempt.
      await start();
      await expect(start()).rejects.toMatchObject({ code: 'rate_limited' });

      after(clock, 60_000); // A full window refills the whole burst.
      await start();
      await start();
      await expect(start()).rejects.toMatchObject({ code: 'rate_limited' });
    });

    test('the overall rate caps all clients together', async () => {
      const { sso, provider } = await fixture({
        startsPerMinute: 3,
        startsPerMinutePerClient: 2,
      });

      for (const client of ['ip:192.0.2.1', 'ip:192.0.2.2', 'ip:192.0.2.3'])
        await sso.start({}, null, client);
      await expect(sso.start({}, null, 'ip:192.0.2.4')).rejects.toMatchObject({
        code: 'rate_limited',
      });
      expect(provider.issued).toBe(3);
    });
  });

  test('reports the signed-in user’s link and operator assignment', async () => {
    const { sso, admin, other, link } = await fixture({
      subjects: { 'sub-managed': 'other@example.com' },
    });

    expect(await sso.identity(admin)).toEqual({
      identities: [],
      assigned: [],
    });
    expect(await sso.identity(other)).toEqual({
      identities: [],
      assigned: ['default'],
    });

    await link(admin, 'sub-x');
    expect(await sso.identity(admin)).toEqual({
      identities: [
        {
          id: 'identity-1',
          providers: ['default'],
          issuer: ISSUER,
          subject: 'sub-x',
          linkedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      assigned: [],
    });

    await sso.unlink(admin.id);
    expect((await sso.identity(admin)).identities).toEqual([]);
  });

  test('password login keeps working next to single sign-on', async () => {
    const { auth, admin } = await fixture();
    expect(
      (
        await auth.login({
          email: 'admin@example.com',
          password: 'long-password',
        })
      ).user,
    ).toEqual(admin);
    await expect(
      auth.login({ email: 'admin@example.com', password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});

describe('SSO HTTP routes', () => {
  const FRONTEND_SECRET = 's'.repeat(40);

  const setup = async (options: Parameters<typeof fixture>[0] = {}) => {
    const context = await fixture(options);
    // Only the services the SSO routes touch; the others are never reached.
    const app = await createApiApp({
      services: {
        auth: context.auth,
        sso: context.sso,
        clients: new ClientResolver(FRONTEND_SECRET),
      } as ApiServices,
      logger: recordingLogger().logger,
    });
    const call = (
      method: string,
      path: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ) =>
      app.fetch(
        new Request(`http://localhost/api/v1/auth/sso${path}`, {
          method,
          headers: {
            ...(body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
    const session = await context.auth.login({
      email: 'admin@example.com',
      password: 'long-password',
    });
    return {
      ...context,
      call,
      bearer: { authorization: `Bearer ${session.token}` },
    };
  };

  test('account linking remains on SSO routes; sign-in must use the engine', async () => {
    const { call, bearer, auth, signIn, sso } = await setup();

    expect(await (await call('GET', '')).json()).toEqual({
      providers: [{ id: 'default', name: 'Company SSO' }],
    });

    expect(
      (await call('POST', '/start', { provider: 'default', intent: 'link' }))
        .status,
    ).toBe(401);

    const link = await (
      await call(
        'POST',
        '/start',
        { provider: 'default', intent: 'link' },
        bearer,
      )
    ).json();
    expect(
      await (
        await call(
          'POST',
          '/callback',
          callback(link.transaction, 'state-1', 'sub-x'),
          bearer,
        )
      ).json(),
    ).toEqual({ kind: 'linked' });

    expect((await call('POST', '/start', { provider: 'default' })).status).toBe(
      409,
    );
    const login = await sso.start({ provider: 'default' }, null, CLIENT);
    const signedIn = await call(
      'POST',
      '/callback',
      callback(login.transaction, 'state-2', 'sub-x'),
    );
    expect(signedIn.status).toBe(409);
    const result = await signIn('sub-x');
    if (result.kind !== 'session') throw new Error('Expected session');

    expect((await call('GET', '/identity')).status).toBe(401);
    expect(
      await (await call('GET', '/identity', undefined, bearer)).json(),
    ).toMatchObject({ identities: [{ subject: 'sub-x' }], assigned: [] });

    expect((await call('DELETE', '/identity/identity-1')).status).toBe(401);
    expect(
      (await call('DELETE', '/identity/identity-1', undefined, bearer)).status,
    ).toBe(204);
    // The session signed in through the link died with it; the password session did not.
    expect(await auth.authenticate(result.session.token)).toBeNull();
    expect((await call('GET', '/identity', undefined, bearer)).status).toBe(
      200,
    );
  });

  test('rejects malformed and forged callbacks', async () => {
    const { call } = await setup();
    expect(
      (await call('POST', '/callback', { transaction: '', query: '' })).status,
    ).toBe(400);
    expect(
      (await call('POST', '/callback', callback('forged', 'state-1', 'sub-x')))
        .status,
    ).toBe(401);
    expect((await call('POST', '/start', { intent: 'admin' })).status).toBe(
      400,
    );
  });

  test('account linking admission is per owner regardless of claimed address', async () => {
    const { call, bearer } = await setup({ total: 20, perClient: 2 });
    const start = (address: string) =>
      call(
        'POST',
        '/start',
        { provider: 'default', intent: 'link' },
        {
          ...bearer,
          'x-cms-client-address': address,
          'x-cms-frontend-secret': FRONTEND_SECRET,
        },
      );
    expect((await start('203.0.113.7')).status).toBe(200);
    expect((await start('203.0.113.8')).status).toBe(200);
    expect((await start('203.0.113.9')).status).toBe(409);
  });

  test('answers 429 when a client starts too often, before any other work', async () => {
    const { call, provider, bearer } = await setup({
      startsPerMinutePerClient: 1,
    });

    expect(
      (
        await call(
          'POST',
          '/start',
          { provider: 'default', intent: 'link' },
          bearer,
        )
      ).status,
    ).toBe(200);

    // Direct calls without the frontend proof share one client, whatever they claim.
    const refused = await call(
      'POST',
      '/start',
      { provider: 'default', intent: 'link' },
      {
        ...bearer,
        'x-cms-client-address': '198.51.100.9',
      },
    );
    expect(refused.status).toBe(429);
    expect((await refused.json()).error.code).toBe('rate_limited');
    expect(provider.issued).toBe(1);
  });
});
