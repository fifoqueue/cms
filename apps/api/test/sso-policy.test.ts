import { expect, test } from 'bun:test';
import { SsoService } from '#api/domain/auth/sso-service';
import { SsoSettingsService } from '#api/domain/auth/sso-settings';
import { SignInSettingsService } from '#api/domain/auth/sign-in-settings';
import { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import type { SsoAccessTransactions } from '#api/domain/auth/sso-ports';
import { sameIssuer } from '#api/domain/auth/sso-issuer';
import { AuthService } from '#api/domain/auth/auth-service';
import { loadConfig } from '#api/config';
import {
  MemorySettings,
  fixedClock,
  sequentialIds,
  userRecord,
  profile,
  recordingLogger,
} from '#test/support/memory';
import {
  MemoryUsers,
  MemorySsoTransactions,
  createMemoryAuthStore,
  plainHasher,
} from '#test/support/sso-memory';
import { plainSecretBox } from '#test/support/memory-security';
import { randomTokenIssuer } from '#api/infra/system';

const provider = (id: string) => ({
  id,
  enabled: true,
  name: id,
  issuer: `https://${id}.example`,
  clientId: 'cms',
  authMethod: 'none' as const,
});
const fixture = async (forced = false) => {
  const users = new MemoryUsers();
  const admin = profile({ id: 'admin', email: 'admin@example.com' });
  await users.insert(userRecord(admin));
  const { identities, sessions } = createMemoryAuthStore(users);
  const clock = fixedClock();
  const settings = new MemorySettings();
  const access: SsoAccessTransactions = {
    run: (work) =>
      settings.run('signIn.admission', (store) =>
        work({ settings: store, identities }),
      ),
  };
  const service = new SsoSettingsService({
    settings,
    access,
    secrets: plainSecretBox,
    siteUrl: async () => 'https://site.example',
    environment: null,
    otherMethod: (actor, store) => signIn.otherUsable(actor, store),
    connect: ({ issuer }) => ({
      authorize: async () => ({
        url: `${issuer}/authorize`,
        state: 'state',
        nonce: 'nonce',
        codeVerifier: 'verifier',
      }),
      verify: async (query) => ({ issuer, subject: query }),
    }),
  });
  const { logger } = recordingLogger();
  const registry = new SignInRegistry({ logger, timeoutMs: 100 });
  const signIn = new SignInSettingsService({
    settings,
    transactions: settings,
    registry,
    passwordForced: forced,
    logger,
  });
  const core = registry.core({
    findById: async () => admin,
    findByEmail: async () => admin,
  });
  core.signInMethod('password', {
    label: 'Password',
    usableBy: () => true,
    begin: () => ({ kind: 'failed' }),
  });
  core.signInMethod('sso', {
    label: 'SSO',
    ready: async () => (await service.setup()).providers.length > 0,
    usableBy: async (user) =>
      (await service.setup()).providers.some(
        (p) =>
          [...identities.rows.values()].some(
            (i) => i.userId === user.id && sameIssuer(i.issuer, p.issuer),
          ) || [...p.subjects.values()].includes(user.email),
      ),
    begin: () => ({ kind: 'failed' }),
  });
  const auth = new AuthService({
    users,
    sessions,
    clock,
    tokens: randomTokenIssuer,
    ids: sequentialIds(),
    hasher: plainHasher,
    sessionTtlMs: 60000,
    passwordLogin: async () =>
      (await signIn.effective()).methods.includes('password'),
  });
  const sso = new SsoService({
    users,
    identities,
    access,
    sessions: auth,
    clock,
    tokens: randomTokenIssuer,
    ids: sequentialIds(),
    transactions: new MemorySsoTransactions(),
    setup: () => service.setup(),
    policy: async (store, user) => ({
      ...(await service.policy(store)),
      otherMethod: await signIn.otherUsable(user, store),
    }),
    transactionTtlMs: 600000,
    admission: { total: 100, perClient: 100 },
    startLimiter: { tryAcquire: () => true },
  });
  await service.update(
    { passwordLogin: true, providers: [provider('one'), provider('two')] },
    admin,
  );
  const complete = async (
    id: string,
    subject: string,
    intent: 'login' | 'link' | 'claim',
    token?: string,
  ) => {
    const user = intent === 'link' ? admin : null;
    const start = await sso.start(
      { provider: id, intent, token },
      user,
      'client',
    );
    return sso.complete(
      { transaction: start.transaction, query: subject },
      user,
    );
  };
  return {
    users,
    admin,
    identities,
    sessions,
    clock,
    settings,
    service,
    sso,
    auth,
    complete,
    signIn,
  };
};

test('providers isolate allowlists and replace only the link for the same exact issuer', async () => {
  const f = await fixture();
  await f.service.update(
    {
      passwordLogin: true,
      providers: [
        { ...provider('one'), allowedSubjects: { assigned: f.admin.email } },
        provider('two'),
      ],
    },
    f.admin,
  );
  expect(await f.sso.info()).toEqual({
    providers: [
      { id: 'one', name: 'one' },
      { id: 'two', name: 'two' },
    ],
  });
  await expect(
    f.sso.start({ provider: 'missing' }, null, 'client'),
  ).rejects.toMatchObject({ code: 'not_found' });
  expect(await f.complete('one', 'assigned', 'login')).toMatchObject({
    kind: 'session',
  });
  await expect(f.complete('two', 'assigned', 'login')).rejects.toMatchObject({
    code: 'unauthorized',
  });
  await f.complete('one', 'first', 'link');
  await f.complete('two', 'second', 'link');
  const firstSession = await f.complete('one', 'first', 'login');
  const secondSession = await f.complete('two', 'second', 'login');
  await f.complete('one', 'replacement', 'link');
  expect(
    (await f.sso.identity(f.admin)).identities.map((i) => i.subject).sort(),
  ).toEqual(['replacement', 'second']);
  if (firstSession.kind !== 'session' || secondSession.kind !== 'session')
    throw new Error('session expected');
  expect(await f.auth.authenticate(firstSession.session.token)).toBeNull();
  expect(await f.auth.authenticate(secondSession.session.token)).not.toBeNull();
});

test('claim tokens are checked at start, consumed atomically with the link and bind the session', async () => {
  const f = await fixture();
  const issue = async (
    token: string,
    expiresAt = new Date(f.clock.now().getTime() + 60000),
  ) =>
    f.identities.tokens.insert({
      tokenHash: randomTokenIssuer.digest(token),
      userId: f.admin.id,
      expiresAt,
      purpose: 'invite',
    });
  await issue('expired', f.clock.now());
  await expect(
    f.sso.start(
      { provider: 'one', intent: 'claim', token: 'expired' },
      null,
      'client',
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await issue('claim');
  await issue('sibling');
  const starts = await Promise.all(
    [0, 1].map(() =>
      f.sso.start(
        { provider: 'one', intent: 'claim', token: 'claim' },
        null,
        'client',
      ),
    ),
  );
  const results = await Promise.allSettled(
    starts.map((start) =>
      f.sso.complete(
        { transaction: start.transaction, query: 'subject' },
        null,
      ),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    await f.identities.claimUser(
      randomTokenIssuer.digest('sibling'),
      f.clock.now(),
    ),
  ).toBeNull();
  await issue('replacement');
  await expect(
    f.complete('one', 'replacement', 'claim', 'replacement'),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    [...f.sessions.rows.values()].filter((s) => s.identityId),
  ).toHaveLength(1);
  await expect(
    f.sso.start(
      { provider: 'one', intent: 'claim', token: 'claim' },
      null,
      'client',
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await issue('late');
  const late = await f.sso.start(
    { provider: 'one', intent: 'claim', token: 'late' },
    null,
    'client',
  );
  f.clock.set(new Date(f.clock.now().getTime() + 60000).toISOString());
  await expect(
    f.sso.complete({ transaction: late.transaction, query: 'late' }, null),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await issue('conflict');
  await f.service.update(
    {
      passwordLogin: true,
      providers: [
        { ...provider('one'), allowedSubjects: { assigned: f.admin.email } },
      ],
    },
    f.admin,
  );
  await expect(
    f.complete('one', 'assigned', 'claim', 'conflict'),
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(
    await f.identities.claimUser(
      randomTokenIssuer.digest('conflict'),
      f.clock.now(),
    ),
  ).toBe(f.admin.id);
});

test('policy changes and concurrent unlink checks cannot remove every way in', async () => {
  const f = await fixture();
  await f.complete('one', 'first', 'link');
  await f.complete('two', 'second', 'link');
  await f.signIn.update(
    { methods: ['sso'], secondFactors: [], requireSecondFactor: [] },
    f.admin,
  );
  const links = await f.identities.findByUser(f.admin.id);
  const results = await Promise.allSettled(
    links.map((link) => f.sso.unlink(f.admin.id, link.id)),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await f.identities.findByUser(f.admin.id)).toHaveLength(1);
  await expect(
    f.auth.login({ email: 'unknown@example.com', password: 'anything' }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(f.auth.login(null)).rejects.toMatchObject({ code: 'forbidden' });

  const race = await fixture();
  await race.complete('one', 'first', 'link');
  const [link] = await race.identities.findByUser(race.admin.id);
  const changes = await Promise.allSettled([
    race.signIn.update(
      { methods: ['sso'], secondFactors: [], requireSecondFactor: [] },
      race.admin,
    ),
    race.sso.unlink(race.admin.id, link!.id),
  ]);
  expect(changes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await race.signIn.effective()).methods.includes('password') ||
      (await race.identities.findByUser(race.admin.id)).length > 0,
  ).toBe(true);
});

test('CMS_ALLOW_PASSWORD_LOGIN forces password access without altering stored policy', async () => {
  expect(loadConfig({}).CMS_ALLOW_PASSWORD_LOGIN).toBe(false);
  const config = loadConfig({ CMS_ALLOW_PASSWORD_LOGIN: 'true' });
  const f = await fixture(config.CMS_ALLOW_PASSWORD_LOGIN);
  await f.service.update(
    {
      passwordLogin: false,
      providers: [
        { ...provider('one'), allowedSubjects: { assigned: f.admin.email } },
      ],
    },
    f.admin,
  );
  await f.signIn.update(
    { methods: ['sso'], secondFactors: [], requireSecondFactor: [] },
    f.admin,
  );
  expect(await f.signIn.getAdmin()).toMatchObject({
    methods: ['sso'],
    passwordForced: true,
  });
  expect(await f.sso.info()).not.toHaveProperty('passwordLogin');
  await expect(
    f.auth.login({ email: 'unknown@example.com', password: 'anything' }),
  ).rejects.toMatchObject({ code: 'unauthorized' });
});

test('restoring a provider cannot withdraw fallback password access without usable SSO', async () => {
  const f = await fixture();
  await f.settings.set('signIn', {
    methods: ['sso'],
    secondFactors: [],
    requireSecondFactor: [],
  });
  await f.settings.set('sso', { settings: { providers: [] }, secrets: {} });
  expect((await f.signIn.effective()).methods).toEqual(['password']);
  await expect(
    f.service.update({ providers: [provider('one')] }, f.admin),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});
