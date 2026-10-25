import { expect, test } from 'bun:test';
import { SignInService } from '#api/domain/auth/sign-in-service';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemorySignInTransactions } from '#test/support/memory-sign-in';
import { MemorySettings, profile, recordingLogger } from '#test/support/memory';

test('core UV passkey satisfies the policy and enrolled factors, but plugins can require an extra factor', async () => {
  const user = profile({ id: 'user' });
  const users = { findById: async () => user, findByEmail: async () => user };
  const { logger } = recordingLogger();
  const registry = new SignInRegistry({ logger, timeoutMs: 100 });
  const core = registry.core(users);
  const hooks = new HookBus({ logger, timeoutMs: 100 });
  const observed: unknown[] = [];
  const events: unknown[] = [];
  hooks.registrar('observer').on('user.signedIn', (event) => {
    events.push(event);
  });
  // The wired core factory only produces this result after a verified UV assertion.
  const method = {
    label: 'Passkey',
    usableBy: () => true,
    begin: () => ({ kind: 'user' as const, userId: user.id }),
  };
  core.signInMethod('passkey', method);
  registry.registrar('core', users).signInMethod('passkey', method);
  core.secondFactor('totp', {
    label: 'TOTP',
    enrolled: () => true,
    challenge: () => ({
      kind: 'fields',
      fields: [{ name: 'code', label: 'Code', type: 'code', required: true }],
    }),
    verify: () => true,
  });
  let sequence = 0;
  const service = new SignInService({
    users,
    registry,
    hooks,
    factorChanges: new MemorySettings(),
    transactions: new MemorySignInTransactions(),
    settings: {
      effective: async () => ({
        methods: ['passkey', 'plugin:core:passkey'],
        secondFactors: ['totp'],
        requireSecondFactor: [user.role],
      }),
    },
    tokens: { issue: () => `${++sequence}`, digest: (value) => value },
    clock: { now: () => new Date('2026-01-01') },
    limits: { total: 10, perClient: 10 },
    protection: { check: async () => {} },
    siteUrl: async () => 'https://site.example',
    session: async () => ({
      user,
      token: 'session',
      expiresAt: '2026-01-02T00:00:00Z',
    }),
  });
  const visitor = { client: null, address: null, captchaToken: null };
  const release = hooks
    .registrar('observer')
    .filter('user.secondFactorRequired', (value) => {
      observed.push({ method: value.method, required: value.required });
      return value;
    });
  expect((await service.start('passkey', {}, visitor)).kind).toBe('session');
  expect(observed).toEqual([{ method: 'passkey', required: false }]);
  expect(events).toEqual([
    { user, method: 'passkey', secondFactor: 'passkey' },
  ]);
  expect((await service.start('plugin:core:passkey', {}, visitor)).kind).toBe(
    'secondFactor',
  );
  release();
  hooks.registrar('strict').filter('user.secondFactorRequired', (value) => ({
    ...value,
    required: true,
  }));
  expect((await service.start('passkey', {}, visitor)).kind).toBe(
    'secondFactor',
  );
});
