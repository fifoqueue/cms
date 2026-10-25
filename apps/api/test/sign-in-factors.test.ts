import { expect, test } from 'bun:test';
import { SignInService } from '#api/domain/auth/sign-in-service';
import type { SignInStep } from '@cms/sdk';
import { Errors } from '@cms/sdk/errors';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemorySignInTransactions } from '#test/support/memory-sign-in';
import { profile, recordingLogger, MemorySettings } from '#test/support/memory';

const handle = (step: SignInStep) => {
  if (!('transaction' in step)) throw new Error('Expected transaction');
  return step.transaction;
};

test('required enrollment, optional enrolled factors, expiry and admission fail closed', async () => {
  const user = profile({ id: 'u' });
  const users = { findById: async () => user, findByEmail: async () => user };
  const { logger } = recordingLogger();
  const registry = new SignInRegistry({ logger, timeoutMs: 100 });
  const hooks = new HookBus({ logger, timeoutMs: 100 });
  const changes: string[] = [];
  hooks.registrar('test').on('user.secondFactorChanged', ({ change }) => {
    changes.push(change);
  });
  let enrolled = false;
  let required = true;
  let now = new Date('2026-01-01');
  let sequence = 0;
  let attempts = 0;
  const registrar = registry.registrar('test', users);
  registrar.signInMethod('method', {
    label: 'Test',
    usableBy: () => true,
    begin: () => ({ kind: 'user', userId: user.id }),
  });
  const challenge = () => ({
    kind: 'fields' as const,
    fields: [
      { name: 'code', label: 'Code', type: 'code' as const, required: true },
    ],
    state: { secret: 'server-only' },
  });
  registrar.secondFactor('factor', {
    label: 'Factor',
    enrolled: () => enrolled,
    challenge,
    verify: (_user, step) => step.values.code === 'ok',
    enroll: {
      begin: challenge,
      finish: (_user, step) => {
        expect(step.state).toEqual({ secret: 'server-only' });
        enrolled = step.values.code === 'ok';
        return enrolled;
      },
    },
  });
  const service = new SignInService({
    factorChanges: new MemorySettings(),
    registry,
    users,
    hooks,
    settings: {
      effective: async () => ({
        methods: ['plugin:test:method'],
        secondFactors: ['plugin:test:factor'],
        requireSecondFactor: required ? [user.role] : [],
      }),
    },
    transactions: new MemorySignInTransactions(),
    tokens: {
      issue: () => `${++sequence}`,
      digest: (value) => `hash:${value}`,
    },
    clock: { now: () => now },
    limits: { total: 1, perClient: 1 },
    protection: {
      check: async () => {
        attempts++;
      },
    },
    siteUrl: async () => 'https://example.com',
    session: async () => ({
      user,
      token: 'session',
      expiresAt: now.toISOString(),
    }),
  });
  const visitor = { client: 'visitor', address: null, captchaToken: null };
  const first = await service.start('plugin:test:method', {}, visitor);
  expect(first.kind).toBe('enroll');
  await expect(
    service.start('plugin:test:method', {}, visitor),
  ).rejects.toMatchObject({ code: 'rate_limited' });
  const enrollment = await service.chooseFactor(
    { transaction: handle(first), factor: 'plugin:test:factor' },
    visitor,
  );
  expect(enrollment.kind).toBe('fields');
  await expect(
    service.continue(
      {
        transaction: handle(enrollment),
        values: { code: 'wrong' },
      },
      visitor,
    ),
  ).rejects.toMatchObject({
    code: 'unauthorized',
    // A failed factor is not reported as a wrong email or password.
    message: Errors.SecondFactorFailed,
  });
  expect(attempts).toBe(1);
  await expect(
    service.start('plugin:test:method', {}, visitor),
  ).rejects.toMatchObject({ code: 'rate_limited' });
  expect(
    (
      await service.continue(
        { transaction: handle(enrollment), values: { code: 'ok' } },
        visitor,
      )
    ).kind,
  ).toBe('session');
  expect(changes).toEqual(['enrolled']);
  expect(attempts).toBe(2);
  required = false;
  const optional = await service.start('plugin:test:method', {}, visitor);
  expect(optional.kind).toBe('secondFactor');
  const second = await service.chooseFactor(
    { transaction: handle(optional), factor: 'plugin:test:factor' },
    visitor,
  );
  expect(
    (
      await service.continue(
        { transaction: handle(second), values: { code: 'ok' } },
        visitor,
      )
    ).kind,
  ).toBe('session');
  const expired = await service.start('plugin:test:method', {}, visitor);
  now = new Date(now.getTime() + 600_000);
  await expect(
    service.chooseFactor(
      { transaction: handle(expired), factor: 'plugin:test:factor' },
      visitor,
    ),
  ).rejects.toMatchObject({ code: 'sign_in_expired' });
});
