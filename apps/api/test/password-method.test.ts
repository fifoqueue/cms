import { expect, test } from 'bun:test';
import { createPasswordMethod } from '#api/domain/auth/password-method';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { SignInService } from '#api/domain/auth/sign-in-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemorySignInTransactions } from '#test/support/memory-sign-in';
import { MemorySettings } from '#test/support/memory';
import { MemoryUsers } from '#test/support/sso-memory';
import { profile, userRecord, recordingLogger } from '#test/support/memory';

test('password method verifies unknown users against a dummy hash and defers setup to atomic token consumption', async () => {
  const users = new MemoryUsers();
  const user = userRecord({
    id: 'owner',
    email: 'owner@example.com',
    passwordHash: 'hash:correct-password',
  });
  await users.insert(user);
  const verified: string[] = [];
  let consumed = false;
  const method = createPasswordMethod({
    users,
    hasher: {
      hash: async (password) => `hash:${password}`,
      verify: async (password, hash) => {
        verified.push(hash);
        return hash === `hash:${password}`;
      },
    },
    credentials: {
      change: async () => {},
      validReset: async () => true,
      reset: async (token, _now, hash) => {
        if (consumed || token !== 'valid-token-hash') return false;
        consumed = true;
        await users.setPassword(user.id, hash);
        return true;
      },
    },
  });
  const request = {
    option: null,
    address: null,
    callbackUrl: 'https://site.example/admin/sign-in/callback',
    values: { email: user.email, password: 'correct-password' },
  };
  expect(await method.begin(request)).toEqual({
    kind: 'user',
    userId: user.id,
  });
  expect(
    await method.begin({
      ...request,
      values: { ...request.values, email: 'missing@example.com' },
    }),
  ).toEqual({ kind: 'failed' });
  expect(verified).toEqual(['hash:correct-password', 'hash:dummy-password']);
  const { logger } = recordingLogger();
  const registry = new SignInRegistry({ logger, timeoutMs: 100 });
  const directory = {
    findById: async () => profile({ id: user.id }),
    findByEmail: async () => null,
  };
  registry.core(directory).signInMethod('password', method);
  const service = new SignInService({
    registry,
    users: directory,
    settings: {
      effective: async () => ({
        methods: ['password'],
        secondFactors: [],
        requireSecondFactor: [],
      }),
    },
    transactions: new MemorySignInTransactions(),
    factorChanges: new MemorySettings(),
    tokens: { issue: () => 'token', digest: (value) => value },
    clock: { now: () => new Date() },
    limits: { total: 10, perClient: 10 },
    protection: { check: async () => {} },
    hooks: new HookBus({ logger, timeoutMs: 100 }),
    siteUrl: async () => 'https://site.example',
    session: async (user) => ({
      user,
      token: 'session',
      expiresAt: new Date().toISOString(),
    }),
  });
  const info = await service.info();
  expect(info.methods[0]!.fields.map((field) => field.name)).toEqual([
    'email',
    'password',
  ]);
  expect(info.setup[0]!.fields).toEqual([
    {
      name: 'password',
      label: 'New password',
      type: 'password',
      autocomplete: 'new-password',
      required: true,
    },
  ]);
  registry.registrar('example', directory).signInMethod('password', method);
  const input = { ...request, values: { password: 'new-password' } };
  const outcome = await registry
    .method('password')!
    .setup!.begin(profile({ id: user.id }), input);
  expect(consumed).toBe(false);
  expect(outcome.kind).toBe('user');
  if (!('commitSetup' in outcome) || !outcome.commitSetup)
    throw new Error('Missing atomic finalizer');
  const results = await Promise.all([
    outcome.commitSetup('valid-token-hash', new Date()),
    outcome.commitSetup('valid-token-hash', new Date()),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect((await users.findById(user.id))?.passwordHash).toBe(
    'hash:new-password',
  );
  const plugin = await registry
    .method('plugin:example:password')!
    .setup!.begin(profile({ id: user.id }), input);
  expect(plugin).toEqual({ kind: 'user', userId: user.id });
  expect('commitSetup' in plugin).toBe(false);
});
