import { expect, test } from 'bun:test';
import { AuthService } from '#api/domain/auth/auth-service';
import { RecoveryService } from '#api/domain/auth/recovery-service';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { ClientResolver } from '#api/http/client-identity';
import {
  MemoryUsers,
  createMemoryAuthStore,
  plainHasher,
} from '#test/support/sso-memory';
import { MemoryRecoveryCodes } from '#test/support/memory-recovery';
import {
  fixedClock,
  sequentialIds,
  userRecord,
  recordingLogger,
} from '#test/support/memory';

test('credential enrollment, SSO linking and recovery generation require recent interactive sessions', async () => {
  const user = userRecord({ id: 'owner' });
  const users = new MemoryUsers();
  await users.insert(user);
  const { sessions } = createMemoryAuthStore(users);
  const clock = fixedClock();
  let serial = 0;
  const tokens = {
    issue: () => `token-${++serial}`,
    digest: (value: string) => `hash:${value}`,
  };
  const auth = new AuthService({
    users,
    sessions,
    tokens,
    clock,
    ids: sequentialIds(),
    hasher: plainHasher,
    sessionTtlMs: 3600000,
    apiTokens: {
      authenticate: async (token) => (token === 'cms_pat_test' ? user : null),
    },
  });
  const { logger } = recordingLogger();
  const codes = new MemoryRecoveryCodes();
  const recovery = new RecoveryService({
    users,
    codes,
    tokens,
    clock,
    sessionRepository: sessions,
    sessions: auth,
    roles: { capabilities: async () => ['settings.manage'] },
    ids: sequentialIds(),
    protection: { check: async () => {} },
    email: { enabled: async () => false, queue: async () => {} },
    site: async () => ({ title: 'Site', locale: 'en' }),
    logger,
  });
  const calls: string[] = [];
  const app = await createApiApp({
    services: {
      auth,
      recovery,
      clients: new ClientResolver(undefined),
      signIn: {
        enroll: async () => {
          calls.push('enroll');
          return { kind: 'done' };
        },
      },
      sso: {
        start: async () => {
          calls.push('link');
          return { authorizationUrl: 'https://id.example' };
        },
      },
    } as unknown as ApiServices,
    logger,
  });
  const old = await auth.startSession(user);
  clock.set('2026-01-01T00:11:00.000Z');
  const paths = ['factors/totp/enroll', 'sso/start', 'recovery-codes'];
  const call = (path: string, token: string) =>
    app.fetch(
      new Request(`http://localhost/api/v1/auth/${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ provider: 'default', intent: 'link' }),
      }),
    );
  for (const token of ['cms_pat_test', old.token, 'missing'])
    for (const path of paths)
      expect((await call(path, token)).status).toBe(401);
  expect(calls).toEqual([]);
  expect((await codes.status(user.id)).remaining).toBe(0);
  const fresh = await auth.startSession(user);
  for (const path of paths)
    expect((await call(path, fresh.token)).status).toBe(200);
  expect(calls).toEqual(['enroll', 'link']);
  expect((await codes.status(user.id)).remaining).toBe(10);
  await expect(
    auth.requireRecent({ id: 'other', role: 'administrator' }, fresh.token),
  ).rejects.toMatchObject({ code: 'unauthorized' });
});
