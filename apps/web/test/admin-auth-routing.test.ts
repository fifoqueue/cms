import { expect, test } from 'bun:test';
import { with_request_store } from '@sveltejs/kit/internal/server';

Bun.plugin({
  name: 'admin-auth-routing-env',
  setup(build) {
    build.module('$app/env/private', () => ({
      exports: {
        CMS_API_URL: 'http://cms.test',
        API_PORT: '4000',
        CMS_FRONTEND_SECRET: '',
        OIDC_FRONTEND_SECRET: '',
      },
      loader: 'object',
    }));
  },
});

const { handle } = await import('#web/hooks.server.js');

let showLogin = false;
const api = (async (input: RequestInfo | URL) => {
  const path = new URL(new Request(input).url).pathname;
  if (path === '/api/v1/install/status')
    return Response.json({ databaseConfigured: true, setupRequired: false });
  if (path === '/api/v1/site')
    return Response.json({
      title: 'Site',
      description: '',
      locale: 'en',
      loginPath: '/members/sign-in',
      showLogin,
    });
  throw new Error(`Unexpected test API path: ${path}`);
}) as typeof fetch;

const request = async (
  path: string,
  routeId: string | null,
  method = 'GET',
) => {
  const url = new URL(path, 'http://web.test');
  const event = {
    cookies: {
      get: () => undefined,
      getAll: () => [],
      set: () => undefined,
      delete: () => undefined,
    },
    fetch: api,
    getClientAddress: () => '127.0.0.1',
    locals: { token: null, user: null },
    params: {},
    request: new Request(url, { method }),
    route: { id: routeId },
    url,
  };
  return with_request_store({ event: event as never, state: {} as never }, () =>
    handle({
      event: event as never,
      resolve: async () =>
        new Response(null, {
          status: routeId?.startsWith('/admin') ? 200 : 404,
        }),
    }),
  );
};

test('admin auth routing hides protected and removed routes without caching their state', async () => {
  const removed = await request('/admin/login', '/(site)/[...path]', 'POST');
  expect(removed.status).toBe(404);
  expect(
    (await request('/admin/login/__data.json', '/(site)/[...path]')).status,
  ).toBe(404);

  const hidden = await request('/admin/content', '/admin/(app)/content');
  expect(hidden.status).toBe(404);
  expect(hidden.headers.get('cache-control')).toBe('private, no-store');

  showLogin = true;
  const visible = await request('/admin/content', '/admin/(app)/content');
  expect(visible.status).toBe(303);
  expect(visible.headers.get('location')).toBe(
    '/members/sign-in?redirect_to=%2Fadmin%2Fcontent',
  );

  expect((await request('/admin/missing', '/(site)/[...path]')).status).toBe(
    404,
  );
});
