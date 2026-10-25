import { expect, test } from 'bun:test';
import type { SignInStep } from '@cms/sdk';
import { SignInService } from '#api/domain/auth/sign-in-service';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemorySignInTransactions } from '#test/support/memory-sign-in';
import { MemorySettings, profile, recordingLogger } from '#test/support/memory';
import type { SettingsTransactions } from '#api/domain/site/settings-transactions';

const handle = (step: SignInStep) => {
  if (!('transaction' in step)) throw new Error('Expected transaction');
  return step.transaction;
};

const setup = (factorChanges: SettingsTransactions = new MemorySettings()) => {
  const user = profile({ id: 'owner' });
  const other = profile({ id: 'other' });
  const users = {
    findById: async (id: string) =>
      id === user.id ? user : id === other.id ? other : null,
    findByEmail: async () => null,
  };
  const { logger } = recordingLogger();
  const registry = new SignInRegistry({ logger, timeoutMs: 100 });
  const hooks = new HookBus({ logger, timeoutMs: 100 });
  const changes: string[] = [];
  let sessions = 0;
  let checks = 0;
  let sequence = 0;
  const credentials = new Map<string, Set<string>>();
  const policy = {
    methods: ['password'],
    secondFactors: ['plugin:test:first', 'plugin:test:second'],
    requireSecondFactor: [user.role],
  };
  hooks.registrar('observer').on('user.secondFactorChanged', ({ change }) => {
    changes.push(change);
  });
  for (const key of ['first', 'second']) {
    credentials.set(key, new Set());
    const owned = (id: string) =>
      id === user.id ? credentials.get(key)! : new Set<string>();
    registry.registrar('test', users).secondFactor(key, {
      label: key,
      enrolled: (actor) => owned(actor.id).size > 0,
      credentials: (actor) =>
        [...owned(actor.id)].map((id) => ({ id, label: id })),
      challenge: () => ({
        kind: 'webauthn',
        ceremony: 'get',
        options: { challenge: 'nonce' },
      }),
      verify: () => false,
      remove: (actor, id) => {
        owned(actor.id).delete(id);
      },
      enroll: {
        begin: () => ({
          kind: 'fields',
          fields: [
            { name: 'code', label: 'Code', type: 'code', required: true },
          ],
          state: { nonce: 'server' },
        }),
        finish: (actor, step) => {
          expect(step.state).toEqual({ nonce: 'server' });
          if (step.values.code !== 'valid') return false;
          owned(actor.id).add('new');
          return true;
        },
      },
    });
  }
  const service = new SignInService({
    registry,
    users,
    hooks,
    settings: { effective: async () => policy },
    transactions: new MemorySignInTransactions(),
    factorChanges,
    clock: { now: () => new Date('2026-01-01') },
    tokens: {
      issue: () => `${++sequence}`,
      digest: (value) => `hash:${value}`,
    },
    protection: {
      check: async () => {
        checks++;
      },
    },
    limits: { total: 10, perClient: 10 },
    siteUrl: async () => 'https://example.com',
    session: async () => {
      sessions++;
      return { user, token: 'session', expiresAt: '2026-01-02T00:00:00Z' };
    },
  });
  const visitor = { client: 'visitor', address: null, captchaToken: null };
  return {
    service,
    user,
    other,
    visitor,
    credentials,
    policy,
    changes,
    hooks,
    counts: () => ({ sessions, checks }),
  };
};

test('factor removal notification runs only after commit, never after commit failure', async () => {
  let finish!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let committed = false;
  const f = setup({
    run: async (_lock, work) => {
      const result = await work(new MemorySettings());
      reached();
      await gate;
      committed = true;
      return result;
    },
  });
  f.policy.requireSecondFactor = [];
  f.credentials.get('first')!.add('credential');
  const observed: boolean[] = [];
  f.hooks.registrar('commit-observer').on('user.secondFactorChanged', () => {
    observed.push(committed);
  });
  const removal = f.service.removeFactor(
    f.user,
    'plugin:test:first',
    'credential',
  );
  await pending;
  expect(f.changes).toEqual([]);
  expect(observed).toEqual([]);
  finish();
  await removal;
  expect(f.changes).toEqual(['removed']);
  expect(observed).toEqual([true]);

  const failed = setup({
    run: async (_lock, work) => {
      await work(new MemorySettings());
      throw new Error('commit failed');
    },
  });
  failed.policy.requireSecondFactor = [];
  failed.credentials.get('first')!.add('credential');
  await expect(
    failed.service.removeFactor(failed.user, 'plugin:test:first', 'credential'),
  ).rejects.toThrow('commit failed');
  expect(failed.changes).toEqual([]);
});

test('account enrollment requires the initiating user and ends with done, not a session', async () => {
  const { service, user, other, visitor, changes, counts } = setup();
  const initial = await service.factors(user);
  expect(initial.required).toBe(true);
  expect(
    initial.factors.every((factor) => !factor.enrolled && factor.enrollable),
  ).toBe(true);
  for (const actor of [undefined, other]) {
    const step = await service.enroll(user, 'plugin:test:first', visitor);
    await expect(
      service.continue(
        { transaction: handle(step), values: { code: 'valid' } },
        visitor,
        actor,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  }
  const step = await service.enroll(user, 'plugin:test:first', visitor);
  expect(
    await service.continue(
      {
        transaction: handle(step),
        values: { code: 'valid' },
        stage: 'primary',
        userId: 'other',
      },
      visitor,
      user,
    ),
  ).toEqual({ kind: 'done' });
  await expect(
    service.continue({ transaction: handle(step) }, visitor, user),
  ).rejects.toMatchObject({ code: 'sign_in_expired' });
  expect(counts()).toEqual({ sessions: 0, checks: 1 });
  expect(changes).toEqual(['enrolled']);
  expect((await service.factors(user)).factors[0]).toMatchObject({
    enrolled: true,
    credentials: [{ id: 'new', label: 'new', createdAt: null }],
  });
  expect((await service.factors(other)).factors[0]!.enrolled).toBe(false);
});

test('failed enrollment and disabled factors never change the account', async () => {
  const { service, user, visitor, policy, changes } = setup();
  const failed = await service.enroll(user, 'plugin:test:first', visitor);
  await expect(
    service.continue(
      { transaction: handle(failed), values: { code: 'wrong' } },
      visitor,
      user,
    ),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  expect(
    await service.continue(
      {
        transaction: handle(failed),
        values: { code: 'valid' },
      },
      visitor,
      user,
    ),
  ).toEqual({ kind: 'done' });
  const disabled = await service.enroll(user, 'plugin:test:first', visitor);
  policy.secondFactors = [];
  await expect(
    service.continue(
      { transaction: handle(disabled), values: { code: 'valid' } },
      visitor,
      user,
    ),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  await expect(
    service.enroll(user, 'plugin:test:first', visitor),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  expect(changes).toEqual(['enrolled']);
});

test('required-factor removals serialize; multiple credentials and optional removal remain possible', async () => {
  const { service, user, credentials, policy, changes } = setup();
  credentials.get('first')!.add('a');
  credentials.get('second')!.add('b');
  const removals = await Promise.allSettled([
    service.removeFactor(user, 'plugin:test:first', 'a'),
    service.removeFactor(user, 'plugin:test:second', 'b'),
  ]);
  expect(
    removals.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(removals[1]).toMatchObject({
    status: 'rejected',
    reason: { code: 'conflict' },
  });
  credentials.get('second')!.add('extra');
  await service.removeFactor(user, 'plugin:test:second', 'extra');
  await expect(
    service.removeFactor(user, 'plugin:test:second', 'unknown'),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  await expect(
    service.removeFactor(user, 'plugin:test:second', 'b'),
  ).rejects.toMatchObject({ code: 'conflict' });
  policy.requireSecondFactor = [];
  await service.removeFactor(user, 'plugin:test:second', 'b');
  expect(changes).toEqual(['removed', 'removed', 'removed']);
});
