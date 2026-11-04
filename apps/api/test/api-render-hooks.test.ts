import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { apiHooks } from '#api/http/api-hooks';
import { apiErrors } from '#api/http/app';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import type { ApiServices } from '#api/http/services';
import { ClientResolver } from '#api/http/client-identity';
import { requireUser } from '#api/http/request';

test('API hooks reverse refusals but cannot bypass route authorization or security headers', async () => {
  const logger = { info() {}, warn() {}, error() {} };
  const hooks = new HookBus({ timeoutMs: 50, logger });
  const registrar = hooks.registrar('test');
  const auth = { authenticate: async () => null };
  const app = new Elysia()
    .use(apiErrors(logger))
    .use(
      apiHooks({
        renderHooks: hooks,
        auth,
        clients: new ClientResolver(undefined),
      } as unknown as ApiServices),
    )
    .get('/public', () =>
      Response.json({ ok: true }, { headers: { 'x-frame-options': 'DENY' } }),
    )
    .get('/private', async ({ request }) => {
      await requireUser(auth, request);

      return 'secret';
    })
    .get('/api/health', () => 'ok');

  registrar.filter('api.requestAllowed', (value) => ({
    ...value,
    allowed: false,
  }));
  expect(
    (await app.handle(new Request('http://localhost/public'))).status,
  ).toBe(403);
  expect(
    (await app.handle(new Request('http://localhost/api/health'))).status,
  ).toBe(200);
  registrar.filter('api.requestAllowed', (value) => ({
    ...value,
    allowed: true,
  }));
  registrar.filter('api.responseHeaders', (value) => ({
    ...value,
    headers: { ...value.headers, 'x-test': 'yes' },
  }));
  registrar.filter('api.responseHeaders', (value) => ({
    ...value,
    headers: { ...value.headers, 'x-frame-options': 'ALLOWALL' },
  }));
  const response = await app.handle(new Request('http://localhost/public'));

  expect(response.status).toBe(200);
  expect(response.headers.get('x-test')).toBe('yes');
  expect(response.headers.get('x-frame-options')).toBe('DENY');
  expect(
    (await app.handle(new Request('http://localhost/private'))).status,
  ).toBe(401);
});
