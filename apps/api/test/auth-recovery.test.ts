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
import { forbidden } from '#api/shared/errors';
import { createApiApp } from '#api/http/app';
import { ClientResolver } from '#api/http/client-identity';
import type { ApiServices } from '#api/http/services';

const attempt = { client: 'visitor', address: null, captchaToken: null };
const fixture = async () => {
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
  const emails: unknown[] = [];
  let allowed = true;
  let emailFails = false;
  const roleChecks: unknown[] = [];
  const consumed: string[] = [];
  const consume = codes.consume.bind(codes);
  codes.consume = async (userId, hash) => {
    consumed.push(userId);
    return consume(userId, hash);
  };
  const grant = await auth.startSession(user);
  const service = new RecoveryService({
    sessionRepository: sessions,
    users,
    codes,
    clock,
    sessions: auth,
    ids: sequentialIds(),
    tokens: randomTokenIssuer,
    roles: {
      capabilities: async (role, userId) => {
        roleChecks.push([role, userId]);
        return role === 'administrator'
          ? [...ROLE_CAPABILITIES.administrator!]
          : [];
      },
    },
    protection: {
      check: async (input) => {
        checks.push(input);
        if (!allowed) throw forbidden();
      },
    },
    email: {
      enabled: async () => true,
      queue: async (message) => {
        if (emailFails) throw new Error('Mail unavailable');
        emails.push(message);
      },
    },
    site: async () => ({ title: 'Site', locale: 'en' }),
    logger: recordingLogger().logger,
  });
  return {
    token: grant.token,
    clock,
    roleChecks,
    consumed,
    failEmail: () => {
      emailFails = true;
    },
    service,
    codes,
    users,
    user,
    auth,
    sessions,
    checks,
    emails,
    block: () => {
      allowed = false;
    },
  };
};

test('recovery generation requires a recent interactive session and mail failures preserve success', async () => {
  const f = await fixture();
  await expect(
    f.service.generate(f.user, 'cms_pat_fake'),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  await expect(f.service.generate(f.user, 'unknown')).rejects.toMatchObject({
    code: 'unauthorized',
  });
  f.failEmail();
  const generated = await f.service.generate(f.user, f.token);
  expect(generated.codes).toHaveLength(10);
  expect(
    await f.service.recover(
      { email: f.user.email, code: generated.codes[0] },
      attempt,
    ),
  ).toHaveProperty('token');
  expect(f.roleChecks).toContainEqual(['administrator', f.user.id]);
  await expect(
    f.service.recover(
      { email: 'missing@example.com', code: generated.codes[1] },
      attempt,
    ),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  expect(f.roleChecks).toContainEqual(['subscriber', undefined]);
  expect(f.consumed.at(-1)).toBe('00000000-0000-0000-0000-000000000000');
  const session = f.sessions.rows.get(randomTokenIssuer.digest(f.token))!;
  session.expiresAt = new Date(f.clock.now().getTime() + 3600_000);
  f.clock.set('2026-01-01T00:11:00.000Z');
  await expect(f.service.generate(f.user, f.token)).rejects.toMatchObject({
    code: 'unauthorized',
  });
});

test('session profiles pass the user id to capability resolution', async () => {
  const f = await fixture();
  const seen: unknown[] = [];
  const auth = new AuthService({
    users: f.users,
    sessions: f.sessions,
    clock: f.clock,
    ids: sequentialIds(),
    tokens: randomTokenIssuer,
    hasher: plainHasher,
    sessionTtlMs: 60000,
    roles: {
      capabilities: async (role, userId) => {
        seen.push([role, userId]);
        return ['settings.manage'];
      },
    },
  });
  expect((await auth.startSession(f.user)).user.capabilities).toEqual([
    'settings.manage',
  ]);
  expect((await auth.authenticate(f.token))?.capabilities).toEqual([
    'settings.manage',
  ]);
  expect(seen).toEqual([
    ['administrator', f.user.id],
    ['administrator', f.user.id],
  ]);
});

test('recovery does not run per-user capability resolution for an unverified email or code', async () => {
  const f = await fixture();
  const generated = await f.service.generate(f.user, f.token);
  await expect(
    f.service.recover({ email: f.user.email, code: 'wrong' }, attempt),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  expect(f.roleChecks).toEqual([['administrator', undefined]]);
  expect((await f.service.status(f.user)).remaining).toBe(10);
  f.roleChecks.length = 0;
  await f.service.recover(
    { email: f.user.email, code: generated.codes[0] },
    attempt,
  );
  expect(f.roleChecks).toEqual([
    ['administrator', undefined],
    ['administrator', f.user.id],
  ]);
});

test('recovery codes replace previous codes, store only digests and consume once under concurrency', async () => {
  const { service, codes, user, sessions, checks, emails, token } =
    await fixture();
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
  expect([...sessions.rows.values()].every((s) => s.identityId === null)).toBe(
    true,
  );
  expect(checks).toContainEqual({
    ...attempt,
    action: 'login',
    account: user.email,
  });
  expect(emails).toHaveLength(3);
  await service.remove(user);
  expect(await service.status(user)).toEqual({ remaining: 0, createdAt: null });
});

test('recovery requires current settings permission and protection before consuming a code', async () => {
  const { service, users, user, block, token } = await fixture();
  const { codes } = await service.generate(user, token);
  const input = { email: user.email, code: codes[0] };
  users.rows.get(user.id)!.role = 'subscriber';
  await expect(service.recover(input, attempt)).rejects.toMatchObject({
    code: 'unauthorized',
  });
  await expect(
    service.generate({ ...user, role: 'subscriber' }, token),
  ).rejects.toMatchObject({ code: 'forbidden' });
  users.rows.get(user.id)!.role = 'administrator';
  block();
  await expect(service.recover(input, attempt)).rejects.toMatchObject({
    code: 'forbidden',
  });
  expect((await service.status(user)).remaining).toBe(9);
});

test('recovery HTTP endpoints require session permission and forward visitor protection', async () => {
  const { service, auth, user, checks } = await fixture();
  const grant = await auth.startSession(user);
  const app = await createApiApp({
    services: {
      recovery: service,
      auth,
      clients: new ClientResolver(undefined),
    } as ApiServices,
    logger: recordingLogger().logger,
  });
  const call = (path: string, method: string, token?: string, body?: unknown) =>
    app.fetch(
      new Request(`http://localhost/api/v1/auth/${path}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  expect((await call('recovery-codes', 'GET')).status).toBe(401);
  const generated = await (
    await call('recovery-codes', 'POST', grant.token)
  ).json();
  expect(generated.codes).toHaveLength(10);
  expect(
    (
      await call('recovery', 'POST', undefined, {
        email: user.email,
        code: generated.codes[0],
      })
    ).status,
  ).toBe(200);
  expect(checks).toHaveLength(1);
  expect(
    (await (await call('recovery-codes', 'GET', grant.token)).json()).remaining,
  ).toBe(9);
  expect((await call('recovery-codes', 'DELETE', grant.token)).status).toBe(
    204,
  );
});
