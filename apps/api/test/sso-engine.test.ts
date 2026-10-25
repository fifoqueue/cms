import { expect, test } from 'bun:test';
import type { SignInStep } from '@cms/sdk';
import { createSsoMethod } from '#api/domain/auth/sso-method';
import { SignInService } from '#api/domain/auth/sign-in-service';
import { SsoService } from '#api/domain/auth/sso-service';
import { AuthService } from '#api/domain/auth/auth-service';
import { createSignInUsers } from '#api/domain/auth/sign-in-users';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { MemorySignInTransactions } from '#test/support/memory-sign-in';
import {
  MemoryUsers,
  createMemoryAuthStore,
  MemorySsoTransactions,
  MemorySsoAccessTransactions,
  plainHasher,
} from '#test/support/sso-memory';
import {
  MemorySettings,
  fixedClock,
  sequentialIds,
  userRecord,
  recordingLogger,
} from '#test/support/memory';
import { unauthorized } from '#api/shared/errors';

const visitor = { client: 'client', address: null, captchaToken: null };
const handle = (step: SignInStep) => {
  if (!('transaction' in step)) throw new Error('Expected transaction');
  return step.transaction;
};
const fixture = async () => {
  const users = new MemoryUsers();
  const owner = userRecord({ id: 'owner', email: 'owner@example.com' });
  await users.insert(owner);
  const { sessions, identities } = createMemoryAuthStore(users);
  const settings = new MemorySettings();
  const clock = fixedClock();
  const ids = sequentialIds();
  let serial = 0;
  const tokens = {
    issue: () => `token-${++serial}`,
    digest: (value: string) => `hash:${value}`,
  };
  const auth = new AuthService({
    users,
    sessions,
    clock,
    ids,
    tokens,
    hasher: plainHasher,
    sessionTtlMs: 600000,
  });
  const checked: unknown[] = [];
  const providers = ['a', 'b'].map((id) => ({
    id,
    issuer: `https://${id}.example`,
    name: id,
    subjects: new Map<string, string>(),
    provider: {
      authorize: async () => ({
        url: `https://${id}.example/authorize`,
        state: `state-${id}`,
        nonce: `nonce-${id}`,
        codeVerifier: `pkce-${id}`,
      }),
      verify: async (query: string, checks: unknown) => {
        checked.push({ id, checks });
        if (!query.startsWith('?code=')) throw unauthorized('Bad callback');
        return { issuer: `https://${id}.example/`, subject: query.slice(6) };
      },
    },
  }));
  const setup = async () => ({ providers });
  const sso = new SsoService({
    setup,
    users,
    identities,
    sessions: auth,
    clock,
    ids,
    tokens,
    access: new MemorySsoAccessTransactions({ settings, identities }),
    policy: async () => ({ otherMethod: true, providers }),
    transactions: new MemorySsoTransactions(),
    transactionTtlMs: 600000,
    admission: { total: 20, perClient: 20 },
    startLimiter: { tryAcquire: () => true },
  });
  const { logger } = recordingLogger();
  const directory = createSignInUsers(users, { capabilities: async () => [] });
  const registry = new SignInRegistry({ logger, timeoutMs: 10 });
  registry.core(directory).signInMethod(
    'sso',
    createSsoMethod({
      setup,
      identities,
      resolve: (identity, subjects) => sso.resolve(identity, subjects),
      ids,
      clock,
      starts: { tryAcquire: () => true },
    }),
  );
  let enrolled = false;
  registry.core(directory).secondFactor('totp', {
    label: 'TOTP',
    enrolled: () => enrolled,
    challenge: () => ({
      kind: 'fields',
      fields: [{ name: 'code', label: 'Code', type: 'code', required: true }],
    }),
    verify: (_user, step) => step.values.code === 'correct',
  });
  const transactions = new MemorySignInTransactions();
  const engine = new SignInService({
    registry,
    users: directory,
    tokens,
    clock,
    transactions,
    factorChanges: settings,
    settings: {
      effective: async () => ({
        methods: ['sso'],
        secondFactors: ['totp'],
        requireSecondFactor: [],
      }),
    },
    hooks: new HookBus({ logger, timeoutMs: 100 }),
    limits: { total: 20, perClient: 20 },
    protection: { check: async () => {} },
    siteUrl: async () => 'https://site.example',
    session: async (user, identityId) =>
      auth.startSession((await users.findById(user.id))!, identityId ?? null),
  });
  const link = () =>
    identities.link({
      id: 'identity',
      userId: owner.id,
      issuer: 'https://a.example/',
      subject: 'subject',
      createdAt: clock.now(),
    });
  const start = (option = 'a') => engine.start('sso', { option }, visitor);
  const finish = (step: SignInStep, query = '?code=subject') =>
    engine.continue({ transaction: handle(step), query }, visitor);
  return {
    engine,
    owner,
    auth,
    identities,
    sessions,
    transactions,
    tokens,
    checked,
    start,
    finish,
    link,
    enroll: () => {
      enrolled = true;
    },
  };
};

test('SSO engine binds verified identities through the factor step to sessions', async () => {
  const f = await fixture();
  await f.link();
  f.enroll();
  const start = await f.start();
  expect(start).toMatchObject({
    kind: 'redirect',
    url: 'https://a.example/authorize',
  });
  const choice = await f.finish(start);
  expect(choice.kind).toBe('secondFactor');
  expect(f.sessions.rows.size).toBe(0);
  expect([...f.transactions.rows.values()][0]!.identityId).toBe('identity');
  expect(f.checked[0]).toEqual({
    id: 'a',
    checks: { state: 'state-a', nonce: 'nonce-a', codeVerifier: 'pkce-a' },
  });
  const prompt = await f.engine.chooseFactor(
    { transaction: handle(choice), factor: 'totp' },
    visitor,
  );
  const result = await f.engine.continue(
    { transaction: handle(prompt), values: { code: 'correct' } },
    visitor,
  );
  if (result.kind !== 'session') throw new Error('Expected session');
  expect(
    f.sessions.rows.get(f.tokens.digest(result.session.token))!.identityId,
  ).toBe('identity');
  await f.identities.unlink(f.owner.id, 'identity');
  expect(await f.auth.authenticate(result.session.token)).toBeNull();
});
