import { expect, test } from 'bun:test';
import { SignInService } from '#api/domain/auth/sign-in-service';
import { SignInSettingsService } from '#api/domain/auth/sign-in-settings';
import { createSsoMethod } from '#api/domain/auth/sso-method';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { ClientResolver } from '#api/http/client-identity';
import { MemoryRateLimiter } from '#api/infra/memory-rate-limiter';
import {
  MemorySettings,
  profile,
  recordingLogger,
  fixedClock,
} from '#test/support/memory';
import { MemorySignInTransactions } from '#test/support/memory-sign-in';
import { createMemoryAuthStore } from '#test/support/sso-memory';

const fixture = () => {
  const user = profile({ id: 'owner' });
  const users = { findById: async () => user, findByEmail: async () => user };
  const { logger } = recordingLogger();
  const warnings: unknown[] = [];
  logger.warn = (...args) => {
    warnings.push(args);
  };
  const registry = new SignInRegistry({ logger, timeoutMs: 100 });
  const core = registry.core(users);
  core.signInMethod('password', {
    label: 'Password',
    usableBy: () => true,
    begin: () => ({ kind: 'user', userId: user.id }),
  });
  core.secondFactor('totp', {
    label: 'TOTP',
    enrolled: () => false,
    challenge: () => ({
      kind: 'fields',
      fields: [{ name: 'code', label: 'Code', type: 'code', required: true }],
    }),
    verify: () => true,
    enroll: {
      begin: () => ({
        kind: 'fields',
        fields: [{ name: 'code', label: 'Code', type: 'code', required: true }],
      }),
      finish: () => true,
    },
  });
  const store = new MemorySettings();
  const settings = new SignInSettingsService({
    settings: store,
    transactions: store,
    registry,
    passwordForced: false,
    logger,
  });
  const hooks = new HookBus({ logger, timeoutMs: 100 });
  let serial = 0;
  const engine = new SignInService({
    users,
    registry,
    settings,
    hooks,
    factorChanges: store,
    transactions: new MemorySignInTransactions(),
    clock: fixedClock(),
    tokens: { issue: () => `${++serial}`, digest: (value) => `hash:${value}` },
    protection: { check: async () => {} },
    limits: { total: 10, perClient: 10 },
    siteUrl: async () => 'https://site.example',
    session: async () => ({
      user,
      token: 'session',
      expiresAt: '2026-01-01T01:00:00Z',
    }),
  });
  return { user, registry, store, settings, hooks, engine, warnings };
};
const visitor = { client: null, address: null, captchaToken: null };

test.each(['allowed', 'required'] as const)(
  '%s filters require complete immutable user/method context',
  async (flag) => {
    const hook =
      flag === 'allowed' ? 'user.signInAllowed' : 'user.secondFactorRequired';
    const corruptions = [
      () => ({ [flag]: flag !== 'allowed' }),
      () => ({
        user: { id: 'owner' },
        method: 'password',
        [flag]: flag !== 'allowed',
      }),
      (user: ReturnType<typeof profile>) => ({
        user: { ...user, id: 'other' },
        method: 'password',
        [flag]: flag !== 'allowed',
      }),
      (user: ReturnType<typeof profile>) => ({
        user: { ...user, role: 'subscriber' },
        method: 'password',
        [flag]: flag !== 'allowed',
      }),
      (user: ReturnType<typeof profile>) => ({
        user: { ...user, email: 42 },
        method: 'password',
        [flag]: flag !== 'allowed',
      }),
      (user: ReturnType<typeof profile>) => ({
        user: { ...user, passwordHash: 'injected' },
        method: 'password',
        [flag]: flag !== 'allowed',
      }),
      (user: ReturnType<typeof profile>) => ({
        user,
        method: 'sso',
        [flag]: flag !== 'allowed',
      }),
      (user: ReturnType<typeof profile>) => ({
        user,
        [flag]: flag !== 'allowed',
      }),
      (user: ReturnType<typeof profile>) => ({
        user,
        method: 'password',
        [flag]: flag !== 'allowed',
        injected: true,
      }),
    ];
    for (const corrupt of corruptions) {
      const f = fixture();
      f.hooks
        .registrar('corrupt')
        .filter(hook, (value) => corrupt(value.user) as typeof value, 1);
      const seen: unknown[] = [];
      f.hooks.registrar('observer').filter(
        hook,
        (value) => {
          seen.push({ user: value.user, method: value.method });
          return value;
        },
        20,
      );
      expect((await f.engine.start('password', {}, visitor)).kind).toBe(
        'session',
      );
      expect(seen).toEqual([{ user: f.user, method: 'password' }]);
      expect(JSON.stringify(f.warnings)).toContain(hook);
    }
  },
);

test('valid decision changes retain their effect with equivalent profile key order', async () => {
  const denied = fixture();
  denied.hooks.registrar('deny').filter('user.signInAllowed', (value) => ({
    ...value,
    user: Object.fromEntries(
      Object.entries(value.user).reverse(),
    ) as typeof value.user,
    allowed: false,
  }));
  await expect(
    denied.engine.start('password', {}, visitor),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  const required = fixture();
  required.hooks
    .registrar('require')
    .filter('user.secondFactorRequired', (value) => ({
      ...value,
      user: Object.fromEntries(
        Object.entries(value.user).reverse(),
      ) as typeof value.user,
      required: true,
    }));
  expect((await required.engine.start('password', {}, visitor)).kind).toBe(
    'enroll',
  );
});

test.each([true, false])(
  'second-factor filters cannot weaken a prior requirement (role=%s)',
  async (roleRequired) => {
    const f = fixture();
    await f.store.set('signIn', {
      methods: ['password'],
      secondFactors: ['totp'],
      requireSecondFactor: roleRequired ? [f.user.role] : [],
    });
    if (!roleRequired)
      f.hooks
        .registrar('require')
        .filter(
          'user.secondFactorRequired',
          (value) => ({ ...value, required: true }),
          1,
        );
    f.hooks
      .registrar('weaken')
      .filter(
        'user.secondFactorRequired',
        (value) => ({ ...value, required: false }),
        20,
      );
    const step = await f.engine.start('password', {}, visitor);
    expect(step.kind).toBe('enroll');
    expect(JSON.stringify(f.warnings)).toContain('user.secondFactorRequired');
  },
);

test('required roles need an enrollable factor and withdrawn plugins fall back to core TOTP without changing storage', async () => {
  const f = fixture();
  await expect(
    f.settings.update(
      {
        methods: ['password'],
        secondFactors: ['recovery-code'],
        requireSecondFactor: [f.user.role],
      },
      f.user,
    ),
  ).rejects.toMatchObject({
    code: 'invalid_input',
    issues: [{ path: 'requireSecondFactor', message: expect.any(String) }],
  });
  await f.settings.update(
    {
      methods: ['password'],
      secondFactors: ['totp'],
      requireSecondFactor: [f.user.role],
    },
    f.user,
  );
  await f.store.set('signIn', {
    methods: ['password'],
    secondFactors: ['plugin:removed:factor'],
    requireSecondFactor: [f.user.role],
  });
  expect((await f.settings.effective()).secondFactors).toEqual(['totp']);
  expect((await f.settings.getAdmin()).secondFactors).toEqual([
    'plugin:removed:factor',
  ]);
  const step = await f.engine.start('password', {}, visitor);
  expect(step).toMatchObject({
    kind: 'enroll',
    factors: [{ id: 'totp', label: 'TOTP' }],
  });
  expect(JSON.stringify(f.warnings)).toContain('TOTP');
  if (step.kind !== 'enroll') throw new Error('Expected enrollment');
  const challenge = await f.engine.chooseFactor(
    { transaction: step.transaction, factor: 'totp' },
    visitor,
  );
  if (!('transaction' in challenge)) throw new Error('Expected challenge');
  expect(
    (
      await f.engine.continue(
        { transaction: challenge.transaction, values: { code: '123456' } },
        visitor,
      )
    ).kind,
  ).toBe('session');
});

test('SSO start admission uses the proved network key, grouping IPv6 /64 and unproved clients', async () => {
  const secret = 'frontend-secret';
  const clients = new ClientResolver(secret);
  const clock = fixedClock();
  const limiter = new MemoryRateLimiter({
    clock,
    perKey: 1,
    total: 20,
    windowMs: 60000,
  });
  const { identities } = createMemoryAuthStore();
  const keys: string[] = [];
  const method = createSsoMethod({
    setup: async () => ({
      providers: [
        {
          id: 'provider',
          name: 'Provider',
          issuer: 'https://id.example',
          subjects: new Map(),
          provider: {
            authorize: async () => ({
              url: 'https://id.example/auth',
              state: 'state',
              nonce: 'nonce',
              codeVerifier: 'verifier',
            }),
            verify: async () => ({
              issuer: 'https://id.example',
              subject: 'subject',
            }),
          },
        },
      ],
    }),
    identities,
    resolve: async () => null,
    ids: { next: () => 'id' },
    clock,
    starts: {
      tryAcquire: (key) => {
        keys.push(key);
        return limiter.tryAcquire(key);
      },
    },
  });
  const start = (address: string, proof = secret) =>
    method.begin({
      ...clients.attempt(
        new Request('http://localhost/', {
          headers: {
            'x-cms-client-address': address,
            'x-cms-frontend-secret': proof,
          },
        }),
      ),
      option: 'provider',
      values: {},
      callbackUrl: 'https://site.example/admin/sign-in/callback',
    });
  expect((await start('2001:db8:1:2::1')).kind).toBe('redirect');
  await expect(start('2001:db8:1:2::99')).rejects.toMatchObject({
    code: 'rate_limited',
  });
  expect((await start('2001:db8:1:3::1')).kind).toBe('redirect');
  expect((await start('203.0.113.1', 'forged')).kind).toBe('redirect');
  await expect(start('203.0.113.2', 'forged')).rejects.toMatchObject({
    code: 'rate_limited',
  });
  expect(keys[0]).toBe(keys[1]);
  expect(keys[3]).toBe(keys[4]);
});
