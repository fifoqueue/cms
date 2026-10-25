import { expect, test } from 'bun:test';
import { SignInService } from '#api/domain/auth/sign-in-service';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemorySignInTransactions } from '#test/support/memory-sign-in';
import { MemorySetupTokens } from '#test/support/memory-setup-tokens';
import { profile, recordingLogger, MemorySettings } from '#test/support/memory';

test('setup binds identity, checks expiry, and consumes one token across concurrent completions', async () => {
  const user = profile({ id: 'u' });
  const users = { findById: async () => user, findByEmail: async () => user };
  const { logger } = recordingLogger();
  const registry = new SignInRegistry({ logger, timeoutMs: 100 });
  const setupTokens = new MemorySetupTokens();
  const now = new Date('2026-01-01');
  let outcomeId = 'other';
  registry.registrar('test', users).signInMethod('method', {
    label: 'Setup',
    usableBy: () => true,
    begin: () => ({ kind: 'failed' }),
    setup: {
      begin: (bound) => {
        expect(bound.id).toBe(user.id);
        return {
          kind: 'fields',
          fields: [
            { name: 'code', label: 'Code', type: 'code', required: true },
          ],
          state: { nonce: 'private' },
        };
      },
      continue: (bound, step) => {
        expect(bound.id).toBe(user.id);
        expect(step.state).toEqual({ nonce: 'private' });
        return { kind: 'user', userId: outcomeId };
      },
    },
  });
  let sequence = 0;
  const service = new SignInService({
    factorChanges: new MemorySettings(),
    registry,
    users,
    setupTokens,
    hooks: new HookBus({ logger, timeoutMs: 100 }),
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
      token: 'session',
      expiresAt: now.toISOString(),
    }),
  });
  const visitor = { client: 'visitor', address: null, captchaToken: null };
  await expect(
    service.setup('plugin:test:method', { token: 'absent' }, visitor),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  setupTokens.rows.set('hash:expired', { userId: user.id, expiresAt: now });
  await expect(
    service.setup('plugin:test:method', { token: 'expired' }, visitor),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  setupTokens.rows.set('hash:valid', {
    userId: user.id,
    expiresAt: new Date(now.getTime() + 600_000),
  });
  const start = async () => {
    const step = await service.setup(
      'plugin:test:method',
      { token: 'valid' },
      visitor,
    );
    if (!('transaction' in step)) throw new Error('Expected handle');
    return step.transaction;
  };
  const mismatch = await start();
  await expect(
    service.continue({ transaction: mismatch }, visitor),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  expect(setupTokens.rows.has('hash:valid')).toBe(true);
  outcomeId = user.id;
  const handles = await Promise.all([start(), start()]);
  const results = await Promise.allSettled(
    handles.map((transaction) => service.continue({ transaction }, visitor)),
  );
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(setupTokens.rows.has('hash:valid')).toBe(false);
  await expect(
    service.setup('plugin:test:method', { token: 'valid' }, visitor),
  ).rejects.toMatchObject({ code: 'unauthorized' });
});
