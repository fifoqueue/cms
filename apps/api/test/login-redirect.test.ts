import { expect, test } from 'bun:test';
import { SignInService } from '#api/domain/auth/sign-in-service';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemorySignInTransactions } from '#test/support/memory-sign-in';
import { profile, recordingLogger, MemorySettings } from '#test/support/memory';

test('login redirects accept local paths only after authentication and keep hook context secret-free', async () => {
  const user = profile({ id: 'u' });
  const users = { findById: async () => user, findByEmail: async () => user };
  const { logger } = recordingLogger();
  const registry = new SignInRegistry({ logger, timeoutMs: 100 });
  const hooks = new HookBus({ logger, timeoutMs: 100 });

  registry.registrar('test', users).signInMethod('method', {
    label: 'Test',
    usableBy: () => true,
    begin: () => ({ kind: 'user', userId: user.id }),
  });
  let sequence = 0;
  const now = new Date('2026-01-01');
  const service = new SignInService({
    factorChanges: new MemorySettings(),
    registry,
    users,
    hooks,
    settings: {
      effective: async () => ({
        methods: ['plugin:test:method'],
        secondFactors: [],
        requireSecondFactor: [],
      }),
    },
    transactions: new MemorySignInTransactions(),
    tokens: {
      issue: () => `${++sequence}`,
      digest: (value) => `hash:${value}`,
    },
    clock: { now: () => now },
    limits: { total: 10, perClient: 10 },
    protection: { check: async () => {} },
    siteUrl: async () => 'https://example.com',
    session: async () => ({
      user,
      token: 'secret',
      expiresAt: now.toISOString(),
    }),
  });
  const start = () =>
    service.start(
      'plugin:test:method',
      {},
      { client: 'visitor', address: null, captchaToken: null },
    );

  expect(await start()).toMatchObject({
    kind: 'session',
    redirectTo: undefined,
  });
  const plugin = hooks.registrar('policy');

  for (const redirectTo of [
    '/welcome?from=login',
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example/',
    '/\nevil.example/',
  ]) {
    const release = plugin.filter('user.loginRedirect', (value) => {
      expect(value).toEqual({
        user,
        method: 'plugin:test:method',
        redirectTo: '/admin',
      });

      return { ...value, redirectTo };
    });

    expect(await start()).toMatchObject({
      kind: 'session',
      redirectTo: redirectTo === '/welcome?from=login' ? redirectTo : '/admin',
    });
    release();
  }

  hooks
    .registrar('functions:site', { trusted: true })
    .filter('user.loginRedirect', (value) => {
      value.method = 'password';
      value.redirectTo = '/changed';

      return value;
    });
  expect(await start()).toMatchObject({ redirectTo: '/admin' });
});
