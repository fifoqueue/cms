import { expect, test } from 'bun:test';
import { AuthService } from '#api/domain/auth/auth-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  fixedClock,
  recordingLogger,
  sequentialIds,
  userRecord,
} from '#test/support/memory';
import {
  MemorySessions,
  MemoryUsers,
  plainHasher,
} from '#test/support/sso-memory';

test('session admission is reversible but cannot replace identity or authenticate unknown tokens', async () => {
  const users = new MemoryUsers();
  const user = userRecord({ id: 'writer', role: 'author' });

  await users.insert(user);
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  const auth = new AuthService({
    hooks,
    users,
    sessions: new MemorySessions(() => false, users),
    apiTokens: {
      authenticate: async (token) => (token === 'api' ? user : null),
    },
    hasher: plainHasher,
    tokens: { issue: () => 'session', digest: (token) => token },
    ids: sequentialIds(),
    clock: fixedClock(),
    sessionTtlMs: 60_000,
  });

  await auth.startSession(user);
  const plugin = hooks.registrar('policy');
  const seen: string[] = [];

  plugin.filter('user.sessionAllowed', (value) => {
    seen.push(value.kind);

    return { ...value, allowed: false };
  });
  expect(await auth.authenticate('session')).toBeNull();
  expect(await auth.authenticate('api')).toBeNull();
  const allow = plugin.filter('user.sessionAllowed', (value) => ({
    ...value,
    allowed: true,
  }));

  expect((await auth.authenticate('session'))?.id).toBe(user.id);
  expect((await auth.authenticate('api'))?.id).toBe(user.id);
  allow();
  hooks
    .registrar('functions:site', { trusted: true })
    .filter('user.sessionAllowed', (value) => {
      value.user.role = 'administrator';
      value.allowed = true;

      return value;
    });
  expect(await auth.authenticate('session')).toBeNull();
  expect(await auth.authenticate('missing')).toBeNull();
  expect(seen).toEqual([
    'session',
    'apiToken',
    'session',
    'apiToken',
    'session',
  ]);
});

test('sign out actions describe committed revocations without credentials', async () => {
  const users = new MemoryUsers();
  const user = userRecord({ id: 'writer', role: 'author' });

  await users.insert(user);
  const sessions = new MemorySessions(() => false, users);
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  let issued = 0;
  const auth = new AuthService({
    hooks,
    users,
    sessions,
    hasher: plainHasher,
    tokens: { issue: () => `token-${++issued}`, digest: (token) => token },
    ids: sequentialIds(),
    clock: fixedClock(),
    sessionTtlMs: 60_000,
  });
  const events: unknown[] = [];

  hooks.registrar('observer').on('user.signedOut', async (event) => {
    expect(await auth.sessions(user, '')).toHaveLength(0);
    events.push(event);
  });
  const first = await auth.startSession(user);

  await auth.logout(first.token);
  await auth.logout(first.token);
  const second = await auth.startSession(user);
  const [session] = await auth.sessions(user, second.token);

  await auth.revokeSession(user, session!.id);
  await auth.startSession(user);
  await auth.signOutEverywhere(user.id, {
    id: 'admin',
    role: 'administrator',
  });
  const profile = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    slug: user.slug,
    bio: user.bio,
    locale: user.locale,
  };

  expect(events).toEqual([
    { user: profile, scope: 'session', actorId: user.id },
    { user: profile, scope: 'other', actorId: user.id },
    { user: profile, scope: 'all', actorId: 'admin' },
  ]);
});
