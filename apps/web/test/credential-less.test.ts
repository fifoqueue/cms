// Regression guard: SvelteKit's own form origin check is off, so the server hook must still refuse
// cross-site form posts everywhere except credential-less endpoints, and the back-channel logout
// endpoint must answer the provider per the spec without touching cookies or a session.
import { expect, test } from 'bun:test';
import { with_request_store } from '@sveltejs/kit/internal/server';

// SvelteKit provides these at build time (same values as `page-data.test.ts`).
Bun.plugin({
  name: 'sveltekit-env',
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
    build.module('$app/paths', () => ({
      exports: { resolve: (path: string) => path, match: async () => null },
      loader: 'object',
    }));
    build.module('$app/env', () => ({
      exports: { browser: false, dev: false, building: false, version: '' },
      loader: 'object',
    }));
  },
});

const { handle } = await import('#web/hooks.server.js');
const { csrf } = await import('#lib/server/csrf.js');
const { POST: backchannelLogout } =
  await import('#web/routes/admin/sso/backchannel-logout/+server.js');

const SITE = 'https://cms.example';
const FORM = 'application/x-www-form-urlencoded';
const BODY = 'logout_token=header.payload.signature';

/** Any read fails the test: the code under test must not use it. */
const untouchable = (name: string) =>
  new Proxy(
    {},
    {
      get(_, key) {
        throw new Error(`read ${name}.${String(key)}`);
      },
    },
  );

/** A form post as a browser on `origin` (or a server, without one) sends it. */
const formPost = (path: string, route: string, origin?: string) => ({
  request: new Request(`${SITE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': FORM,
      'content-length': String(BODY.length),
      ...(origin && { origin }),
    },
    body: BODY,
  }),
  url: new URL(path, SITE),
  route: { id: route },
  isRemoteRequest: false,
  locals: {} as App.Locals,
  cookies: untouchable('cookies'),
  fetch: untouchable('fetch'),
});

const resolved = () => new Response('resolved');

/** The whole server hook sequence, as SvelteKit runs it. */
const serve = (event: ReturnType<typeof formPost>) =>
  with_request_store({ event, state: {} } as never, () =>
    handle({ event, resolve: resolved } as never),
  );

test('the server hook refuses cross-site form posts but lets the provider reach credential-less endpoints', async () => {
  for (const origin of ['https://evil.example', undefined]) {
    const refused = await serve(
      formPost('/admin/settings', '/admin/(app)/settings', origin),
    );

    expect(refused.status).toBe(403);
  }

  const own = await csrf({
    event: formPost('/admin/settings', '/admin/(app)/settings', SITE),
    resolve: resolved,
  } as never);

  expect(await own.text()).toBe('resolved');

  const provider = await serve(
    formPost('/admin/sso/backchannel-logout', '/admin/sso/backchannel-logout'),
  );

  expect(provider.status).toBe(200);
  expect(await provider.text()).toBe('resolved');
});

test('back-channel logout forwards the token without a session and answers per the spec', async () => {
  const calls: Request[] = [];
  let reply = () => new Response(null, { status: 204 });
  const post = (body: string, type = FORM) =>
    backchannelLogout({
      request: new Request(`${SITE}/admin/sso/backchannel-logout`, {
        method: 'POST',
        headers: { 'content-type': type },
        body,
      }),
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(new Request(input, init));

        return reply();
      },
      cookies: untouchable('cookies'),
      locals: untouchable('locals'),
    } as never);

  const done = await post(BODY);

  expect(done.status).toBe(200);
  expect(done.headers.get('cache-control')).toBe('no-store');
  expect(await done.text()).toBe('');
  expect(calls.map((call) => call.url)).toEqual([
    'http://cms.test/api/v1/auth/sso/backchannel-logout',
  ]);
  expect(calls[0]!.headers.has('authorization')).toBe(false);
  expect(await calls[0]!.json()).toEqual({
    logoutToken: 'header.payload.signature',
  });

  reply = () =>
    Response.json(
      { error: { code: 'invalid_input', message: 'Invalid logout token' } },
      { status: 400 },
    );

  for (const [body, type] of [
    [BODY, FORM],
    ['', FORM],
    ['{"logout_token":"x"}', 'application/json'],
  ] as const) {
    const refused = await post(body, type);

    expect(refused.status).toBe(400);
    expect(refused.headers.get('cache-control')).toBe('no-store');
    expect(await refused.json()).toEqual({ error: 'invalid_request' });
  }

  // Only the well-formed body reached the API.
  expect(calls).toHaveLength(2);

  reply = () =>
    Response.json(
      { error: { code: 'internal', message: 'database at 10.0.0.5 is down' } },
      { status: 500 },
    );

  // Not a success or an invalid token: SvelteKit answers 500 without the API's details.
  await expect(post(BODY)).rejects.toThrow();
});
