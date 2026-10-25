import { expect, test } from 'bun:test';
import { SignInService } from '#api/domain/auth/sign-in-service';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemorySignInTransactions } from '#test/support/memory-sign-in';
import { profile, recordingLogger, MemorySettings } from '#test/support/memory';

test('primary plugin flow rotates handles, round-trips state, protects fields and denies re-allow', async () => {
  const user = profile({ id: 'user' });
  const users = { findById: async () => user, findByEmail: async () => user };
  const { logger } = recordingLogger();
  const registry = new SignInRegistry({ timeoutMs: 100, logger });
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const seen: unknown[] = [];
  const events: string[] = [];
  hooks.registrar('observer').on('user.signedIn', () => {
    events.push('signedIn');
  });
  hooks.registrar('observer').on('user.signInFailed', () => {
    events.push('failed');
  });
  registry.registrar('test', users).signInMethod('method', {
    label: 'Test',
    usableBy: () => true,
    begin: (request) => {
      expect(request.callbackUrl).toBe(
        'https://site.example/admin/sign-in/callback',
      );
      return {
        kind: 'redirect',
        url: 'https://id.example/auth',
        state: { step: 1 },
      };
    },
    continue: ({ state }) => {
      seen.push(state);
      const step = (state as { step: number }).step;
      if (step === 1)
        return {
          kind: 'webauthn',
          ceremony: 'get',
          options: { challenge: 'nonce' },
          state: { step: 2 },
        };
      if (step === 2)
        return {
          kind: 'fields',
          fields: [
            { name: 'code', label: 'Code', type: 'code', required: true },
          ],
          state: { step: 3 },
        };
      return { kind: 'user', userId: user.id };
    },
  });
  let sequence = 0;
  let checks = 0;
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
      issue: () => `handle-${++sequence}`,
      digest: (value) => `digest:${value}`,
    },
    clock: { now: () => new Date('2026-01-01') },
    limits: { total: 5, perClient: 5 },
    protection: {
      check: async () => {
        checks++;
      },
    },
    siteUrl: async () => 'https://site.example',
    session: async () => ({
      token: 'session',
      user,
      expiresAt: '2026-01-02T00:00:00Z',
    }),
  });
  const visitor = { client: 'client', address: null, captchaToken: null };
  await expect(
    service.continue({ transaction: 'unknown' }, visitor),
  ).rejects.toMatchObject({ code: 'sign_in_expired' });
  await expect(
    service.chooseFactor({ transaction: 'unknown', factor: 'totp' }, visitor),
  ).rejects.toMatchObject({ code: 'sign_in_expired' });
  const first = await service.start('plugin:test:method', {}, visitor);
  expect(first.kind).toBe('redirect');
  if (!('transaction' in first)) throw new Error('Expected transaction');
  const second = await service.continue(
    { transaction: first.transaction },
    visitor,
  );
  expect(second.kind).toBe('webauthn');
  await expect(
    service.continue({ transaction: first.transaction }, visitor),
  ).rejects.toMatchObject({ code: 'sign_in_expired' });
  if (!('transaction' in second)) throw new Error('Expected transaction');
  expect(second.transaction).not.toBe(first.transaction);
  const third = await service.continue(
    { transaction: second.transaction },
    visitor,
  );
  expect(third.kind).toBe('fields');
  if (!('transaction' in third)) throw new Error('Expected transaction');
  const result = await service.continue(
    { transaction: third.transaction, values: { code: '123456' } },
    visitor,
  );
  expect(result.kind).toBe('session');
  expect(checks).toBe(1);
  expect(seen).toEqual([{ step: 1 }, { step: 2 }, { step: 3 }]);
  expect(events).toContain('signedIn');
  hooks
    .registrar('deny')
    .filter('user.signInAllowed', (value) => ({ ...value, allowed: false }));
  hooks
    .registrar('allow')
    .filter('user.signInAllowed', (value) => ({ ...value, allowed: true }), 20);
  let denied = await service.start('plugin:test:method', {}, visitor);
  for (let index = 0; index < 2; index++) {
    if (!('transaction' in denied)) throw new Error('Expected transaction');
    denied = await service.continue(
      { transaction: denied.transaction },
      visitor,
    );
  }
  if (!('transaction' in denied)) throw new Error('Expected transaction');
  await expect(
    service.continue({ transaction: denied.transaction }, visitor),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  registry.registrar('test', users).signInMethod('denied', {
    label: 'Denied',
    usableBy: () => true,
    begin: () => ({ kind: 'failed' }),
  });
  await expect(
    service.start('plugin:test:denied', {}, visitor),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  expect(events).toContain('failed');
});
