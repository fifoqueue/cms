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

test('session lifetimes persist accepted bounds and reject identity changes without exposing secrets', async () => {
  const users = new MemoryUsers();
  const user = userRecord({ id: 'writer' });

  await users.insert(user);
  const clock = fixedClock();
  const sessions = new MemorySessions(() => false, users);
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  const auth = new AuthService({
    hooks,
    roles: { capabilities: async () => ['users.manage'] },
    users,
    sessions,
    hasher: plainHasher,
    tokens: { issue: () => 'session', digest: (token) => token },
    ids: sequentialIds(),
    clock,
    sessionTtlMs: 60_000,
  });
  const plugin = hooks.registrar('policy');

  for (const ttlMs of [
    1,
    120_000,
    31_536_000_000,
    0,
    -1,
    Infinity,
    0.5,
    31_536_000_001,
  ]) {
    const release = plugin.filter('user.sessionLifetime', (value) => {
      expect(value.user).not.toHaveProperty('passwordHash');
      expect(value).not.toHaveProperty('token');

      return { ...value, ttlMs };
    });
    const grant = await auth.startSession(user);
    const expected = [1, 120_000, 31_536_000_000].includes(ttlMs)
      ? ttlMs
      : 60_000;

    expect(Date.parse(grant.expiresAt) - clock.now().getTime()).toBe(expected);
    expect((await sessions.find(grant.token))?.expiresAt.toISOString()).toBe(
      grant.expiresAt,
    );
    release();
  }

  hooks
    .registrar('functions:site', { trusted: true })
    .filter('user.sessionLifetime', (value) => {
      value.user.id = 'replacement';
      value.ttlMs = 1;

      return value;
    });
  const grant = await auth.startSession(user);

  expect(Date.parse(grant.expiresAt) - clock.now().getTime()).toBe(60_000);
  expect(grant.user.id).toBe(user.id);
});
