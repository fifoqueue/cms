import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { apiHooks } from '#api/http/api-hooks';
import { apiErrors } from '#api/http/app';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import type { ApiServices } from '#api/http/services';
import { ClientResolver } from '#api/http/client-identity';
import { requireUser } from '#api/http/request';
import { CONTENT_UNLOCK_HEADER } from '@cms/sdk';

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
    .get('/conditional', ({ request, set }) => {
      set.headers.ETag = '"inner"';
      set.headers['Last-Modified'] = 'Wed, 01 Jan 2025 00:00:00 GMT';

      return request.headers.has('if-none-match') ||
        request.headers.has('if-modified-since')
        ? new Response(null, { status: 304 })
        : new Response('UNLOCKED-BODY');
    })
    .get('/not-modified', () => new Response(null, { status: 304 }))
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
  registrar.filter('api.responseHeaders', (value) => ({
    ...value,
    headers: {
      ...value.headers,
      etag: 'W/"plugin"',
      'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
    },
  }));
  const response = await app.handle(new Request('http://localhost/public'));

  expect(response.status).toBe(200);
  expect(response.headers.get('x-test')).toBe('yes');
  expect(response.headers.get('x-frame-options')).toBe('DENY');
  expect(response.headers.get('etag')).toBe('W/"plugin"');
  registrar.filter('api.responseHeaders', (value) => ({
    ...value,
    headers: { ...value.headers, 'cache-control': 'public, max-age=600' },
  }));
  const proofResponse = await app.handle(
    new Request('http://localhost/public', {
      headers: { [CONTENT_UNLOCK_HEADER]: 'entry.proof' },
    }),
  );

  expect(proofResponse.headers.get('cache-control')).toBe('private, no-store');
  expect(proofResponse.headers.get('vary')).toContain(CONTENT_UNLOCK_HEADER);
  expect(proofResponse.headers.has('etag')).toBe(false);
  expect(proofResponse.headers.has('last-modified')).toBe(false);

  for (const credential of [CONTENT_UNLOCK_HEADER, 'authorization']) {
    const headers = {
      [credential]: 'entry.proof',
      'if-none-match': '"inner"',
      'if-modified-since': 'Wed, 01 Jan 2025 00:00:00 GMT',
    };
    const privateResponse = await app.handle(
      new Request('http://localhost/conditional', { headers }),
    );

    expect(privateResponse.status).toBe(200);
    expect(await privateResponse.text()).toBe('UNLOCKED-BODY');
    expect(privateResponse.headers.get('cache-control')).toBe(
      'private, no-store',
    );
    expect(privateResponse.headers.has('etag')).toBe(false);
    expect(privateResponse.headers.has('last-modified')).toBe(false);
    const invalid = await app.handle(
      new Request('http://localhost/not-modified', { headers }),
    );

    expect(invalid.status).toBe(500);
    expect(invalid.headers.has('etag')).toBe(false);
    expect(invalid.headers.has('last-modified')).toBe(false);
  }

  const anonymous = await app.handle(
    new Request('http://localhost/conditional', {
      headers: { 'if-none-match': '"inner"' },
    }),
  );

  expect(anonymous.status).toBe(304);
  expect(
    (await app.handle(new Request('http://localhost/private'))).status,
  ).toBe(401);
});
