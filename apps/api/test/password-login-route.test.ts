import { expect, test } from 'bun:test';
import { createApiApp } from '#api/http/app';
import type { ApiServices } from '#api/http/services';
import { ClientResolver } from '#api/http/client-identity';
import { profile, recordingLogger } from '#test/support/memory';
import { templates } from '#api/domain/email/templates';

test('legacy login delegates to the engine and refuses multi-step flows with 409', async () => {
  const calls: unknown[] = [];
  const grant = {
    token: 'session',
    user: profile({ id: 'u' }),
    expiresAt: '2026-01-02T00:00:00Z',
  };
  let further = false;
  const app = await createApiApp({
    services: {
      clients: new ClientResolver(undefined),
      signIn: {
        start: async (...args: unknown[]) => {
          calls.push(args);
          return further
            ? {
                kind: 'secondFactor',
                transaction: 'private-handle',
                factors: [{ id: 'totp', label: 'TOTP' }],
              }
            : { kind: 'session', session: grant };
        },
      },
    } as unknown as ApiServices,
    logger: recordingLogger().logger,
  });
  const values = { email: 'user@example.com', password: 'password' };
  const call = () =>
    app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      }),
    );
  const first = await call();
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual(grant);
  expect(calls[0]).toEqual([
    'password',
    { values },
    { client: null, address: null, captchaToken: null },
  ]);
  further = true;
  const second = await call();
  expect(second.status).toBe(409);
  const text = await second.text();
  expect(text).toContain('step-based sign-in flow');
  expect(text).not.toContain('private-handle');
});

test('passwordless invitations and resets describe sign-in setup in both locales', () => {
  const link = 'https://site.example/admin/password?token=opaque';
  expect(templates('en').reset('Site', link, true).text).toContain(
    'Set up your sign-in',
  );
  expect(templates('en').invite('Site', 'User', link, true).text).toContain(
    'Set up your sign-in',
  );
  expect(templates('ko').reset('Site', link, true).text).toContain(
    '로그인 방법을 설정하세요',
  );
  expect(templates('ko').invite('Site', 'User', link, true).text).toContain(
    '로그인 방법을 설정하세요',
  );
});
