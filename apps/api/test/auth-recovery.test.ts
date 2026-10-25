import { expect, test } from 'bun:test';
import { ROLE_CAPABILITIES } from '@cms/sdk';
import { RecoveryService } from '#api/domain/auth/recovery-service';
import { AuthService } from '#api/domain/auth/auth-service';
import { MemoryRecoveryCodes } from '#test/support/memory-recovery';
import {
  MemoryUsers,
  createMemoryAuthStore,
  plainHasher,
} from '#test/support/sso-memory';
import {
  fixedClock,
  sequentialIds,
  recordingLogger,
  userRecord,
} from '#test/support/memory';
import { randomTokenIssuer } from '#api/infra/system';

const attempt = { client: 'visitor', address: null, captchaToken: null };

test('recovery codes replace previous codes, store only digests and consume once under concurrency', async () => {
  const users = new MemoryUsers();
  const user = userRecord({ id: 'admin', email: 'admin@example.com' });
  await users.insert(user);
  const { sessions } = createMemoryAuthStore(users);
  const clock = fixedClock();
  const auth = new AuthService({
    users,
    sessions,
    clock,
    ids: sequentialIds(),
    tokens: randomTokenIssuer,
    hasher: plainHasher,
    sessionTtlMs: 60000,
  });
  const codes = new MemoryRecoveryCodes();
  const checks: unknown[] = [];
  const { token } = await auth.startSession(user);
  const service = new RecoveryService({
    sessionRepository: sessions,
    users,
    codes,
    clock,
    sessions: auth,
    ids: sequentialIds(),
    tokens: randomTokenIssuer,
    roles: {
      capabilities: async (role) =>
        role === 'administrator' ? [...ROLE_CAPABILITIES.administrator!] : [],
    },
    protection: {
      check: async (input) => {
        checks.push(input);
      },
    },
    email: { enabled: async () => true, queue: async () => {} },
    site: async () => ({ title: 'Site', locale: 'en' }),
    logger: recordingLogger().logger,
  });
  const first = await service.generate(user, token);
  const second = await service.generate(user, token);
  expect(first.codes).toHaveLength(10);
  expect(await service.status(user)).toEqual({
    remaining: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  expect(JSON.stringify([...codes.rows.values()])).not.toContain(
    second.codes[0]!.replaceAll('-', ''),
  );
  await expect(
    service.recover({ email: user.email, code: first.codes[0] }, attempt),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  const input = {
    email: user.email,
    code: second.codes[0]!.replaceAll('-', '').toLowerCase(),
  };
  const results = await Promise.allSettled([
    service.recover(input, attempt),
    service.recover(input, attempt),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await service.status(user)).remaining).toBe(9);
  expect(checks).toContainEqual({
    ...attempt,
    action: 'login',
    account: user.email,
  });
});
